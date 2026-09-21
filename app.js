/* =========================================================================
   app.js  —  La app en sí: guardar datos, pintar la pantalla y el mapa.
   -------------------------------------------------------------------------
   Orden del archivo:
     1. DB        -> guardar y leer del teléfono (localStorage)
     2. Estado    -> variables que cambian mientras usas la app
     3. Arranque  -> qué pasa al abrir
     4. Lista     -> pintar las tarjetas
     5. Mapa      -> Leaflet
     6. Ubicación -> GPS del navegador y distancias
     7. Agregar   -> buscar en OpenStreetMap y guardar
     8. Detalle   -> ver/editar/eliminar una cafetería
     9. Utilidades
   ========================================================================= */

/* ============================= 1. DB ===================================== */
/* Todo vive en localStorage, o sea: en TU teléfono/navegador. No hay
   servidor, nadie más ve tu lista, y si borras los datos del navegador
   se borra la lista (por eso más abajo hay exportar/importar en el README). */

const CLAVE = 'cafeterias_v1';

const DB = {
  leer() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE)) || [];
    } catch (e) {
      console.error('No se pudo leer la lista', e);
      return [];
    }
  },
  guardar(lista) {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  }
};

/* =========================== 2. Estado ================================== */

let cafeterias = [];      // la lista completa
let miUbicacion = null;   // {lat, lon} cuando das permiso de ubicación
let mapa = null;          // el objeto de Leaflet
let capaMarcadores = null;
let marcadorYo = null;
let idEnDetalle = null;   // qué cafetería está abierta en el modal
let candidatoTemporal = null;

/* =========================== 3. Arranque ================================ */

document.addEventListener('DOMContentLoaded', () => {
  cafeterias = DB.leer();
  renderLista();
  conectarEventos();
  registrarServiceWorker();

  // Cada minuto repintamos: así "cierra en 35 min" se va actualizando solo.
  setInterval(renderLista, 60 * 1000);
});

function conectarEventos() {
  // Pestañas Lista / Mapa
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => cambiarVista(tab.dataset.vista));
  });

  document.getElementById('btnUbicacion').addEventListener('click', pedirUbicacion);
  document.getElementById('btnAgregar').addEventListener('click', abrirModalAgregar);
  document.getElementById('soloAbiertas').addEventListener('change', renderLista);
  document.getElementById('ordenar').addEventListener('change', renderLista);

  document.getElementById('formBuscar').addEventListener('submit', ev => {
    ev.preventDefault();
    hacerBusqueda();
  });

  document.getElementById('btnGuardar').addEventListener('click', guardarDetalle);
  document.getElementById('btnEliminar').addEventListener('click', eliminarDetalle);
  document.getElementById('btnActualizarOSM').addEventListener('click', actualizarDesdeOSM);

  // Cualquier botón con data-cerrar cierra su modal
  document.querySelectorAll('[data-cerrar]').forEach(b => {
    b.addEventListener('click', () => cerrarModales());
  });
  // Tocar el fondo oscuro también cierra
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', ev => { if (ev.target === m) cerrarModales(); });
  });
}

function cambiarVista(vista) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('activa', t.dataset.vista === vista);
  });
  document.getElementById('vistaLista').hidden = vista !== 'lista';
  document.getElementById('vistaMapa').hidden = vista !== 'mapa';

  if (vista === 'mapa') {
    prepararMapa();
    // Leaflet necesita saber que ya es visible, si no dibuja mal los mosaicos.
    setTimeout(() => mapa && mapa.invalidateSize(), 50);
  }
}

/* ============================ 4. Lista ================================== */

function renderLista() {
  const ul = document.getElementById('lista');
  const soloAbiertas = document.getElementById('soloAbiertas').checked;
  const orden = document.getElementById('ordenar').value;

  // A cada cafetería le calculamos AHORA su estado y su distancia.
  let items = cafeterias.map(c => ({
    cafe: c,
    estado: estadoAhora(c.horarios),
    km: miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, c.lat, c.lon) : null
  }));

  if (soloAbiertas) {
    items = items.filter(i => i.estado.estado === 'abierta' || i.estado.estado === 'cierra_pronto');
  }

  const rango = { abierta: 0, cierra_pronto: 1, desconocido: 2, cerrada: 3 };
  items.sort((a, b) => {
    if (orden === 'nombre') return a.cafe.nombre.localeCompare(b.cafe.nombre);
    if (orden === 'estado') {
      const d = rango[a.estado.estado] - rango[b.estado.estado];
      if (d !== 0) return d;
    }
    // Por distancia (las que no tienen distancia van al final)
    if (a.km === null && b.km === null) return a.cafe.nombre.localeCompare(b.cafe.nombre);
    if (a.km === null) return 1;
    if (b.km === null) return -1;
    return a.km - b.km;
  });

  ul.innerHTML = '';
  for (const item of items) ul.appendChild(crearTarjeta(item));

  document.getElementById('vacio').hidden = cafeterias.length > 0;
  if (mapa) pintarMarcadores();
}

