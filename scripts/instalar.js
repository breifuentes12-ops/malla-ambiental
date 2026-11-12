// Crea la base de datos, las tablas, la malla y unos usuarios de prueba.
//   npm run instalar-bd      -> crea lo que falte (no borra nada)
//   npm run reiniciar-bd     -> borra la base de datos y la crea de nuevo
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const MATERIAS = require('../src/datos/malla');

const reiniciar = process.argv.includes('--reiniciar');
const NOMBRE_BD = config.bd.database;

const TABLAS = [
  `CREATE TABLE IF NOT EXISTS usuarios (
     id INT AUTO_INCREMENT PRIMARY KEY,
     cedula VARCHAR(15) NOT NULL UNIQUE,
     nombre VARCHAR(60) NOT NULL,
     apellido VARCHAR(60) NOT NULL,
     clave_hash VARCHAR(100) NOT NULL,
     rol ENUM('estudiante', 'admin') NOT NULL DEFAULT 'estudiante',
     creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS materias (
     codigo VARCHAR(20) PRIMARY KEY,
     nombre VARCHAR(200) NOT NULL,
     semestre TINYINT NOT NULL,
     creditos TINYINT NOT NULL,
     ht TINYINT NOT NULL DEFAULT 0,
     hp TINYINT NOT NULL DEFAULT 0,
     area VARCHAR(100) NOT NULL DEFAULT '',
     electiva TINYINT(1) NOT NULL DEFAULT 0,
     INDEX idx_semestre (semestre)
   ) ENGINE=InnoDB`,

  // Cada fila es una arista del dígrafo: prerrequisito_codigo -> materia_codigo
  `CREATE TABLE IF NOT EXISTS prerrequisitos (
     materia_codigo VARCHAR(20) NOT NULL,
     prerrequisito_codigo VARCHAR(20) NOT NULL,
     PRIMARY KEY (materia_codigo, prerrequisito_codigo),
     FOREIGN KEY (materia_codigo) REFERENCES materias(codigo) ON DELETE CASCADE,
     FOREIGN KEY (prerrequisito_codigo) REFERENCES materias(codigo) ON DELETE CASCADE
   ) ENGINE=InnoDB`,

  // Una fila por cada intento de una materia. Si se repite una materia queda una fila nueva
  // en otro periodo, así el historial no se pierde.
  `CREATE TABLE IF NOT EXISTS matriculas (
     id INT AUTO_INCREMENT PRIMARY KEY,
     usuario_id INT NOT NULL,
     materia_codigo VARCHAR(20) NOT NULL,
     periodo INT NOT NULL,
     estado ENUM('matriculada', 'aprobada', 'reprobada') NOT NULL DEFAULT 'matriculada',
     nota DECIMAL(2,1) NULL,
     matriculada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     calificada_en TIMESTAMP NULL DEFAULT NULL,
     UNIQUE KEY uq_intento (usuario_id, materia_codigo, periodo),
     INDEX idx_usuario (usuario_id),
     FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
     FOREIGN KEY (materia_codigo) REFERENCES materias(codigo) ON DELETE RESTRICT
   ) ENGINE=InnoDB`,
];

// Usuarios de prueba. "semestre" es el semestre que están cursando ahora.
const CLAVE_ESTUDIANTES = 'estudiante123';
const CLAVE_ADMIN = 'admin1234';
const USUARIOS = [
  { cedula: '1000000000', nombre: 'Administrador', apellido: 'Sistema', clave: CLAVE_ADMIN, rol: 'admin' },
  { cedula: '1000000001', nombre: 'Breiner', apellido: 'Fuentes Martinez', clave: CLAVE_ESTUDIANTES, semestre: 1 },
  { cedula: '1000000002', nombre: 'Jesus David', apellido: 'Avila Ribón', clave: CLAVE_ESTUDIANTES, semestre: 2 },
];

