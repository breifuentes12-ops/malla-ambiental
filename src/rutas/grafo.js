const express = require('express');
const { ruta, exigirSesion } = require('../middlewares');
const { construirDesdeMaterias } = require('../grafo/digrafo');
const R = require('../reglas/matricula');
const academico = require('../servicios/academico');

const router = express.Router();
router.use(exigirSesion);

// GET /api/grafo -> nodos (con el estado del usuario) y aristas dirigidas
router.get('/', ruta(async (req, res) => {
  const materias = await academico.cargarMaterias();
  const matriculas = await academico.cargarMatriculas(req.session.usuarioId);
  const resumen = R.resumenPorMateria(matriculas);
  const g = construirDesdeMaterias(materias);

  const nodos = materias.map((m) => ({
    codigo: m.codigo,
    nombre: m.nombre,
    semestre: m.semestre,
    creditos: m.creditos,
    estado: resumen[m.codigo] ? resumen[m.codigo].estado : 'no_cursada',
    nota: resumen[m.codigo] ? resumen[m.codigo].nota : null,
    grado_entrada: g.gradoEntrada(m.codigo),
    grado_salida: g.gradoSalida(m.codigo),
  }));
  const aristas = g.aristas().map(([desde, hasta]) => ({ desde, hasta }));
  res.json({ nodos, aristas });
}));

// GET /api/grafo/analisis -> propiedades del dígrafo calculadas con los algoritmos propios
router.get('/analisis', ruta(async (req, res) => {
  const materias = await academico.cargarMaterias();
  const porCodigo = academico.mapaPorCodigo(materias);
  const g = construirDesdeMaterias(materias);
  const nombre = (c) => ({ codigo: c, nombre: porCodigo[c].nombre, semestre: porCodigo[c].semestre });

  const orden = g.ordenTopologico();
  const camino = g.caminoMasLargo();

  res.json({
    vertices: g.vertices.length,
    aristas: g.cantidadAristas(),
    es_aciclico: orden !== null,
    orden_topologico: orden ? orden.map(nombre) : null,
    camino_mas_largo: camino ? camino.map(nombre) : null,
    sin_prerrequisitos: g.vertices.filter((v) => g.gradoEntrada(v) === 0).map(nombre),
    sin_dependientes: g.vertices.filter((v) => g.gradoSalida(v) === 0).map(nombre),
    grados: g.vertices.map((v) => ({
      codigo: v,
      nombre: porCodigo[v].nombre,
      entrada: g.gradoEntrada(v),
      salida: g.gradoSalida(v),
    })),
  });
}));

// GET /api/grafo/matriz -> matriz de adyacencia
router.get('/matriz', ruta(async (req, res) => {
  const materias = await academico.cargarMaterias();
  const g = construirDesdeMaterias(materias);
  res.json({ codigos: g.vertices, matriz: g.matrizAdyacencia() });
}));

// GET /api/grafo/relaciones/:codigo -> prerrequisitos (directos e indirectos) y materias que dependen de ella
router.get('/relaciones/:codigo', ruta(async (req, res) => {
  const materias = await academico.cargarMaterias();
  const g = construirDesdeMaterias(materias);
  if (!g.vertices.includes(req.params.codigo)) {
    return res.status(404).json({ error: 'Materia no encontrada' });
  }
  res.json({
    ancestros: g.ancestros(req.params.codigo),
    descendientes: g.descendientes(req.params.codigo),
  });
}));

module.exports = router;