function crearTarjeta({ cafe, estado, km }) {
  const li = document.createElement('li');
  li.className = 'tarjeta ' + estado.estado;
  li.innerHTML = `
    <h3></h3>
    <p class="dir"></p>
    <div class="meta">
      <span class="estado ${estado.estado}"></span>
      <span class="km"></span>
    </div>`;

  // Usamos textContent (no innerHTML) para el texto que viene de internet:
  // así ningún nombre raro puede meter HTML dentro de la página.
  li.querySelector('h3').textContent = cafe.nombre;
  li.querySelector('.dir').textContent = cafe.direccion || '';
  li.querySelector('.estado').textContent = estado.texto;
  li.querySelector('.km').textContent = km === null ? '' : '· a ' + distanciaATexto(km);

  li.addEventListener('click', () => abrirDetalle(cafe.id));
  return li;
}

/* ============================= 5. Mapa ================================== */

function prepararMapa() {
  if (mapa) return; // ya está creado

  mapa = L.map('mapa');
  // Los "mosaicos" (las imágenes del mapa) los sirve OpenStreetMap gratis.
  // La atribución de abajo a la derecha es OBLIGATORIA por su licencia.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);

  capaMarcadores = L.layerGroup().addTo(mapa);
  mapa.setView([23.6345, -102.5528], 5); // México completo, por si no hay nada aún
  pintarMarcadores();
}

