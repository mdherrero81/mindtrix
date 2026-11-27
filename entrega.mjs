const archivos = new Map([
  ['robotica', 'robotica-casera.pdf'],
  ['ciencia', 'ciencia-y-arte-en-casa.pdf'],
]);

const dosDias = 2 * 24 * 60 * 60;
const ahora = () => Math.floor(Date.now() / 1000);

export function entregaConfigurada(env) {
  return Boolean(env.ENTREGAS && env.GUIAS);
}

export async function guiasDisponibles(env, ids) {
  const objetos = await Promise.all(ids.map(id => env.GUIAS.head(archivos.get(id))));
  return objetos.every(Boolean);
}

export async function habilitarDescargas(env, id, referencia, ids) {
  if (!await guiasDisponibles(env, ids)) throw new Error('Falta una guía en R2');
  const productos = JSON.stringify([...ids].sort());

  const fila = await env.ENTREGAS.prepare(`
    INSERT INTO entregas (orden_id, referencia, correo, productos, token, aprobado_en)
    VALUES (?, ?, '', ?, ?, ?)
    ON CONFLICT (orden_id) DO UPDATE SET aprobado_en = COALESCE(entregas.aprobado_en, excluded.aprobado_en)
    WHERE entregas.referencia = excluded.referencia AND entregas.productos = excluded.productos
    RETURNING token, aprobado_en
  `).bind(id, referencia, productos, crypto.randomUUID(), ahora()).first();

  if (!fila) throw new Error('El pedido almacenado no coincide con la orden acreditada');
  const vence = fila.aprobado_en + dosDias;
  return {
    vence,
    enlaces: ahora() >= vence ? [] : ids.map(producto => ({
      producto,
      url: '/descarga/' + fila.token + '/' + producto,
    })),
  };
}

export async function descargar(request, env, url) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const match = url.pathname.match(/^\/descarga\/([a-f0-9-]{36})\/([a-z]+)$/);
  if (request.method !== 'GET' || !match || !env.ENTREGAS || !env.GUIAS) return new Response('Enlace no disponible', { status: 404, headers });
  const [, token, producto] = match;
  const fila = await env.ENTREGAS.prepare('SELECT productos, aprobado_en FROM entregas WHERE token = ?')
    .bind(token).first();
  if (!fila?.aprobado_en || ahora() - fila.aprobado_en >= dosDias ||
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
