import { api } from './api.js';
import { esc, aviso, abrirModal, cerrarModal, confirmar, plural } from './util.js';

// Pestaña abierta dentro de Administración (se conserva al recargar)
let pestanaAdmin = 'estudiantes';

export async function mostrarAdmin(contenedor, usuario) {
  const [usuarios, materias] = await Promise.all([api('GET', '/usuarios'), api('GET', '/materias')]);
  const recargar = () => mostrarAdmin(contenedor, usuario);

  const porCodigo = {};
  materias.forEach((m) => { porCodigo[m.codigo] = m; });
  const estudiantes = usuarios.filter((u) => u.rol !== 'admin');
  const creditosCarrera = materias.reduce((s, m) => s + m.creditos, 0);

  // ---------- Resumen ----------
  const cifra = (valor, rotulo) => '<div class="cifra"><div class="valor">' + valor + '</div><div class="rotulo">' + rotulo + '</div></div>';
  const resumen = '<div class="cifras admin-cifras">' +
    cifra(estudiantes.length, estudiantes.length === 1 ? 'Estudiante' : 'Estudiantes') +
    cifra(materias.length, 'Materias en la malla') +
    cifra(creditosCarrera, 'Créditos de la carrera') +
  '</div>';

  // ---------- Estudiantes ----------
  const tarjetasEstudiantes = estudiantes.length === 0
    ? '<p class="nota-pequena">Todavía no hay estudiantes registrados.</p>'
    : '<div class="grid-estudiantes">' + estudiantes.map((u) => {
        const aprobados = u.creditos_aprobados || 0;
        const pct = creditosCarrera > 0 ? Math.round((aprobados / creditosCarrera) * 100) : 0;
        return '<div class="tarjeta-estudiante">' +
          '<div class="te-cabeza"><div><strong>' + esc(u.nombre) + ' ' + esc(u.apellido) + '</strong>' +
            '<div class="nota-pequena">Cédula ' + esc(u.cedula) + '</div></div>' +
            '<span class="etiqueta e-matriculada">Semestre ' + (u.semestre_actual || 1) + '</span></div>' +
          '<div class="te-avance"><span>' + aprobados + ' de ' + creditosCarrera + ' créditos</span><strong>' + pct + '%</strong></div>' +
          '<div class="barra-progreso" style="max-width:none"><div style="width:' + pct + '%"></div></div>' +
          '<div class="te-acciones"><button class="btn chico" data-accion="borrar-usuario" data-id="' + u.id + '" data-nombre="' + esc(u.nombre + ' ' + u.apellido) + '">Eliminar</button></div>' +
        '</div>';
      }).join('') + '</div>';

  // ---------- Materias por semestre ----------
  const porSemestre = {};
  materias.forEach((m) => { (porSemestre[m.semestre] = porSemestre[m.semestre] || []).push(m); });
  const chips = (m) => m.prereqs.length === 0
    ? '<span class="chip vacio">Sin prerrequisitos</span>'
    : m.prereqs.map((c) => '<span class="chip">' + esc(porCodigo[c] ? porCodigo[c].nombre : c) + '</span>').join('');

  const seccionesMaterias = Object.keys(porSemestre).map(Number).sort((a, b) => a - b).map((s) => {
    const lista = porSemestre[s];
    const creditos = lista.reduce((t, m) => t + m.creditos, 0);
    return '<details class="sem-admin"><summary><strong>Semestre ' + s + '</strong> <small>' +
      plural(lista.length, 'materia') + ' · ' + plural(creditos, 'crédito') + '</small></summary>' +
      lista.map((m) =>
        '<div class="fila-materia" data-buscar="' + esc((m.nombre + ' ' + m.codigo).toLowerCase()) + '">' +
          '<div class="fm-info"><strong>' + esc(m.nombre) + '</strong>' +
            '<div class="nota-pequena">' + esc(m.codigo) + ' · ' + plural(m.creditos, 'crédito') + '</div>' +
            '<div class="chips">' + chips(m) + '</div></div>' +
          '<div class="fm-botones"><button class="btn chico" data-accion="editar" data-codigo="' + esc(m.codigo) + '">Editar</button>' +
          '<button class="btn chico" data-accion="borrar-materia" data-codigo="' + esc(m.codigo) + '" data-nombre="' + esc(m.nombre) + '">Eliminar</button></div>' +
        '</div>'
      ).join('') +
    '</details>';
  }).join('');

  contenedor.innerHTML =
    '<h2>Administración</h2>' + resumen +
    '<div class="pestanas pestanas-admin">' +
      '<button type="button" class="pestana' + (pestanaAdmin === 'estudiantes' ? ' activa' : '') + '" data-pestana="estudiantes">Estudiantes</button>' +
      '<button type="button" class="pestana' + (pestanaAdmin === 'materias' ? ' activa' : '') + '" data-pestana="materias">Materias</button>' +
    '</div>' +
    '<section data-panel="estudiantes"' + (pestanaAdmin === 'estudiantes' ? '' : ' class="oculto"') + '>' + tarjetasEstudiantes + '</section>' +
    '<section data-panel="materias"' + (pestanaAdmin === 'materias' ? '' : ' class="oculto"') + '>' +
      '<div class="barra-materias"><input id="buscar-materia" class="buscador" type="search" placeholder="Buscar materia por nombre o código">' +
      '<button class="btn primario" data-accion="nueva">Nueva materia</button></div>' +
      seccionesMaterias +
      '<p id="sin-resultados" class="nota-pequena oculto">No hay materias con ese nombre.</p>' +
    '</section>';

  // Cambiar de pestaña
  contenedor.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => {
    pestanaAdmin = b.dataset.pestana;
    contenedor.querySelectorAll('[data-pestana]').forEach((x) => x.classList.toggle('activa', x === b));
    contenedor.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('oculto', p.dataset.panel !== pestanaAdmin));
  }));

  // Buscador de materias
  contenedor.querySelector('#buscar-materia').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let total = 0;
    contenedor.querySelectorAll('.sem-admin').forEach((sec) => {
      let visibles = 0;
      sec.querySelectorAll('.fila-materia').forEach((f) => {
        const ok = !q || f.dataset.buscar.includes(q);
        f.classList.toggle('oculto', !ok);
        if (ok) visibles++;
      });
      sec.classList.toggle('oculto', visibles === 0);
      sec.open = !!(q && visibles); // al buscar se abren; al borrar la búsqueda se cierran
      total += visibles;
    });
    contenedor.querySelector('#sin-resultados').classList.toggle('oculto', total > 0);
  });

  contenedor.querySelectorAll('button[data-accion]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const a = boton.dataset.accion;
      if (a === 'nueva') return formularioMateria(null, recargar);
      if (a === 'editar') return formularioMateria(porCodigo[boton.dataset.codigo], recargar);

      if (a === 'borrar-usuario') {
        const ok = await confirmar({ titulo: '¿Eliminar a ' + boton.dataset.nombre + '?', texto: 'También se borra todo su historial de notas. Esto no se puede deshacer.', si: 'Sí, eliminar', no: 'Cancelar', peligro: true });
        if (!ok) return;
        try {
          const r = await api('DELETE', '/usuarios/' + boton.dataset.id);
          aviso(r.mensaje);
          recargar();
        } catch (err) { aviso(err.message, 'error'); }
      }
      if (a === 'borrar-materia') {
        const ok = await confirmar({ titulo: '¿Eliminar ' + boton.dataset.nombre + '?', texto: 'La materia saldrá de la malla. Esto no se puede deshacer.', si: 'Sí, eliminar', no: 'Cancelar', peligro: true });
        if (!ok) return;
        try {
          const r = await api('DELETE', '/materias/' + encodeURIComponent(boton.dataset.codigo));
          aviso(r.mensaje);
          recargar();
        } catch (err) { aviso(err.message, 'error'); }
      }
    });
  });
}

