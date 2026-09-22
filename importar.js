/* =========================================================================
   importar.js — Traer cafeterías desde Google Maps
   -------------------------------------------------------------------------
   Por qué existe este archivo:

   OpenStreetMap no tiene mapeadas todas las cafeterías (sobre todo las
   chiquitas y nuevas). Google sí. Pero Google no deja leer tus listas
   guardadas desde otra página: no hay API pública y el navegador bloquea
   leer contenido de google.com desde aquí (eso se llama CORS).

   Lo que SÍ podemos hacer, y es suficiente: leer un **link** de Google Maps.
   Dentro del link vienen las coordenadas exactas del lugar, y con eso la app
   ya tiene todo lo importante (posición en el mapa, distancia y "cómo
   llegar"). El horario lo capturas tú una vez.

   Dos formas de entrar:
     1. Pegar uno o varios links (o coordenadas sueltas).
     2. Importar el CSV de Google Takeout, que es la exportación oficial de
        tus listas guardadas.
   ========================================================================= */

/* -------------------------------------------------------------------------
   coordsDesdeTexto(texto)
   Saca la latitud y longitud de casi cualquier cosa que pegues.

   Formatos que entiende:
     .../maps/place/Cafe+X/@25.6694,-100.3098,17z/data=!3d25.669!4d-100.309
     .../maps/search/?api=1&query=25.6694,-100.3098
     .../maps/dir/?api=1&destination=25.6694,-100.3098
     25.6694, -100.3098        (pegado a mano)

   Devuelve {lat, lon} o null.
   ------------------------------------------------------------------------- */
