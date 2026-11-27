(() => {
  const claveCarrito = 'mindtrix.carrito.v1';
  const clavePedido = 'mindtrix.pedido-prueba.v1';
  const claveDescarga = 'mindtrix.descarga-prueba.v1';
  const productos = new Map([
    ['robotica', { titulo: 'Robótica Casera', precio: 900 }],
    ['ciencia', { titulo: 'Ciencia y arte en casa', precio: 900 }],
  ]);
  const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

  function leerCarrito() {
    try {
      const datos = JSON.parse(localStorage.getItem(claveCarrito));
      return new Set(Array.isArray(datos) ? datos.filter(id => productos.has(id)) : []);
    } catch {
      return new Set();
    }
  }

  const carrito = leerCarrito();
  const contadores = document.querySelectorAll('[data-carrito-contador]');
  const lista = document.querySelector('#carrito-productos');
  const total = document.querySelector('#carrito-total');
  const pagar = document.querySelector('#carrito-pagar');
  const estado = document.querySelector('#carrito-estado');
  const descargas = document.querySelector('#carrito-descargas');
  const enlaces = document.querySelector('#carrito-enlaces');
  let habilitado = false;
  let enviando = false;
  let intento;
  let pedido;
  if (pagar) {
    try { pedido = JSON.parse(localStorage.getItem(clavePedido)); } catch { pedido = null; }
  }

  function actualizar() {
    contadores.forEach(enlace => {
      enlace.textContent = carrito.size ? 'Carrito (' + carrito.size + ')' : 'Carrito';
    });
    if (!lista) return;
    let importe = 0;
    lista.replaceChildren();
    for (const id of carrito) {
      const producto = productos.get(id);
      importe += producto.precio;
      const item = document.createElement('li');
      item.append(producto.titulo + ' · ' + pesos.format(producto.precio) + ' ARS ');
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.dataset.quitar = id;
      quitar.disabled = enviando;
      quitar.textContent = 'Quitar';
      quitar.setAttribute('aria-label', 'Quitar ' + producto.titulo);
      item.append(quitar);
      lista.append(item);
    }
    total.textContent = carrito.size ? 'Total · ' + pesos.format(importe) + ' ARS' : 'Tu carrito está vacío.';
    pagar.disabled = !habilitado || !carrito.size || enviando || Boolean(pedido);
  }

  function guardar() {
    localStorage.setItem(claveCarrito, JSON.stringify([...carrito]));
    intento = undefined;
    actualizar();
  }

  document.addEventListener('click', event => {
    const agregar = event.target.closest('[data-agregar-carrito]');
    const quitar = event.target.closest('[data-quitar]');
    if (enviando || (!agregar && !quitar)) return;
    try {
      if (agregar && productos.has(agregar.dataset.agregarCarrito)) {
        carrito.add(agregar.dataset.agregarCarrito);
        guardar();
        window.location.assign('/carrito/');
      } else if (quitar) {
        carrito.delete(quitar.dataset.quitar);
        guardar();
        (lista.querySelector('button') || document.querySelector('a[href="/taller-curioso/"]')).focus();
      }
    } catch {
      window.alert('El navegador bloqueó el guardado del carrito.');
    }
  });

  actualizar();
  if (!pagar) return;
  function mostrarDescargas(datos) {
    if (typeof datos?.vence !== 'number' || datos.vence <= Date.now() / 1000 || !Array.isArray(datos.enlaces)) return;
    enlaces.replaceChildren();
    for (const { producto, url } of datos.enlaces) {
      if (!productos.has(producto) || !/^\/descarga\/[a-f0-9-]{36}\/[a-z]+$/.test(url) ||
          !url.endsWith('/' + producto)) continue;
      const item = document.createElement('li');
      const boton = document.createElement('a');
      boton.className = 'button';
      boton.href = url;
      boton.textContent = 'Descargar PDF · ' + productos.get(producto).titulo;
      item.append(boton);
      enlaces.append(item);
    }
    descargas.hidden = !enlaces.childElementCount;
  }

  try {
    mostrarDescargas(JSON.parse(localStorage.getItem(claveDescarga)));
  } catch {
    // El carrito puede seguir usándose si el navegador no guarda la descarga.
  }
  const retorno = new URLSearchParams(window.location.search);
  const regreso = retorno.has('regreso');
  if (!pedido && regreso) {
    const id = retorno.get('order_id');
    const referencia = retorno.get('external_reference');
    if (/^ORDTST[A-Z0-9]{1,64}$/.test(id) && /^[a-f0-9-]{36}$/i.test(referencia)) {
      pedido = { id, referencia };
    }
  }
  const consultar = document.createElement('button');
  consultar.type = 'button';
  consultar.className = 'mx-collection';
  consultar.textContent = 'Verificar pago';
  consultar.hidden = true;
  estado.after(consultar);

  async function verificar() {
    if (!pedido || enviando) return;
    enviando = true;
    consultar.disabled = true;
    estado.textContent = 'Verificando el pago en Mercado Pago…';
    actualizar();
    try {
      const respuesta = await fetch('/api/checkout/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedido.id, referencia: pedido.referencia }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'No pudimos verificar el pago.');
      if (datos.estado === 'aprobado') {
        const ids = datos.productos;
        if (pedido.productos && (ids.length !== pedido.productos.length || ids.some(id => !pedido.productos.includes(id)))) {
          throw new Error('El pedido aprobado no coincide con la selección guardada.');
        }
        const carActual = leerCarrito();
        ids.forEach(id => carActual.delete(id));
        localStorage.setItem(claveCarrito, JSON.stringify([...carActual]));
        carrito.clear();
        carActual.forEach(id => carrito.add(id));
        if (datos.descarga.enlaces.length) {
          localStorage.setItem(claveDescarga, JSON.stringify(datos.descarga));
          mostrarDescargas(datos.descarga);
        }
        localStorage.removeItem(clavePedido);
        pedido = null;
        if (regreso) history.replaceState(null, '', window.location.pathname);
        estado.textContent = datos.descarga.enlaces.length
          ? 'Pago de prueba aprobado. Tus guías están listas para descargar.'
          : 'Pago de prueba aprobado. El plazo de descarga ya venció.';
      } else if (datos.estado === 'cerrado') {
        localStorage.removeItem(clavePedido);
        pedido = null;
        intento = undefined;
        if (regreso) history.replaceState(null, '', window.location.pathname);
        estado.textContent = 'El pedido anterior terminó sin un pago acreditado. Podés volver a intentar.';
      } else {
        estado.textContent = 'Mercado Pago todavía no confirma el pago. Tu carrito sigue guardado.';
        if (datos.estado === 'iniciado' && pedido.url) {
          const enlace = document.createElement('a');
          enlace.href = pedido.url;
          enlace.textContent = ' Retomar el pago de prueba';
          estado.append(enlace);
        }
      }
    } catch (error) {
      estado.textContent = error.message;
    } finally {
      enviando = false;
      consultar.disabled = false;
      consultar.hidden = !pedido;
      actualizar();
    }
  }

  consultar.addEventListener('click', verificar);
  fetch('/api/checkout', { cache: 'no-store' })
    .then(async response => {
      const config = response.ok ? await response.json() : {};
      habilitado = config.habilitado === true;
      if (pedido) return verificar();
      estado.textContent = regreso
        ? 'Esta compra no tiene un pedido guardado en el navegador. Revisá el resultado en Mercado Pago.'
        : habilitado ? 'Compra de prueba en pesos argentinos.' : 'El pago de prueba está pendiente de configurar.';
      actualizar();
    })
    .catch(() => {
      consultar.hidden = !pedido;
      estado.textContent = 'No pudimos comprobar si el pago está disponible.';
    });

  pagar.addEventListener('click', async () => {
    if (pagar.disabled) return;
    enviando = true;
    estado.textContent = 'Preparando el pedido de prueba…';
    actualizar();
    try {
      intento ??= crypto.randomUUID();
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intento },
        body: JSON.stringify({ productos: [...carrito] }),
      });
      const datos = await response.json();
      if (!response.ok) {
        estado.textContent = datos.error || 'El pedido de prueba no pudo iniciarse.';
        return;
      }
      const nuevoPedido = { id: datos.id, referencia: intento, productos: [...carrito], url: datos.url };
      localStorage.setItem(clavePedido, JSON.stringify(nuevoPedido));
      pedido = nuevoPedido;
      window.location.assign(datos.url);
    } catch {
      estado.textContent = 'No pudimos abrir el pago. Volvé a intentar.';
    } finally {
      enviando = false;
      actualizar();
    }
  });
})();
