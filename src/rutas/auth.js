const express = require('express');
const bcrypt = require('bcryptjs');
const bd = require('../bd');
const { ruta, exigirSesion } = require('../middlewares');

const router = express.Router();

// Guarda al usuario en una sesión nueva (evita reutilizar una sesión anterior)
function abrirSesion(req, usuario) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.usuarioId = usuario.id;
      req.session.rol = usuario.rol;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function datosPublicos(u) {
  return { id: u.id, cedula: u.cedula, nombre: u.nombre, apellido: u.apellido, rol: u.rol };
}

// POST /api/auth/registro
// Crea la cuenta y matricula las materias del semestre 1 en el periodo 1.
router.post('/registro', ruta(async (req, res) => {
  const cedula = String(req.body.cedula || '').trim();
  const nombre = String(req.body.nombre || '').trim();
  const apellido = String(req.body.apellido || '').trim();
  const clave = String(req.body.clave || '');

  if (!cedula || !nombre || !apellido || !clave) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!/^\d{5,15}$/.test(cedula)) {
    return res.status(400).json({ error: 'La cédula debe tener solo números (entre 5 y 15 dígitos)' });
  }
  if (nombre.length > 60 || apellido.length > 60) {
    return res.status(400).json({ error: 'El nombre y el apellido pueden tener máximo 60 caracteres' });
  }
  if (clave.length < 6 || clave.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 72 caracteres' });
  }

  const [existe] = await bd.query('SELECT id FROM usuarios WHERE cedula = ?', [cedula]);
  if (existe.length > 0) {
    return res.status(409).json({ error: 'Ya existe una cuenta con esa cédula' });
  }

  const hash = await bcrypt.hash(clave, 10);

  // Usuario y matrículas del primer semestre se guardan juntos o no se guarda nada
  const conn = await bd.getConnection();
  let usuario;
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO usuarios (cedula, nombre, apellido, clave_hash, rol) VALUES (?, ?, ?, ?, "estudiante")',
      [cedula, nombre, apellido, hash]
    );
    const [primeras] = await conn.query('SELECT codigo FROM materias WHERE semestre = 1');
    for (const m of primeras) {
      await conn.query(
        'INSERT INTO matriculas (usuario_id, materia_codigo, periodo, estado) VALUES (?, ?, 1, "matriculada")',
        [r.insertId, m.codigo]
      );
    }
    await conn.commit();
    usuario = { id: r.insertId, cedula, nombre, apellido, rol: 'estudiante' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await abrirSesion(req, usuario);
  res.status(201).json({ usuario: datosPublicos(usuario) });
}));

// POST /api/auth/entrar
router.post('/entrar', ruta(async (req, res) => {
  const cedula = String(req.body.cedula || '').trim();
  const clave = String(req.body.clave || '');
  if (!cedula || !clave) {
    return res.status(400).json({ error: 'Escribe tu cédula y tu contraseña' });
  }

  const [filas] = await bd.query('SELECT * FROM usuarios WHERE cedula = ?', [cedula]);
  const usuario = filas[0];
  const correcta = usuario ? await bcrypt.compare(clave, usuario.clave_hash) : false;
  if (!correcta) {
    // Mismo mensaje en ambos casos para no revelar qué cédulas existen
    return res.status(401).json({ error: 'Cédula o contraseña incorrecta' });
  }

  await abrirSesion(req, usuario);
  res.json({ usuario: datosPublicos(usuario) });
}));

// POST /api/auth/salir
router.post('/salir', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('malla.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/yo
router.get('/yo', exigirSesion, ruta(async (req, res) => {
  const [filas] = await bd.query(
    'SELECT id, cedula, nombre, apellido, rol FROM usuarios WHERE id = ?',
    [req.session.usuarioId]
  );
  if (!filas[0]) return res.status(401).json({ error: 'La sesión ya no es válida' });
  res.json({ usuario: filas[0] });
}));

module.exports = router;
