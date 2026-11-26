const productos = new Map([
  ['robotica', { title: 'Robótica Casera', price: 900 }],
  ['ciencia', { title: 'Ciencia y arte en casa', price: 900 }],
]);
const mercadoPago = 'https://www.mercadopago.com.ar';
const ordersApi = 'https://api.mercadopago.com/v1/orders';
const respuesta = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});

async function checkout(request, env, url) {
  const habilitado = Boolean(env.MP_TEST_ACCESS_TOKEN);
  if (request.method === 'GET') return respuesta({ habilitado });
  if (request.method !== 'POST') return respuesta({ error: 'Método no disponible.' }, 405);
  if (request.headers.get('Origin') !== url.origin) {
    return respuesta({ error: 'Abrí el carrito desde Mindtrix.' }, 403);
  }
  if (!habilitado) return respuesta({ error: 'El checkout de prueba está pendiente de configurar.' }, 503);

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

  const seleccion = [...ids].sort().map(id => productos.get(id));
  const total = seleccion.reduce((suma, producto) => suma + producto.price, 0);
  const volver = new URL('/carrito/?regreso=1', url.origin).href;
  const token = env.MP_TEST_ACCESS_TOKEN.trim();
  if (!/^[!-~]+$/.test(token)) {
    return respuesta({ error: 'Revisá el secreto de prueba en Cloudflare. El valor está vacío o contiene espacios internos.' }, 503);
  }

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
    console.error('Checkout de prueba: falló el pedido a Mercado Pago.', error.name);
    return respuesta({ error: 'Cloudflare no recibió respuesta de Mercado Pago (MP_CONEXION).' }, 502);
  }
  if (!resultado.ok) {
    console.warn('Checkout de prueba: Mercado Pago devolvió HTTP', resultado.status);
    return respuesta({ error: 'Mercado Pago rechazó el pedido de prueba (HTTP ' + resultado.status +
      '). Revisá Tus integraciones → API Requests.' }, 502);
  }

  const orden = await resultado.json().catch(() => null);
  let destino;
  try {
    destino = new URL(orden?.checkout_url);
  } catch {
    return respuesta({ error: 'Mercado Pago respondió, pero faltó un enlace válido de checkout (MP_ENLACE).' }, 502);
  }
  if (!/^ORDTST[A-Z0-9]+$/.test(orden.id) || orden.currency !== 'ARS' ||
      Number(orden.total_amount) !== total || destino.origin !== mercadoPago ||
      destino.pathname !== '/checkout/v1/redirect' ||
      destino.searchParams.get('order_id') !== orden.id) {
    return respuesta({ error: 'Mercado Pago no devolvió una orden de prueba válida por el total del carrito (MP_ORDEN).' }, 502);
  }
  return respuesta({ url: destino.href });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/checkout') return checkout(request, env, url);
    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok || request.method !== 'GET' || !asset.headers.get('Content-Type')?.startsWith('text/html')) {
      return asset;
    }

    return new HTMLRewriter()
      .on('head', { element(element) {
        element.prepend('<script defer src="/carrito.js"></script>', { html: true });
      } })
      .on('header .mx-top, header .nav', { element(element) {
        element.append('<a class="mx-collection" href="/carrito/" data-carrito-contador>Carrito</a>', { html: true });
      } })
      .transform(asset);
  },
};