function pintarMarcadores() {
  if (!mapa) return;
  capaMarcadores.clearLayers();

  const puntos = [];

  for (const cafe of cafeterias) {
    const estado = estadoAhora(cafe.horarios);
    const icono = L.divIcon({
      className: '',
      html: `<div class="marcador ${estado.estado}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const km = miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, cafe.lat, cafe.lon) : null;
    const marcador = L.marker([cafe.lat, cafe.lon], { icon: icono }).addTo(capaMarcadores);
    marcador.bindPopup(`
      <strong>${escapar(cafe.nombre)}</strong><br>
      ${escapar(estado.texto)}${km === null ? '' : ' · a ' + distanciaATexto(km)}<br>
      <a href="${linkComoLlegar(cafe)}" target="_blank" rel="noopener">Cómo llegar</a>`);
    puntos.push([cafe.lat, cafe.lon]);
  }

  if (miUbicacion) {
    const iconoYo = L.divIcon({
      className: '',
      html: '<div class="marcador yo"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    marcadorYo = L.marker([miUbicacion.lat, miUbicacion.lon], { icon: iconoYo }).addTo(capaMarcadores);
    marcadorYo.bindPopup('Estás aquí');
    puntos.push([miUbicacion.lat, miUbicacion.lon]);
  }

  // Ajusta el zoom para que se vea todo lo que hay en el mapa.
  if (puntos.length === 1) mapa.setView(puntos[0], 15);
  else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [40, 40] });
}

/* =========================== 6. Ubicación =============================== */

function pedirUbicacion() {
  const aviso = document.getElementById('avisoUbicacion');

  if (!navigator.geolocation) {
    aviso.textContent = 'Este navegador no puede darme tu ubicación.';
    return;
  }

  aviso.textContent = 'Buscando tu ubicación...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      miUbicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      document.getElementById('btnUbicacion').classList.add('activo');
      aviso.textContent = 'Ubicación activa · distancias en línea recta desde donde estás.';
      renderLista();
      if (mapa) pintarMarcadores();
    },
    err => {
      // Los errores más comunes: negaste el permiso, o la página no es segura.
      const motivos = {
        1: 'No diste permiso de ubicación. Puedes activarlo en el candado de la barra de direcciones.',
        2: 'No se pudo obtener la ubicación (sin señal de GPS).',
        3: 'La ubicación tardó demasiado. Intenta de nuevo.'
      };
      aviso.textContent = motivos[err.code] || 'No se pudo obtener tu ubicación.';
      if (location.protocol === 'file:') {
        aviso.textContent += ' Ojo: abriste el archivo directo. Necesitas abrirla con un servidor (http://localhost).';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/* =========================== 7. Agregar ================================= */

function abrirModalAgregar() {
  document.getElementById('resultados').innerHTML = '';
  document.getElementById('estadoBusqueda').textContent = '';
  document.getElementById('textoBusqueda').value = '';
  abrirModal('modalAgregar');
  document.getElementById('textoBusqueda').focus();
}

async function hacerBusqueda() {
  const texto = document.getElementById('textoBusqueda').value.trim();
  const estado = document.getElementById('estadoBusqueda');
  const ul = document.getElementById('resultados');

  if (texto.length < 3) {
    estado.textContent = 'Escribe al menos 3 letras.';
    return;
  }

  estado.textContent = 'Buscando en OpenStreetMap...';
  ul.innerHTML = '';

  try {
    const lugares = await buscarLugares(texto, miUbicacion);
    if (lugares.length === 0) {
      estado.textContent = 'Sin resultados. Prueba con el nombre + la ciudad.';
      return;
    }
    estado.textContent = 'Toca el lugar correcto para agregarlo:';

    for (const lugar of lugares) {
      const li = document.createElement('li');
      const km = miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, lugar.lat, lugar.lon) : null;
      const strong = document.createElement('strong');
      strong.textContent = lugar.nombre;
      const small = document.createElement('small');
      small.textContent = lugar.direccionLarga + (km === null ? '' : ' · a ' + distanciaATexto(km));
      li.append(strong, small);
      li.addEventListener('click', () => agregarCafeteria(lugar));
      ul.appendChild(li);
    }
  } catch (e) {
    console.error(e);
    estado.textContent = 'No se pudo conectar con OpenStreetMap. Revisa tu internet.';
  }
}

async function agregarCafeteria(lugar) {
  const estado = document.getElementById('estadoBusqueda');
  estado.textContent = 'Guardando y buscando su horario...';

  // 1) Lo que Nominatim ya nos dio.
  let openingHours = lugar.openingHours;
  let telefono = lugar.telefono;
  let web = lugar.web;

  // 2) Si no venía el horario, le preguntamos a Overpass por ese lugar.
  if (!openingHours && lugar.osmType && lugar.osmId) {
    try {
      const det = await detallesOSM(lugar.osmType, lugar.osmId);
      if (det) {
        openingHours = det.openingHours || openingHours;
        telefono = telefono || det.telefono;
        web = web || det.web;
      }
    } catch (e) {
      console.warn('Overpass no respondió', e);
    }
  }

  const horarios = parsearOpeningHours(openingHours) || horariosVacios();

  const cafe = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6),
    nombre: lugar.nombre,
    direccion: lugar.direccion,
    lat: lugar.lat,
    lon: lugar.lon,
    osmType: lugar.osmType,
    osmId: lugar.osmId,
    openingHoursOSM: openingHours || null, // el texto original, por si acaso
    horarios,
    telefono: telefono || null,
    web: web || null,
    notas: ''
  };

  cafeterias.push(cafe);
  DB.guardar(cafeterias);
  renderLista();
  cerrarModales();

  if (openingHours && tieneAlgunTurno(horarios)) {
    toast('Agregada con su horario de OpenStreetMap');
  } else {
    toast('Agregada. No traía horario: captúralo tú');
    abrirDetalle(cafe.id); // abrimos el editor para que lo llenes
  }
}

/* =========================== 8. Detalle ================================= */

function abrirDetalle(id) {
  const cafe = cafeterias.find(c => c.id === id);
  if (!cafe) return;
  idEnDetalle = id;

  const estado = estadoAhora(cafe.horarios);
  const km = miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, cafe.lat, cafe.lon) : null;

  document.getElementById('detalleNombre').textContent = cafe.nombre;
  document.getElementById('detalleDireccion').textContent =
    (cafe.direccion || '') + (km === null ? '' : ' · a ' + distanciaATexto(km));
  document.getElementById('detalleEstado').textContent = estado.texto;
  document.getElementById('detalleNotas').value = cafe.notas || '';
  document.getElementById('detalleComoLlegar').href = linkComoLlegar(cafe);
  document.getElementById('detalleVerMapa').href = linkGoogleMaps(cafe);
  document.getElementById('btnActualizarOSM').disabled = !cafe.osmId;

  // Editor: una fila por día, empezando en lunes (más natural que domingo).
  const editor = document.getElementById('editorHorario');
  editor.innerHTML = '';
  for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
    const fila = document.createElement('div');
    fila.className = 'dia-fila';
    const label = document.createElement('label');
    label.textContent = DIAS[dia];
    label.setAttribute('for', 'dia' + dia);
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'dia' + dia;
    input.dataset.dia = String(dia);
    input.placeholder = 'cerrado';
    input.value = rangosATexto((cafe.horarios || {})[dia]);
    fila.append(label, input);
    editor.appendChild(fila);
  }

  abrirModal('modalDetalle');
}

function guardarDetalle() {
  const cafe = cafeterias.find(c => c.id === idEnDetalle);
  if (!cafe) return;

  const horarios = horariosVacios();
  document.querySelectorAll('#editorHorario input').forEach(input => {
    horarios[Number(input.dataset.dia)] = parsearRangos(input.value);
  });

  cafe.horarios = horarios;
  cafe.notas = document.getElementById('detalleNotas').value.trim();

  DB.guardar(cafeterias);
  renderLista();
  cerrarModales();
  toast('Guardado');
}

function eliminarDetalle() {
  const cafe = cafeterias.find(c => c.id === idEnDetalle);
  if (!cafe) return;
  if (!confirm('¿Eliminar "' + cafe.nombre + '" de tu lista?')) return;

  cafeterias = cafeterias.filter(c => c.id !== idEnDetalle);
  DB.guardar(cafeterias);
  renderLista();
  cerrarModales();
  toast('Eliminada');
}

// Vuelve a preguntarle a OpenStreetMap el horario de este lugar.
async function actualizarDesdeOSM() {
  const cafe = cafeterias.find(c => c.id === idEnDetalle);
  if (!cafe || !cafe.osmId) return;

  const boton = document.getElementById('btnActualizarOSM');
  boton.disabled = true;
  boton.textContent = 'Consultando...';

  try {
    const det = await detallesOSM(cafe.osmType, cafe.osmId);
    const horarios = det && parsearOpeningHours(det.openingHours);
    if (horarios) {
      cafe.horarios = horarios;
      cafe.openingHoursOSM = det.openingHours;
      cafe.telefono = cafe.telefono || det.telefono;
      cafe.web = cafe.web || det.web;
      DB.guardar(cafeterias);
      renderLista();
      abrirDetalle(cafe.id); // repinta el editor con lo nuevo
      toast('Horario actualizado desde OpenStreetMap');
    } else {
      toast('OpenStreetMap no tiene horario de este lugar');
    }
  } catch (e) {
    console.error(e);
    toast('No se pudo consultar. Revisa tu internet');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Actualizar horario';
  }
}

/* ========================== 9. Utilidades =============================== */

function abrirModal(id) {
  document.getElementById(id).hidden = false;
}

function cerrarModales() {
  document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
  idEnDetalle = null;
}

let temporizadorToast = null;
function toast(mensaje) {
  const t = document.getElementById('toast');
  t.textContent = mensaje;
  t.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { t.hidden = true; }, 2600);
}

// Escapa texto que va a ir dentro de HTML (los popups del mapa).
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : texto;
  return div.innerHTML;
}

function registrarServiceWorker() {
  // Solo funciona en http/https, no al abrir el archivo directo (file://).
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW no registrado', e));
}

/* ---- Exportar / importar tu lista (por si cambias de teléfono) ----------
   Se usan desde la consola del navegador:  exportarLista()  /  importarLista(texto)
   ------------------------------------------------------------------------ */
function exportarLista() {
  const texto = JSON.stringify(cafeterias, null, 2);
  console.log(texto);
  navigator.clipboard && navigator.clipboard.writeText(texto);
  toast('Lista copiada al portapapeles');
  return texto;
}

function importarLista(texto) {
  const datos = JSON.parse(texto);
  if (!Array.isArray(datos)) throw new Error('El texto no es una lista válida');
  cafeterias = datos;
  DB.guardar(cafeterias);
  renderLista();
  toast('Lista importada: ' + datos.length + ' cafeterías');
}
