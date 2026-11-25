from pathlib import Path
from html import escape

DIST = Path(__file__).resolve().parent / "dist"
RUBROS = [
    ("robotica", "Robótica", "Mecanismos e inventos para construir en casa.", "✳", True),
    ("jardineria", "Jardinería", "Cultivo, plantas y cuidado del jardín.", "❋", False),
    ("mecanica", "Mecánica", "Guías sobre herramientas y mantenimiento.", "⚙", False),
    ("carpinteria", "Carpintería", "Proyectos y técnicas para trabajar la madera.", "▨", False),
    ("prompts-ia", "Prompts de IA", "Ideas y ejemplos para trabajar con inteligencia artificial.", "⌘", False),
    ("ciencia", "Ciencia", "Experimentos para explorar cómo funcionan las cosas.", "◉", True),
    ("arte", "Arte", "Manualidades y proyectos para experimentar con color.", "✦", True),
]


def enlace(slug, nombre, actual=None):
    selected = ' aria-current="page"' if slug == actual else ''
    return f'<a href="/{slug}/"{selected}>{nombre}</a>'


def pagina(titulo, descripcion, contenido, actual=None, script=False):
    menu = "".join(enlace(slug, nombre, actual) for slug, nombre, *_ in RUBROS)
    javascript = '<script defer src="/catalogo.js"></script>' if script else ''
    return f"""<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{escape(descripcion, quote=True)}">
<title>{titulo}</title>
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/mindtrix.css">
{javascript}
</head>
<body class="mindtrix">
<header class="mx-header"><div class="mx-wrap mx-top">
<a class="mx-brand" href="/" aria-label="Mindtrix, inicio"><span aria-hidden="true">✳</span>mindtrix</a>
<a class="mx-collection" href="/taller-curioso/">Taller Curioso</a>
</div>
<nav class="mx-nav mx-wrap" aria-label="Rubros"><a href="/" {'aria-current="page"' if actual is None else ''}>Inicio</a>{menu}</nav>
</header>
<main>{contenido}</main>
<footer class="mx-footer"><div class="mx-wrap"><a class="mx-brand" href="/"><span aria-hidden="true">✳</span>mindtrix</a><a href="/#rubros">Explorar rubros</a></div></footer>
</body>
</html>
"""


def tarjeta(rubro):
    slug, nombre, descripcion, icono, disponible = rubro
    estado = "1 guía" if disponible else "Sin guías por ahora"
    return f"""<a class="mx-category {slug}" href="/{slug}/">
<span class="mx-icon" aria-hidden="true">{icono}</span>
<h3>{nombre}</h3><p>{descripcion}</p><span class="mx-status">{estado}</span>
</a>"""


portada = f"""
<section class="mx-hero"><div class="mx-wrap mx-hero-grid">
<div><p class="mx-label">BIBLIOTECA DIGITAL</p><h1>Aprendé algo.<br><em>Hacé algo.</em></h1>
<p class="mx-intro">Guías en PDF para explorar temas, aprender técnicas y llevar ideas a la práctica.</p>
<a class="mx-button" href="#rubros">Explorar rubros</a></div>
<a class="mx-feature" href="/taller-curioso/" aria-label="Explorar la colección Taller Curioso">
<div class="mx-covers"><img src="/robotica.jpg" alt="" width="711" height="920"><img src="/ciencia.jpg" alt="" width="650" height="920"></div>
<div class="mx-feature-caption"><span>Colección destacada</span><strong>Taller Curioso</strong></div></a>
</div></section>
<section class="mx-wrap mx-rubros" id="rubros"><h2>Explorá por rubro</h2>
<div class="mx-list">{''.join(map(tarjeta, RUBROS))}</div></section>
<section class="mx-wrap mx-rubros" id="packs" aria-labelledby="titulo-packs">
<h2 id="titulo-packs">Packs educativos</h2>
<p class="section-copy">Próximamente · $4.500 ARS por pack</p>
<div class="mx-list">
<article class="mx-category"><h3>Guía de Robótica</h3><p>+190 proyectos prácticos.</p></article>
<article class="mx-category"><h3>Kit de Estimulación Inteligente</h3><p>+500 actividades y manualidades.</p></article>
<article class="mx-category"><h3>Más de 100 Experimentos Científicos para Niños</h3><p>Experimentos para explorar ciencia en casa.</p></article>
<article class="mx-category"><h3>Kit de Gimnasia Cerebral e Inteligencia Emocional</h3><p>Ejercicios de atención y concentración.</p></article>
<article class="mx-category"><h3>Curso Completo de Inglés para Niños</h3><p>Vocabulario, dinámicas lúdicas y fichas ilustradas.</p></article>
<article class="mx-category"><h3>Mega Pack de Plantillas Imprimibles</h3><p>Paper Toys 3D, recortables y tableros de seguimiento de logros.</p></article>
</div></section>
"""

FICHA = """<dialog id="ficha" aria-labelledby="titulo-ficha"><div class="dialog-inner">
<form method="dialog"><button class="close" aria-label="Cerrar ficha">×</button></form>
<img id="portada" alt="">
<div><p class="eyebrow" id="detalle"></p><h2 id="titulo-ficha"></h2><p id="descripcion"></p>
<h3>Actividades incluidas</h3><ul id="actividades"></ul>
<p id="estado"></p><a hidden class="button" id="pagar">Comprar PDF</a></div>
</div></dialog>"""


def contenido_rubro(rubro):
    slug, nombre, descripcion, icono, disponible = rubro
    if disponible:
        catalogo = f"""<h2>Guías de {nombre}</h2>
<div class="cards" id="productos" data-tema="{slug}" aria-live="polite"></div>
<noscript>Activá JavaScript para ver las guías.</noscript>
<p class="mx-collection-link">También podés ver <a href="/taller-curioso/">la colección completa de Taller Curioso</a>.</p>
{FICHA}"""
    else:
        catalogo = """<div class="mx-empty"><h2>Todavía no hay guías en este rubro</h2>
<p>Podés consultar las guías de los demás rubros en el catálogo.</p>
<a class="mx-button" href="/#rubros">Explorar otros rubros</a></div>"""
    return f"""<section class="mx-subhero"><div class="mx-wrap">
<a class="mx-back" href="/#rubros">Todos los rubros</a>
<div class="mx-subtitle"><span aria-hidden="true">{icono}</span><h1>{nombre}</h1></div>
<p class="mx-intro">{descripcion}</p></div></section>
<section class="mx-wrap mx-rubros">{catalogo}</section>"""


(DIST / "index.html").write_text(
    pagina("Mindtrix · Guías digitales por rubro", "Guías en PDF para aprender y crear.", portada),
    encoding="utf-8",
)
for rubro in RUBROS:
    slug, nombre, descripcion, _, disponible = rubro
    directorio = DIST / slug
    directorio.mkdir(exist_ok=True)
    (directorio / "index.html").write_text(
        pagina(f"{nombre} · Mindtrix", descripcion, contenido_rubro(rubro), slug, disponible),
        encoding="utf-8",
    )
