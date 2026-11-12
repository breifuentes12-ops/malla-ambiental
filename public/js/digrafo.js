import { api } from './api.js';
import { esc, formatoNota } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const ANCHO_NODO = 172;
const ALTO_NODO = 44;
const SEPARACION_X = 232;
const SEPARACION_Y = 60;
const MARGEN = 30;
const ALTO_TITULO = 56; // espacio para la etiqueta de cada semestre

const NOMBRES_ESTADO = {
  no_cursada: 'Sin cursar',
  matriculada: 'Cursando',
  aprobada: 'Aprobada',
  reprobada: 'Por repetir',
};

function crear(nombre, atributos) {
  const el = document.createElementNS(NS, nombre);
  for (const k in atributos || {}) el.setAttribute(k, atributos[k]);
  return el;
}

function recortar(texto, max) {
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
}

export async function mostrarDigrafo(contenedor) {
  const [grafo, analisis] = await Promise.all([api('GET', '/grafo'), api('GET', '/grafo/analisis')]);

  // Materias que el estudiante ya puede matricular (el administrador no tiene panorama)
  const disponibles = new Set();
  try {
    const p = await api('GET', '/matriculas/panorama');
    p.materias.forEach((m) => { if (m.elegible && !p.periodo_abierto) disponibles.add(m.codigo); });
  } catch (e) { /* sin panorama: no se marcan disponibles */ }

  const semestres = Array.from(new Set(grafo.nodos.map((n) => n.semestre))).sort((a, b) => a - b);

  contenedor.innerHTML =
    '<h2>Dígrafo de prerrequisitos</h2>' +
    '<p class="nota-pequena">Cada flecha va de una materia a la que la necesita. ' +
    'Toca una materia para ver qué necesitas antes y qué se te abre después. ' +
    'Arrastra el fondo para moverte y usa la rueda del ratón (o dos dedos) para acercar.</p>' +
    '<div class="herramientas">' +
      '<label>Semestre <select id="filtro-semestre"><option value="0">Todos</option>' +
        semestres.map((s) => '<option value="' + s + '">' + s + '</option>').join('') + '</select></label>' +
      '<button class="btn chico" id="zoom-mas" type="button">Acercar</button>' +
      '<button class="btn chico" id="zoom-menos" type="button">Alejar</button>' +
      '<button class="btn chico" id="zoom-ajustar" type="button">Ver todo</button>' +
      (analisis.camino_mas_largo ? '<button class="btn chico btn-cadena" id="ver-cadena" type="button">Ver cadena más larga</button>' : '') +
    '</div>' +
    '<div class="leyenda">' +
      '<span class="lg e-aprobada">Aprobada</span><span class="lg e-matriculada">Cursando</span>' +
      '<span class="lg e-reprobada">Por repetir</span><span class="lg elegible">Puedes matricularla</span><span class="lg e-no_cursada">Sin cursar</span>' +
      '<span class="lg-flecha abierta">Camino abierto</span><span class="lg-flecha cerrada">Aún cerrado</span>' +
    '</div>' +
    '<div class="grafo-zona">' +
      '<svg id="lienzo-grafo" class="lienzo-grafo" role="img" aria-label="Dígrafo de la malla curricular"></svg>' +
      '<aside id="panel-nodo" class="panel-nodo"><p>Toca una materia del dígrafo para ver sus relaciones.</p></aside>' +
    '</div>' +
    '<div id="analisis"></div>';

  dibujarGrafo(contenedor, grafo, disponibles, analisis.camino_mas_largo);
  dibujarAnalisis(contenedor.querySelector('#analisis'), analisis);
}

