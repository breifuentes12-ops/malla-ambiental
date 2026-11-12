// Reglas académicas del sistema. Son funciones puras: reciben datos ya cargados
// (materias y matrículas) y devuelven un resultado, sin tocar la base de datos.

const MIN_CREDITOS = 12;
const MAX_CREDITOS = 20;
const NOTA_MINIMA = 3.0;

// Cuándo se habilita el semestre N:
//   'cursadas'  -> todas las materias del semestre N-1 ya tienen nota (aprobada o reprobada)
//   'aprobadas' -> todas las materias del semestre N-1 están aprobadas
const MODO_DESBLOQUEO = 'cursadas';

// Resume la historia de cada materia para un estudiante.
// Devuelve un objeto { codigo: { estado, nota, periodo, matriculaId, aprobada, cursada, intentos } }
// donde estado/nota/periodo corresponden al intento más reciente.
function resumenPorMateria(matriculas) {
  const resumen = {};
  const ordenadas = matriculas.slice().sort((a, b) => a.periodo - b.periodo);

  for (const m of ordenadas) {
    const r = resumen[m.materia_codigo] || (resumen[m.materia_codigo] = {
      estado: null, nota: null, periodo: 0, matriculaId: null,
      aprobada: false, cursada: false, intentos: 0,
    });
    r.estado = m.estado;
    r.nota = m.nota === null || m.nota === undefined ? null : Number(m.nota);
    r.periodo = m.periodo;
    r.matriculaId = m.id;
    r.intentos++;
    if (m.estado === 'aprobada') r.aprobada = true;
    if (m.estado === 'aprobada' || m.estado === 'reprobada') r.cursada = true;
  }
  return resumen;
}

// Semestres que el estudiante tiene habilitados (siempre en orden y sin saltos).
function semestresHabilitados(materias, resumen, modo = MODO_DESBLOQUEO) {
  const porSemestre = {};
  let ultimo = 1;
  for (const m of materias) {
    if (!porSemestre[m.semestre]) porSemestre[m.semestre] = [];
    porSemestre[m.semestre].push(m.codigo);
    if (m.semestre > ultimo) ultimo = m.semestre;
  }

  const habilitados = [1];
  for (let s = 2; s <= ultimo; s++) {
    const anteriores = porSemestre[s - 1] || [];
    const completo = anteriores.every((codigo) => {
      const r = resumen[codigo];
      if (!r) return false;
      return modo === 'aprobadas' ? r.aprobada : r.cursada;
    });
    if (!completo) break;
    habilitados.push(s);
  }
  return habilitados;
}

// Periodo abierto: hay materias matriculadas que todavía no tienen nota.
function periodoAbierto(matriculas) {
  const abiertas = matriculas.filter((m) => m.estado === 'matriculada');
  if (abiertas.length === 0) return null;
  const periodo = Math.max(...abiertas.map((m) => m.periodo));
  const cantidad = abiertas.filter((m) => m.periodo === periodo).length;
  return { periodo, cantidad };
}

// ¿Puede el estudiante matricular esta materia (sin contar si hay periodo abierto)?
// Devuelve { elegible, motivo, codigoMotivo, faltantes }
function elegibilidad(materia, ctx) {
  const r = ctx.resumen[materia.codigo];

  if (r && r.aprobada) {
    return { elegible: false, codigoMotivo: 'aprobada', motivo: 'Ya la aprobaste', faltantes: [] };
  }
  if (r && r.estado === 'matriculada') {
    return { elegible: false, codigoMotivo: 'matriculada', motivo: 'Ya está matriculada', faltantes: [] };
  }
  if (!ctx.habilitados.includes(materia.semestre)) {
    return {
      elegible: false,
      codigoMotivo: 'semestre',
      motivo: 'El semestre ' + materia.semestre + ' todavía no está habilitado',
      faltantes: [],
    };
  }
  const faltantes = materia.prereqs.filter((p) => !(ctx.resumen[p] && ctx.resumen[p].aprobada));
  if (faltantes.length > 0) {
    return {
      elegible: false,
      codigoMotivo: 'prerrequisitos',
      motivo: 'Faltan prerrequisitos por aprobar',
      faltantes,
    };
  }
  return { elegible: true, codigoMotivo: null, motivo: null, faltantes: [] };
}

// Materia de un semestre aún no habilitado, sin prerrequisitos, que se puede adelantar
function esAdelantable(materia, ctx) {
  const r = ctx.resumen[materia.codigo];
  if (r && (r.aprobada || r.estado === 'matriculada')) return false;
  if (ctx.habilitados.includes(materia.semestre)) return false; // esas son las normales
  return materia.prereqs.length === 0;
}

// Arma el contexto que usan las demás funciones.
function armarContexto(materias, matriculas) {
  const resumen = resumenPorMateria(matriculas);
  const habilitados = semestresHabilitados(materias, resumen);
  return { materias, matriculas, resumen, habilitados };
}