function formularioMateria(materia, alGuardar) {
  const editando = materia !== null;
  const m = materia || { codigo: '', nombre: '', semestre: 1, creditos: 3, ht: 0, hp: 0, area: '', electiva: false, prereqs: [] };

  const caja = abrirModal(
    '<h2>' + (editando ? 'Editar materia' : 'Nueva materia') + '</h2>' +
    '<form id="form-materia" class="formulario">' +
      '<label>Código<input name="codigo" required value="' + esc(m.codigo) + '"' + (editando ? ' readonly' : '') + '></label>' +
      '<label>Nombre<input name="nombre" required value="' + esc(m.nombre) + '"></label>' +
      '<div class="fila-triple">' +
        '<label>Semestre<input name="semestre" type="number" min="1" max="10" required value="' + m.semestre + '"></label>' +
        '<label>Créditos<input name="creditos" type="number" min="0" max="12" required value="' + m.creditos + '"></label>' +
        '<label>Área<input name="area" value="' + esc(m.area) + '"></label>' +
      '</div>' +
      '<div class="fila-doble">' +
        '<label>Horas de teoría<input name="ht" type="number" min="0" max="40" value="' + m.ht + '"></label>' +
        '<label>Horas de práctica<input name="hp" type="number" min="0" max="40" value="' + m.hp + '"></label>' +
      '</div>' +
      '<label>Prerrequisitos <small>(códigos separados por coma)</small><input name="prereqs" value="' + esc(m.prereqs.join(', ')) + '"></label>' +
      '<label class="elegir"><input type="checkbox" name="electiva"' + (m.electiva ? ' checked' : '') + '> Es electiva</label>' +
      '<p id="materia-error" class="error-caja oculto"></p>' +
      '<div class="acciones">' +
        '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn primario">Guardar</button>' +
      '</div>' +
    '</form>'
  );

  caja.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  caja.querySelector('#form-materia').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const cuerpo = {
      codigo: f.codigo.value.trim(),
      nombre: f.nombre.value,
      semestre: f.semestre.value,
      creditos: f.creditos.value,
      ht: f.ht.value,
      hp: f.hp.value,
      area: f.area.value,
      electiva: f.electiva.checked,
      prereqs: f.prereqs.value.split(',').map((p) => p.trim()).filter((p) => p),
    };
    try {
      const r = editando
        ? await api('PUT', '/materias/' + encodeURIComponent(m.codigo), cuerpo)
        : await api('POST', '/materias', cuerpo);
      cerrarModal();
      aviso(r.mensaje);
      alGuardar();
    } catch (err) {
      const p = caja.querySelector('#materia-error');
      p.textContent = err.message;
      p.classList.remove('oculto');
    }
  });
}