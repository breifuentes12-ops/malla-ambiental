import { api } from './api.js';
import { aviso, esc } from './util.js';
import { mostrarResumen, mostrarMalla, mostrarHistorial } from './malla.js';
import { mostrarDigrafo } from './digrafo.js';
import { mostrarAdmin } from './admin.js';

const VISTAS = {
  resumen:   { texto: 'Inicio',         dibujar: mostrarResumen,   solo: 'estudiante' },
  malla:     { texto: 'Mi malla',       dibujar: mostrarMalla,     solo: 'estudiante' },
  historial: { texto: 'Mis notas',      dibujar: mostrarHistorial, solo: 'estudiante' },
  digrafo:   { texto: 'Dígrafo',        dibujar: mostrarDigrafo },
  admin:     { texto: 'Administración', dibujar: mostrarAdmin,     solo: 'admin' },
};

let usuario = null;
let vistaActual = null;

const pantallaAcceso = document.getElementById('pantalla-acceso');
const pantallaApp = document.getElementById('pantalla-app');
const contenido = document.getElementById('contenido');
const menu = document.getElementById('menu');

// ---------- Acceso ----------

function errorAcceso(texto) {
  const p = document.getElementById('acceso-error');
  p.textContent = texto || '';
  p.classList.toggle('oculto', !texto);
}

document.querySelectorAll('.pestana').forEach((boton) => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
    document.querySelectorAll('.acceso .formulario').forEach((f) => f.classList.toggle('oculto', f.id !== boton.dataset.form));
    errorAcceso('');
  });
});

function datosDeFormulario(form) {
  const datos = {};
  new FormData(form).forEach((valor, clave) => { datos[clave] = valor; });
  return datos;
}

// Evita doble clic mientras se espera al servidor
async function conEspera(form, textoEspera, tarea) {
  const boton = form.querySelector('button[type="submit"]');
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoEspera;
  try { await tarea(); } finally { boton.disabled = false; boton.textContent = original; }
}

document.getElementById('form-entrar').addEventListener('submit', (e) => {
  e.preventDefault();
  errorAcceso('');
  conEspera(e.target, 'Entrando…', async () => {
    try {
      const r = await api('POST', '/auth/entrar', datosDeFormulario(e.target));
      iniciarApp(r.usuario);
    } catch (err) {
      errorAcceso(err.message);
    }
  });
});

document.getElementById('form-registro').addEventListener('submit', (e) => {
  e.preventDefault();
  errorAcceso('');
  conEspera(e.target, 'Creando tu cuenta…', async () => {
    try {
      const r = await api('POST', '/auth/registro', datosDeFormulario(e.target));
      iniciarApp(r.usuario);
      aviso('Bienvenido, ' + r.usuario.nombre + '. Ya estás inscrito en primer semestre.');
    } catch (err) {
      errorAcceso(err.message);
    }
  });
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  try { await api('POST', '/auth/salir'); } catch (e) { /* si falla igual volvemos al acceso */ }
  usuario = null;
  vistaActual = null;
  pantallaApp.classList.add('oculto');
  pantallaAcceso.classList.remove('oculto');
  document.querySelectorAll('form').forEach((f) => f.reset());
});

// ---------- Aplicación ----------

function iniciarApp(u) {
  usuario = u;
  pantallaAcceso.classList.add('oculto');
  pantallaApp.classList.remove('oculto');
  document.getElementById('usuario-nombre').textContent = u.nombre + ' ' + u.apellido + (u.rol === 'admin' ? ' (admin)' : '');

  const visibles = Object.keys(VISTAS).filter((k) => !VISTAS[k].solo || VISTAS[k].solo === u.rol);
  menu.innerHTML = visibles.map((k) => '<button type="button" data-vista="' + k + '">' + VISTAS[k].texto + '</button>').join('');
  irA(u.rol === 'admin' ? 'admin' : 'resumen');
}

menu.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-vista]');
  if (boton) irA(boton.dataset.vista);
});

async function irA(nombre) {
  vistaActual = nombre;
  menu.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === nombre));
  contenido.classList.toggle('contenido-angosto', nombre === 'resumen' || nombre === 'historial');
  contenido.innerHTML = '<p class="cargando">Cargando…</p>';
  try {
    await VISTAS[nombre].dibujar(contenido, usuario, irA);
  } catch (err) {
    if (err.estado === 401) return volverAlAcceso('Tu sesión se cerró. Entra de nuevo, por favor.');
    contenido.innerHTML = '<div class="error-caja">Ups, algo salió mal: ' + esc(err.message) + '</div>';
  }
}

function volverAlAcceso(mensaje) {
  usuario = null;
  pantallaApp.classList.add('oculto');
  pantallaAcceso.classList.remove('oculto');
  errorAcceso(mensaje);
}

// Si ya hay sesión abierta, entrar directo
(async function arrancar() {
  try {
    const r = await api('GET', '/auth/yo');
    iniciarApp(r.usuario);
  } catch (err) {
    pantallaAcceso.classList.remove('oculto');
  }
})();