function dibujarGrafo(contenedor, grafo, disponibles, cadena) {
  const svg = contenedor.querySelector('#lienzo-grafo');
  const panel = contenedor.querySelector('#panel-nodo');

  // Posiciones iniciales: una columna por semestre
  const posiciones = {};
  const contadorPorSemestre = {};
  grafo.nodos.forEach((n) => {
    const fila = contadorPorSemestre[n.semestre] || 0;
    contadorPorSemestre[n.semestre] = fila + 1;
    posiciones[n.codigo] = { x: MARGEN + (n.semestre - 1) * SEPARACION_X, y: MARGEN + ALTO_TITULO + fila * SEPARACION_Y };
  });
  const porCodigo = {};
  grafo.nodos.forEach((n) => { porCodigo[n.codigo] = n; });

  // Puntas de flecha: una por cada tipo de arista
  const defs = crear('defs');
  ['abierta', 'cerrada', 'resaltada', 'cadena'].forEach((tipo) => {
    const marcador = crear('marker', { id: 'punta-' + tipo, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    marcador.appendChild(crear('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'punta punta-' + tipo }));
    defs.appendChild(marcador);
  });
  svg.appendChild(defs);

  const lienzo = crear('g', { id: 'lienzo' });
  svg.appendChild(lienzo);

  // Franjas de fondo y etiqueta de cada semestre
  const semestres = Array.from(new Set(grafo.nodos.map((n) => n.semestre)));
  const maxFilas = Math.max(...Object.values(contadorPorSemestre));
  const altoFranja = ALTO_TITULO + maxFilas * SEPARACION_Y + 16;
  const titulos = {};
  semestres.forEach((s) => {
    const x = MARGEN + (s - 1) * SEPARACION_X;
    const g = crear('g', { class: 'columna-grafo' });
    g.appendChild(crear('rect', { x: x - 18, y: MARGEN - 18, width: SEPARACION_X - 24, height: altoFranja, rx: 16, class: 'franja ' + (s % 2 ? 'impar' : 'par') }));
    g.appendChild(crear('rect', { x: x + ANCHO_NODO / 2 - 52, y: MARGEN - 6, width: 104, height: 26, rx: 13, class: 'etiqueta-sem' }));
    const t = crear('text', { x: x + ANCHO_NODO / 2, y: MARGEN + 11, class: 'titulo-col', 'text-anchor': 'middle' });
    t.textContent = 'Semestre ' + s;
    g.appendChild(t);
    lienzo.appendChild(g);
    titulos[s] = g;
  });

  // Aristas (se dibujan primero para que queden debajo de los nodos)
  const capaAristas = crear('g');
  lienzo.appendChild(capaAristas);
  const caminos = grafo.aristas.map((a) => {
    // Camino abierto: el prerrequisito ya está aprobado
    const tipo = porCodigo[a.desde].estado === 'aprobada' ? 'abierta' : 'cerrada';
    const p = crear('path', { class: 'arista ' + tipo, 'marker-end': 'url(#punta-' + tipo + ')' });
    capaAristas.appendChild(p);
    return { desde: a.desde, hasta: a.hasta, el: p, tipo };
  });

  // Nodos
  const elementos = {};
  grafo.nodos.forEach((n) => {
    const g = crear('g', { class: 'nodo e-' + n.estado + (disponibles.has(n.codigo) ? ' disponible' : ''), 'data-codigo': n.codigo });
    g.appendChild(crear('rect', { width: ANCHO_NODO, height: ALTO_NODO, rx: 10 }));
    const texto = crear('text', { x: ANCHO_NODO / 2, y: ALTO_NODO / 2 + 4, 'text-anchor': 'middle' });
    texto.textContent = recortar(n.nombre, 25);
    g.appendChild(texto);
    const titulo = crear('title');
    titulo.textContent = n.nombre + ' (' + n.codigo + ')';
    g.appendChild(titulo);
    lienzo.appendChild(g);
    elementos[n.codigo] = g;
  });

  function trazarArista(c) {
    const a = posiciones[c.desde];
    const b = posiciones[c.hasta];
    const x1 = a.x + ANCHO_NODO, y1 = a.y + ALTO_NODO / 2;
    const x2 = b.x, y2 = b.y + ALTO_NODO / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    c.el.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2);
  }
  function colocarNodo(codigo) {
    elementos[codigo].setAttribute('transform', 'translate(' + posiciones[codigo].x + ',' + posiciones[codigo].y + ')');
  }
  grafo.nodos.forEach((n) => colocarNodo(n.codigo));
  caminos.forEach(trazarArista);

  // ---------- Vista (zoom y desplazamiento) ----------
  const vista = { x: 0, y: 0, escala: 1 };
  function aplicarVista() {
    lienzo.setAttribute('transform', 'translate(' + vista.x + ',' + vista.y + ') scale(' + vista.escala + ')');
  }
  function zoomEn(px, py, factor) {
    const nueva = Math.min(3, Math.max(0.25, vista.escala * factor));
    const f = nueva / vista.escala;
    vista.x = px - (px - vista.x) * f;
    vista.y = py - (py - vista.y) * f;
    vista.escala = nueva;
    aplicarVista();
  }
  // legible = true: llena el alto del recuadro con letra legible (y se arrastra para ver el resto)
  function ajustar(legible) {
    const r = svg.getBoundingClientRect();
    const visibles = grafo.nodos.filter((n) => !elementos[n.codigo].classList.contains('oculto-svg'));
    if (visibles.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibles.forEach((n) => {
      const p = posiciones[n.codigo];
      minX = Math.min(minX, p.x - 18); minY = Math.min(minY, p.y - ALTO_TITULO);
      maxX = Math.max(maxX, p.x + ANCHO_NODO); maxY = Math.max(maxY, p.y + ALTO_NODO);
    });
    const ancho = maxX - minX + 2 * MARGEN, alto = maxY - minY + 2 * MARGEN;
    const todo = Math.min(r.width / ancho, r.height / alto);
    vista.escala = legible ? Math.min(1.1, Math.max(todo, r.height / alto)) : Math.min(1.2, todo);
    if (legible && vista.escala > todo + 0.01) {
      vista.x = MARGEN / 2 - minX * vista.escala; // empieza por el semestre 1
    } else {
      vista.x = (r.width - (maxX - minX) * vista.escala) / 2 - minX * vista.escala;
    }
    vista.y = (r.height - (maxY - minY) * vista.escala) / 2 - minY * vista.escala;
    aplicarVista();
  }

  contenedor.querySelector('#zoom-mas').addEventListener('click', () => {
    const r = svg.getBoundingClientRect(); zoomEn(r.width / 2, r.height / 2, 1.2);
  });
  contenedor.querySelector('#zoom-menos').addEventListener('click', () => {
    const r = svg.getBoundingClientRect(); zoomEn(r.width / 2, r.height / 2, 1 / 1.2);
  });
  contenedor.querySelector('#zoom-ajustar').addEventListener('click', () => ajustar(false));

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomEn(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });

  // ---------- Ratón y táctil (eventos de puntero) ----------
  const punteros = new Map();
  let arrastrando = null; // { tipo: 'nodo' | 'fondo', codigo, movido }
  let distanciaPinza = 0;

  function aMundo(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - vista.x) / vista.escala, y: (clientY - r.top - vista.y) / vista.escala };
  }

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2) {
      const [a, b] = Array.from(punteros.values());
      distanciaPinza = Math.hypot(a.x - b.x, a.y - b.y);
      arrastrando = null;
      return;
    }
    const nodo = e.target.closest('.nodo');
    if (nodo) {
      const m = aMundo(e.clientX, e.clientY);
      const p = posiciones[nodo.dataset.codigo];
      arrastrando = { tipo: 'nodo', codigo: nodo.dataset.codigo, dx: m.x - p.x, dy: m.y - p.y, movido: false, inicioX: e.clientX, inicioY: e.clientY };
    } else {
      arrastrando = { tipo: 'fondo', movido: false };
    }
  });

  svg.addEventListener('pointermove', (e) => {
    const previo = punteros.get(e.pointerId);
    if (!previo) return;
    const actual = { x: e.clientX, y: e.clientY };
    punteros.set(e.pointerId, actual);

    if (punteros.size === 2) {
      const [a, b] = Array.from(punteros.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (distanciaPinza > 0) {
        const r = svg.getBoundingClientRect();
        zoomEn((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / distanciaPinza);
      }
      distanciaPinza = d;
      return;
    }
    if (!arrastrando) return;

    if (arrastrando.tipo === 'fondo') {
      vista.x += actual.x - previo.x;
      vista.y += actual.y - previo.y;
      arrastrando.movido = true;
      aplicarVista();
    } else {
      if (Math.hypot(e.clientX - arrastrando.inicioX, e.clientY - arrastrando.inicioY) > 4) arrastrando.movido = true;
      if (arrastrando.movido) {
        const m = aMundo(e.clientX, e.clientY);
        posiciones[arrastrando.codigo] = { x: m.x - arrastrando.dx, y: m.y - arrastrando.dy };
        colocarNodo(arrastrando.codigo);
        caminos.forEach((c) => {
          if (c.desde === arrastrando.codigo || c.hasta === arrastrando.codigo) trazarArista(c);
        });
      }
    }
  });

  function soltar(e) {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) distanciaPinza = 0;
    if (arrastrando && arrastrando.tipo === 'nodo' && !arrastrando.movido) seleccionar(arrastrando.codigo);
    if (arrastrando && arrastrando.tipo === 'fondo' && !arrastrando.movido) seleccionar(null);
    arrastrando = null;
  }
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);

  // ---------- Selección y relaciones ----------
  let seleccionActual = null;

  async function seleccionar(codigo) {
    seleccionActual = codigo;
    if (cadenaVisible) { cadenaVisible = false; botonCadena.classList.remove('activo'); botonCadena.textContent = 'Ver cadena más larga'; }
    limpiarResaltado();
    if (!codigo) {
      panel.innerHTML = '<p>Toca una materia del dígrafo para ver sus relaciones.</p>';
      return;
    }
    const n = porCodigo[codigo];
    panel.innerHTML = '<p class="cargando">Cargando…</p>';
    let rel;
    try {
      rel = await api('GET', '/grafo/relaciones/' + encodeURIComponent(codigo));
    } catch (err) {
      panel.innerHTML = '<p class="error">' + esc(err.message) + '</p>';
      return;
    }
    if (seleccionActual !== codigo) return; // el usuario ya eligió otra

    resaltar(codigo, rel.ancestros, rel.descendientes);
    const lista = (codigos) => codigos.length === 0
      ? '<li>Ninguna</li>'
      : codigos.map((c) => '<li>' + esc(porCodigo[c].nombre) + ' <small>(sem. ' + porCodigo[c].semestre + ')</small></li>').join('');

    panel.innerHTML =
      '<h4>' + esc(n.nombre) + '</h4>' +
      '<p class="nota-pequena">' + esc(n.codigo) + ' · semestre ' + n.semestre + ' · ' + n.creditos + ' créditos</p>' +
      '<p><span class="etiqueta e-' + n.estado + '">' + NOMBRES_ESTADO[n.estado] + (n.nota !== null ? ' · ' + formatoNota(n.nota) : '') + '</span></p>' +
      '<p>Grado de entrada: <strong>' + n.grado_entrada + '</strong> (prerrequisitos directos)<br>' +
      'Grado de salida: <strong>' + n.grado_salida + '</strong> (materias que la usan directamente)</p>' +
      '<h5>Necesitas antes (directa e indirectamente)</h5><ul>' + lista(rel.ancestros) + '</ul>' +
      '<h5>Te abre el camino a (directa e indirectamente)</h5><ul>' + lista(rel.descendientes) + '</ul>';
  }

  function limpiarResaltado() {
    grafo.nodos.forEach((n) => elementos[n.codigo].classList.remove('tenue', 'elegido', 'previa', 'siguiente', 'en-cadena'));
    caminos.forEach((c) => {
      c.el.classList.remove('tenue', 'resaltada', 'en-cadena');
      c.el.setAttribute('marker-end', 'url(#punta-' + c.tipo + ')');
    });
  }

  function resaltar(codigo, ancestros, descendientes) {
    const previas = new Set(ancestros);
    const siguientes = new Set(descendientes);
    grafo.nodos.forEach((n) => {
      const el = elementos[n.codigo];
      if (n.codigo === codigo) el.classList.add('elegido');
      else if (previas.has(n.codigo)) el.classList.add('previa');
      else if (siguientes.has(n.codigo)) el.classList.add('siguiente');
      else el.classList.add('tenue');
    });
    const relacionados = new Set([codigo, ...ancestros, ...descendientes]);
    caminos.forEach((c) => {
      if (relacionados.has(c.desde) && relacionados.has(c.hasta)) {
        c.el.classList.add('resaltada');
        c.el.setAttribute('marker-end', 'url(#punta-resaltada)');
      } else c.el.classList.add('tenue');
    });
  }

  // ---------- Cadena de prerrequisitos más larga ----------
  const botonCadena = contenedor.querySelector('#ver-cadena');
  let cadenaVisible = false;
  function mostrarCadena(ver) {
    cadenaVisible = ver;
    seleccionActual = null;
    limpiarResaltado();
    botonCadena.classList.toggle('activo', ver);
    botonCadena.textContent = ver ? 'Ocultar cadena' : 'Ver cadena más larga';
    if (!ver) {
      panel.innerHTML = '<p>Toca una materia del dígrafo para ver sus relaciones.</p>';
      return;
    }
    ajustar(false); // que se vea la cadena completa
    const codigos = cadena.map((n) => n.codigo);
    const enCadena = new Set(codigos);
    grafo.nodos.forEach((n) => elementos[n.codigo].classList.add(enCadena.has(n.codigo) ? 'en-cadena' : 'tenue'));
    caminos.forEach((c) => {
      const i = codigos.indexOf(c.desde);
      if (i >= 0 && codigos[i + 1] === c.hasta) {
        c.el.classList.add('en-cadena');
        c.el.setAttribute('marker-end', 'url(#punta-cadena)');
      } else c.el.classList.add('tenue');
    });
    panel.innerHTML = '<h4>Cadena más larga</h4>' +
      '<p class="nota-pequena">Es la ruta de prerrequisitos más larga de la carrera: ' + cadena.length + ' materias que se deben ver una después de otra.</p>' +
      '<ol>' + cadena.map((n) => '<li>' + esc(n.nombre) + ' <small>(sem. ' + n.semestre + ')</small></li>').join('') + '</ol>';
  }
  if (botonCadena) botonCadena.addEventListener('click', () => mostrarCadena(!cadenaVisible));

  // ---------- Filtro por semestre ----------
  contenedor.querySelector('#filtro-semestre').addEventListener('change', (e) => {
    const s = Number(e.target.value);
    const visibles = new Set();
    if (s === 0) {
      grafo.nodos.forEach((n) => visibles.add(n.codigo));
    } else {
      // El semestre elegido y las materias conectadas directamente con él
      grafo.nodos.filter((n) => n.semestre === s).forEach((n) => visibles.add(n.codigo));
      grafo.aristas.forEach((a) => {
        if (porCodigo[a.desde].semestre === s || porCodigo[a.hasta].semestre === s) {
          visibles.add(a.desde); visibles.add(a.hasta);
        }
      });
    }
    grafo.nodos.forEach((n) => {
      const el = elementos[n.codigo];
      el.classList.toggle('oculto-svg', !visibles.has(n.codigo));
      el.classList.toggle('vecino', s !== 0 && n.semestre !== s && visibles.has(n.codigo));
    });
    caminos.forEach((c) => c.el.classList.toggle('oculto-svg', !(visibles.has(c.desde) && visibles.has(c.hasta))));
    for (const sem in titulos) titulos[sem].classList.toggle('oculto-svg', s !== 0 && !grafo.nodos.some((n) => n.semestre === Number(sem) && visibles.has(n.codigo)));
    ajustar();
  });

  ajustar(true);
}

