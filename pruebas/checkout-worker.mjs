const title = 'Robótica Casera';
const amount = '900.00';
const mpOrigin = 'https://www.mercadopago.com.ar';
const api = 'https://api.mercadopago.com/v1/orders';
const testOrderId = /^ORDTST[A-Z0-9]+$/;

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; form-action 'self' https://www.mercadopago.com.ar; base-uri 'none'; frame-ancestors 'none'",
};

function page(message, status = 200) {
  return new Response('<!doctype html><html lang="es-AR"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Mindtrix · Compra de prueba</title><main><h1>Mindtrix · Compra de prueba</h1>' +
    '<p>Robótica Casera · $900 ARS simulados</p>' + message + '</main></html>', { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/') return page('<p>Página no encontrada.</p>', 404);
    if (request.method === 'GET') {
      return page('<p>Usá la tarjeta de prueba que te muestra Mercado Pago.</p>' +
        '<form method="post"><button>Ir a Mercado Pago</button></form>');
    }
    if (request.method !== 'POST') return page('<p>Método no disponible.</p>', 405);
    if (request.headers.get('origin') !== url.origin) return page('<p>Iniciá la prueba desde esta página.</p>', 403);
    if (!env.MP_TEST_ACCESS_TOKEN) return page('<p>Falta configurar el Access Token de prueba.</p>', 503);

    const reference = crypto.randomUUID();
    try {
      const response = await fetch(api, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': 'Bearer ' + env.MP_TEST_ACCESS_TOKEN,
          'content-type': 'application/json',
          'x-idempotency-key': reference,
        },
        body: JSON.stringify({
          type: 'online',
          processing_mode: 'manual',
          external_reference: reference,
          total_amount: amount,
          items: [{ title, quantity: 1, unit_price: amount }],
        }),
      });
      if (!response.ok) {
        return page('<p>Mercado Pago rechazó la creación del pedido (HTTP ' + response.status +
          '). Revisá las credenciales y los logs en el panel de tu aplicación.</p>', 502);
      }

      const order = await response.json();
      const checkout = new URL(order.checkout_url);
      if (!testOrderId.test(order.id) || checkout.origin !== mpOrigin ||
          checkout.pathname !== '/checkout/v1/redirect' ||
          checkout.searchParams.get('order_id') !== order.id ||
          Number(order.total_amount) !== Number(amount) || order.currency !== 'ARS') {
        return page('<p>Mercado Pago no devolvió una orden de prueba argentina por el importe esperado.</p>', 502);
      }
      return new Response(null, {
        status: 303,
        headers: { location: checkout.href, 'cache-control': 'no-store' },
      });
    } catch {
      return page('<p>No se pudo iniciar la compra de prueba. Volvé a intentarlo.</p>', 502);
    }
  },
};
