import { descargar, entregaConfigurada, guiasDisponibles, habilitarDescargas } from './entrega.mjs';

const productos = new Map([
  ['robotica', { title: 'Robótica Casera', price: 900 }],
  ['ciencia', { title: 'Ciencia y arte en casa', price: 900 }],
]);
const mercadoPago = 'https://www.mercadopago.com.ar';
const ordersApi = 'https://api.mercadopago.com/v1/orders';
const respuesta = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});

function esProduccion(env) {
  return env.MINDTRIX_PAYMENT_MODE === 'production';
}

function tokenDePago(env) {
  return (esProduccion(env) ? env.MP_ACCESS_TOKEN : env.MP_TEST_ACCESS_TOKEN)?.trim();
}

function identificadorValido(id, env) {
  if (typeof id !== 'string') return false;
  return esProduccion(env) ? /^ORD(?!TST)[A-Z0-9]{1,64}$/.test(id) : /^ORDTST[A-Z0-9]{1,64}$/.test(id);
}

function origenPermitido(url, env) {
  return !esProduccion(env) || url.origin === 'https://mindtrix.store';
}

async function checkout(request, env, url) {
  const token = tokenDePago(env);
  const habilitado = Boolean(token && /^[!-~]+$/.test(token) && entregaConfigurada(env) &&
    origenPermitido(url, env) && (!esProduccion(env) || env.MINDTRIX_LIVE_CHECKOUT === 'true'));
  if (request.method === 'GET') return respuesta({ habilitado, entrega: entregaConfigurada(env) });
  if (request.method !== 'POST') return respuesta({ error: 'Método no disponible.' }, 405);
  if (request.headers.get('Origin') !== url.origin || !origenPermitido(url, env)) {
    return respuesta({ error: 'Abrí el carrito desde Mindtrix.' }, 403);
  }
  if (!habilitado) return respuesta({ error: 'El pago con Mercado Pago todavía no está habilitado.' }, 503);

  const clave = request.headers.get('Idempotency-Key');
  if (!clave || !/^[a-f0-9-]{36}$/i.test(clave)) {
    return respuesta({ error: 'Volvé a iniciar el pedido desde el carrito.' }, 400);
  }
  const datos = await request.json().catch(() => null);
  const ids = datos?.productos;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > productos.size ||
      new Set(ids).size !== ids.length || ids.some(id => !productos.has(id))) {
    return respuesta({ error: 'Revisá los productos del carrito.' }, 400);
  }

  const disponibles = await guiasDisponibles(env, ids).catch(() => false);
  if (!disponibles) {
    return respuesta({ error: 'Una de las guías no está disponible para descargar.' }, 503);
  }
  const seleccion = [...ids].sort().map(id => productos.get(id));
  const total = seleccion.reduce((suma, producto) => suma + producto.price, 0);
  const volver = new URL('/carrito/?regreso=1', url.origin).href;

  let resultado;
  try {
    resultado = await fetch(ordersApi, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Idempotency-Key': clave,
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'manual',
        total_amount: total.toFixed(2),
        external_reference: clave,
        items: seleccion.map(({ title, price }) => ({ title, quantity: 1, unit_price: price.toFixed(2) })),
        config: { online: { success_url: volver, failure_url: volver, pending_url: volver, auto_return: 'all' } },
      }),
    });
  } catch (error) {
    console.error('Checkout: falló el pedido a Mercado Pago.', error.name);
    return respuesta({ error: 'Cloudflare no recibió respuesta de Mercado Pago (MP_CONEXION).' }, 502);
  }
  if (!resultado.ok) {
    console.warn('Checkout: Mercado Pago devolvió HTTP', resultado.status);
    return respuesta({ error: 'Mercado Pago rechazó el pedido (HTTP ' + resultado.status +
      '). Revisá Tus integraciones → API Requests.' }, 502);
  }

  const orden = await resultado.json().catch(() => null);
  let destino;
  try {
    destino = new URL(orden?.checkout_url);
  } catch {
    return respuesta({ error: 'Mercado Pago respondió, pero faltó un enlace válido de checkout (MP_ENLACE).' }, 502);
  }
  if (!identificadorValido(orden.id, env) || orden.currency !== 'ARS' ||
      Number(orden.total_amount) !== total || destino.origin !== mercadoPago ||
      destino.pathname !== '/checkout/v1/redirect' ||
      destino.searchParams.get('order_id') !== orden.id) {
    return respuesta({ error: 'Mercado Pago no devolvió una orden válida por el total del carrito (MP_ORDEN).' }, 502);
  }
  return respuesta({ url: destino.href, id: orden.id });
}