// ---------- Análisis del dígrafo ----------

function dibujarAnalisis(caja, a) {
  const fila = (n) => '<li>' + esc(n.nombre) + ' <small>(sem. ' + n.semestre + ')</small></li>';

  caja.innerHTML =
    '<h3>Propiedades del dígrafo</h3>' +
    '<dl class="datos">' +
      '<dt>Vértices (materias)</dt><dd>' + a.vertices + '</dd>' +
      '<dt>Aristas (prerrequisitos)</dt><dd>' + a.aristas + '</dd>' +
      '<dt>¿Es acíclico?</dt><dd>' + (a.es_aciclico ? 'Sí, no hay ciclos de prerrequisitos' : 'No, hay al menos un ciclo') + '</dd>' +
      '<dt>Cadena de prerrequisitos más larga</dt><dd>' + (a.camino_mas_largo
        ? a.camino_mas_largo.length + ' materias: ' + a.camino_mas_largo.map((n) => esc(n.nombre)).join(' → ')
        : 'No se puede calcular') + '</dd>' +
    '</dl>' +
    '<details><summary>Orden topológico (un orden válido para cursar todas las materias)</summary>' +
      (a.orden_topologico ? '<ol>' + a.orden_topologico.map(fila).join('') + '</ol>' : '<p>No existe porque hay ciclos.</p>') + '</details>' +
    '<details><summary>Materias sin prerrequisitos (grado de entrada 0)</summary><ul>' + a.sin_prerrequisitos.map(fila).join('') + '</ul></details>' +
    '<details><summary>Materias que no son prerrequisito de ninguna (grado de salida 0)</summary><ul>' + a.sin_dependientes.map(fila).join('') + '</ul></details>' +
    '<details><summary>Grados de entrada y salida de cada materia</summary>' +
      '<div class="tabla-caja"><table class="tabla"><thead><tr><th>Código</th><th>Materia</th><th>Entrada</th><th>Salida</th></tr></thead><tbody>' +
      a.grados.map((g) => '<tr><td>' + esc(g.codigo) + '</td><td>' + esc(g.nombre) + '</td><td>' + g.entrada + '</td><td>' + g.salida + '</td></tr>').join('') +
      '</tbody></table></div></details>' +
    '<details id="det-matriz"><summary>Matriz de adyacencia</summary><div id="matriz-caja" class="tabla-caja"><p class="cargando">Cargando…</p></div></details>';

  // La matriz es grande: se pide solo cuando se abre
  const detalle = caja.querySelector('#det-matriz');
  detalle.addEventListener('toggle', async () => {
    const destino = caja.querySelector('#matriz-caja');
    if (!detalle.open || destino.dataset.lista) return;
    try {
      const m = await api('GET', '/grafo/matriz');
      const cabeza = m.codigos.map((c) => '<th title="' + esc(c) + '">' + esc(c.slice(-3)) + '</th>').join('');
      const cuerpo = m.matriz.map((fila, i) =>
        '<tr><th title="' + esc(m.codigos[i]) + '">' + esc(m.codigos[i].slice(-3)) + '</th>' +
        fila.map((v, j) => '<td class="' + (v ? 'uno' : '') + '" title="' + esc(m.codigos[i]) + ' → ' + esc(m.codigos[j]) + '">' + v + '</td>').join('') + '</tr>'
      ).join('');
      destino.innerHTML = '<p class="nota-pequena">Fila = prerrequisito, columna = materia que lo necesita. Se muestran los últimos 3 dígitos del código; pasa el ratón por una celda para ver el código completo.</p>' +
        '<table class="matriz"><thead><tr><th></th>' + cabeza + '</tr></thead><tbody>' + cuerpo + '</tbody></table>';
      destino.dataset.lista = '1';
    } catch (err) {
      destino.innerHTML = '<p class="error">' + esc(err.message) + '</p>';
    }
  });
}