// Generador de números pseudoaleatorios con semilla fija, para que las notas de prueba
// salgan iguales cada vez que se instala.
function crearAleatorio(semilla) {
  let x = semilla;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

async function main() {
  const conn = await mysql.createConnection({
    host: config.bd.host,
    port: config.bd.port,
    user: config.bd.user,
    password: config.bd.password,
    charset: 'utf8mb4',
  });

  if (reiniciar) {
    await conn.query('DROP DATABASE IF EXISTS `' + NOMBRE_BD + '`');
    console.log('Base de datos anterior eliminada');
  }
  await conn.query('CREATE DATABASE IF NOT EXISTS `' + NOMBRE_BD + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.query('USE `' + NOMBRE_BD + '`');

  for (const sql of TABLAS) await conn.query(sql);
  console.log('Tablas listas');

  // Materias y prerrequisitos
  const [[{ total: totalMaterias }]] = await conn.query('SELECT COUNT(*) AS total FROM materias');
  if (totalMaterias === 0) {
    for (const m of MATERIAS) {
      await conn.query(
        'INSERT INTO materias (codigo, nombre, semestre, creditos, ht, hp, area, electiva) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [m.codigo, m.nombre, m.semestre, m.creditos, m.ht, m.hp, m.area, m.electiva ? 1 : 0]
      );
    }
    let aristas = 0;
    for (const m of MATERIAS) {
      for (const p of m.prereqs) {
        await conn.query('INSERT INTO prerrequisitos (materia_codigo, prerrequisito_codigo) VALUES (?, ?)', [m.codigo, p]);
        aristas++;
      }
    }
    console.log('Materias: ' + MATERIAS.length + ', prerrequisitos (aristas): ' + aristas);
  } else {
    console.log('La malla ya estaba cargada, no se modificó');
  }

  // Usuarios de prueba
  const [[{ total: totalUsuarios }]] = await conn.query('SELECT COUNT(*) AS total FROM usuarios');
  if (totalUsuarios === 0) {
    const aleatorio = crearAleatorio(2026);
    for (const u of USUARIOS) {
      const hash = await bcrypt.hash(u.clave, 10);
      const [r] = await conn.query(
        'INSERT INTO usuarios (cedula, nombre, apellido, clave_hash, rol) VALUES (?, ?, ?, ?, ?)',
        [u.cedula, u.nombre, u.apellido, hash, u.rol || 'estudiante']
      );
      if (u.rol === 'admin') continue;

      // Los semestres anteriores quedan aprobados y el actual queda matriculado (periodo abierto)
      for (const m of MATERIAS) {
        if (m.semestre < u.semestre) {
          const nota = Math.round((3 + aleatorio() * 1.8) * 10) / 10;
          await conn.query(
            'INSERT INTO matriculas (usuario_id, materia_codigo, periodo, estado, nota, calificada_en) VALUES (?, ?, ?, "aprobada", ?, NOW())',
            [r.insertId, m.codigo, m.semestre, nota]
          );
        } else if (m.semestre === u.semestre) {
          await conn.query(
            'INSERT INTO matriculas (usuario_id, materia_codigo, periodo, estado) VALUES (?, ?, ?, "matriculada")',
            [r.insertId, m.codigo, m.semestre]
          );
        }
      }
    }
    console.log('Usuarios de prueba creados');
    console.log('  Administrador: 1000000000 / ' + CLAVE_ADMIN);
    console.log('  Estudiantes:   1000000001 y 1000000002 / ' + CLAVE_ESTUDIANTES + ' (semestres 1 y 2)');
  } else {
    console.log('Ya había usuarios, no se crearon los de prueba');
  }

  await conn.end();
  console.log('\nListo. Ahora ejecuta: npm start');
}

main().catch((err) => {
  console.error('Error al instalar la base de datos:', err.message);
  console.error('Revisa que MySQL esté encendido en Laragon y que los datos del archivo .env sean correctos.');
  process.exit(1);
});