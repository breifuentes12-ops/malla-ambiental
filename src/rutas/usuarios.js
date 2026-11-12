const express = require('express');
const bd = require('../bd');
const { ruta, exigirSesion, exigirAdmin } = require('../middlewares');
const R = require('../reglas/matricula');
const academico = require('../servicios/academico');

const router = express.Router();
router.use(exigirSesion, exigirAdmin);

// GET /api/usuarios -> lista de usuarios con su semestre actual y créditos aprobados
router.get('/', ruta(async (req, res) => {
  const [usuarios] = await bd.query(
    'SELECT id, cedula, nombre, apellido, rol, creado_en FROM usuarios ORDER BY creado_en DESC, id DESC'
  );
  const materias = await academico.cargarMaterias();
  const porCodigo = academico.mapaPorCodigo(materias);

  const [todas] = await bd.query('SELECT usuario_id, materia_codigo, periodo, estado, nota, id FROM matriculas');
  const porUsuario = {};
  for (const m of todas) {
    if (!porUsuario[m.usuario_id]) porUsuario[m.usuario_id] = [];
    porUsuario[m.usuario_id].push(m);
  }

  const lista = usuarios.map((u) => {
    if (u.rol === 'admin') return { ...u, semestre_actual: null, creditos_aprobados: null };
    const matriculas = porUsuario[u.id] || [];
    const ctx = R.armarContexto(materias, matriculas);
    const creditos = Object.keys(ctx.resumen)
      .filter((c) => ctx.resumen[c].aprobada)
      .reduce((s, c) => s + (porCodigo[c] ? porCodigo[c].creditos : 0), 0);
    return { ...u, semestre_actual: Math.max(...ctx.habilitados), creditos_aprobados: creditos };
  });
  res.json(lista);
}));

// DELETE /api/usuarios/:id
router.delete('/:id', ruta(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.usuarioId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  const [r] = await bd.query('DELETE FROM usuarios WHERE id = ?', [id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ mensaje: 'Usuario eliminado junto con su historial' });
}));

module.exports = router;
