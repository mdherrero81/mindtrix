import { enlacesDeDescarga } from './entrega.mjs';

const origen = 'https://mindtrix.store';
const callback = origen + '/auth/google/callback';
const cookieIntento = '__Host-mindtrix_google';
const cookieSesion = '__Host-mindtrix_sesion';
const diezMinutos = 600;
const catorceDias = 14 * 24 * 60 * 60;
const tokenValido = /^[A-Za-z0-9_-]{43}$/;
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const encode = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function tokenAleatorio() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function huella(texto) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(texto))));
}

function leerCookie(request, nombre) {
  return request.headers.get('Cookie')?.split(';').map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nombre + '='))?.slice(nombre.length + 1) || '';
}

function cookie(nombre, valor, vence) {
  return nombre + '=' + valor + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + vence;
}

function json(datos, status = 200) {
  return Response.json(datos, { status, headers });
}

function redirigir(destino, ...cookies) {
  const respuesta = new Response(null, { status: 303, headers: { ...headers, Location: destino } });
  for (const valor of cookies) respuesta.headers.append('Set-Cookie', valor);
  return respuesta;
}

export function cuentaConfigurada(env, url) {
  return url.origin === origen && Boolean(env.ENTREGAS && env.GOOGLE_CLIENT_ID?.trim() &&
    env.GOOGLE_CLIENT_SECRET?.trim());
}

async function iniciarGoogle(request, url, env) {
  const estado = tokenAleatorio();
  const verificador = tokenAleatorio();
  const nonce = tokenAleatorio();
  const volver = url.searchParams.get('volver') === 'carrito' ? 'carrito' : 'cuenta';
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID.trim(),
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email',
    state: estado,
    nonce,
    code_challenge: await huella(verificador),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  const intento = [estado, verificador, nonce, volver].join('.');
  return redirigir('https://accounts.google.com/o/oauth2/v2/auth?' + params,
    cookie(cookieIntento, intento, diezMinutos));
}

function identidad(idToken, env, nonce) {
  // El token llega del endpoint HTTPS de Google mediante un intercambio autenticado.
  const partes = typeof idToken === 'string' ? idToken.split('.') : [];
  if (partes.length !== 3 || !partes[1] || partes[1].length > 8192) return null;
  const bytes = Uint8Array.from(atob(partes[1].replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const datos = JSON.parse(new TextDecoder().decode(bytes));
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(datos.iss) ||
      datos.aud !== env.GOOGLE_CLIENT_ID.trim() || datos.nonce !== nonce ||
      !Number.isInteger(datos.exp) || datos.exp <= Math.floor(Date.now() / 1000) ||
      typeof datos.sub !== 'string' || !/^[\x21-\x7E]{1,255}$/.test(datos.sub) ||
      datos.email_verified !== true || typeof datos.email !== 'string' ||
      datos.email.length > 320 || !datos.email.includes('@')) return null;
  return datos;
}

async function recibirGoogle(request, url, env) {
  const [estado, verificador, nonce, volver] = leerCookie(request, cookieIntento).split('.');
  const borrarIntento = cookie(cookieIntento, '', 0);
  const fallo = redirigir('/cuenta/?google=error', borrarIntento);
  const codigo = url.searchParams.get('code');
  if (!tokenValido.test(estado) || !tokenValido.test(verificador) || !tokenValido.test(nonce) ||
      url.searchParams.get('state') !== estado || !codigo) {
    return redirigir('/cuenta/?google=' + (url.searchParams.has('error') ? 'cancelado' : 'error'), borrarIntento);
  }

  try {
    const respuesta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
      body: new URLSearchParams({
        code: codigo,
        client_id: env.GOOGLE_CLIENT_ID.trim(),
        client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
        redirect_uri: callback,
        grant_type: 'authorization_code',
        code_verifier: verificador,
      }),
    });
    if (!respuesta.ok) {
      console.warn('Google OAuth: el intercambio devolvió HTTP', respuesta.status);
      return fallo;
    }
    const datos = identidad((await respuesta.json()).id_token, env, nonce);
    if (!datos) return fallo;
    const sesion = tokenAleatorio();
    const hash = await huella(sesion);
    const anterior = leerCookie(request, cookieSesion);
    const anteriorHash = tokenValido.test(anterior) ? await huella(anterior) : '';
    const db = env.ENTREGAS;
    await db.batch([
      db.prepare('DELETE FROM sesiones_clientes WHERE vence <= unixepoch() OR token_hash = ?').bind(anteriorHash),
      db.prepare(`
        INSERT INTO clientes (google_sub, correo) VALUES (?, ?)
        ON CONFLICT (google_sub) DO UPDATE SET correo = excluded.correo
      `).bind(datos.sub, datos.email),
      db.prepare(`
        INSERT INTO sesiones_clientes (token_hash, google_sub, vence) VALUES (?, ?, unixepoch() + ?)
      `).bind(hash, datos.sub, catorceDias),
    ]);
    return redirigir(volver === 'carrito' ? '/carrito/' : '/cuenta/',
      borrarIntento, cookie(cookieSesion, sesion, catorceDias));
  } catch (error) {
    console.warn('Google OAuth: no se pudo iniciar la sesión', error.name);
    return fallo;
  }
}

