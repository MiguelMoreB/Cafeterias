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
  document.getElementById('btnCerca').addEventListener('click', buscarCercaDeMi);
  document.getElementById('btnPegar').addEventListener('click', importarPegado);
  document.getElementById('archivoCSV').addEventListener('change', importarArchivoCSV);

  document.getElementById('btnGuardar').addEventListener('click', guardarDetalle);
  document.getElementById('btnEliminar').addEventListener('click', eliminarDetalle);
  document.getElementById('btnActualizarOSM').addEventListener('click', actualizarDesdeOSM);

  // Cualquier botón con data-cerrar cierra su modal
  document.querySelectorAll('[data-cerrar]').forEach(b => {
    b.addEventListener('click', () => cerrarModales());
  });
  // Tocar el fondo oscuro también cierra (el selector de mapa se cierra solo
  // a sí mismo, para no perder el detalle que tienes abierto debajo).
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', ev => {
      if (ev.target !== m) return;
      if (m.id === 'modalMapa') cerrarSelectorMapa();
      // La captura guiada no se cierra por tocar fuera: perderías el avance.
      else if (m.id !== 'modalCaptura') cerrarModales();
    });
  });

  document.getElementById('capturaGuardar').addEventListener('click', guardarCaptura);
  document.getElementById('capturaSaltar').addEventListener('click', saltarCaptura);
  document.getElementById('capturaMapa').addEventListener('click', capturaEnMapa);
  document.getElementById('capturaSalir').addEventListener('click', () => {
    document.getElementById('modalCaptura').hidden = true;
  });

  document.getElementById('btnUsarPunto').addEventListener('click', confirmarPunto);
  document.getElementById('btnCancelarPunto').addEventListener('click', cerrarSelectorMapa);
  document.getElementById('btnAjustarUbicacion').addEventListener('click', ajustarUbicacionDetalle);
  document.getElementById('btnInterpretarHorario').addEventListener('click', interpretarHorarioPegado);
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
      ${cafe.aproximada ? '<span class="aviso-aprox">ubicación por confirmar</span>' : ''}
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

// Modo 1: buscar por nombre en todo el mundo (Nominatim).
async function hacerBusqueda() {
  const texto = document.getElementById('textoBusqueda').value.trim();
  const estado = document.getElementById('estadoBusqueda');

  if (texto.length < 3) {
    estado.textContent = 'Escribe al menos 3 letras.';
    return;
  }

  estado.textContent = 'Buscando en OpenStreetMap...';
  document.getElementById('resultados').innerHTML = '';

  try {
    const lugares = await buscarLugares(texto, miUbicacion);
    pintarResultados(lugares, 'Sin resultados por nombre. Si el lugar está cerca, prueba el botón 📍 de abajo.');
  } catch (e) {
    console.error(e);
    estado.textContent = mensajeDeError(e);
  }
}

// Modo 2 (el bueno): traer las cafeterías mapeadas alrededor de ti.
async function buscarCercaDeMi() {
  const estado = document.getElementById('estadoBusqueda');
  const texto = document.getElementById('textoBusqueda').value.trim();

  if (!miUbicacion) {
    estado.textContent = 'Primero toca 📍 en la barra de arriba para darme tu ubicación.';
    return;
  }

  estado.textContent = 'Buscando cafeterías a 3 km a la redonda...';
  document.getElementById('resultados').innerHTML = '';

  try {
    let lugares = await buscarCafesCerca(miUbicacion, 3000);

    // El filtro por nombre lo hacemos aquí, no en el servidor (es instantáneo
    // y no tumba la consulta). "cafe" encuentra también "Café".
    if (texto) {
      const buscado = sinAcentos(texto);
      lugares = lugares.filter(l => sinAcentos(l.nombre).includes(buscado));
    }

    lugares.sort((a, b) =>
      distanciaKm(miUbicacion.lat, miUbicacion.lon, a.lat, a.lon) -
      distanciaKm(miUbicacion.lat, miUbicacion.lon, b.lat, b.lon));

    pintarResultados(lugares, texto
      ? 'Ninguna cafetería cercana se llama así. Borra el texto para verlas todas.'
      : 'OpenStreetMap no tiene cafeterías mapeadas a 3 km de aquí.');
  } catch (e) {
    console.error(e);
    estado.textContent = mensajeDeError(e);
  }
}

