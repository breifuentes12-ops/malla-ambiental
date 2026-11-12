const mysql = require('mysql2/promise');
const config = require('./config');

// Pool de conexiones: reutiliza conexiones en vez de abrir una por consulta.
const pool = mysql.createPool({
  ...config.bd,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

module.exports = pool;