export async function clienteActivo(request, env) {
  const token = leerCookie(request, cookieSesion);
  if (!tokenValido.test(token)) return null;
  return env.ENTREGAS.prepare(`
    SELECT clientes.google_sub, clientes.correo
    FROM sesiones_clientes JOIN clientes USING (google_sub)
    WHERE token_hash = ? AND vence > unixepoch()
  `).bind(await huella(token)).first();
}

export async function guardarPedidoCliente(env, cliente, id, referencia) {
  const fila = await env.ENTREGAS.prepare(`
    INSERT INTO pedidos_clientes (orden_id, referencia, google_sub) VALUES (?, ?, ?)
    ON CONFLICT (orden_id) DO UPDATE SET orden_id = excluded.orden_id
    WHERE pedidos_clientes.referencia = excluded.referencia
      AND pedidos_clientes.google_sub = excluded.google_sub
    RETURNING orden_id
  `).bind(id, referencia, cliente.google_sub).first();
  if (!fila) throw new Error('El pedido ya pertenece a otra cuenta');
}

async function datosCuenta(request, env) {
  const cliente = await clienteActivo(request, env);
  if (!cliente) return json({ cliente: null, pedidos: [] });
  const { results } = await env.ENTREGAS.prepare(`
    SELECT pedidos_clientes.orden_id, creado_en, aprobado_en, productos, token
    FROM pedidos_clientes LEFT JOIN entregas USING (orden_id, referencia)
    WHERE google_sub = ?
    ORDER BY creado_en DESC, pedidos_clientes.orden_id
    LIMIT 100
  `).bind(cliente.google_sub).all();
  return json({
    cliente: { correo: cliente.correo },
    pedidos: results.map(fila => ({
      id: fila.orden_id,
      fecha: fila.creado_en,
      productos: fila.productos ? JSON.parse(fila.productos) : [],
      descarga: fila.aprobado_en ? enlacesDeDescarga(fila, JSON.parse(fila.productos)) : null,
    })),
  });
}

export async function rutaCuenta(request, env, url, verificarPedido) {
  const ruta = url.pathname;
  if (ruta === '/api/cuenta' && request.method === 'GET' && !cuentaConfigurada(env, url)) {
    return json({ disponible: false });
  }
  if (!cuentaConfigurada(env, url)) return json({ error: 'Acceso con Google no disponible.' }, 404);
  try {
    if (request.method === 'GET') {
      if (ruta === '/auth/google') return iniciarGoogle(request, url, env);
      if (ruta === '/auth/google/callback') return recibirGoogle(request, url, env);
      if (ruta === '/api/cuenta') return await datosCuenta(request, env);
    }
    if (request.method !== 'POST') return json({ error: 'Método no disponible.' }, 405);
    if (request.headers.get('Origin') !== origen) return json({ error: 'Abrí tu cuenta desde Mindtrix.' }, 403);
    if (ruta === '/auth/salir') {
      const token = leerCookie(request, cookieSesion);
      if (tokenValido.test(token)) {
        await env.ENTREGAS.prepare('DELETE FROM sesiones_clientes WHERE token_hash = ?').bind(await huella(token)).run();
      }
      return redirigir('/cuenta/', cookie(cookieSesion, '', 0));
    }
    if (ruta === '/api/cuenta/pedido') {
      const cliente = await clienteActivo(request, env);
      if (!cliente) return json({ error: 'Volvé a iniciar sesión.' }, 401);
      const { id } = await request.json().catch(() => null) || {};
      if (typeof id !== 'string' || !/^ORD(?!TST)[A-Z0-9]{1,64}$/.test(id)) return json({ error: 'Pedido inválido.' }, 400);
      const fila = await env.ENTREGAS.prepare(`
        SELECT referencia FROM pedidos_clientes WHERE orden_id = ? AND google_sub = ?
      `).bind(id, cliente.google_sub).first();
      if (!fila) return json({ error: 'Pedido no disponible.' }, 404);
      return await verificarPedido(id, fila.referencia, env);
    }
    return json({ error: 'Página no disponible.' }, 404);
  } catch (error) {
    console.warn('Cuenta: no se pudo completar la operación', error.name);
    return json({ error: 'No pudimos acceder a tu cuenta. Volvé a intentar.' }, 503);
  }
}