function coordsDesdeTexto(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;

  // 1) !3d<lat>!4d<lon> es lo MÁS exacto: es el punto del lugar en sí.
  //    El @lat,lon de la URL es solo el centro de la vista del mapa, que
  //    puede estar corrido unos metros. Por eso este va primero.
  const exacto = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (exacto) return validar(exacto[1], exacto[2]);

  // 2) Parámetros típicos: query=, ll=, destination=, daddr=, center=
  const param = t.match(/(?:query|ll|destination|daddr|center|sll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (param) return validar(param[1], param[2]);

  // 3) El @lat,lon de la barra de direcciones.
  const arroba = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (arroba) return validar(arroba[1], arroba[2]);

  // 4) Coordenadas pegadas a mano: "25.6694, -100.3098"
  const sueltas = t.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (sueltas) return validar(sueltas[1], sueltas[2]);

  return null;
}

function validar(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!isFinite(la) || !isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo };
}

// ¿Es un link corto de los que genera el botón "Compartir"?
// (maps.app.goo.gl/xxxx o goo.gl/maps/xxxx). Esos NO traen coordenadas:
// hay que abrirlos para que Google los expanda, y el navegador no nos deja
// hacerlo desde aquí. Se detectan para poder explicarlo bien.
function esLinkCorto(texto) {
  return /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(String(texto || ''));
}

/* -------------------------------------------------------------------------
   nombreDesdeTexto(texto)
   De .../maps/place/Café+Nuevo+Brasil/@... saca "Café Nuevo Brasil".
   ------------------------------------------------------------------------- */
function nombreDesdeTexto(texto) {
  const m = String(texto || '').match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch (e) {
    return m[1].replace(/\+/g, ' ').trim();
  }
}

/* -------------------------------------------------------------------------
   filasDesdePegado(texto)
   Convierte lo que pegaste (una línea o veinte) en filas {nombre, url}.
   Acepta también "Nombre del café | https://..." por si quieres nombrarlas.
   ------------------------------------------------------------------------- */
function filasDesdePegado(texto) {
  return String(texto || '')
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(linea => {
      // Si escribiste "Nombre | link", respetamos tu nombre.
      const conNombre = linea.match(/^(.+?)\s*[|;]\s*(https?:\/\/\S+)$/);
      if (conNombre) return { nombre: conNombre[1].trim(), url: conNombre[2] };
      return { nombre: nombreDesdeTexto(linea), url: linea };
    });
}

/* -------------------------------------------------------------------------
   filasDesdeCSV(texto)
   Lee el CSV que te da Google Takeout con tus listas guardadas.
   Sus columnas son: Title, Note, URL (y a veces Comment).

   No usamos split(',') a secas porque los nombres traen comas dentro de
   comillas: "Café Nuevo León, sucursal Centro" es UNA columna, no dos.
   ------------------------------------------------------------------------- */
function filasDesdeCSV(texto) {
  const lineas = partirCSV(String(texto || ''));
  if (lineas.length === 0) return [];

  // Buscamos en qué columna viene el título y en cuál la URL.
  const encabezado = lineas[0].map(c => c.trim().toLowerCase());
  let iNombre = encabezado.findIndex(c => /^(title|nombre|name)$/.test(c));
  let iUrl = encabezado.findIndex(c => /^(url|enlace|link)$/.test(c));
  let iNota = encabezado.findIndex(c => /^(note|nota|comment|comentario)$/.test(c));

  // Si el archivo no trae encabezados reconocibles, adivinamos:
  // la columna que contenga "http" es la URL, la primera es el nombre.
  const hayEncabezado = iNombre !== -1 || iUrl !== -1;
  if (!hayEncabezado) {
    iNombre = 0;
    iUrl = (lineas[0] || []).findIndex(c => /https?:\/\//.test(c));
  }

  const filas = [];
  for (const columnas of lineas.slice(hayEncabezado ? 1 : 0)) {
    const nombre = (columnas[iNombre] || '').trim();
    const url = iUrl === -1 ? '' : (columnas[iUrl] || '').trim();
    const nota = iNota === -1 ? '' : (columnas[iNota] || '').trim();
    if (!nombre && !url) continue;
    filas.push({ nombre: nombre || nombreDesdeTexto(url), url, nota });
  }
  return filas;
}

/* -------------------------------------------------------------------------
   filasDesdeKML(texto)
   Lee un archivo KML, que es el que exporta **Google My Maps**.

   Por qué importa: el CSV de Takeout muchas veces trae URLs sin coordenadas
   (solo un identificador interno de Google). El truco es pasar ese CSV por
   My Maps (mymaps.google.com → Importar), donde el propio geocodificador de
   Google le pone coordenadas a cada lugar, y luego exportar a KML. Ese KML
   sí trae el punto exacto de cada cafetería:

     <Placemark><name>Café X</name>
       <Point><coordinates>-100.3098,25.6694,0</coordinates></Point>

   Ojo con el orden: en KML va longitud PRIMERO y latitud después.
   ------------------------------------------------------------------------- */
function filasDesdeKML(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return [];

  const filas = [];
  for (const marca of doc.getElementsByTagName('Placemark')) {
    const nombre = textoDeEtiqueta(marca, 'name');
    const coords = textoDeEtiqueta(marca, 'coordinates');
    if (!coords) continue;

    const [lon, lat] = coords.trim().split(/\s+/)[0].split(',').map(Number);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    filas.push({
      nombre: nombre || 'Cafetería sin nombre',
      url: '',
      nota: textoDeEtiqueta(marca, 'description'),
      lat,
      lon
    });
  }
  return filas;
}

function textoDeEtiqueta(elemento, etiqueta) {
  const nodo = elemento.getElementsByTagName(etiqueta)[0];
  return nodo ? nodo.textContent.trim() : '';
}

// Decide solo si lo que subiste es un KML o un CSV.
function filasDesdeArchivo(texto, nombreArchivo) {
  const esKML = /\.kml$/i.test(nombreArchivo || '') || /<kml[\s>]/i.test(texto.slice(0, 500));
  return esKML ? filasDesdeKML(texto) : filasDesdeCSV(texto);
}

// Parte un CSV respetando las comillas. Devuelve un arreglo de filas,
// y cada fila es un arreglo de columnas.
function partirCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        // Dos comillas seguidas dentro de un campo = una comilla literal.
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }

  // Lo que quedó pendiente al final del archivo.
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(c => c.trim() !== ''));
}
