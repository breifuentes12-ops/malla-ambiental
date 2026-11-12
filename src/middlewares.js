// Envuelve una ruta async para que los errores lleguen al manejador de errores de Express.
function ruta(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function exigirSesion(req, res, next) {
  if (!req.session || !req.session.usuarioId) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.session || req.session.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  }
  next();
}

module.exports = { ruta, exigirSesion, exigirAdmin };
