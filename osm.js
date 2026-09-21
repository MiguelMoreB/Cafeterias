/* =========================================================================
   osm.js  —  La "conexión a internet" de la app
   -------------------------------------------------------------------------
   Usamos OpenStreetMap (OSM), que es como la Wikipedia de los mapas:
   gratis, sin tarjeta de crédito y sin API key.

   Dos servicios:

   1) NOMINATIM  -> buscador. Le mandas "cafe con leche monterrey" y te
      devuelve lugares con nombre, dirección, latitud y longitud.

   2) OVERPASS   -> base de datos cruda de OSM. Le preguntamos por un lugar
      concreto y nos da TODAS sus etiquetas, incluida "opening_hours"
      (el horario), teléfono y sitio web.

   Reglas de buena educación (las piden ellos y son importantes):
   - Máximo 1 búsqueda por segundo -> lo controlamos con esperarTurno().
   - Nunca buscar en cada tecla que escribes -> se busca al dar Enter/botón.
   ========================================================================= */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

let ultimaLlamada = 0;

// Espera lo necesario para no hacer más de una llamada por segundo.
async function esperarTurno() {
  const faltan = 1100 - (Date.now() - ultimaLlamada);
  if (faltan > 0) await new Promise(r => setTimeout(r, faltan));
  ultimaLlamada = Date.now();
}

/* -------------------------------------------------------------------------
   buscarLugares("starbucks valle oriente", {lat, lon})
   Devuelve una lista de candidatos para que TÚ elijas cuál agregar.
   Si le pasamos tu ubicación, le damos preferencia a lo que está cerca.
   ------------------------------------------------------------------------- */
async function buscarLugares(texto, cerca) {
  await esperarTurno();

  const params = new URLSearchParams({
    q: texto,
    format: 'jsonv2',
    limit: '12',
    addressdetails: '1',
    extratags: '1',        // <- aquí viene opening_hours cuando existe
    'accept-language': 'es'
  });

  // "viewbox" es un rectángulo alrededor de ti: los resultados de dentro
  // salen primero. No es un filtro estricto, solo una preferencia.
  if (cerca) {
    const d = 0.35; // ~35 km de margen
    params.set('viewbox', [cerca.lon - d, cerca.lat + d, cerca.lon + d, cerca.lat - d].join(','));
  }

  const resp = await fetch(NOMINATIM + '?' + params.toString(), {
    headers: { Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error('Nominatim respondió ' + resp.status);

  const datos = await resp.json();
  return datos.map(normalizarResultado);
}

// Convierte la respuesta de Nominatim al formato que usa nuestra app.
function normalizarResultado(r) {
  const extra = r.extratags || {};
  return {
    nombre: r.name || (r.display_name || '').split(',')[0],
    direccion: direccionCorta(r),
    direccionLarga: r.display_name || '',
    lat: Number(r.lat),
    lon: Number(r.lon),
    osmType: r.osm_type || null,      // node | way | relation
    osmId: r.osm_id || null,
    openingHours: extra.opening_hours || null,
    telefono: extra.phone || extra['contact:phone'] || null,
    web: extra.website || extra['contact:website'] || null,
    categoria: r.type || ''
  };
}

// De la dirección larguísima de OSM nos quedamos con lo útil:
// "Av. Constitución 123, Centro, Monterrey"
function direccionCorta(r) {
  const a = r.address || {};
  const calle = [a.road, a.house_number].filter(Boolean).join(' ');
  const partes = [
    calle,
    a.neighbourhood || a.suburb || a.quarter,
    a.city || a.town || a.village || a.municipality
  ].filter(Boolean);
  return partes.join(', ') || (r.display_name || '').split(',').slice(0, 3).join(',');
}

/* -------------------------------------------------------------------------
   detallesOSM('node', 123456)
   Nominatim a veces no trae el horario. Entonces le preguntamos a Overpass
   por ese lugar exacto y leemos sus etiquetas.

   La consulta se escribe en "Overpass QL":
       [out:json][timeout:20]; node(123456); out tags;
   ------------------------------------------------------------------------- */
async function detallesOSM(osmType, osmId) {
  if (!osmType || !osmId) return null;
  await esperarTurno();

  const consulta = `[out:json][timeout:20];${osmType}(${osmId});out tags;`;
  const resp = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(consulta)
  });
  if (!resp.ok) throw new Error('Overpass respondió ' + resp.status);

  const datos = await resp.json();
  const elemento = (datos.elements || [])[0];
  if (!elemento) return null;

  const tags = elemento.tags || {};
  return {
    openingHours: tags.opening_hours || null,
    telefono: tags.phone || tags['contact:phone'] || null,
    web: tags.website || tags['contact:website'] || null,
    nombre: tags.name || null
  };
}

/* -------------------------------------------------------------------------
   Links a Google Maps. No necesitan API key ni cuenta: son URLs públicas.
   ------------------------------------------------------------------------- */
function linkGoogleMaps(cafe) {
  return `https://www.google.com/maps/search/?api=1&query=${cafe.lat},${cafe.lon}`;
}

function linkComoLlegar(cafe) {
  return `https://www.google.com/maps/dir/?api=1&destination=${cafe.lat},${cafe.lon}`;
}
