// Llamadas al servidor. Lanza un Error con el mensaje que mande la API.
export async function api(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: {}, credentials: 'same-origin' };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch('/api' + ruta, opciones);
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor');
  }

  let datos = null;
  try { datos = await respuesta.json(); } catch (e) { /* la respuesta no era JSON */ }

  if (!respuesta.ok) {
    const error = new Error((datos && datos.error) || 'Error ' + respuesta.status);
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}