// Pinta la lista de candidatos; al tocar uno, se agrega.
function pintarResultados(lugares, mensajeVacio) {
  const estado = document.getElementById('estadoBusqueda');
  const ul = document.getElementById('resultados');
  ul.innerHTML = '';

  if (!lugares || lugares.length === 0) {
    estado.textContent = mensajeVacio;
    return;
  }
  estado.textContent = `${lugares.length} encontradas · toca la correcta para agregarla:`;

  for (const lugar of lugares) {
    const li = document.createElement('li');
    const km = miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, lugar.lat, lugar.lon) : null;

    const strong = document.createElement('strong');
    strong.textContent = lugar.nombre;
    const small = document.createElement('small');
    small.textContent = [
      lugar.direccionLarga || lugar.direccion,
      km === null ? null : 'a ' + distanciaATexto(km),
      lugar.openingHours ? 'con horario' : null
    ].filter(Boolean).join(' · ');

    li.append(strong, small);
    li.addEventListener('click', () => agregarCafeteria(lugar));
    ul.appendChild(li);
  }
}

// "Café Orgánico" -> "cafe organico" (para comparar sin acentos ni mayúsculas)
function sinAcentos(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function mensajeDeError(e) {
  if (e && e.message === 'OSM_OCUPADO') {
    return 'El servidor gratuito de OpenStreetMap está saturado ahorita. Espera medio minuto y vuelve a intentar.';
  }
  return 'No se pudo conectar con OpenStreetMap. Revisa tu internet.';
}

async function agregarCafeteria(lugar) {
  const estado = document.getElementById('estadoBusqueda');

  // Si ya la tienes, no la duplicamos.
  const repetida = yaExiste(lugar);
  if (repetida) {
    estado.textContent = '"' + repetida.nombre + '" ya está en tu lista.';
    return;
  }

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
  const cafe = construirCafe(Object.assign({}, lugar, { openingHours, telefono, web }), horarios);

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

// Arma el objeto que guardamos. Un solo lugar donde se decide la forma de
// una cafetería, lo use quien lo use (búsqueda o importación).
function construirCafe(datos, horarios) {
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6),
    nombre: datos.nombre || 'Cafetería sin nombre',
    direccion: datos.direccion || '',
    lat: datos.lat,
    lon: datos.lon,
    osmType: datos.osmType || null,
    osmId: datos.osmId || null,
    openingHoursOSM: datos.openingHours || null, // el texto original, por si acaso
    horarios: horarios || horariosVacios(),
    telefono: datos.telefono || null,
    web: datos.web || null,
    notas: datos.notas || '',
    // true = la ubicación la adivinó un buscador, no vino de un link exacto.
    // Se muestra un aviso hasta que la confirmes en el mapa.
    aproximada: !!datos.aproximada
  };
}

// ¿Ya tengo esta cafetería? (mismo lugar de OSM, o mismo nombre a <50 m)
function yaExiste(lugar) {
  return cafeterias.find(c =>
    (c.osmId && lugar.osmId && c.osmId === lugar.osmId && c.osmType === lugar.osmType) ||
    (c.nombre === lugar.nombre && Math.abs(c.lat - lugar.lat) < 0.0005 &&
     Math.abs(c.lon - lugar.lon) < 0.0005));
}

/* ===================== 8. Importar desde Google Maps ==================== */

