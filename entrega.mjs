const archivos = new Map([
  ['robotica', 'robotica-casera.pdf'],
  ['ciencia', 'ciencia-y-arte-en-casa.pdf'],
]);

const sieteDias = 7 * 24 * 60 * 60;
const ventanaDeReintento = 23 * 60 * 60;
const encoder = new TextEncoder();
const ahora = () => Math.floor(Date.now() / 1000);

export function entregaConfigurada(env) {
  return Boolean(env.ENTREGAS && env.GUIAS && env.MP_TEST_WEBHOOK_SECRET &&
    env.RESEND_API_KEY && env.ENTREGA_FROM && env.ENTREGA_ORIGIN);
}

export async function guardarPedido(env, id, referencia, correo, ids) {
  const productos = JSON.stringify([...ids].sort());
  const token = crypto.randomUUID();
  await env.ENTREGAS.prepare(`
    INSERT INTO entregas (orden_id, referencia, correo, productos, token)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (orden_id) DO NOTHING
  `).bind(id, referencia, correo, productos, token).run();
  const fila = await env.ENTREGAS.prepare(
    'SELECT referencia, correo, productos FROM entregas WHERE orden_id = ?',
  ).bind(id).first();
  return fila?.referencia === referencia && fila.correo === correo && fila.productos === productos;
}

async function firmaValida(request, url, clave) {
  const signature = request.headers.get('x-signature') || '';
  const partes = new Map(signature.split(',').map(parte => parte.trim().split('=')));
  const ts = partes.get('ts');
  const hash = partes.get('v1');
  const requestId = request.headers.get('x-request-id');
  const id = url.searchParams.get('data.id');
  if (!id || !requestId || !/^\d{10,13}$/.test(ts) || !/^[a-f0-9]{64}$/i.test(hash)) return false;
  const manifiesto = 'id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';';
  const key = await crypto.subtle.importKey('raw', encoder.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(hash.match(/../g), par => Number.parseInt(par, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(manifiesto));
}

export async function enviarEntrega(env, id) {
  const fila = await env.ENTREGAS.prepare('SELECT * FROM entregas WHERE orden_id = ?').bind(id).first();
  if (!fila?.aprobado_en || fila.enviado_en) return;
  const ids = JSON.parse(fila.productos);
  const metadatos = await Promise.all(ids.map(producto => env.GUIAS.head(archivos.get(producto))));
  if (metadatos.some(archivo => !archivo)) throw new Error('Falta un PDF en R2');
  const inicio = ahora();
  await env.ENTREGAS.prepare(`
    UPDATE entregas SET primer_envio_en = COALESCE(primer_envio_en, ?)
    WHERE orden_id = ? AND enviado_en IS NULL
  `).bind(inicio, id).run();
  const intento = await env.ENTREGAS.prepare('SELECT primer_envio_en, enviado_en FROM entregas WHERE orden_id = ?')
    .bind(id).first();
  // Resend conserva las claves de idempotencia durante 24 horas.
  if (intento.enviado_en || inicio - intento.primer_envio_en >= ventanaDeReintento) return;

  const enlaces = ids.map(producto => {
    const url = new URL('/descarga/' + fila.token + '/' + producto, env.ENTREGA_ORIGIN);
    return archivos.get(producto) + '\n' + url.href;
  });
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'mindtrix-prueba/' + id,
    },
    body: JSON.stringify({
      from: env.ENTREGA_FROM,
      to: [fila.correo],
      subject: 'Mindtrix · Tus guías de la compra de prueba',
      text: 'Tu pago de prueba fue aprobado. Descargá tus guías. Los enlaces vencen a los 7 días.\n\n' + enlaces.join('\n\n'),
    }),
  });
  if (!respuesta.ok) throw new Error('Resend HTTP ' + respuesta.status);
  await env.ENTREGAS.prepare('UPDATE entregas SET enviado_en = ? WHERE orden_id = ? AND enviado_en IS NULL')
    .bind(ahora(), id).run();
}

export async function webhook(request, env, url, verificarOrden) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!entregaConfigurada(env)) return new Response(null, { status: 503 });
  if (!await firmaValida(request, url, env.MP_TEST_WEBHOOK_SECRET)) return new Response(null, { status: 401 });

  const id = url.searchParams.get('data.id').toUpperCase();
  if (!/^ORDTST[A-Z0-9]{1,64}$/.test(id)) return new Response(null, { status: 200 });
  try {
    const fila = await env.ENTREGAS.prepare('SELECT referencia, productos FROM entregas WHERE orden_id = ?')
      .bind(id).first();
    if (!fila) return new Response(null, { status: 200 });
    const productosPagados = await verificarOrden(id, fila.referencia);
    if (productosPagados) {
      if (JSON.stringify([...productosPagados].sort()) !== fila.productos) throw new Error('Productos del pedido no coinciden');
      await env.ENTREGAS.prepare('UPDATE entregas SET aprobado_en = COALESCE(aprobado_en, ?) WHERE orden_id = ?')
        .bind(ahora(), id).run();
      await enviarEntrega(env, id);
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    console.warn('Entrega de prueba pendiente:', error.message);
    return new Response(null, { status: 503 });
  }
}

export async function descargar(request, env, url) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const match = url.pathname.match(/^\/descarga\/([a-f0-9-]{36})\/([a-z]+)$/);
  if (request.method !== 'GET' || !match || !env.ENTREGAS || !env.GUIAS) return new Response('Enlace no disponible', { status: 404, headers });
  const [, token, producto] = match;
  const fila = await env.ENTREGAS.prepare('SELECT productos, aprobado_en FROM entregas WHERE token = ?')
    .bind(token).first();
  if (!fila?.aprobado_en || ahora() - fila.aprobado_en >= sieteDias ||
      !archivos.has(producto) || !JSON.parse(fila.productos).includes(producto)) {
    return new Response('Enlace no disponible o vencido', { status: 404, headers });
  }
  const nombre = archivos.get(producto);
  const pdf = await env.GUIAS.get(nombre);
  if (!pdf) return new Response('Archivo no disponible', { status: 404, headers });
  return new Response(pdf.body, {
    headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + nombre + '"', 'X-Content-Type-Options': 'nosniff' },
  });
}
