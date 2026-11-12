import { api } from './api.js';
import { esc, formatoNota, aviso, abrirModal, cerrarModal, confirmar, plural } from './util.js';

const NOMBRES_ESTADO = {
  no_cursada: 'Sin cursar',
  matriculada: 'Cursando',
  aprobada: 'Aprobada',
  reprobada: 'Por repetir',
};

// Frase corta y amable de por qué una materia todavía no se puede tomar
function motivoAmable(m, porCodigo) {
  if (m.codigo_motivo === 'semestre' || /semestre/i.test(m.motivo || '')) {
    return 'Se abre cuando termines el semestre ' + (m.semestre - 1);
  }
  if (m.faltantes && m.faltantes.length) {
    const nombres = m.faltantes.map((f) => porCodigo[f] ? porCodigo[f].nombre : f);
    if (nombres.length === 1) return 'Primero necesitas aprobar ' + nombres[0];
    return 'Primero necesitas aprobar ' + nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }
  return m.motivo || '';
}

// ---------- Registrar o corregir una nota (ventana emergente) ----------

export function pedirNota(matriculaId, nombreMateria, notaActual, alGuardar) {
  const caja = abrirModal(
    '<h2>¿Cómo te fue?</h2>' +
    '<p>Escribe la nota final de <strong>' + esc(nombreMateria) + '</strong>.</p>' +
    '<form id="form-nota" class="formulario">' +
      '<label>Nota <small>(de 0.0 a 5.0 · se aprueba con 3.0)</small>' +
        '<input name="nota" type="number" step="0.1" min="0" max="5" required placeholder="Ej: 4.2" value="' + esc(notaActual === null || notaActual === undefined ? '' : notaActual) + '">' +
      '</label>' +
      '<p id="nota-error" class="error-caja oculto"></p>' +
      '<div class="acciones">' +
        '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn primario">Guardar nota</button>' +
      '</div>' +
    '</form>'
  );
  caja.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  caja.querySelector('#form-nota').addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = e.target.nota.value;
    try {
      const r = await api('PUT', '/matriculas/' + matriculaId + '/nota', { nota: valor });
      cerrarModal();
      if (r.estado === 'aprobada') {
        aviso('¡Aprobaste ' + nombreMateria + ' con ' + formatoNota(r.nota) + '! Muy bien.', 'ok');
      } else {
        aviso('Guardamos tu ' + formatoNota(r.nota) + ' en ' + nombreMateria + '. Tranquilo, la puedes volver a cursar.', 'alerta');
      }
      alGuardar();
    } catch (err) {
      const p = caja.querySelector('#nota-error');
      p.textContent = err.message;
      p.classList.remove('oculto');
    }
  });
}

async function cancelarMatricula(matriculaId, nombre, alTerminar) {
  const ok = await confirmar({
    titulo: '¿Quitar ' + nombre + '?',
    texto: 'La materia saldrá de este periodo. Después la puedes volver a inscribir.',
    si: 'Sí, quitarla',
    no: 'No, dejarla',
    peligro: true,
  });
  if (!ok) return;
  try {
    await api('DELETE', '/matriculas/' + matriculaId);
    aviso('Listo, quitamos ' + nombre + ' de tu periodo.');
    alTerminar();
  } catch (err) {
    aviso(err.message, 'error');
  }
}

// ---------- Inicio ----------

function anillo(pct) {
  const r = 70;
  const largo = 2 * Math.PI * r;
  const desfase = largo * (1 - pct / 100);
  return '<svg class="anillo" viewBox="0 0 180 180" role="img" aria-label="Llevas el ' + pct + '% de la carrera">' +
    '<circle class="fondo-anillo" cx="90" cy="90" r="' + r + '"/>' +
    '<circle class="valor-anillo" cx="90" cy="90" r="' + r + '" stroke-dasharray="' + largo.toFixed(1) + '" stroke-dashoffset="' + desfase.toFixed(1) + '"/>' +
    '<text class="num" x="90" y="92" text-anchor="middle">' + pct + '%</text>' +
    '<text class="txt" x="90" y="114" text-anchor="middle">de la carrera</text>' +
  '</svg>';
}

