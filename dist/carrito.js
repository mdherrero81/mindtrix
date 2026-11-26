(() => {
  const claveCarrito = 'mindtrix.carrito.v1';
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
  let habilitado = false;
  let enviando = false;
  let intento;

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
    pagar.disabled = !habilitado || !carrito.size || enviando;
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
  const regreso = new URLSearchParams(window.location.search).has('regreso');
  fetch('/api/checkout', { cache: 'no-store' })
    .then(async response => {
      habilitado = response.ok && (await response.json()).habilitado === true;
      estado.textContent = regreso
        ? 'Volviste de Mercado Pago. Consultá el resultado en Mercado Pago.'
        : habilitado ? 'Compra de prueba en pesos argentinos.' : 'El pago de prueba está pendiente de configurar.';
      actualizar();
    })
    .catch(() => { estado.textContent = 'No pudimos comprobar si el pago está disponible.'; });

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
      window.location.assign(datos.url);
    } catch {
      estado.textContent = 'No pudimos abrir el pago. Volvé a intentar.';
    } finally {
      enviando = false;
      actualizar();
    }
  });
})();
