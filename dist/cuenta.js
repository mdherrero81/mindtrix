(() => {
  const acceso = document.querySelector('#cuenta-acceso');
  const estado = document.querySelector('#cuenta-estado');
  const carrito = document.querySelector('#carrito-cuenta');
  const pedidos = document.querySelector('#cuenta-pedidos');
  const lista = document.querySelector('#cuenta-lista');
  const titulos = { robotica: 'Robótica Casera', ciencia: 'Ciencia y arte en casa' };
  const formato = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  });

  function fecha(segundos) {
    return formato.format(new Date(segundos * 1000));
  }

  async function consultar(url, opciones) {
    const respuesta = await fetch(url, { cache: 'no-store', ...opciones });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No pudimos consultar tu cuenta.');
    return datos;
  }

  function mostrarPedido(pedido) {
    const item = document.createElement('li');
    const info = document.createElement('p');
    const titulosPedido = pedido.productos.map(id => titulos[id] || id);
    info.textContent = (titulosPedido.join(', ') || 'Pedido iniciado') + ' · ' + fecha(pedido.fecha);
    item.append(info);

    if (pedido.descarga) {
      const detalle = document.createElement('p');
      const { enlaces, vence } = pedido.descarga;
      detalle.textContent = enlaces.length ? 'Descarga disponible hasta el ' + fecha(vence) + '.' : 'El plazo de descarga venció.';
      item.append(detalle);
      for (const { producto, url } of enlaces) {
        const enlace = document.createElement('a');
        enlace.className = 'mx-collection';
        enlace.href = url;
        enlace.textContent = 'Descargar ' + (titulos[producto] || producto);
        item.append(enlace);
      }
    } else {
      const verificar = document.createElement('button');
      const mensaje = document.createElement('span');
      mensaje.setAttribute('role', 'status');
      verificar.type = 'button';
      verificar.className = 'mx-collection';
      verificar.textContent = 'Verificar pago';
      verificar.addEventListener('click', async () => {
        verificar.disabled = true;
        mensaje.textContent = ' Consultando el pago…';
        try {
          const datos = await consultar('/api/cuenta/pedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pedido.id }),
          });
          if (datos.estado === 'aprobado') {
            item.replaceWith(mostrarPedido({ ...pedido, ...datos }));
            return;
          }
          mensaje.textContent = datos.estado === 'cerrado' ? ' El pedido está cerrado.' : ' El pago todavía no se acreditó.';
        } catch (error) {
          mensaje.textContent = ' ' + error.message;
        } finally {
          verificar.disabled = false;
        }
      });
      item.append(verificar, mensaje);
    }
    return item;
  }

  consultar('/api/cuenta').then(datos => {
    if (datos.disponible === false) {
      if (estado) estado.textContent = 'El acceso con Google todavía no está disponible.';
      return;
    }
    if (carrito) {
      if (datos.cliente) {
        carrito.querySelector('[data-cuenta-carrito]').textContent = 'Sesión iniciada. Este pedido quedará en Mis compras.';
        const enlace = carrito.querySelector('a');
        enlace.href = '/cuenta/';
        enlace.textContent = 'Mi cuenta';
      }
      carrito.hidden = false;
      return;
    }
    if (!datos.cliente) {
      const motivo = new URLSearchParams(location.search).get('google');
      estado.textContent = motivo === 'cancelado' ? 'Se canceló el acceso con Google.' :
        motivo === 'error' ? 'No pudimos iniciar sesión con Google. Volvé a intentar.' : '';
      acceso.hidden = false;
      return;
    }
    estado.textContent = datos.cliente.correo;
    pedidos.hidden = false;
    if (datos.pedidos.length) {
      lista.replaceChildren(...datos.pedidos.map(mostrarPedido));
    } else {
      const vacio = document.createElement('li');
      vacio.textContent = 'Todavía no tenés pedidos vinculados a esta cuenta.';
      lista.append(vacio);
    }
  }).catch(() => {
    if (estado) estado.textContent = 'No pudimos consultar tu cuenta. Recargá la página para volver a intentar.';
  });
})();