function cifras(r) {
  const cifra = (valor, rotulo) =>
    '<div class="cifra"><div class="valor">' + valor + '</div><div class="rotulo">' + rotulo + '</div></div>';
  return '<div class="cifras">' +
    cifra(r.semestre_actual, 'Semestre actual') +
    cifra(r.materias_aprobadas + '<small> / ' + r.materias_totales + '</small>', 'Materias aprobadas') +
    cifra(r.periodos_cursados, (r.periodos_cursados === 1 ? 'Periodo cursado' : 'Periodos cursados')) +
  '</div>';
}

function porcentaje(r) {
  return r.creditos_totales > 0 ? Math.round((r.creditos_aprobados / r.creditos_totales) * 100) : 0;
}

export async function mostrarResumen(contenedor, usuario, irA) {
  const datos = await api('GET', '/matriculas/panorama');
  const abierto = datos.periodo_abierto;
  const r = datos.resumen;
  const pct = porcentaje(r);

  const paso = abierto
    ? '<div class="siguiente-paso">' +
        '<div><strong>Tu siguiente paso</strong>' +
        '<p>Te ' + (abierto.cantidad === 1 ? 'falta la nota de 1 materia' : 'faltan las notas de ' + abierto.cantidad + ' materias') +
        ' del periodo ' + abierto.periodo + '. Cuando las pongas, podrás inscribir el siguiente.</p></div>' +
        '<button class="btn primario" data-ir="malla">Poner notas</button>' +
      '</div>'
    : '<div class="siguiente-paso listo">' +
        '<div><strong>¡Todo al día!</strong>' +
        '<p>No tienes notas pendientes. Ya puedes escoger tus materias del próximo periodo.</p></div>' +
        '<button class="btn primario" data-ir="malla">Escoger materias</button>' +
      '</div>';

  contenedor.innerHTML =
    '<div class="saludo"><h2>Hola, ' + esc(usuario.nombre) + '</h2></div>' +
    '<div class="inicio-grilla">' +
      '<div class="tarjeta-blanca anillo-caja">' +
        anillo(pct) +
        '<div><strong>' + r.creditos_aprobados + '</strong> de ' + r.creditos_totales + ' créditos</div>' +
      '</div>' +
      '<div>' + paso + cifras(r) +
      '</div>' +
    '</div>';

  contenedor.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.ir)));
}

// ---------- Malla ----------

function tarjeta(m, periodoAbierto, porCodigo) {
  const clases = ['tarjeta', 'e-' + m.estado];
  if (m.estado === 'no_cursada' || m.estado === 'reprobada') {
    clases.push(m.elegible ? 'elegible' : 'bloqueada');
  }

  let pie = '';
  if (m.estado === 'matriculada') {
    pie = '<div class="tarjeta-botones">' +
      '<button class="btn chico primario" data-accion="nota" data-id="' + m.matricula_id + '" data-codigo="' + esc(m.codigo) + '">Poner nota</button>' +
      '<button class="btn chico" data-accion="cancelar" data-id="' + m.matricula_id + '" data-codigo="' + esc(m.codigo) + '">Quitar</button>' +
      '</div>';
  } else if (m.elegible && !periodoAbierto) {
    pie = '<label class="elegir"><input type="checkbox" class="chk-materia" value="' + esc(m.codigo) + '" data-creditos="' + m.creditos + '">' +
      (m.estado === 'reprobada' ? 'La quiero repetir' : 'La quiero tomar') + '</label>';
  } else if (!m.elegible && m.motivo && m.estado !== 'aprobada') {
    pie = '<div class="motivo">' + esc(motivoAmable(m, porCodigo)) + '</div>';
  }

  const nota = m.nota !== null ? '<span class="nota">' + formatoNota(m.nota) + '</span>' : '';
  return '<div class="' + clases.join(' ') + '" data-codigo="' + esc(m.codigo) + '" title="Toca para ver más">' +
    '<div class="tarjeta-nombre">' + esc(m.nombre) + '</div>' +
    '<div class="tarjeta-datos"><span>' + plural(m.creditos, 'crédito') + '</span>' + nota + '</div>' +
    pie +
  '</div>';
}