// Valida una matrícula de varias materias. Devuelve { ok: true, creditos } o { ok: false, error }.
function validarMatricula(codigos, ctx) {
  if (!Array.isArray(codigos) || codigos.length === 0) {
    return { ok: false, error: 'Debes seleccionar al menos una materia' };
  }
  if (new Set(codigos).size !== codigos.length) {
    return { ok: false, error: 'Hay materias repetidas en la selección' };
  }

  const abierto = periodoAbierto(ctx.matriculas);
  if (abierto) {
    return {
      ok: false,
      error: 'Tienes ' + abierto.cantidad + ' materia(s) sin nota en el semestre ' + abierto.periodo +
        '. Registra todas las notas antes de matricular un nuevo semestre.',
    };
  }

  const porCodigo = {};
  for (const m of ctx.materias) porCodigo[m.codigo] = m;

  const elegidas = [];
  const adelantadas = [];
  for (const codigo of codigos) {
    const materia = porCodigo[codigo];
    if (!materia) return { ok: false, error: 'La materia ' + codigo + ' no existe' };
    const e = elegibilidad(materia, ctx);
    if (!e.elegible) {
      // Excepción: materias sin prerrequisitos de semestres superiores
      if (esAdelantable(materia, ctx)) {
        adelantadas.push(materia);
        elegidas.push(materia);
        continue;
      }
      let detalle = e.motivo;
      if (e.faltantes.length > 0) detalle += ': ' + e.faltantes.join(', ');
      return { ok: false, error: materia.nombre + ' (' + codigo + '): ' + detalle };
    }
    elegidas.push(materia);
  }

  const creditos = elegidas.reduce((suma, m) => suma + m.creditos, 0);

  // Para adelantar: máximo 20 créditos y ya deben ir todas las materias del semestre
  if (adelantadas.length > 0) {
    if (creditos > MAX_CREDITOS) {
      return { ok: false, error: 'Con las materias adelantadas llevas ' + creditos + ' créditos y el máximo es ' + MAX_CREDITOS + '.' };
    }
    const faltan = ctx.materias.filter((m) => elegibilidad(m, ctx).elegible && !codigos.includes(m.codigo));
    if (faltan.length > 0) {
      return {
        ok: false,
        error: 'Para adelantar primero debes matricular todas las materias de tu semestre. Te falta: ' +
          faltan.map((m) => m.nombre).join(', '),
      };
    }
  }

  // El primer periodo se matricula solo al registrarse; los límites aplican a los siguientes.
  const hayPeriodoPrevio = ctx.matriculas.length > 0;
  if (hayPeriodoPrevio) {
    if (creditos > MAX_CREDITOS) {
      return { ok: false, error: 'No puedes superar ' + MAX_CREDITOS + ' créditos por semestre (llevas ' + creditos + ').' };
    }
    if (creditos < MIN_CREDITOS) {
      // Si no queda nada más por matricular, el mínimo no se exige.
      const todasLasElegibles = ctx.materias.filter((m) => elegibilidad(m, ctx).elegible);
      const llevaTodo = todasLasElegibles.every((m) => codigos.includes(m.codigo));
      if (!llevaTodo) {
        return { ok: false, error: 'Debes matricular mínimo ' + MIN_CREDITOS + ' créditos por semestre (llevas ' + creditos + ').' };
      }
    }
  }

  return { ok: true, creditos };
}

// PAPA = suma(nota * créditos) / suma(créditos), solo con las materias aprobadas.
function calcularPapa(matriculas, materiasPorCodigo) {
  let puntos = 0;
  let creditos = 0;
  for (const m of matriculas) {
    if (m.estado !== 'aprobada') continue;
    const materia = materiasPorCodigo[m.materia_codigo];
    if (!materia) continue;
    puntos += Number(m.nota) * materia.creditos;
    creditos += materia.creditos;
  }
  if (creditos === 0) return null;
  return Math.round((puntos / creditos) * 100) / 100;
}

// Valida una nota y devuelve el número (con un decimal) o null si no es válida.
function normalizarNota(valor) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || Number.isNaN(n)) return null;
  if (n < 0 || n > 5) return null;
  const redondeada = Math.round(n * 10) / 10;
  if (Math.abs(redondeada - n) > 1e-9) return null;
  return redondeada;
}

function estadoSegunNota(nota) {
  return nota >= NOTA_MINIMA ? 'aprobada' : 'reprobada';
}

module.exports = {
  MIN_CREDITOS, MAX_CREDITOS, NOTA_MINIMA, MODO_DESBLOQUEO,
  resumenPorMateria, semestresHabilitados, periodoAbierto, elegibilidad, esAdelantable,
  armarContexto, validarMatricula, calcularPapa, normalizarNota, estadoSegunNota,
};