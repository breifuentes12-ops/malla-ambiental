const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');

const app = express();

app.use(express.json());
app.use(session({
  name: 'malla.sid',
  secret: config.sesionSecreto,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }, // 8 horas
}));

// Archivos del frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API
app.use('/api/auth', require('./rutas/auth'));
app.use('/api/materias', require('./rutas/materias'));
app.use('/api/matriculas', require('./rutas/matriculas'));
app.use('/api/usuarios', require('./rutas/usuarios'));
app.use('/api/grafo', require('./rutas/grafo'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador de errores
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  console.error(err);
  if (err.code === 'ECONNREFUSED' || err.code === 'ER_BAD_DB_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ error: 'No hay conexión con la base de datos. ¿Ejecutaste npm run instalar-bd?' });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(config.puerto, () => {
  console.log('Malla curricular de Ingeniería Ambiental');
  console.log('Servidor en http://localhost:' + config.puerto);
  if (config.sesionSecreto === 'secreto_de_desarrollo_cambiar') {
    console.log('Aviso: cambia SESION_SECRETO en el archivo .env');
  }
});