async function verificarPedido(request, env, url) {
  if (request.method !== 'POST') return respuesta({ error: 'Método no disponible.' }, 405);
  if (request.headers.get('Origin') !== url.origin || !origenPermitido(url, env)) return respuesta({ error: 'Abrí el carrito desde Mindtrix.' }, 403);

  const { id, referencia } = await request.json().catch(() => null) || {};
  if (!identificadorValido(id, env) || !/^[a-f0-9-]{36}$/i.test(referencia)) {
    return respuesta({ error: 'No se pudo identificar el pedido.' }, 400);
  }
  if (!entregaConfigurada(env)) return respuesta({ error: 'La descarga está pendiente de configurar.' }, 503);
  const estado = await consultarEstado(id, referencia, env);
  if (!estado.ok) return estado;
  const datos = await estado.json();
  if (datos.estado !== 'aprobado') return respuesta(datos);
  try {
    return respuesta({ ...datos, descarga: await habilitarDescargas(env, id, referencia, datos.productos) });
  } catch {
    return respuesta({ error: 'El pago fue aprobado. No pudimos habilitar la descarga todavía. Volvé a verificar sin pagar de nuevo.' }, 503);
  }
}

async function consultarEstado(id, referencia, env) {
  const token = tokenDePago(env);
  if (!token || !/^[!-~]+$/.test(token)) return respuesta({ error: 'El pago está pendiente de configurar.' }, 503);

  let resultado;
  try {
    resultado = await fetch(ordersApi + '/' + id, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
  } catch (error) {
    console.error('Consulta de orden: falló la conexión.', error.name);
    return respuesta({ error: 'Cloudflare no recibió respuesta al consultar el pedido (MP_ESTADO_CONEXION).' }, 502);
  }

  if (!resultado.ok) {
    console.warn('Consulta de orden: Mercado Pago devolvió HTTP', resultado.status);
    return respuesta({ error: 'Mercado Pago respondió HTTP ' + resultado.status +
      ' al consultar el pedido (MP_ESTADO_HTTP).' }, 502);
  }

  const orden = await resultado.json().catch(() => null);
  if (!orden) {
    return respuesta({ error: 'Mercado Pago respondió en un formato inesperado (MP_ESTADO_FORMATO).' }, 502);
  }
  if (orden.id !== id || orden.external_reference !== referencia || orden.currency !== 'ARS') {
    return respuesta({ error: 'La respuesta de Mercado Pago no coincide con este pedido (MP_ESTADO_PEDIDO).' }, 502);
  }

  if (orden.status === 'processed' && orden.status_detail === 'accredited') {
    const ids = [];
    for (const item of orden.items || []) {
      const producto = [...productos].find(([, datos]) =>
        datos.title === item.title && datos.price === Number(item.unit_price));
      if (!producto || Number(item.quantity) !== 1 || ids.includes(producto[0])) {
        return respuesta({ error: 'La orden aprobada no coincide con el catálogo.' }, 502);
      }
      ids.push(producto[0]);
    }
    const total = ids.reduce((suma, id) => suma + productos.get(id).price, 0);
    if (!total || Number(orden.total_amount) !== total || Number(orden.total_paid_amount) !== total) {
      return respuesta({ error: 'No pudimos verificar el importe pagado.' }, 502);
    }
    return respuesta({ estado: 'aprobado', productos: ids });
  }
  if (['canceled', 'failed', 'expired', 'refunded'].includes(orden.status)) {
    return respuesta({ estado: 'cerrado' });
  }
  return respuesta({ estado: orden.status === 'created' ? 'iniciado' : 'pendiente' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/checkout') return checkout(request, env, url);
    if (url.pathname === '/api/checkout/estado') return verificarPedido(request, env, url);
    if (url.pathname.startsWith('/descarga/') && origenPermitido(url, env)) return descargar(request, env, url);
    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok || request.method !== 'GET' || !asset.headers.get('Content-Type')?.startsWith('text/html')) {
      return asset;
    }

    const pagina = new Response(asset.body, asset);
    pagina.headers.set('Referrer-Policy', 'no-referrer');
    return new HTMLRewriter()
      .on('html', { element(element) {
        if (esProduccion(env)) element.setAttribute('data-pagos', 'produccion');
      } })
      .on('head', { element(element) {
        element.prepend('<script defer src="/carrito.js"></script>', { html: true });
      } })
      .on('header .mx-top, header .nav', { element(element) {
        element.append('<a class="mx-collection" href="/carrito/" data-carrito-contador>Carrito</a><a class="mx-collection" href="/mi-compra/">Mi compra</a>', { html: true });
      } })
      .transform(pagina);
  },
};
