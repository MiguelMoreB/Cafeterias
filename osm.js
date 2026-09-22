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

// Overpass tiene varios servidores públicos con los MISMOS datos. El
// principal se satura seguido (responde 429 o 504), así que si falla uno
// probamos el siguiente antes de darnos por vencidos.
const SERVIDORES_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

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
   buscarCafesCerca({lat, lon}, radioMetros)

   Nominatim busca "direcciones", y es malo encontrando cafeterías locales
   por su nombre. Overpass en cambio busca por ETIQUETA: le pedimos
   directamente "todo lo que sea amenity=cafe a 3 km de aquí", y de paso nos
   trae el horario en la misma respuesta. Por eso esta es la mejor forma de
   armar tu lista.

   Nota de diseño: NO filtramos por nombre aquí. Overpass tiene un índice por
   etiqueta (amenity), pero buscar por nombre con expresiones regulares le
   obliga a revisar todo y la consulta se cae por tiempo. Traemos las
   cafeterías de la zona y filtramos por nombre ya en el teléfono, que es
   instantáneo.
   ------------------------------------------------------------------------- */
async function buscarCafesCerca(centro, radioMetros = 3000, tope = 80) {
  const alrededor = `around:${radioMetros},${centro.lat},${centro.lon}`;
  // nwr = nodes + ways + relations (un café puede estar mapeado como un
  // punto o como el polígono del edificio).
  const consulta =
    `[out:json][timeout:60];` +
    `nwr["amenity"~"^(cafe|coffee_shop)$"]["name"](${alrededor});` +
    `out center tags ${tope};`;

  const datos = await consultarOverpass(consulta);
  return (datos.elements || []).map(normalizarElementoOverpass).filter(Boolean);
}

/* -------------------------------------------------------------------------
   buscarCafesEnArea(centro, radioMetros, tope)
   Lo mismo que buscarCafesCerca, pero para zonas GRANDES (una ciudad entera).

   La diferencia es el tipo de consulta. `around:20000,lat,lon` obliga a
   Overpass a medir distancias una por una y con un radio grande se cae por
   tiempo: los tres servidores públicos devolvieron 504 probando con la
   Ciudad de México. Un rectángulo (bbox) usa directamente su índice
   geográfico y responde. A cambio, la zona es un cuadrado en vez de un
   círculo, lo cual aquí da igual: luego cruzamos por nombre.

   También pedimos solo `nw` (puntos y edificios), sin relaciones, que son
   las más caras de calcular y casi nunca son cafeterías.
   ------------------------------------------------------------------------- */
async function buscarCafesEnArea(centro, radioMetros = 12000, alAvanzar) {
  // Cuántos grados son esos metros. Un grado de latitud son ~111.32 km;
  // los de longitud se encogen conforme te alejas del ecuador.
  const dLat = radioMetros / 111320;
  const dLon = radioMetros / (111320 * Math.cos(centro.lat * Math.PI / 180));

  // Una sola consulta de 24x24 km no pasa: los tres servidores devolvieron
  // 504 con la Ciudad de México. En cambio, nueve consultas chicas de 8x8 km
  // responden al instante cada una. Es más lento en total, pero funciona.
  const CELDAS = 3;
  const altoCelda = (dLat * 2) / CELDAS;
  const anchoCelda = (dLon * 2) / CELDAS;

  const encontrados = [];
  const vistos = new Set();
  let fallaron = 0;
  let hechas = 0;

  for (let i = 0; i < CELDAS; i++) {
    for (let j = 0; j < CELDAS; j++) {
      hechas++;
      if (alAvanzar) alAvanzar(hechas, CELDAS * CELDAS);

      const sur = (centro.lat - dLat + i * altoCelda).toFixed(5);
      const norte = (centro.lat - dLat + (i + 1) * altoCelda).toFixed(5);
      const oeste = (centro.lon - dLon + j * anchoCelda).toFixed(5);
      const este = (centro.lon - dLon + (j + 1) * anchoCelda).toFixed(5);

      // Solo `nw` (puntos y edificios): las relaciones son caras de calcular
      // y casi nunca son cafeterías.
      const consulta =
        `[out:json][timeout:40];` +
        `nw["amenity"~"^(cafe|coffee_shop)$"]["name"](${sur},${oeste},${norte},${este});` +
        `out center tags 500;`;

      try {
        const datos = await consultarOverpass(consulta);
        for (const el of datos.elements || []) {
          const llave = el.type + el.id;
          if (vistos.has(llave)) continue; // una celda puede repetir el borde
          vistos.add(llave);
          const cafe = normalizarElementoOverpass(el);
          if (cafe) encontrados.push(cafe);
        }
      } catch (e) {
        // Si una celda falla seguimos con las demás: mejor traer el 80% de la
        // ciudad que nada.
        if (e.message !== 'OSM_OCUPADO') throw e;
        fallaron++;
      }
    }
  }

  if (fallaron === CELDAS * CELDAS) throw new Error('OSM_OCUPADO');
  return encontrados;
}

// Todas las llamadas a Overpass pasan por aquí, para tratar los errores
// en un solo lugar.
async function consultarOverpass(consulta) {
  let ultimoError = new Error('OSM_OCUPADO');

  for (const servidor of SERVIDORES_OVERPASS) {
    try {
      return await consultarUnServidor(servidor, consulta);
    } catch (e) {
      ultimoError = e;
      // Solo tiene sentido cambiar de servidor si el problema fue del servidor.
      if (e.message !== 'OSM_OCUPADO') throw e;
      console.warn('Overpass ocupado en ' + servidor + ', probando el siguiente');
    }
  }
  throw ultimoError;
}

async function consultarUnServidor(servidor, consulta) {
  await esperarTurno();

  const resp = await fetch(servidor, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(consulta)
  });

  // 429 = "vas muy rápido"; 504 y 503 = el servidor está saturado. Son
  // gratuitos y compartidos por mucha gente, así que pasa seguido.
  if (resp.status === 429 || resp.status === 503 || resp.status === 504) {
    throw new Error('OSM_OCUPADO');
  }
  if (!resp.ok) throw new Error('Overpass respondió ' + resp.status);

  const datos = await resp.json();
  // Overpass a veces responde 200 pero con un aviso de que se quedó sin tiempo.
  if (datos.remark && /timed out|runtime error/i.test(datos.remark)) {
    throw new Error('OSM_OCUPADO');
  }
  return datos;
}

function normalizarElementoOverpass(el) {
  const tags = el.tags || {};
  // Los "way" y "relation" no tienen lat/lon propios: traen un centro.
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
  if (lat == null || lon == null || !tags.name) return null;

  const calle = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const direccion = [calle, tags['addr:neighbourhood'] || tags['addr:suburb'], tags['addr:city']]
    .filter(Boolean).join(', ');

  return {
    nombre: tags.name,
    direccion: direccion,
    direccionLarga: direccion || 'Sin dirección en OpenStreetMap',
    lat: Number(lat),
    lon: Number(lon),
    osmType: el.type,
    osmId: el.id,
    openingHours: tags.opening_hours || null,
    telefono: tags.phone || tags['contact:phone'] || null,
    web: tags.website || tags['contact:website'] || null,
    categoria: tags.amenity || 'cafe'
  };
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

  const datos = await consultarOverpass(`[out:json][timeout:20];${osmType}(${osmId});out tags;`);
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
