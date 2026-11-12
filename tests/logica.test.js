// Pruebas de la lógica (sin base de datos). Se ejecutan con: npm test
const test = require('node:test');
const assert = require('node:assert');

const MATERIAS = require('../src/datos/malla');
const { Digrafo, construirDesdeMaterias } = require('../src/grafo/digrafo');
const R = require('../src/reglas/matricula');

const porCodigo = {};
MATERIAS.forEach((m) => { porCodigo[m.codigo] = m; });

// Crea matrículas aprobadas para todas las materias de los semestres indicados
function aprobarSemestres(hasta) {
  const lista = [];
  let id = 1;
  for (const m of MATERIAS) {
    if (m.semestre <= hasta) {
      lista.push({ id: id++, materia_codigo: m.codigo, periodo: m.semestre, estado: 'aprobada', nota: 4.0 });
    }
  }
  return lista;
}

// ---------- Dígrafo ----------

test('la malla es un grafo acíclico con 56 vértices y 44 aristas', () => {
  const g = construirDesdeMaterias(MATERIAS);
  assert.strictEqual(g.vertices.length, 56);
  assert.strictEqual(g.cantidadAristas(), 44);
  assert.strictEqual(g.tieneCiclo(), false);
});

test('el orden topológico respeta todos los prerrequisitos', () => {
  const g = construirDesdeMaterias(MATERIAS);
  const orden = g.ordenTopologico();
  assert.strictEqual(orden.length, 56);
  const pos = new Map(orden.map((c, i) => [c, i]));
  for (const [u, v] of g.aristas()) assert.ok(pos.get(u) < pos.get(v));
});

test('detecta un ciclo cuando se agrega una arista de regreso', () => {
  const g = construirDesdeMaterias(MATERIAS);
  g.agregarArista('453050', '453045'); // Electiva Prof. II -> Electiva Prof. I (ya existe I -> II)
  assert.strictEqual(g.tieneCiclo(), true);
  assert.strictEqual(g.ordenTopologico(), null);
});

test('matriz de adyacencia coincide con las aristas', () => {
  const g = new Digrafo(['a', 'b', 'c']);
  g.agregarArista('a', 'b');
  g.agregarArista('b', 'c');
  assert.deepStrictEqual(g.matrizAdyacencia(), [[0, 1, 0], [0, 0, 1], [0, 0, 0]]);
  assert.strictEqual(g.gradoSalida('b'), 1);
  assert.strictEqual(g.gradoEntrada('c'), 1);
});

test('ancestros y descendientes', () => {
  const g = construirDesdeMaterias(MATERIAS);
  // Cálculo I -> Cálculo II -> Ecuaciones Diferenciales -> Métodos Numéricos
  assert.ok(g.ancestros('453022').includes('453001'));
  assert.ok(g.descendientes('453001').includes('453022'));
  assert.strictEqual(g.existeCamino('453001', '453022'), true);
  assert.strictEqual(g.existeCamino('453022', '453001'), false);
});

test('camino más largo de la malla', () => {
  const g = construirDesdeMaterias(MATERIAS);
  const camino = g.caminoMasLargo();
  assert.ok(camino.length >= 6);
  for (let i = 0; i < camino.length - 1; i++) {
    assert.ok(g.sucesores(camino[i]).includes(camino[i + 1]));
  }
});

// ---------- Reglas ----------

test('un estudiante de primer semestre NO puede adelantar materias de semestres superiores', () => {
  // Matriculado en semestre 1 sin notas todavía
  const mats = MATERIAS.filter((m) => m.semestre === 1)
    .map((m, i) => ({ id: i + 1, materia_codigo: m.codigo, periodo: 1, estado: 'matriculada', nota: null }));
  const ctx = R.armarContexto(MATERIAS, mats);
  // Estadística (semestre 4) no tiene prerrequisitos, pero su semestre no está habilitado
  const e = R.elegibilidad(porCodigo['453021'], ctx);
  assert.strictEqual(e.elegible, false);
  assert.strictEqual(e.codigoMotivo, 'semestre');
});

test('con el semestre 1 terminado se habilita el 2 pero no el 3', () => {
  const ctx = R.armarContexto(MATERIAS, aprobarSemestres(1));
  assert.deepStrictEqual(ctx.habilitados, [1, 2]);
  assert.strictEqual(R.elegibilidad(porCodigo['453008'], ctx).elegible, true); // Cálculo II
  assert.strictEqual(R.elegibilidad(porCodigo['453016'], ctx).elegible, false); // Cálculo III
});

test('una materia con prerrequisito reprobado queda bloqueada', () => {
  const mats = aprobarSemestres(1).map((m) =>
    m.materia_codigo === '453001' ? { ...m, estado: 'reprobada', nota: 2.0 } : m);
  const ctx = R.armarContexto(MATERIAS, mats);
  assert.deepStrictEqual(ctx.habilitados, [1, 2]); // modo 'cursadas'
  const e = R.elegibilidad(porCodigo['453008'], ctx); // Cálculo II necesita Cálculo I
  assert.strictEqual(e.elegible, false);
  assert.deepStrictEqual(e.faltantes, ['453001']);
});

test('no se puede matricular con un periodo abierto', () => {
  const mats = [{ id: 1, materia_codigo: '453001', periodo: 1, estado: 'matriculada', nota: null }];
  const ctx = R.armarContexto(MATERIAS, mats);
  const r = R.validarMatricula(['453002'], ctx);
  assert.strictEqual(r.ok, false);
});

test('créditos: mínimo 12 y máximo 20 después del primer periodo', () => {
  const ctx = R.armarContexto(MATERIAS, aprobarSemestres(1));
  const pocos = R.validarMatricula(['453008', '453011'], ctx); // 6 créditos y quedan más por matricular
  assert.strictEqual(pocos.ok, false);
  const bien = R.validarMatricula(['453012', '453011', '453008', '453009', '453010'], ctx); // 15
  assert.strictEqual(bien.ok, true);
  assert.strictEqual(bien.creditos, 15);
});

test('no se puede matricular una materia ya aprobada', () => {
  const ctx = R.armarContexto(MATERIAS, aprobarSemestres(2));
  const r = R.validarMatricula(['453008'], ctx);
  assert.strictEqual(r.ok, false);
});

test('PAPA solo cuenta las materias aprobadas', () => {
  const mats = [
    { id: 1, materia_codigo: '453001', periodo: 1, estado: 'aprobada', nota: 4.0 }, // 3 créditos
    { id: 2, materia_codigo: '453002', periodo: 1, estado: 'aprobada', nota: 3.0 }, // 3 créditos
    { id: 3, materia_codigo: '453004', periodo: 1, estado: 'reprobada', nota: 1.0 }, // no cuenta
  ];
  assert.strictEqual(R.calcularPapa(mats, porCodigo), 3.5);
  assert.strictEqual(R.calcularPapa([], porCodigo), null);
});

test('validación de notas', () => {
  assert.strictEqual(R.normalizarNota('3.5'), 3.5);
  assert.strictEqual(R.normalizarNota(5), 5);
  assert.strictEqual(R.normalizarNota('5.1'), null);
  assert.strictEqual(R.normalizarNota('-1'), null);
  assert.strictEqual(R.normalizarNota('abc'), null);
  assert.strictEqual(R.normalizarNota('3.55'), null);
  assert.strictEqual(R.estadoSegunNota(3.0), 'aprobada');
  assert.strictEqual(R.estadoSegunNota(2.9), 'reprobada');
});
