const catalogo = [
  {
    id: 'robotica',
    titulo: 'Robótica Casera',
    parte: 'Kit de inicio',
    temas: ['robotica'],
    portada: '/robotica.jpg',
    paginas: 11,
    descripcion: 'Construí mecanismos con cartón, palitos, hilos y componentes simples.',
    actividades: ['Puente levadizo hidráulico', 'Rueda de luz', 'Mini cortadora de papel', 'Mano robótica'],
    precio: 900,
    compra: null
  },
  {
    id: 'ciencia',
    titulo: 'Ciencia y arte en casa',
    parte: 'Kit de inicio · Parte 2',
    temas: ['ciencia', 'arte'],
    portada: '/ciencia.jpg',
    paginas: 9,
    descripcion: 'Probá experimentos y manualidades con materiales cotidianos de casa.',
    actividades: ['Volcán en erupción', 'Arcoíris caminante', 'Lámpara de lava casera', 'El huevo que flota', 'Teléfono de vasos', 'Pintura mágica con sal'],
    precio: 900,
    compra: null
  }
];

const productos = document.querySelector('#productos');
const ficha = document.querySelector('#ficha');
const pagar = document.querySelector('#pagar');
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

function mostrarFicha(kit) {
  const portada = document.querySelector('#portada');
  portada.src = kit.portada;
  portada.alt = 'Portada de ' + kit.titulo;
  document.querySelector('#titulo-ficha').textContent = kit.titulo;
  document.querySelector('#detalle').textContent = 'PDF · ' + kit.paginas + ' páginas';
  document.querySelector('#descripcion').textContent = kit.descripcion;
  document.querySelector('#actividades').replaceChildren(...kit.actividades.map(actividad => {
    const item = document.createElement('li');
    item.textContent = actividad;
    return item;
  }));
  const disponible = kit.compra && kit.precio !== null;
  pagar.hidden = !disponible;
  if (disponible) pagar.href = kit.compra;
  else pagar.removeAttribute('href');
  document.querySelector('#estado').textContent = pesos.format(kit.precio) + ' ARS' + (disponible ? '' : ' · Compra aún no habilitada.');
  if (document.querySelector('[data-carrito-contador]')) {
    let agregar = ficha.querySelector('[data-agregar-carrito]');
    if (!agregar) {
      agregar = document.createElement('button');
      agregar.type = 'button';
      agregar.className = 'button';
      agregar.textContent = 'Agregar al carrito';
      pagar.after(agregar);
    }
    agregar.dataset.agregarCarrito = kit.id;
    document.querySelector('#estado').textContent = pesos.format(kit.precio) + ' ARS';
  }
  ficha.showModal();
}

function mostrarProductos(filtro) {
  const visibles = catalogo.filter(kit => filtro === 'todos' || kit.temas.includes(filtro));
  productos.replaceChildren(...visibles.map(kit => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-art ${kit.id}"><img src="${kit.portada}" alt="Portada de ${kit.titulo}" width="260" height="345"></div>
      <div class="card-body">
        <p class="edition">${kit.parte}</p>
        <h3>${kit.titulo}</h3>
        <p>${kit.descripcion}</p>
        <div class="card-end"><span>PDF · ${kit.actividades.length} actividades · <strong>${pesos.format(kit.precio)} ARS</strong></span><button type="button" aria-label="Ver el kit ${kit.titulo}">Ver kit</button></div>
      </div>`;
    card.querySelector('button').addEventListener('click', () => mostrarFicha(kit));
    return card;
  }));
}
const filtros = [...document.querySelectorAll('[data-filter]')];
for (const boton of filtros) {
  boton.addEventListener('click', () => {
    filtros.forEach(item => item.setAttribute('aria-pressed', String(item === boton)));
    mostrarProductos(boton.dataset.filter);
  });
}
mostrarProductos(productos.dataset.tema || 'todos');
