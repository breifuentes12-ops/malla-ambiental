// Funciones de ayuda compartidas por las vistas.

// Escapa texto antes de meterlo en innerHTML (los nombres los escribe el usuario)
export function esc(texto) {
  return String(texto === null || texto === undefined ? '' : texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatoNota(n) {
  return n === null || n === undefined ? '' : Number(n).toFixed(1);
}

// plural(3, 'materia') -> "3 materias" ; plural(1, 'materia') -> "1 materia"
export function plural(n, singular, pluralTexto) {
  return n + ' ' + (n === 1 ? singular : (pluralTexto || singular + 's'));
}

export function aviso(texto, tipo) {
  const caja = document.getElementById('avisos');
  const div = document.createElement('div');
  div.className = 'aviso ' + (tipo || 'ok');
  div.textContent = texto;
  caja.appendChild(div);
  setTimeout(() => div.remove(), 4500);
}

export function abrirModal(html) {
  const caja = document.getElementById('modal-caja');
  caja.innerHTML = html;
  document.getElementById('modal').classList.remove('oculto');
  const primero = caja.querySelector('input, select, button');
  if (primero) primero.focus();
  return caja;
}

export function cerrarModal() {
  document.getElementById('modal').classList.add('oculto');
  document.getElementById('modal-caja').innerHTML = '';
  if (alCerrarModal) { const f = alCerrarModal; alCerrarModal = null; f(); }
}

let alCerrarModal = null;

// Reemplazo amable de confirm(). Devuelve una promesa con true o false.
// confirmar({ titulo, texto, si: 'Sí, eliminar', no: 'Mejor no', peligro: true })
export function confirmar(op) {
  return new Promise((resolver) => {
    const caja = abrirModal(
      '<h2>' + esc(op.titulo) + '</h2>' +
      (op.texto ? '<p>' + esc(op.texto) + '</p>' : '') +
      '<div class="acciones">' +
        '<button type="button" class="btn" data-no>' + esc(op.no || 'Cancelar') + '</button>' +
        '<button type="button" class="btn ' + (op.peligro ? 'peligro' : 'primario') + '" data-si>' + esc(op.si || 'Sí') + '</button>' +
      '</div>'
    );
    let respondido = false;
    alCerrarModal = () => { if (!respondido) resolver(false); };
    caja.querySelector('[data-no]').addEventListener('click', () => { cerrarModal(); });
    caja.querySelector('[data-si]').addEventListener('click', () => {
      respondido = true;
      alCerrarModal = null;
      cerrarModal();
      resolver(true);
    });
    caja.querySelector('[data-no]').focus();
  });
}

// Cerrar con clic fuera de la caja o con Escape
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modal').classList.contains('oculto')) cerrarModal();
});