function actualizarContador(caja, limites) {
  const marcadas = caja.querySelectorAll('.chk-materia:checked');
  let creditos = 0;
  marcadas.forEach((c) => { creditos += Number(c.dataset.creditos); });
  const boton = caja.querySelector('#btn-matricular');
  if (boton) boton.disabled = marcadas.length === 0 || creditos > limites.max;

  const span = caja.querySelector('#contador');
  if (!span) return;
  let frase;
  if (marcadas.length === 0) frase = 'Marca las materias que quieres tomar este periodo.';
  else if (creditos > limites.max) frase = 'Te pasaste: llevas ' + creditos + ' créditos y el máximo es ' + limites.max + '.';
  else if (creditos < limites.min) frase = plural(marcadas.length, 'materia') + ' · ' + creditos + ' créditos (lo normal es entre ' + limites.min + ' y ' + limites.max + ')';
  else frase = plural(marcadas.length, 'materia') + ' · ' + creditos + ' créditos. ¡Perfecto!';
  span.textContent = frase;
  span.classList.toggle('error-texto', creditos > limites.max);

  // Medidor visual: la franja verde es el rango permitido
  const tope = limites.max + 4;
  const relleno = caja.querySelector('.medidor-relleno');
  if (relleno) {
    relleno.style.width = Math.min(100, (creditos / tope) * 100) + '%';
    relleno.classList.toggle('ok', creditos >= limites.min && creditos <= limites.max);
    relleno.classList.toggle('pasado', creditos > limites.max);
  }
}

