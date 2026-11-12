const express = require('express');
const bd = require('../bd');
const { ruta, exigirSesion, exigirAdmin } = require('../middlewares');
const { construirDesdeMaterias } = require('../grafo/digrafo');
const academico = require('../servicios/academico');

const router = express.Router();
router.use(exigirSesion);

function entero(valor, min, max) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// Revisa los campos que llegan del formulario. Devuelve { error } o { datos }.
function leerCampos(cuerpo, conCodigo) {
  const datos = {};
  if (conCodigo) {
    datos.codigo = String(cuerpo.codigo || '').trim();
    if (!/^[A-Za-z0-9 -]{1,20}$/.test(datos.codigo)) {
      return { error: 'El código debe tener entre 1 y 20 caracteres (letras, números, espacio o guion)' };
    }
  }
  datos.nombre = String(cuerpo.nombre || '').trim();
  if (datos.nombre.length === 0 || datos.nombre.length > 200) {
    return { error: 'El nombre es obligatorio (máximo 200 caracteres)' };
  }
  datos.semestre = entero(cuerpo.semestre, 1, 10);
  if (datos.semestre === null) return { error: 'El semestre debe ser un número entre 1 y 10' };
  datos.creditos = entero(cuerpo.creditos, 0, 12);
  if (datos.creditos === null) return { error: 'Los créditos deben ser un número entre 0 y 12' };
  datos.ht = entero(cuerpo.ht === undefined || cuerpo.ht === '' ? 0 : cuerpo.ht, 0, 40);
  datos.hp = entero(cuerpo.hp === undefined || cuerpo.hp === '' ? 0 : cuerpo.hp, 0, 40);
  if (datos.ht === null || datos.hp === null) return { error: 'Las horas deben ser números entre 0 y 40' };
  datos.area = String(cuerpo.area || '').trim().slice(0, 100);
  datos.electiva = !!cuerpo.electiva;

  let prereqs = cuerpo.prereqs;
  if (prereqs === undefined || prereqs === null) prereqs = [];
  if (!Array.isArray(prereqs)) return { error: 'Los prerrequisitos deben enviarse como una lista' };
  datos.prereqs = Array.from(new Set(prereqs.map((p) => String(p).trim()).filter((p) => p)));
  return { datos };
}

// Comprueba que los prerrequisitos tengan sentido dentro del grafo completo.
// Devuelve un texto con el error, o null si todo está bien.
function revisarPrerrequisitos(materias, codigo, semestre, prereqs) {
  const porCodigo = {};
  materias.forEach((m) => { porCodigo[m.codigo] = m; });

  for (const p of prereqs) {
    if (p === codigo) return 'Una materia no puede ser prerrequisito de sí misma';
    if (!porCodigo[p]) return 'El prerrequisito ' + p + ' no existe';
    if (porCodigo[p].semestre >= semestre) {
      return 'El prerrequisito ' + p + ' (' + porCodigo[p].nombre + ') debe estar en un semestre anterior al ' + semestre;
    }
  }
  // Las materias que dependen de esta tienen que seguir quedando después
  for (const m of materias) {
    if (m.prereqs.includes(codigo) && m.semestre <= semestre) {
      return 'No puedes mover la materia al semestre ' + semestre + ': ' + m.nombre + ' (semestre ' + m.semestre + ') la tiene como prerrequisito';
    }
  }

  // Comprobación con el dígrafo: la malla nueva no puede tener ciclos
  const nueva = materias.filter((m) => m.codigo !== codigo).map((m) => ({ ...m }));
  nueva.push({ codigo, semestre, prereqs });
  const g = construirDesdeMaterias(nueva);
  if (g.tieneCiclo()) return 'Esos prerrequisitos formarían un ciclo en la malla';
  return null;
}

// GET /api/materias
router.get('/', ruta(async (req, res) => {
  res.json(await academico.cargarMaterias());
}));

// GET /api/materias/:codigo
router.get('/:codigo', ruta(async (req, res) => {
  const materias = await academico.cargarMaterias();
  const materia = materias.find((m) => m.codigo === req.params.codigo);
  if (!materia) return res.status(404).json({ error: 'Materia no encontrada' });
  res.json(materia);
}));

// POST /api/materias (admin)
router.post('/', exigirAdmin, ruta(async (req, res) => {
  const leido = leerCampos(req.body, true);
  if (leido.error) return res.status(400).json({ error: leido.error });
  const d = leido.datos;

  const materias = await academico.cargarMaterias();
  if (materias.some((m) => m.codigo === d.codigo)) {
    return res.status(409).json({ error: 'Ya existe una materia con ese código' });
  }
  const problema = revisarPrerrequisitos(materias, d.codigo, d.semestre, d.prereqs);
  if (problema) return res.status(400).json({ error: problema });

  const conn = await bd.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO materias (codigo, nombre, semestre, creditos, ht, hp, area, electiva) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [d.codigo, d.nombre, d.semestre, d.creditos, d.ht, d.hp, d.area, d.electiva ? 1 : 0]
    );
    for (const p of d.prereqs) {
      await conn.query('INSERT INTO prerrequisitos (materia_codigo, prerrequisito_codigo) VALUES (?, ?)', [d.codigo, p]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.status(201).json({ mensaje: 'Materia creada' });
}));

// PUT /api/materias/:codigo (admin)
router.put('/:codigo', exigirAdmin, ruta(async (req, res) => {
  const codigo = req.params.codigo;
  const leido = leerCampos(req.body, false);
  if (leido.error) return res.status(400).json({ error: leido.error });
  const d = leido.datos;

  const materias = await academico.cargarMaterias();
  if (!materias.some((m) => m.codigo === codigo)) {
    return res.status(404).json({ error: 'Materia no encontrada' });
  }
  const problema = revisarPrerrequisitos(materias, codigo, d.semestre, d.prereqs);
  if (problema) return res.status(400).json({ error: problema });

  const conn = await bd.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE materias SET nombre = ?, semestre = ?, creditos = ?, ht = ?, hp = ?, area = ?, electiva = ? WHERE codigo = ?',
      [d.nombre, d.semestre, d.creditos, d.ht, d.hp, d.area, d.electiva ? 1 : 0, codigo]
    );
    await conn.query('DELETE FROM prerrequisitos WHERE materia_codigo = ?', [codigo]);
    for (const p of d.prereqs) {
      await conn.query('INSERT INTO prerrequisitos (materia_codigo, prerrequisito_codigo) VALUES (?, ?)', [codigo, p]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ mensaje: 'Materia actualizada' });
}));

// DELETE /api/materias/:codigo (admin)
router.delete('/:codigo', exigirAdmin, ruta(async (req, res) => {
  const codigo = req.params.codigo;
  const materias = await academico.cargarMaterias();
  if (!materias.some((m) => m.codigo === codigo)) {
    return res.status(404).json({ error: 'Materia no encontrada' });
  }

  const dependientes = materias.filter((m) => m.prereqs.includes(codigo));
  if (dependientes.length > 0) {
    return res.status(409).json({
      error: 'No se puede eliminar: es prerrequisito de ' + dependientes.map((m) => m.nombre).join(', '),
    });
  }
  const [[{ n }]] = await bd.query('SELECT COUNT(*) AS n FROM matriculas WHERE materia_codigo = ?', [codigo]);
  if (n > 0) {
    return res.status(409).json({ error: 'No se puede eliminar: hay ' + n + ' matrícula(s) de estudiantes en esta materia' });
  }

  await bd.query('DELETE FROM materias WHERE codigo = ?', [codigo]);
  res.json({ mensaje: 'Materia eliminada' });
}));

module.exports = router;
