// Dígrafo con listas de adyacencia, hecho a mano (sin librerías de grafos).
// Los vértices son códigos de materias y una arista u -> v significa
// "u es prerrequisito de v".

class Digrafo {
  constructor(vertices) {
    this.vertices = [];
    this.sucesoresDe = new Map();
    this.predecesoresDe = new Map();
    for (const v of vertices) this.agregarVertice(v);
  }

  agregarVertice(v) {
    if (this.sucesoresDe.has(v)) return;
    this.vertices.push(v);
    this.sucesoresDe.set(v, []);
    this.predecesoresDe.set(v, []);
  }

  agregarArista(desde, hasta) {
    if (!this.sucesoresDe.has(desde) || !this.sucesoresDe.has(hasta)) {
      throw new Error('Vértice inexistente: ' + desde + ' -> ' + hasta);
    }
    if (this.sucesoresDe.get(desde).includes(hasta)) return;
    this.sucesoresDe.get(desde).push(hasta);
    this.predecesoresDe.get(hasta).push(desde);
  }

  sucesores(v) { return this.sucesoresDe.get(v) || []; }
  predecesores(v) { return this.predecesoresDe.get(v) || []; }
  gradoSalida(v) { return this.sucesores(v).length; }
  gradoEntrada(v) { return this.predecesores(v).length; }

  cantidadAristas() {
    let total = 0;
    for (const v of this.vertices) total += this.gradoSalida(v);
    return total;
  }

  // Lista de aristas como pares [desde, hasta]
  aristas() {
    const lista = [];
    for (const u of this.vertices) {
      for (const v of this.sucesores(u)) lista.push([u, v]);
    }
    return lista;
  }

  // Matriz de adyacencia: matriz[i][j] = 1 si existe la arista i -> j
  matrizAdyacencia() {
    const n = this.vertices.length;
    const indice = new Map();
    this.vertices.forEach((v, i) => indice.set(v, i));
    const matriz = [];
    for (let i = 0; i < n; i++) matriz.push(new Array(n).fill(0));
    for (const [u, v] of this.aristas()) matriz[indice.get(u)][indice.get(v)] = 1;
    return matriz;
  }

  // Orden topológico con el algoritmo de Kahn.
  // Devuelve null si el grafo tiene al menos un ciclo.
  ordenTopologico() {
    const gradoEnt = new Map();
    for (const v of this.vertices) gradoEnt.set(v, this.gradoEntrada(v));

    const cola = [];
    for (const v of this.vertices) {
      if (gradoEnt.get(v) === 0) cola.push(v);
    }

    const orden = [];
    let inicio = 0;
    while (inicio < cola.length) {
      const u = cola[inicio++];
      orden.push(u);
      for (const v of this.sucesores(u)) {
        gradoEnt.set(v, gradoEnt.get(v) - 1);
        if (gradoEnt.get(v) === 0) cola.push(v);
      }
    }

    if (orden.length !== this.vertices.length) return null;
    return orden;
  }

  tieneCiclo() {
    return this.ordenTopologico() === null;
  }

  // Todos los vértices que se alcanzan desde v siguiendo las flechas (DFS iterativo).
  descendientes(v) {
    return this._recorrer(v, (x) => this.sucesores(x));
  }

  // Todos los vértices desde los que se llega a v (sus prerrequisitos directos e indirectos).
  ancestros(v) {
    return this._recorrer(v, (x) => this.predecesores(x));
  }

  _recorrer(inicio, vecinos) {
    const visitados = new Set();
    const pila = [inicio];
    while (pila.length > 0) {
      const actual = pila.pop();
      for (const w of vecinos(actual)) {
        if (!visitados.has(w)) {
          visitados.add(w);
          pila.push(w);
        }
      }
    }
    return Array.from(visitados);
  }

  existeCamino(origen, destino) {
    if (origen === destino) return true;
    return this.descendientes(origen).includes(destino);
  }

  // Camino más largo (en número de aristas) en un grafo acíclico.
  // Se usa programación dinámica sobre el orden topológico.
  // En una malla, ese camino es la cadena de prerrequisitos más larga.
  caminoMasLargo() {
    const orden = this.ordenTopologico();
    if (orden === null) return null;

    const largo = new Map();
    const anterior = new Map();
    for (const v of orden) {
      largo.set(v, 0);
      anterior.set(v, null);
    }

    for (const u of orden) {
      for (const v of this.sucesores(u)) {
        if (largo.get(u) + 1 > largo.get(v)) {
          largo.set(v, largo.get(u) + 1);
          anterior.set(v, u);
        }
      }
    }

    let fin = orden[0];
    for (const v of orden) {
      if (largo.get(v) > largo.get(fin)) fin = v;
    }

    const camino = [];
    for (let v = fin; v !== null; v = anterior.get(v)) camino.unshift(v);
    return camino;
  }
}

// Construye el dígrafo a partir de la lista de materias (cada una con su arreglo prereqs).
function construirDesdeMaterias(materias) {
  const g = new Digrafo(materias.map((m) => m.codigo));
  for (const m of materias) {
    for (const p of m.prereqs) g.agregarArista(p, m.codigo);
  }
  return g;
}

module.exports = { Digrafo, construirDesdeMaterias };