export async function mostrarMalla(contenedor, usuario, irA) {
  const datos = await api('GET', '/matriculas/panorama');
  const recargar = () => mostrarMalla(contenedor, usuario, irA);
  const esCelular = window.matchMedia('(max-width: 800px)').matches;

  const porCodigo = {};
  datos.materias.forEach((m) => { porCodigo[m.codigo] = m; });

  const porSemestre = {};
  datos.materias.forEach((m) => {
    if (!porSemestre[m.semestre]) porSemestre[m.semestre] = [];
    porSemestre[m.semestre].push(m);
  });
  const semestres = Object.keys(porSemestre).map(Number).sort((a, b) => a - b);

  const columnas = semestres.map((s) => {
    const habilitado = datos.semestres_habilitados.includes(s);
    const lista = porSemestre[s];
    const aprobadas = lista.filter((m) => m.estado === 'aprobada').length;
    const pct = Math.round((aprobadas / lista.length) * 100);
    let estado;
    if (aprobadas === lista.length) estado = '¡Completo!';
    else if (habilitado) estado = aprobadas + ' de ' + lista.length + ' aprobadas';
    else estado = 'Aún no disponible';
    // En celular se abren solo los semestres habilitados que no están completos
    const abierto = !esCelular || (habilitado && aprobadas < lista.length);

    return '<details class="columna' + (habilitado ? '' : ' columna-bloqueada') + '"' + (abierto ? ' open' : '') + '>' +
      '<summary><h3>Semestre ' + s + '</h3>' +
      '<div class="columna-estado">' + estado + '</div>' +
      (habilitado ? '<div class="barra-progreso"><div style="width:' + pct + '%"></div></div>' : '') +
      '</summary>' +
      lista.map((m) => tarjeta(m, datos.periodo_abierto, porCodigo)).join('') +
    '</details>';
  }).join('');

  const avisoArriba = datos.periodo_abierto
    ? '<div class="recuadro amarillo">Estás cursando el periodo ' + datos.periodo_abierto.periodo + '. ' +
      'Cuando pongas ' + (datos.periodo_abierto.cantidad === 1 ? 'la nota que falta' : 'las ' + datos.periodo_abierto.cantidad + ' notas que faltan') +
      ', podrás escoger las materias del siguiente.</div>'
    : '';

  contenedor.innerHTML =
    '<h2>Mi malla</h2>' + avisoArriba +
    '<div class="leyenda">' +
      '<span class="lg e-aprobada">Aprobada</span><span class="lg e-matriculada">Cursando</span>' +
      '<span class="lg e-reprobada">Por repetir</span><span class="lg elegible">Puedes tomarla</span><span class="lg bloqueada">Todavía no</span>' +
    '</div>' +
    '<div class="malla">' + columnas + '</div>' +
    (datos.periodo_abierto ? '' :
      '<div class="barra-matricula">' +
        '<div><span id="contador" class="contador-texto"></span>' +
          '<div class="medidor" aria-hidden="true">' +
            '<div class="medidor-zona" style="left:' + (datos.limites.min / (datos.limites.max + 4) * 100) + '%;width:' +
              ((datos.limites.max - datos.limites.min) / (datos.limites.max + 4) * 100) + '%"></div>' +
            '<div class="medidor-relleno" style="width:0"></div>' +
          '</div>' +
        '</div>' +
        '<button id="btn-matricular" class="btn primario" type="button" disabled>Inscribir materias</button>' +
      '</div>');

  actualizarContador(contenedor, datos.limites);

  // Los escuchadores van en elementos que se vuelven a crear en cada dibujo (no en el contenedor fijo)
  contenedor.querySelector('.malla').addEventListener('change', (e) => {
    if (e.target.classList.contains('chk-materia')) actualizarContador(contenedor, datos.limites);
  });

  const botonMatricular = contenedor.querySelector('#btn-matricular');
  if (botonMatricular) {
    botonMatricular.addEventListener('click', async () => {
      const codigos = Array.from(contenedor.querySelectorAll('.chk-materia:checked')).map((c) => c.value);
      botonMatricular.disabled = true;
      try {
        await api('POST', '/matriculas', { codigos });
        aviso('¡Listo! Quedaste inscrito en ' + plural(codigos.length, 'materia') + '. ¡Éxitos este periodo!');
        recargar();
      } catch (err) {
        aviso(err.message, 'error');
        actualizarContador(contenedor, datos.limites);
      }
    });
  }

  contenedor.querySelector('.malla').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (boton) {
      const m = porCodigo[boton.dataset.codigo];
      if (boton.dataset.accion === 'nota') pedirNota(boton.dataset.id, m.nombre, null, recargar);
      if (boton.dataset.accion === 'cancelar') cancelarMatricula(boton.dataset.id, m.nombre, recargar);
      return;
    }
    if (e.target.closest('label, input, summary')) return;
    const t = e.target.closest('.tarjeta');
    if (t) detalleMateria(porCodigo[t.dataset.codigo], porCodigo);
  });
}

function detalleMateria(m, porCodigo) {
  const prereqs = m.prereqs.length === 0
    ? '<li>Ninguno, puedes tomarla cuando se abra su semestre.</li>'
    : m.prereqs.map((p) => {
        const x = porCodigo[p];
        return '<li><span>' + esc(x.nombre) + '</span><span class="etiqueta e-' + x.estado + '">' + NOMBRES_ESTADO[x.estado] + '</span></li>';
      }).join('');

  const horas = [];
  if (m.ht) horas.push(m.ht + ' de teoría');
  if (m.hp) horas.push(m.hp + ' de práctica');

  let estado = NOMBRES_ESTADO[m.estado];
  if (m.nota !== null) estado += ' · nota ' + formatoNota(m.nota);
  if (m.intentos > 1) estado += ' · ' + m.intentos + ' intentos';

  const caja = abrirModal(
    '<h2>' + esc(m.nombre) + '</h2>' +
    '<p class="nota-pequena">Semestre ' + m.semestre + ' · ' + plural(m.creditos, 'crédito') + ' · código ' + esc(m.codigo) + '</p>' +
    '<dl class="datos">' +
      '<dt>Cómo vas</dt><dd><span class="etiqueta e-' + m.estado + '">' + estado + '</span></dd>' +
      (horas.length ? '<dt>Horas a la semana</dt><dd>' + horas.join(' y ') + '</dd>' : '') +
      (m.area ? '<dt>Área</dt><dd>' + esc(m.area.charAt(0) + m.area.slice(1).toLowerCase()) + '</dd>' : '') +
    '</dl>' +
    '<h4>Antes necesitas</h4><ul class="lista-prereq">' + prereqs + '</ul>' +
    (!m.elegible && m.motivo && m.estado !== 'aprobada' && m.estado !== 'matriculada'
      ? '<p class="recuadro amarillo">' + esc(motivoAmable(m, porCodigo)) + '</p>' : '') +
    '<div class="acciones"><button class="btn" data-cerrar>Cerrar</button></div>'
  );
  caja.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
}

