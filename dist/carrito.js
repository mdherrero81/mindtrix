(() => {
  const claveCarrito = 'mindtrix.carrito.v1';
  const clavePedido = 'mindtrix.pedido-prueba.v1';
  const claveUltimoPedido = 'mindtrix.ultimo-pedido-prueba.v1';
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
  const esMiCompra = Boolean(document.querySelector('#mi-compra'));
  const copiar = document.querySelector('#copiar-compra');
  const pagoOriginal = document.querySelector('#retomar-compra');
  const enlacePrivado = document.querySelector('#enlace-compra');
  const descargas = document.querySelector('#carrito-descargas');
  const enlaces = document.querySelector('#carrito-enlaces');
  let habilitado = false;
  let enviando = false;
  let intento;
  function leerPedido(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
  }

  function mismoPedido(a, b) {
    return a?.id && a.id === b?.id && a.referencia === b.referencia;
  }

  function enlaceDePedido({ id, referencia }) {
    const enlace = new URL('/mi-compra/', window.location.origin);
    enlace.hash = new URLSearchParams({ id, referencia }).toString();
    return enlace;
  }

  function mostrarPagoOriginal(pedido) {
    if (!pagoOriginal || !pedido?.url) return false;
    const destino = new URL(pedido.url, window.location.origin);
    if (destino.origin !== 'https://www.mercadopago.com.ar' ||
        destino.pathname !== '/checkout/v1/redirect' || destino.searchParams.get('order_id') !== pedido.id) return false;
    pagoOriginal.href = destino.href;
    pagoOriginal.hidden = false;
    return true;
  }

  function mostrarEnlacePrivado(pedido) {
    if (!enlacePrivado || !pedido) return;
    enlacePrivado.value = enlaceDePedido(pedido).href;
    enlacePrivado.parentElement.hidden = false;
  }

  let pedido = estado ? leerPedido(clavePedido) : null;

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
  if (!pagar && !esMiCompra) return;
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
    if (!esMiCompra) mostrarDescargas(JSON.parse(localStorage.getItem(claveDescarga)));
  } catch {
    // El carrito puede seguir usándose si el navegador no guarda la descarga.
  }
  if (esMiCompra) {
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    if (window.location.hash) {
      const id = fragmento.get('id');
      const referencia = fragmento.get('referencia');
      const enlaceValido = /^ORDTST[A-Z0-9]{1,64}$/.test(id) && /^[a-f0-9-]{36}$/i.test(referencia);
      pedido = enlaceValido ? (mismoPedido(pedido, { id, referencia }) ? pedido : { id, referencia }) : null;
    } else {
      pedido ??= leerPedido(claveUltimoPedido);
    }
    mostrarEnlacePrivado(pedido);
    pagoOriginal.addEventListener('click', () => {
      const pendiente = leerPedido(clavePedido);
      if (!mismoPedido(pendiente, pedido)) return;
      pedido.checkoutAbierto = true;
      try { localStorage.setItem(clavePedido, JSON.stringify(pedido)); } catch {}
    });
    copiar.addEventListener('click', async () => {
      if (!enlacePrivado.value) return;
      try {
        await navigator.clipboard.writeText(enlacePrivado.value);
        document.querySelector('#estado-copia').textContent = 'Enlace copiado.';
      } catch {
        enlacePrivado.focus();
        enlacePrivado.select();
        document.querySelector('#estado-copia').textContent = 'Copiá el enlace seleccionado.';
      }
    });
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
    if (pagoOriginal) pagoOriginal.hidden = true;
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
        const pendiente = leerPedido(clavePedido);
        if (datos.descarga.enlaces.length) mostrarDescargas(datos.descarga);
        try {
          localStorage.setItem(claveUltimoPedido, JSON.stringify({ id: pedido.id, referencia: pedido.referencia }));
          if (!esMiCompra || mismoPedido(pendiente, pedido)) {
            const carActual = leerCarrito();
            ids.forEach(id => carActual.delete(id));
            localStorage.setItem(claveCarrito, JSON.stringify([...carActual]));
            carrito.clear();
            carActual.forEach(id => carrito.add(id));
            if (datos.descarga.enlaces.length) localStorage.setItem(claveDescarga, JSON.stringify(datos.descarga));
            if (!pendiente || mismoPedido(pendiente, pedido)) localStorage.removeItem(clavePedido);
          }
        } catch {
          // El enlace privado y la descarga pueden usarse aunque el navegador bloquee el guardado.
        }
        pedido = null;
        if (regreso) history.replaceState(null, '', window.location.pathname);
        estado.textContent = datos.descarga.enlaces.length
          ? 'Pago de prueba aprobado. Tus guías están listas para descargar.'
          : 'Pago de prueba aprobado. El plazo de descarga ya venció.';
      } else if (datos.estado === 'cerrado') {
        if (mismoPedido(leerPedido(clavePedido), pedido)) localStorage.removeItem(clavePedido);
        pedido = null;
        intento = undefined;
        if (regreso) history.replaceState(null, '', window.location.pathname);
        estado.textContent = 'El pedido anterior terminó sin un pago acreditado. Podés volver a intentar.';
      } else {
        estado.textContent = 'Mercado Pago todavía no confirma el pago.';
        if (datos.estado === 'iniciado' && pedido.url) {
          if (mostrarPagoOriginal(pedido)) {
            estado.textContent = 'Tu pedido está listo. Guardá el enlace privado y seguí a Mercado Pago.';
          } else {
            const enlace = document.createElement('a');
            enlace.href = enlaceDePedido(pedido).href;
            enlace.textContent = ' Abrir Mi compra';
            estado.append(enlace);
          }
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
      if (esMiCompra && !pedido?.checkoutAbierto && mostrarPagoOriginal(pedido)) {
        estado.textContent = 'Guardá el enlace privado y seguí a Mercado Pago.';
        consultar.hidden = false;
        return;
      }
      if (pedido) return verificar();
      if (esMiCompra) {
        estado.textContent = window.location.hash
          ? 'Este enlace de compra es inválido o está incompleto.'
          : 'Abrí el enlace privado que guardaste al iniciar tu compra.';
        return;
      }
      estado.textContent = regreso
        ? 'Esta compra no tiene un pedido guardado en el navegador. Revisá el resultado en Mercado Pago.'
        : habilitado ? 'Compra de prueba en pesos argentinos.' : 'El pago de prueba está pendiente de configurar.';
      actualizar();
    })
    .catch(() => {
      consultar.hidden = !pedido;
      estado.textContent = 'No pudimos comprobar si el pago está disponible.';
    });

  pagar?.addEventListener('click', async () => {
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
      window.location.assign(enlaceDePedido(pedido).href);
    } catch {
      estado.textContent = 'No pudimos abrir el pago. Volvé a intentar.';
    } finally {
      enviando = false;
      actualizar();
    }
  });
})();
