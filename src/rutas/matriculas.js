const express = require('express');
const bd = require('../bd');
const { ruta, exigirSesion } = require('../middlewares');
const R = require('../reglas/matricula');
const academico = require('../servicios/academico');

const router = express.Router();
router.use(exigirSesion);

// GET /api/matriculas/panorama  -> malla completa con el estado de cada materia
router.get('/panorama', ruta(async (req, res) => {
  res.json(await academico.panorama(req.session.usuarioId));
}));

// GET /api/matriculas/historial  -> intentos agrupados por periodo
router.get('/historial', ruta(async (req, res) => {
  res.json(await academico.historial(req.session.usuarioId));
}));

// POST /api/matriculas  { codigos: ["453008", ...] }
router.post('/', ruta(async (req, res) => {
  const usuarioId = req.session.usuarioId;
  if (req.session.rol === 'admin') {
    return res.status(403).json({ error: 'El administrador no tiene matrículas' });
  }

  const codigos = req.body.codigos;
  const materias = await academico.cargarMaterias();
  const matriculas = await academico.cargarMatriculas(usuarioId);
  const ctx = R.armarContexto(materias, matriculas);

  const veredicto = R.validarMatricula(codigos, ctx);
  if (!veredicto.ok) return res.status(400).json({ error: veredicto.error });

  // Número del nuevo periodo = último periodo + 1
  const nuevoPeriodo = matriculas.reduce((mayor, m) => Math.max(mayor, m.periodo), 0) + 1;

  const conn = await bd.getConnection();
  try {
    await conn.beginTransaction();
    for (const codigo of codigos) {
      await conn.query(
        'INSERT INTO matriculas (usuario_id, materia_codigo, periodo, estado) VALUES (?, ?, ?, "matriculada")',
        [usuarioId, codigo, nuevoPeriodo]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.status(201).json({
    mensaje: codigos.length + ' materia(s) matriculada(s) en el semestre ' + nuevoPeriodo,
    periodo: nuevoPeriodo,
    creditos: veredicto.creditos,
  });
}));

// PUT /api/matriculas/:id/nota  { nota: 3.5 }
router.put('/:id/nota', ruta(async (req, res) => {
  const nota = R.normalizarNota(req.body.nota);
  if (nota === null) {
    return res.status(400).json({ error: 'La nota debe estar entre 0.0 y 5.0, con máximo un decimal' });
  }

  const [filas] = await bd.query('SELECT * FROM matriculas WHERE id = ?', [req.params.id]);
  const mat = filas[0];
  if (!mat) return res.status(404).json({ error: 'Matrícula no encontrada' });

  const esAdmin = req.session.rol === 'admin';
  if (mat.usuario_id !== req.session.usuarioId && !esAdmin) {
    return res.status(403).json({ error: 'Esta matrícula no es tuya' });
  }
  if (mat.estado === 'aprobada') {
    return res.status(400).json({ error: 'Una materia aprobada no se puede modificar' });
  }
  if (mat.estado === 'reprobada') {
    // Solo se corrige una reprobada si todavía no se matriculó un periodo posterior
    const [[{ n }]] = await bd.query(
      'SELECT COUNT(*) AS n FROM matriculas WHERE usuario_id = ? AND periodo > ?',
      [mat.usuario_id, mat.periodo]
    );
    if (n > 0 && !esAdmin) {
      return res.status(400).json({ error: 'No puedes corregir esta nota porque ya matriculaste un semestre posterior' });
    }
  }

  const estado = R.estadoSegunNota(nota);
  await bd.query(
    'UPDATE matriculas SET nota = ?, estado = ?, calificada_en = NOW() WHERE id = ?',
    [nota, estado, mat.id]
  );
  res.json({ mensaje: 'Nota registrada: ' + nota.toFixed(1) + ' (' + estado + ')', estado, nota });
}));

// DELETE /api/matriculas/:id  -> cancelar una matrícula que todavía no tiene nota
router.delete('/:id', ruta(async (req, res) => {
  const [filas] = await bd.query('SELECT * FROM matriculas WHERE id = ?', [req.params.id]);
  const mat = filas[0];
  if (!mat) return res.status(404).json({ error: 'Matrícula no encontrada' });
  if (mat.usuario_id !== req.session.usuarioId && req.session.rol !== 'admin') {
    return res.status(403).json({ error: 'Esta matrícula no es tuya' });
  }
  if (mat.estado !== 'matriculada') {
    return res.status(400).json({ error: 'Solo se pueden cancelar materias que todavía no tienen nota' });
  }
  await bd.query('DELETE FROM matriculas WHERE id = ?', [mat.id]);
  res.json({ mensaje: 'Matrícula cancelada' });
}));

module.exports = router;