// ---------- Historial ----------

export async function mostrarHistorial(contenedor, usuario, irA) {
  const datos = await api('GET', '/matriculas/historial');
  const recargar = () => mostrarHistorial(contenedor, usuario, irA);
  const ultimo = datos.periodos.length ? datos.periodos[datos.periodos.length - 1].periodo : 0;

  if (datos.periodos.length === 0) {
    contenedor.innerHTML = '<h2>Mis notas</h2>' +
      '<div class="tarjeta-blanca" style="text-align:center;padding:2.5rem 1rem">' +
        '<p><strong>Aquí aparecerán tus notas.</strong><br>Todavía no tienes materias inscritas.</p>' +
        '<button class="btn primario" data-ir="malla">Ir a mi malla</button>' +
      '</div>';
    contenedor.querySelector('[data-ir]').addEventListener('click', () => irA('malla'));
    return;
  }

  const r = datos.resumen;
  const pct = porcentaje(r);

  const bloques = datos.periodos.slice().reverse().map((p) => {
    const filas = p.matriculas.map((m) => {
      let acciones = '';
      if (m.estado === 'matriculada') {
        acciones = '<button class="btn chico primario" data-accion="nota" data-id="' + m.id + '" data-nombre="' + esc(m.nombre) + '">Poner nota</button> ' +
          '<button class="btn chico" data-accion="cancelar" data-id="' + m.id + '" data-nombre="' + esc(m.nombre) + '">Quitar</button>';
      } else if (m.estado === 'reprobada' && p.periodo === ultimo && !datos.periodo_abierto) {
        acciones = '<button class="btn chico" data-accion="corregir" data-id="' + m.id + '" data-nombre="' + esc(m.nombre) + '" data-nota="' + m.nota + '">Corregir nota</button>';
      }
      return '<tr><td><strong>' + esc(m.nombre) + '</strong><br><small>Semestre ' + m.semestre + ' · ' + plural(m.creditos, 'crédito') + '</small></td>' +
        '<td><span class="etiqueta e-' + m.estado + '">' + NOMBRES_ESTADO[m.estado] + '</span></td>' +
        '<td><strong>' + formatoNota(m.nota) + '</strong></td><td>' + acciones + '</td></tr>';
    }).join('');

    return '<div class="periodo-titulo"><h3>Periodo ' + p.periodo + '</h3><small>' + plural(p.creditos, 'crédito') + '</small></div>' +
      '<div class="tabla-caja"><table class="tabla"><thead><tr>' +
      '<th>Materia</th><th>Estado</th><th>Nota</th><th></th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>';
  }).join('');

  contenedor.innerHTML =
    '<h2>Mis notas</h2>' +
    cifras(r) +
    '<div class="tarjeta-blanca" style="margin-top:.8rem">' +
      '<strong>' + r.creditos_aprobados + '</strong> de ' + r.creditos_totales + ' créditos aprobados (' + pct + '%)' +
      '<div class="barra-progreso" style="max-width:none"><div style="width:' + pct + '%"></div></div>' +
    '</div>' +
    '<div id="bloques-historial">' + bloques + '</div>';

  contenedor.querySelector('#bloques-historial').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const a = boton.dataset.accion;
    if (a === 'nota') pedirNota(boton.dataset.id, boton.dataset.nombre, null, recargar);
    if (a === 'corregir') pedirNota(boton.dataset.id, boton.dataset.nombre, boton.dataset.nota, recargar);
    if (a === 'cancelar') cancelarMatricula(boton.dataset.id, boton.dataset.nombre, recargar);
  });
}