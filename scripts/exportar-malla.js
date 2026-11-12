// Genera src/datos/malla.js a partir de las materias guardadas en MySQL.
// Uso: node scripts/exportar-malla.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const conn = await mysql.createConnection({ ...config.bd, charset: 'utf8mb4' });
  try {
    const [materias] = await conn.query('SELECT * FROM materias ORDER BY semestre, codigo');
    const [aristas] = await conn.query(
      'SELECT materia_codigo, prerrequisito_codigo FROM prerrequisitos ORDER BY materia_codigo, prerrequisito_codigo'
    );

    if (materias.length === 0) {
      console.log('La tabla materias está vacía. No se generó nada.');
      return;
    }

    const prereqs = {};
    for (const a of aristas) {
      if (!prereqs[a.materia_codigo]) prereqs[a.materia_codigo] = [];
      prereqs[a.materia_codigo].push(a.prerrequisito_codigo);
    }

    const texto = (v) => JSON.stringify(String(v));
    const lineas = materias.map((m) =>
      '  { codigo: ' + texto(m.codigo) +
      ', nombre: ' + texto(m.nombre) +
      ', semestre: ' + m.semestre +
      ', creditos: ' + m.creditos +
      ', ht: ' + m.ht +
      ', hp: ' + m.hp +
      ', area: ' + texto(m.area || '') +
      ', electiva: ' + (m.electiva ? 'true' : 'false') +
      ', prereqs: [' + (prereqs[m.codigo] || []).map(texto).join(', ') + '] },'
    );

    const contenido =
      '// Materias de la carrera y sus prerrequisitos.\n' +
      '// Cada materia es un vértice del dígrafo y cada prerrequisito una arista (prerrequisito -> materia).\n' +
      '// Lo usan scripts/instalar.js (para llenar la base de datos) y tests/logica.test.js.\n\n' +
      'module.exports = [\n' + lineas.join('\n') + '\n];\n';

    const destino = path.join(__dirname, '..', 'src', 'datos', 'malla.js');
    fs.writeFileSync(destino, contenido, 'utf8');
    console.log('Listo: ' + materias.length + ' materias y ' + aristas.length + ' prerrequisitos guardados en src/datos/malla.js');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo exportar la malla:', err.message);
  process.exit(1);
});
