# Malla Curricular · Ingeniería Ambiental

Aplicación web para seguir el avance de una carrera universitaria. La malla se modela como un **grafo dirigido** de prerrequisitos. Cada estudiante ve qué materias aprobó, cuáles está cursando y cuáles puede matricular, y mira cómo se conectan las asignaturas a lo largo de la carrera.

El proyecto combina dos frentes: una aplicación completa  y una parte de **Teoría de Grafos**.

---

## ¿Qué problema resuelve?

Una malla curricular suele publicarse como una tabla o un PDF. Ahí es difícil responder preguntas que todo estudiante se hace:

- ¿Qué puedo matricular el próximo semestre?
- Si pierdo esta materia, ¿qué otras se me atrasan?
- ¿Cuál es la cadena de prerrequisitos más larga de la carrera?
- ¿Cuántos créditos me faltan para terminar?

Esta aplicación responde esas preguntas con un modelo de grafo dirigido, donde cada materia es un vértice y cada prerrequisito es una arista. A partir del historial del estudiante, el sistema calcula su estado académico y muestra solo las opciones que de verdad tiene.

## Funcionalidades

### Para el estudiante

- **Registro e inicio de sesión** con cédula y contraseña. 
- **Panel de inicio** con créditos aprobados, materias aprobadas, semestre actual y avisos cuando hay notas pendientes por registrar.
- **Mi malla:** la carrera semestre por semestre. Cada materia aparece con un estado (aprobada, cursando, por repetir, disponible o bloqueada) y, si no se puede matricular, el motivo exacto.
- **Matrícula guiada:** el estudiante elige sus materias y un medidor le muestra en tiempo real si está dentro del rango de créditos permitido.
- **Registro de notas:** al calificar una materia, el sistema decide si queda aprobada o reprobada y desbloquea lo que corresponda.
- **Historial:** todos los intentos agrupados por periodo, incluidas las materias repetidas.
- **Dígrafo interactivo:** un mapa de la carrera que se puede acercar, alejar y recorrer. Al tocar una materia se resaltan sus prerrequisitos (directos e indirectos) y las materias que dependen de ella.

### Para el administrador

- Resumen general: número de estudiantes, materias y créditos de la carrera.
- Lista de estudiantes con su semestre actual y su porcentaje de avance.
- **Gestión de la malla:** crear, editar y eliminar materias y sus prerrequisitos. Antes de guardar cualquier cambio, el sistema verifica que la malla siga siendo un grafo acíclico.

## La malla como dígrafo

Toda la lógica de grafos está en [`src/grafo/digrafo.js`](src/grafo/digrafo.js). Es una clase propia que representa el grafo con **listas de adyacencia**.


## Reglas académicas

Las reglas están escritas como **funciones puras** en [`src/reglas/matricula.js`](src/reglas/matricula.js): reciben los datos ya cargados y devuelven un resultado sin tocar la base de datos. Eso facilita probarlas y modificarlas.


## Tecnologías

- **Backend:** Node.js y Express
- **Base de datos:** MySQL o MariaDB, con `mysql2` y un pool de conexiones
- **Autenticación:** sesiones con `express-session` y contraseñas cifradas con `bcryptjs`
- **Frontend:** HTML, CSS y JavaScript con módulos ES, sin frameworks. El dígrafo se dibuja en SVG.
- **Pruebas:** el corredor nativo de Node (`node --test`)


## Instalación

### Requisitos

- Node.js 18 o superior
- MySQL o MariaDB en ejecución, ya sea local o con Laragon o XAMPP

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/<tu-usuario>/malla-ambiental.git
cd malla-ambiental

# 2. Instalar dependencias
npm install

# 3. Configurar el entorno
cp .env.example .env
# Edita .env con los datos de tu servidor MySQL (host, puerto, usuario, contraseña)

# 4. Crear la base de datos, las tablas y los datos de prueba
npm run instalar-bd

# 5. Iniciar el servidor
npm start
```

Luego abre **http://localhost:3000** en el navegador.

> Para borrar todo y volver a crear la base de datos desde cero: `npm run reiniciar-bd`


