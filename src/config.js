// Lee las variables de entorno (archivo .env) y deja valores por defecto de Laragon.
require('dotenv').config();

module.exports = {
  bd: {
    host: process.env.BD_HOST || '127.0.0.1',
    port: Number(process.env.BD_PUERTO) || 3306,
    user: process.env.BD_USUARIO || 'root',
    password: process.env.BD_CLAVE || '',
    database: process.env.BD_NOMBRE || 'malla_ambiental',
  },
  puerto: Number(process.env.PUERTO) || 3000,
  sesionSecreto: process.env.SESION_SECRETO || 'secreto_de_desarrollo_cambiar',
};