// Botón "Agregar lo pegado": links de Google Maps, o el contenido completo
// de un KML/CSV/JSON pegado (por si el archivo no se deja subir).
async function importarPegado() {
  const texto = document.getElementById('textoPegado').value;
  if (!texto.trim()) {
    estadoImport('Pega al menos un link de Google Maps.');
    return;
  }

  const inicio = texto.slice(0, 800);
  const esArchivoPegado = /<kml[\s>]/i.test(inicio) || /^\s*[[{]/.test(inicio) ||
    /^\s*"?(title|nombre|name)"?\s*,/i.test(inicio);

  await procesarImportacion(esArchivoPegado
    ? filasDesdeArchivo(texto, '')
    : filasDesdePegado(texto));
}

/* -------------------------------------------------------------------------
   Botón de archivo. Acepta lo que sea que te haya dado Google:
     .csv  - listas guardadas de Takeout
     .kml  - exportación de My Maps marcando "Exportar como KML"
     .kmz  - lo que exporta My Maps por defecto (un KML comprimido)
     .json - "Saved Places.json" y otros de Takeout
   ------------------------------------------------------------------------- */
async function importarArchivoCSV(ev) {
  const archivo = ev.target.files && ev.target.files[0];
  ev.target.value = ''; // permite volver a elegir el mismo archivo
  if (!archivo) return;

  estadoImport('Leyendo ' + archivo.name + '...');

  try {
    let texto;
    let nombre = archivo.name;

    if (/\.kmz$/i.test(archivo.name)) {
      texto = await descomprimirKMZ(await archivo.arrayBuffer());
      nombre = 'doc.kml'; // ya viene descomprimido: se trata como KML
    } else {
      texto = await archivo.text();
    }

    const filas = filasDesdeArchivo(texto, nombre);
    if (filas.length === 0) {
      estadoImport(explicarArchivoVacio(texto, nombre));
      return;
    }
    await procesarImportacion(filas);
  } catch (e) {
    console.error(e);
    estadoImport(explicarErrorArchivo(e, archivo.name));
  }
}

/* -------------------------------------------------------------------------
   Cuando un archivo no aporta ni una cafetería, decir POR QUÉ.

   El caso que más confunde: el KML de Google My Maps. En la pantalla de My
   Maps ves tus pines colocados, pero el archivo exportado trae `<address>`
   (que en las listas de Takeout es el puro nombre del café) en lugar de
   `<Point>`. Google geocodifica al dibujar, no al exportar.

   La salida es pedirle a Google el mapa YA RENDERIZADO, que sí trae los
   puntos: www.google.com/maps/d/kml?mid=TU_ID&forcekml=1
   ------------------------------------------------------------------------- */
function explicarArchivoVacio(texto, nombreArchivo) {
  const esKML = /\.kml$/i.test(nombreArchivo || '') || /<kml[\s>]/i.test(texto.slice(0, 800));

  if (esKML) {
    const d = diagnosticoKML(texto);
    if (d.lugares > 0 && d.conPunto === 0) {
      return `Este KML trae ${d.lugares} lugares pero NINGUNO con coordenadas: My Maps ` +
        `exportó los nombres, no los puntos que ves en su pantalla. Solución: abre tu mapa ` +
        `en My Maps, copia el "mid=" de la barra de direcciones, y entra a ` +
        `www.google.com/maps/d/kml?mid=TU_ID&forcekml=1 — ese archivo sí trae los puntos. ` +
        `Súbelo aquí.`;
    }
    return 'Este KML no trae lugares dentro.';
  }

  return 'Leí el archivo pero no encontré lugares dentro. ' +
    'Si es un CSV de Takeout, revisa que sea el de una lista (con columnas Título y URL).';
}

function explicarErrorArchivo(e, nombreArchivo) {
  if (e.message === 'KMZ_SIN_SOPORTE') {
    return 'Este navegador no puede abrir archivos KMZ. Vuelve a exportar desde My Maps marcando la casilla "Exportar como KML".';
  }
  if (e.message === 'KMZ_INVALIDO' || e.message === 'KMZ_SIN_KML') {
    return 'Ese KMZ no trae un KML adentro. Vuelve a exportarlo desde My Maps.';
  }
  return 'No se pudo leer ' + nombreArchivo + '. Prueba con otro formato (KML, CSV o JSON).';
}

/* -------------------------------------------------------------------------
   procesarImportacion(filas)
   filas = [{nombre, url, nota}]

   Pasos:
     1. Sacar coordenadas del link de cada fila.
     2. Las que no traían link usable: buscarlas por nombre en Nominatim.
     3. UNA sola consulta a Overpass que cubra todos los puntos, para pegarles
        el horario de OSM si esa cafetería está mapeada (no una consulta por
        cafetería: serían decenas y el servidor gratuito nos cortaría).
     4. Guardar, y reportar con claridad qué entró y qué no.
   ------------------------------------------------------------------------- */
async function procesarImportacion(filas) {
  if (filas.length === 0) {
    estadoImport('No encontré nada que importar en eso.');
    return;
  }

  estadoImport(`Leyendo ${filas.length} lugares...`);
  document.getElementById('pendientes').innerHTML = '';

  const ubicados = [];
  const sinCoordenadas = [];
  const cortos = [];

  for (const fila of filas) {
    // El KML ya trae las coordenadas puestas; del CSV hay que sacarlas del link.
    const coords = (isFinite(fila.lat) && isFinite(fila.lon))
      ? { lat: fila.lat, lon: fila.lon }
      : (coordsDesdeTexto(fila.url) || coordsDesdeTexto(fila.nombre));
    if (coords) ubicados.push(Object.assign({}, fila, coords));
    else if (esLinkCorto(fila.url)) cortos.push(fila);
    else sinCoordenadas.push(fila);
  }

  /* --- Paso 2: las que no traen coordenadas quedan pendientes.
     DECISIÓN, medida con la lista real de 58 cafeterías de CDMX:

     Intentar adivinarlas descargando las cafeterías mapeadas de la ciudad
     recuperaba 13 de 58 (y solo 5 con horario), tardaba minutos y muchas
     veces ni terminaba: los servidores gratuitos de Overpass devuelven 504
     con zonas urbanas grandes. No vale la pena hacerlo por omisión.

     Así que la importación es instantánea, y el intento automático queda
     como un botón aparte, avisando que es lento y parcial. El camino bueno
     para estas es la captura guiada: das el link de Google (coordenadas
     exactas) y de paso pegas el horario. */
  const noEncontradas = sinCoordenadas.slice();

  // --- Paso 3: pegarles el horario de OpenStreetMap, si existe.
  // Si esto falla NO cancelamos la importación (las cafeterías entran igual),
  // pero sí hay que avisarlo: si no, parecería que OSM no tiene los horarios,
  // cuando en realidad el servidor estaba saturado.
  let avisoHorarios = '';
  if (ubicados.length > 0) {
    estadoImport(`Buscando horarios en OpenStreetMap de ${ubicados.length} lugares...`);
    const zona = zonaQueCubre(ubicados);
    try {
      let cafesOSM;
      try {
        cafesOSM = await buscarCafesCerca(zona.centro, zona.radio);
      } catch (e) {
        if (e.message !== 'OSM_OCUPADO') throw e;
        // Saturado: esperamos tantito y lo intentamos una vez más.
        estadoImport('El servidor de OpenStreetMap está ocupado, reintentando...');
        await new Promise(r => setTimeout(r, 4000));
        cafesOSM = await buscarCafesCerca(zona.centro, zona.radio);
      }
      for (const lugar of ubicados) emparejarConOSM(lugar, cafesOSM);
    } catch (e) {
      console.warn('No se pudieron traer horarios de OSM', e);
      avisoHorarios = e.message === 'OSM_OCUPADO'
        ? ' · sin horarios: OpenStreetMap está saturado, vuelve a importar en un minuto y se completan'
        : ' · sin horarios: no hubo conexión con OpenStreetMap';
    }
  }

  // --- Paso 4: guardar.
  let agregadas = 0, repetidas = 0, conHorario = 0, completadas = 0;
  for (const lugar of ubicados) {
    const horarios = parsearOpeningHours(lugar.openingHours) || horariosVacios();
    const repetida = yaExiste(lugar);

    if (repetida) {
      // Si ya la tenías SIN horario y ahora sí vino uno, se lo completamos.
      // (Pasa cuando reimportas porque la vez anterior OSM estaba saturado.)
      if (!tieneAlgunTurno(repetida.horarios) && tieneAlgunTurno(horarios)) {
        repetida.horarios = horarios;
        repetida.openingHoursOSM = lugar.openingHours;
        completadas++;
      } else {
        repetidas++;
      }
      continue;
    }

    if (tieneAlgunTurno(horarios)) conHorario++;
    cafeterias.push(construirCafe(lugar, horarios));
    agregadas++;
  }

  DB.guardar(cafeterias);
  renderLista();

  // --- Reporte honesto de lo que pasó.
  const partes = [`${agregadas} agregadas`];
  if (conHorario) partes.push(`${conHorario} con horario`);
  if (completadas) partes.push(`${completadas} completadas con su horario`);
  if (repetidas) partes.push(`${repetidas} ya las tenías`);
  if (noEncontradas.length || cortos.length) partes.push(`${noEncontradas.length + cortos.length} sin ubicar`);
  estadoImport(partes.join(' · ') + avisoHorarios);

  mostrarPendientes(noEncontradas, cortos);
  if (agregadas > 0) {
    document.getElementById('textoPegado').value = '';
    toast(`Importadas ${agregadas} cafeterías`);
  }
}

/* -------------------------------------------------------------------------
   centroParaBuscar()
   Devuelve el punto alrededor del cual buscar: tu ubicación si la diste, o
   la ciudad que escribiste (una sola consulta a Nominatim para ubicarla).
   ------------------------------------------------------------------------- */
async function centroParaBuscar() {
  const ciudad = document.getElementById('ciudadImport').value.trim();
  if (ciudad) {
    try {
      const lugares = await buscarLugares(ciudad, miUbicacion);
      if (lugares.length > 0) return { lat: lugares[0].lat, lon: lugares[0].lon };
    } catch (e) {
      console.warn('No se pudo ubicar la ciudad', e);
    }
  }
  return miUbicacion;
}

/* -------------------------------------------------------------------------
   mejorPorNombre(nombre, cafesOSM)
   Cruza el nombre de tu lista contra las cafeterías mapeadas de la zona.

   Devuelve {cafe, exacto} o null. "exacto" distingue entre
   "Nativos Café" == "Nativos Café" (seguro) y una coincidencia parcial
   (que se marca como "ubicación por confirmar").
   ------------------------------------------------------------------------- */
function mejorPorNombre(nombre, cafesOSM) {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return null;

  const propias = new Set(palabrasConPeso(nombre));
  let parcial = null;
  let mejorPuntaje = 0;

  for (const cafe of cafesOSM) {
    if (normalizarNombre(cafe.nombre) === buscado) return { cafe, exacto: true };

    const suyas = new Set(palabrasConPeso(cafe.nombre));
    if (propias.size === 0 || suyas.size === 0) continue;

    const comunes = [...propias].filter(p => suyas.has(p));
    if (comunes.length === 0) continue;

    // Que compartan al menos una palabra CON SUSTANCIA. Si no, "Binomio Café"
    // acabaría emparejada con una cafetería que en OSM se llama "B".
    if (!comunes.some(p => p.length >= 4)) continue;

    // Y que las palabras compartidas sean la mayoría del nombre más largo,
    // no del más corto: así "Latte Latte Coffee Crafters" no se confunde con
    // "The Latte Café" solo porque ambas digan "latte".
    const puntaje = comunes.length / Math.max(propias.size, suyas.size);
    if (puntaje >= 0.6 && puntaje > mejorPuntaje) {
      parcial = cafe;
      mejorPuntaje = puntaje;
    }
  }

  return parcial ? { cafe: parcial, exacto: false } : null;
}

function normalizarNombre(texto) {
  return sinAcentos(texto).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* -------------------------------------------------------------------------
   esCandidatoRazonable(loQueBuscabas, loQueEncontro)
   Dos filtros de sentido común antes de dar por buena una coincidencia:

     1. Que compartan alguna palabra con peso. "Cafetería del barrio" NO es
        "Café del Barrio Viejo" solo porque ambas digan "café" o "del".
     2. Que no esté absurdamente lejos. Una lista de cafeterías guardadas es
        de tu ciudad; si el resultado cae a 900 km, está mal.
   ------------------------------------------------------------------------- */
const PALABRAS_VACIAS = ['cafe', 'cafeteria', 'coffee', 'shop', 'the', 'el', 'la',
  'los', 'las', 'de', 'del', 'y', 'en', 'mi', 'su'];

function esCandidatoRazonable(buscado, candidato) {
  const propias = palabrasConPeso(buscado);
  const suyas = palabrasConPeso(candidato.nombre);
  // Si el nombre buscado era solo palabras genéricas, no podemos comparar:
  // lo damos por bueno y quedará marcado como aproximado.
  if (propias.length > 0 && suyas.length > 0) {
    if (!propias.some(p => suyas.includes(p))) return false;
  }

  if (miUbicacion) {
    const km = distanciaKm(miUbicacion.lat, miUbicacion.lon, candidato.lat, candidato.lon);
    if (km > 100) return false;
  }
  return true;
}

function palabrasConPeso(texto) {
  return sinAcentos(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2 && !PALABRAS_VACIAS.includes(p));
}

// Calcula un círculo que cubra todos los puntos importados, para pedirle a
// Overpass las cafeterías de esa zona en UNA sola consulta.
function zonaQueCubre(lugares) {
  const lat = lugares.reduce((s, l) => s + l.lat, 0) / lugares.length;
  const lon = lugares.reduce((s, l) => s + l.lon, 0) / lugares.length;
  const centro = { lat, lon };
  const masLejos = Math.max(...lugares.map(l => distanciaKm(lat, lon, l.lat, l.lon)));
  // Mínimo 500 m, máximo 15 km (más allá la consulta tarda demasiado).
  const radio = Math.min(15000, Math.max(500, Math.round(masLejos * 1000) + 300));
  return { centro, radio };
}

// Busca la cafetería de OSM que esté prácticamente encima del punto de
// Google (a menos de 120 m) y le copia horario, dirección y teléfono.
function emparejarConOSM(lugar, cafesOSM) {
  let mejor = null;
  let mejorDistancia = 0.12; // km

  for (const c of cafesOSM) {
    const d = distanciaKm(lugar.lat, lugar.lon, c.lat, c.lon);
    if (d < mejorDistancia) { mejor = c; mejorDistancia = d; }
  }
  if (!mejor) return;

  lugar.openingHours = lugar.openingHours || mejor.openingHours;
  lugar.direccion = lugar.direccion || mejor.direccion;
  lugar.telefono = lugar.telefono || mejor.telefono;
  lugar.web = lugar.web || mejor.web;
  lugar.osmType = lugar.osmType || mejor.osmType;
  lugar.osmId = lugar.osmId || mejor.osmId;
}

/* -------------------------------------------------------------------------
   Las que no se pudieron ubicar NO se pierden: quedan listadas con dos formas
   de arreglarlas ahí mismo, sin volver a importar nada.

     1. "Abrir en Maps" + pegar la dirección larga en su propia casilla.
     2. "Poner en el mapa": tocas el punto exacto y listo. Este siempre
        funciona, sin depender de ningún servidor.
   ------------------------------------------------------------------------- */
function mostrarPendientes(noEncontradas, cortos) {
  const ul = document.getElementById('pendientes');
  ul.innerHTML = '';
  if (noEncontradas.length === 0 && cortos.length === 0) return;

  const faltantes = [...cortos, ...noEncontradas];

  const explicar = document.createElement('li');
  explicar.className = 'nota-pendientes';
  explicar.textContent = 'Estas no están en OpenStreetMap, así que no hay de dónde ' +
    'sacarlas automáticamente. Puedes capturarlas una por una (recomendado si son ' +
    'muchas) o arreglarlas aquí abajo.';
  ul.appendChild(explicar);

  const guiada = document.createElement('li');
  guiada.className = 'nota-pendientes';

  const botonGuiado = document.createElement('button');
  botonGuiado.className = 'btn ancho';
  botonGuiado.textContent = `Capturar las ${faltantes.length} una por una`;
  botonGuiado.addEventListener('click', () => iniciarCaptura(faltantes));
  guiada.appendChild(botonGuiado);

  // El intento automático va aparte y con su advertencia: es lento y solo
  // encuentra las que estén mapeadas en OpenStreetMap (con la lista real de
  // prueba, 13 de 58).
  const botonOSM = document.createElement('button');
  botonOSM.className = 'btn secundario ancho';
  botonOSM.textContent = 'Antes, intentar encontrarlas en OpenStreetMap (lento)';
  botonOSM.addEventListener('click', () => intentarCruzarConOSM(faltantes, botonOSM));
  guiada.appendChild(botonOSM);

  ul.appendChild(guiada);

  for (const fila of [...cortos, ...noEncontradas]) {
    ul.appendChild(filaPendiente(fila));
  }
}

function filaPendiente(fila) {
  const li = document.createElement('li');

  const strong = document.createElement('strong');
  // Si no tiene nombre (típico de los links cortos), mostramos la liga
  // para que puedas identificar cuál es.
  strong.textContent = fila.nombre || fila.url || '(sin nombre)';
  li.appendChild(strong);

  const acciones = document.createElement('div');
  acciones.className = 'acciones-pendiente';

  const a = document.createElement('a');
  a.href = fila.url && /^https?:\/\//.test(fila.url)
    ? fila.url
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(fila.nombre || '');
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Abrir en Maps';
  acciones.appendChild(a);

  const enMapa = document.createElement('button');
  enMapa.className = 'btn secundario chico';
  enMapa.textContent = 'Poner en el mapa';
  enMapa.addEventListener('click', () => {
    abrirSelectorMapa(fila.nombre, null, punto => {
      resolverPendiente(li, fila, punto);
    });
  });
  acciones.appendChild(enMapa);
  li.appendChild(acciones);

  // Casilla para pegar la dirección larga de esa cafetería en particular.
  const pegar = document.createElement('input');
  pegar.type = 'text';
  pegar.placeholder = 'Pega aquí su link de Google Maps';
  pegar.addEventListener('change', () => {
    const punto = coordsDesdeTexto(pegar.value);
    if (!punto) {
      pegar.value = '';
      pegar.placeholder = 'Ese link no trae coordenadas. Usa "Poner en el mapa".';
      return;
    }
    resolverPendiente(li, fila, punto);
  });
  li.appendChild(pegar);

  return li;
}

// Guarda una pendiente ya ubicada y la marca como resuelta en la lista.
function resolverPendiente(li, fila, punto) {
  const lugar = Object.assign({}, fila, punto);
  if (yaExiste(lugar)) {
    li.className = 'resuelta';
    li.textContent = (fila.nombre || 'Esa cafetería') + ' — ya la tenías';
    return;
  }

  cafeterias.push(construirCafe(lugar, horariosVacios()));
  DB.guardar(cafeterias);
  renderLista();

  li.className = 'resuelta';
  li.textContent = '✓ ' + (fila.nombre || 'Agregada') + ' — agregada, captúrale el horario';
}

/* -------------------------------------------------------------------------
   intentarCruzarConOSM(filas)
   El intento automático, a petición tuya: descarga las cafeterías mapeadas
   de tu ciudad (por zonas, porque una consulta de ciudad entera revienta los
   servidores gratuitos) y las cruza por nombre con tu lista.

   Encuentra solo las que alguien haya mapeado en OpenStreetMap. Las que
   aparecen quedan agregadas; el resto sigue esperando en la captura guiada.
   ------------------------------------------------------------------------- */
async function intentarCruzarConOSM(filas, boton) {
  const centro = await centroParaBuscar();
  if (!centro) {
    estadoImport('Escribe arriba la ciudad de tus cafeterías (o activa tu ubicación 📍) para poder buscarlas.');
    return;
  }

  boton.disabled = true;
  const textoOriginal = boton.textContent;

  try {
    const cafesOSM = await buscarCafesEnArea(centro, 12000, (hechas, total) => {
      boton.textContent = `Revisando zona ${hechas} de ${total}...`;
    });

    let encontradas = 0;
    const siguenFaltando = [];

    for (const fila of filas) {
      const match = mejorPorNombre(fila.nombre, cafesOSM);
      if (!match) { siguenFaltando.push(fila); continue; }

      const lugar = Object.assign({}, fila, match.cafe, {
        nombre: fila.nombre,        // respetamos el nombre de TU lista
        aproximada: !match.exacto   // si el nombre no calzó exacto, se marca
      });
      if (yaExiste(lugar)) continue;

      cafeterias.push(construirCafe(lugar, parsearOpeningHours(lugar.openingHours) || horariosVacios()));
      encontradas++;
    }

    DB.guardar(cafeterias);
    renderLista();
    estadoImport(`Encontradas ${encontradas} de ${filas.length} en OpenStreetMap. ` +
      `Las otras ${siguenFaltando.length} hay que capturarlas.`);
    mostrarPendientes(siguenFaltando, []);
  } catch (e) {
    console.warn(e);
    boton.disabled = false;
    boton.textContent = textoOriginal;
    estadoImport('Los servidores de OpenStreetMap no respondieron. Captúralas una por una: es más rápido que insistir.');
  }
}

/* -------------------------------------------------------------------------
   Captura guiada: te lleva una por una por las que no se pudieron ubicar.
   En cada una: la abres en Google Maps, pegas la dirección larga (de ahí
   salen las coordenadas exactas) y, ya que estás en esa página, pegas el
   horario. Es el camino más rápido cuando son decenas.
   ------------------------------------------------------------------------- */
let porCapturar = [];
let indiceCaptura = 0;

function iniciarCaptura(filas) {
  porCapturar = filas.slice();
  indiceCaptura = 0;
  if (porCapturar.length === 0) return;
  document.getElementById('modalCaptura').hidden = false;
  mostrarCaptura();
}

function mostrarCaptura() {
  const fila = porCapturar[indiceCaptura];
  if (!fila) {
    document.getElementById('modalCaptura').hidden = true;
    toast('Terminaste la captura');
    return;
  }

  document.getElementById('capturaProgreso').textContent =
    `${indiceCaptura + 1} de ${porCapturar.length}`;
  document.getElementById('capturaTitulo').textContent = fila.nombre || '(sin nombre)';
  document.getElementById('capturaAbrir').href =
    fila.url && /^https?:\/\//.test(fila.url)
      ? fila.url
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(fila.nombre || '');
  document.getElementById('capturaURL').value = '';
  document.getElementById('capturaHorario').value = '';
  document.getElementById('capturaAviso').textContent = '';
}

function guardarCaptura() {
  const fila = porCapturar[indiceCaptura];
  const aviso = document.getElementById('capturaAviso');
  const punto = coordsDesdeTexto(document.getElementById('capturaURL').value);

  if (!punto) {
    aviso.textContent = 'Esa dirección no trae coordenadas. Abre el lugar en Google Maps ' +
      'y copia la dirección COMPLETA de la barra (la que trae @ y números), o usa "Ponerla en el mapa".';
    return;
  }

  guardarCapturada(fila, punto, document.getElementById('capturaHorario').value);
}

// Guarda la cafetería capturada y pasa a la siguiente.
function guardarCapturada(fila, punto, textoHorario) {
  const horarios = parsearHorarioPegado(textoHorario) || horariosVacios();
  const lugar = Object.assign({}, fila, punto);

  if (!yaExiste(lugar)) {
    cafeterias.push(construirCafe(lugar, horarios));
    DB.guardar(cafeterias);
    renderLista();
  }

  indiceCaptura++;
  mostrarCaptura();
}

function saltarCaptura() {
  indiceCaptura++;
  mostrarCaptura();
}

// Botón "Ponerla en el mapa" dentro de la captura guiada.
function capturaEnMapa() {
  const fila = porCapturar[indiceCaptura];
  if (!fila) return;
  const textoHorario = document.getElementById('capturaHorario').value;

  abrirSelectorMapa(fila.nombre, null, punto => {
    guardarCapturada(fila, punto, textoHorario);
  });
}

/* -------------------------------------------------------------------------
   Selector de mapa: tocas un punto y lo devuelve. Se usa para ubicar a mano
   una cafetería que ningún buscador encuentra, y para corregir una mal puesta.
   ------------------------------------------------------------------------- */
let mapaSelector = null;
let marcaSelector = null;
let puntoElegido = null;
let alConfirmarPunto = null;

function abrirSelectorMapa(titulo, puntoInicial, alConfirmar) {
  alConfirmarPunto = alConfirmar;
  puntoElegido = puntoInicial || null;

  document.getElementById('tituloSelector').textContent = titulo || 'Poner en el mapa';
  document.getElementById('btnUsarPunto').disabled = !puntoElegido;
  document.getElementById('modalMapa').hidden = false;

  const centro = puntoInicial || miUbicacion || { lat: 25.6694, lon: -100.3098 };

  if (!mapaSelector) {
    mapaSelector = L.map('mapaSelector');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapaSelector);

    mapaSelector.on('click', ev => {
      puntoElegido = { lat: ev.latlng.lat, lon: ev.latlng.lng };
      ponerMarcaSelector();
      document.getElementById('btnUsarPunto').disabled = false;
    });
  }

  mapaSelector.setView([centro.lat, centro.lon], puntoInicial ? 18 : 16);
  if (marcaSelector) { mapaSelector.removeLayer(marcaSelector); marcaSelector = null; }
  if (puntoElegido) ponerMarcaSelector();

  // El mapa se crea escondido, hay que avisarle que ya se ve.
  setTimeout(() => mapaSelector.invalidateSize(), 60);
}

function ponerMarcaSelector() {
  const icono = L.divIcon({
    className: '',
    html: '<div class="marcador cierra_pronto"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  if (marcaSelector) mapaSelector.removeLayer(marcaSelector);
  marcaSelector = L.marker([puntoElegido.lat, puntoElegido.lon], { icon: icono }).addTo(mapaSelector);
}

function confirmarPunto() {
  if (!puntoElegido || !alConfirmarPunto) return;
  const callback = alConfirmarPunto;
  cerrarSelectorMapa();
  callback(puntoElegido);
}

function cerrarSelectorMapa() {
  document.getElementById('modalMapa').hidden = true;
  alConfirmarPunto = null;
}

function estadoImport(mensaje) {
  document.getElementById('estadoImport').textContent = mensaje;
}

/* =========================== 9. Detalle ================================= */

function abrirDetalle(id) {
  const cafe = cafeterias.find(c => c.id === id);
  if (!cafe) return;
  idEnDetalle = id;

  const estado = estadoAhora(cafe.horarios);
  const km = miUbicacion ? distanciaKm(miUbicacion.lat, miUbicacion.lon, cafe.lat, cafe.lon) : null;

  document.getElementById('detalleNombre').textContent = cafe.nombre;
  document.getElementById('detalleDireccion').textContent =
    (cafe.direccion || '') + (km === null ? '' : ' · a ' + distanciaATexto(km)) +
    (cafe.aproximada ? ' · ⚠ ubicación adivinada por el buscador: confírmala con "Corregir ubicación"' : '');
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

  document.getElementById('horarioPegado').value = '';
  document.getElementById('estadoHorarioPegado').textContent = '';

  abrirModal('modalDetalle');
}

// Corrige la posición de una cafetería tocando el punto correcto en el mapa.
function ajustarUbicacionDetalle() {
  const cafe = cafeterias.find(c => c.id === idEnDetalle);
  if (!cafe) return;

  abrirSelectorMapa(cafe.nombre, { lat: cafe.lat, lon: cafe.lon }, punto => {
    cafe.lat = punto.lat;
    cafe.lon = punto.lon;
    cafe.aproximada = false; // tú la pusiste: ya no hay nada que confirmar
    DB.guardar(cafeterias);
    renderLista();
    abrirDetalle(cafe.id); // repinta el detalle con la distancia nueva
    toast('Ubicación corregida');
  });
}

/* -------------------------------------------------------------------------
   Pegar el horario copiado de Google Maps y llenar los 7 días de un golpe.
   No guarda solo: llena las casillas para que tú revises y le des Guardar.
   ------------------------------------------------------------------------- */
function interpretarHorarioPegado() {
  const estado = document.getElementById('estadoHorarioPegado');
  const horarios = parsearHorarioPegado(document.getElementById('horarioPegado').value);

  if (!horarios) {
    estado.textContent = 'No reconocí ningún día ahí. Copia la tabla completa de horarios de Google Maps (con los nombres de los días).';
    return;
  }

  let dias = 0;
  document.querySelectorAll('#editorHorario input').forEach(input => {
    const turnos = horarios[Number(input.dataset.dia)];
    input.value = rangosATexto(turnos);
    if (turnos.length > 0) dias++;
  });

  estado.textContent = `Entendí ${dias} días con horario. Revísalos abajo y dale Guardar.`;
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

/* ========================= 10. Utilidades =============================== */

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
