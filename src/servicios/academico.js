// Carga datos de MySQL y los pasa por las reglas (src/reglas/matricula.js).
const bd = require('../bd');
const R = require('../reglas/matricula');

// Todas las materias, cada una con su arreglo de prerrequisitos
async function cargarMaterias() {
  const [filas] = await bd.query('SELECT * FROM materias ORDER BY semestre, codigo');
  const [aristas] = await bd.query('SELECT materia_codigo, prerrequisito_codigo FROM prerrequisitos');

  const prereqs = {};
  for (const a of aristas) {
    if (!prereqs[a.materia_codigo]) prereqs[a.materia_codigo] = [];
    prereqs[a.materia_codigo].push(a.prerrequisito_codigo);
  }

  return filas.map((m) => ({
    codigo: m.codigo,
    nombre: m.nombre,
    semestre: m.semestre,
    creditos: m.creditos,
    ht: m.ht,
    hp: m.hp,
    area: m.area,
    electiva: !!m.electiva,
    prereqs: prereqs[m.codigo] || [],
  }));
}

async function cargarMatriculas(usuarioId) {
  const [filas] = await bd.query(
    'SELECT id, materia_codigo, periodo, estado, nota, matriculada_en, calificada_en FROM matriculas WHERE usuario_id = ? ORDER BY periodo, id',
    [usuarioId]
  );
  return filas.map((f) => ({ ...f, nota: f.nota === null ? null : Number(f.nota) }));
}

function mapaPorCodigo(materias) {
  const mapa = {};
  for (const m of materias) mapa[m.codigo] = m;
  return mapa;
}

// Números generales del estudiante
function armarResumen(materias, matriculas, ctx) {
  const porCodigo = mapaPorCodigo(materias);
  const aprobadas = Object.keys(ctx.resumen).filter((c) => ctx.resumen[c].aprobada);
  const creditosAprobados = aprobadas.reduce((s, c) => s + (porCodigo[c] ? porCodigo[c].creditos : 0), 0);
  const creditosTotales = materias.reduce((s, m) => s + m.creditos, 0);
  const periodos = new Set(matriculas.map((m) => m.periodo));

  return {
    papa: R.calcularPapa(matriculas, porCodigo),
    creditos_aprobados: creditosAprobados,
    creditos_totales: creditosTotales,
    materias_aprobadas: aprobadas.length,
    materias_totales: materias.length,
    materias_reprobadas_ahora: Object.keys(ctx.resumen).filter((c) => ctx.resumen[c].estado === 'reprobada').length,
    semestre_actual: Math.max(...ctx.habilitados),
    periodos_cursados: periodos.size,
  };
}

// Información completa para la pantalla de la malla
async function panorama(usuarioId) {
  const materias = await cargarMaterias();
  const matriculas = await cargarMatriculas(usuarioId);
  const ctx = R.armarContexto(materias, matriculas);
  const abierto = R.periodoAbierto(matriculas);

  const lista = materias.map((m) => {
    const r = ctx.resumen[m.codigo];
    const e = R.elegibilidad(m, ctx);
    return {
      ...m,
      estado: r ? r.estado : 'no_cursada',
      nota: r ? r.nota : null,
      intentos: r ? r.intentos : 0,
      matricula_id: r && r.estado === 'matriculada' ? r.matriculaId : null,
            elegible: e.elegible,
      adelantable: R.esAdelantable(m, ctx),
      motivo: e.motivo,
      codigo_motivo: e.codigoMotivo,
      faltantes: e.faltantes,
    };
  });

  return {
    materias: lista,
    semestres_habilitados: ctx.habilitados,
    periodo_abierto: abierto,
    resumen: armarResumen(materias, matriculas, ctx),
    limites: { min: R.MIN_CREDITOS, max: R.MAX_CREDITOS },
  };
}

async function historial(usuarioId) {
  const materias = await cargarMaterias();
  const porCodigo = mapaPorCodigo(materias);
  const matriculas = await cargarMatriculas(usuarioId);
  const ctx = R.armarContexto(materias, matriculas);

  const periodos = {};
  for (const m of matriculas) {
    const materia = porCodigo[m.materia_codigo];
    if (!periodos[m.periodo]) periodos[m.periodo] = { periodo: m.periodo, creditos: 0, matriculas: [] };
    periodos[m.periodo].creditos += materia.creditos;
    periodos[m.periodo].matriculas.push({
      id: m.id,
      codigo: m.materia_codigo,
      nombre: materia.nombre,
      semestre: materia.semestre,
      creditos: materia.creditos,
      estado: m.estado,
      nota: m.nota,
    });
  }

  return {
    periodos: Object.values(periodos).sort((a, b) => a.periodo - b.periodo),
    periodo_abierto: R.periodoAbierto(matriculas),
    resumen: armarResumen(materias, matriculas, ctx),
  };
}

module.exports = { cargarMaterias, cargarMatriculas, mapaPorCodigo, panorama, historial };
