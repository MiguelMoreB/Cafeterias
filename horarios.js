/* =========================================================================
   horarios.js  —  Todo lo relacionado con "¿está abierta o cerrada?"
   -------------------------------------------------------------------------
   Aquí NO hay nada de pantalla ni de mapa: son funciones puras que reciben
   datos y devuelven datos. Eso las hace fáciles de entender y de probar.

   Guardamos los horarios de una cafetería así:

     horarios = {
       0: [ {desde: 480, hasta: 1200} ],   // 0 = domingo, 480 = 08:00
       1: [ {desde: 480, hasta: 840}, {desde: 960, hasta: 1200} ], // dos turnos
       2: [],                              // día cerrado
       ...
     }

   Los minutos se cuentan desde la medianoche: 08:00 = 8*60 = 480.
   Si un horario cruza la medianoche (18:00-02:00) guardamos hasta = 1560
   (o sea "26:00"). Así el resto del código nunca tiene que preguntarse si
   el cierre es menor que la apertura.
   ========================================================================= */

// Nombres de los días en el mismo orden que usa JavaScript (Date.getDay()).
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Cómo se llaman los días en los datos de OpenStreetMap (Mo, Tu, We...).
const DIAS_OSM = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };

// "08:30" -> 510 minutos. Devuelve null si el texto no es una hora válida.
function aMinutos(hhmm) {
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const horas = Number(m[1]);
  const mins = Number(m[2]);
  if (horas > 24 || mins > 59) return null;
  return horas * 60 + mins;
}

// 510 -> "08:30". Si el número pasa de 1440 (medianoche) le da la vuelta,
// para que 1560 se muestre como "02:00" y no como "26:00".
function aTexto(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const min = String(m % 60).padStart(2, '0');
  return h + ':' + min;
}

// Un horario vacío: los 7 días sin ningún turno (= cerrado toda la semana).
function horariosVacios() {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/* -------------------------------------------------------------------------
   parsearRangos("08:00-14:00, 16:00-20:00") -> [{desde:480,hasta:840}, ...]
   Es lo que usa el editor manual de horarios de la app.
   Acepta también "cerrado" o texto vacío -> [] (ningún turno).
   ------------------------------------------------------------------------- */
function parsearRangos(texto) {
  const limpio = String(texto || '').trim().toLowerCase();
  if (!limpio || limpio === 'cerrado' || limpio === 'off') return [];

  const turnos = [];
  // Busca todos los pares hora-hora que encuentre en el texto.
  const regex = /(\d{1,2}:\d{2})\s*[-–a]+\s*(\d{1,2}:\d{2})/g;
  let encontrado;
  while ((encontrado = regex.exec(limpio)) !== null) {
    const desde = aMinutos(encontrado[1]);
    let hasta = aMinutos(encontrado[2]);
    if (desde === null || hasta === null) continue;
    // 18:00-02:00 cruza la medianoche: le sumamos un día al cierre.
    if (hasta <= desde) hasta += 1440;
    turnos.push({ desde, hasta });
  }
  return turnos.sort((a, b) => a.desde - b.desde);
}

// El camino inverso: [{desde:480,hasta:840}] -> "08:00-14:00"
function rangosATexto(turnos) {
  if (!turnos || turnos.length === 0) return '';
  return turnos.map(t => {
    // Un cierre a medianoche se ve mejor como "24:00" que como "00:00".
    const fin = t.hasta > 0 && t.hasta % 1440 === 0 ? '24:00' : aTexto(t.hasta);
    return aTexto(t.desde) + '-' + fin;
  }).join(', ');
}

/* -------------------------------------------------------------------------
   parsearOpeningHours(texto)
   Traduce el campo "opening_hours" de OpenStreetMap a nuestro formato.

   Ejemplos que entiende:
     "Mo-Fr 08:00-20:00; Sa-Su 09:00-14:00"
     "Mo-Su 07:00-23:00"
     "Mo-Fr 08:00-13:00,15:00-19:00"
     "24/7"
     "Mo-Sa 08:00-20:00; Su off"

   El formato real de OSM tiene MUCHAS más variantes (festivos, estaciones,
   "sunset"...). Si encontramos algo que no entendemos, ignoramos esa regla
   en vez de inventar un horario equivocado; y si no entendimos nada,
   devolvemos null para que la app te pida capturarlo a mano.
   ------------------------------------------------------------------------- */
function parsearOpeningHours(texto) {
  if (!texto) return null;
  const original = String(texto).trim();
  const resultado = horariosVacios();
  let entendimosAlgo = false;

  // Caso especial: abierto siempre.
  if (/^24\s*\/\s*7$/.test(original)) {
    for (let d = 0; d < 7; d++) resultado[d] = [{ desde: 0, hasta: 1440 }];
    return resultado;
  }

  // Las reglas van separadas por ';' -> "Mo-Fr 08:00-20:00" | "Su off"
  for (const reglaCruda of original.split(';')) {
    const regla = reglaCruda.trim().toLowerCase();
    if (!regla) continue;

    // Reglas que no sabemos interpretar: festivos, meses, semanas, "sunset".
    if (/\b(ph|sh|easter|sunrise|sunset|week)\b/.test(regla)) continue;
    if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(regla)) continue;

    // ¿A qué días aplica esta regla?
    const dias = diasDeLaRegla(regla);
    if (dias.length === 0) continue;

    // ¿Qué turnos tiene? ("off" o "closed" = cerrado ese día)
    const cerrado = /\b(off|closed)\b/.test(regla);
    const turnos = cerrado ? [] : parsearRangos(regla);
    if (!cerrado && turnos.length === 0) continue;

    // Una regla posterior pisa a la anterior (así funciona OSM).
    for (const d of dias) resultado[d] = turnos;
    entendimosAlgo = true;
  }

  return entendimosAlgo ? resultado : null;
}

// Saca la lista de días de una regla: "mo-fr 08:00-20:00" -> [1,2,3,4,5]
// Si la regla no menciona ningún día ("08:00-20:00"), aplica a los 7.
function diasDeLaRegla(regla) {
  const dias = new Set();
  // Quitamos las horas para no confundir "sa" de "sábado" con otra cosa.
  const soloDias = regla.replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, '');

  // Rangos de días: "mo-fr"
  const rangos = soloDias.matchAll(/\b(su|mo|tu|we|th|fr|sa)\s*-\s*(su|mo|tu|we|th|fr|sa)\b/g);
  for (const r of rangos) {
    let i = DIAS_OSM[r[1]];
    const fin = DIAS_OSM[r[2]];
    // Avanzamos en círculo por si el rango da la vuelta (sa-mo).
    for (let paso = 0; paso < 7; paso++) {
      dias.add(i);
      if (i === fin) break;
      i = (i + 1) % 7;
    }
  }

  // Días sueltos: "mo, we, fr"
  const sueltos = soloDias.matchAll(/\b(su|mo|tu|we|th|fr|sa)\b/g);
  for (const s of sueltos) dias.add(DIAS_OSM[s[1]]);

  if (dias.size === 0 && /\d{1,2}:\d{2}/.test(regla)) return [0, 1, 2, 3, 4, 5, 6];
  return [...dias];
}

/* -------------------------------------------------------------------------
   parsearHorarioPegado(texto)

   Para cuando OpenStreetMap no tiene el horario (que es lo normal en las
   cafeterías chiquitas): abres el lugar en Google Maps, despliegas la tabla
   de horarios, la seleccionas, copias y la pegas aquí. Esta función la
   entiende y llena los 7 días de un jalón.

   Ejemplos que lee:
     lunes        8:00–20:00
     martes:      8 a.m.–8 p.m.
     miércoles    8:00–13:00, 16:00–20:00
     domingo      Cerrado
     lunes a viernes 7:00 a 22:00
     Abierto las 24 horas
     Monday       8 AM–8 PM

   Devuelve el objeto de horarios, o null si no entendió nada.
   ------------------------------------------------------------------------- */

// Cada día con todas las formas en que puede venir escrito.
const NOMBRES_DIA = [
  { dia: 0, patron: /\b(domingo|dom\.?|sunday|sun\.?)\b/i },
  { dia: 1, patron: /\b(lunes|lun\.?|monday|mon\.?)\b/i },
  { dia: 2, patron: /\b(martes|mar\.?|tuesday|tue\.?|tues\.?)\b/i },
  { dia: 3, patron: /\b(mi[ée]rcoles|mi[ée]\.?|wednesday|wed\.?)\b/i },
  { dia: 4, patron: /\b(jueves|jue\.?|thursday|thu\.?|thurs\.?)\b/i },
  { dia: 5, patron: /\b(viernes|vie\.?|friday|fri\.?)\b/i },
  { dia: 6, patron: /\b(s[áa]bado|s[áa]b\.?|saturday|sat\.?)\b/i }
];

function parsearHorarioPegado(texto) {
  const DIA_ES = 'domingo|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado';

  const lineas = String(texto || '')
    // Google a veces pega todo seguido: "lunes8:00–20:00martes8:00–20:00".
    // 1) Cortamos línea cuando un día viene pegado DESPUÉS de un valor.
    //    Ojo: solo después de un valor, para no partir "lunes a viernes".
    .replace(new RegExp('(\\d|cerrado|closed|horas)(?=\\s*(?:' + DIA_ES + '))', 'gi'), '$1\n')
    // 2) Separamos el día de su hora cuando vienen pegados ("lunes8:00").
    .replace(new RegExp('(' + DIA_ES + ')(?=[\\dA-ZÁÉÍÓÚ])', 'gi'), '$1 ')
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(Boolean);

  const resultado = horariosVacios();
  let entendimosAlgo = false;

  for (const linea of lineas) {
    const dias = diasDeLaLinea(linea);
    if (dias.length === 0) continue;

    let turnos;
    if (/\b(cerrado|closed)\b/i.test(linea)) {
      turnos = [];
    } else if (/24\s*(horas|hours|h)\b|todo el d[ií]a|open 24/i.test(linea)) {
      turnos = [{ desde: 0, hasta: 1440 }];
    } else {
      turnos = rangosConAmPm(linea);
      if (turnos.length === 0) continue; // línea sin horas útiles: la saltamos
    }

    for (const d of dias) resultado[d] = turnos;
    entendimosAlgo = true;
  }

  return entendimosAlgo ? resultado : null;
}

// Qué días menciona la línea. Entiende "lunes a viernes" como un rango.
function diasDeLaLinea(linea) {
  const encontrados = NOMBRES_DIA.filter(d => d.patron.test(linea)).map(d => d.dia);
  if (encontrados.length === 0) return [];

  // "lunes a viernes" / "lunes - viernes": rango de días.
  const esRango = encontrados.length === 2 &&
    /\b(a|to|hasta|-|–|—)\b/i.test(linea.replace(/\d{1,2}[:.]\d{2}/g, ''));
  if (esRango) {
    const dias = [];
    let i = encontrados[0];
    for (let paso = 0; paso < 7; paso++) {
      dias.push(i);
      if (i === encontrados[1]) break;
      i = (i + 1) % 7;
    }
    return dias;
  }
  return encontrados;
}

// Saca los rangos de una línea, entendiendo a.m./p.m. además del formato 24h.
function rangosConAmPm(linea) {
  const marcador = '(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?|am|pm)';
  const hora = '(\\d{1,2})(?::(\\d{2}))?\\s*' + marcador + '?';
  const separador = '\\s*(?:–|—|−|-|a|to|hasta)\\s*';
  const regex = new RegExp(hora + separador + hora, 'gi');

  const turnos = [];
  let m;
  while ((m = regex.exec(linea)) !== null) {
    // m[1],m[2],m[3] = inicio (hora, minutos, a.m./p.m.)
    // m[4],m[5],m[6] = fin
    let desde = aMinutosConMarcador(m[1], m[2], m[3]);
    let hasta = aMinutosConMarcador(m[4], m[5], m[6]);
    if (desde === null || hasta === null) continue;

    if (hasta <= desde) hasta += 1440; // cruza la medianoche
    turnos.push({ desde, hasta });
  }
  return turnos.sort((a, b) => a.desde - b.desde);
}

function aMinutosConMarcador(h, min, marcador) {
  let horas = Number(h);
  const minutos = Number(min || 0);
  if (!isFinite(horas) || horas > 24 || minutos > 59) return null;

  if (marcador) {
    const esTarde = /p/i.test(marcador);
    if (esTarde && horas < 12) horas += 12;   // 8 p.m. -> 20
    if (!esTarde && horas === 12) horas = 0;  // 12 a.m. -> 00
  }
  return horas * 60 + minutos;
}

/* -------------------------------------------------------------------------
   estadoAhora(horarios, ahora)
   El corazón de la app. Devuelve, por ejemplo:

     { estado: 'abierta',       texto: 'Abierta · cierra 20:00' }
     { estado: 'cierra_pronto', texto: 'Cierra en 35 min · 20:00' }
     { estado: 'cerrada',       texto: 'Cerrada · abre mañana 08:00' }
     { estado: 'desconocido',   texto: 'Sin horario' }
   ------------------------------------------------------------------------- */
const MINUTOS_CIERRA_PRONTO = 60; // a partir de aquí decimos "cierra pronto"

function estadoAhora(horarios, ahora = new Date()) {
  if (!horarios || !tieneAlgunTurno(horarios)) {
    return { estado: 'desconocido', texto: 'Sin horario' };
  }

  const hoy = ahora.getDay();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // 1) ¿Hay un turno de HOY que nos cubra?
  for (const turno of horarios[hoy] || []) {
    if (minutosAhora >= turno.desde && minutosAhora < turno.hasta) {
      return construirAbierta(turno.hasta - minutosAhora, turno.hasta);
    }
  }

  // 2) ¿Y un turno de AYER que cruzó la medianoche? (18:00-02:00)
  const ayer = (hoy + 6) % 7;
  for (const turno of horarios[ayer] || []) {
    const minutosDesdeAyer = minutosAhora + 1440;
    if (minutosDesdeAyer >= turno.desde && minutosDesdeAyer < turno.hasta) {
      return construirAbierta(turno.hasta - minutosDesdeAyer, turno.hasta);
    }
  }

  // 3) Está cerrada: buscamos la próxima apertura en los siguientes 7 días.
  const proxima = proximaApertura(horarios, hoy, minutosAhora);
  return {
    estado: 'cerrada',
    texto: proxima ? 'Cerrada · abre ' + proxima : 'Cerrada'
  };
}

function construirAbierta(minutosRestantes, minutoCierre) {
  const hora = aTexto(minutoCierre);
  if (minutosRestantes <= MINUTOS_CIERRA_PRONTO) {
    return {
      estado: 'cierra_pronto',
      texto: 'Cierra en ' + minutosRestantes + ' min · ' + hora,
      minutos: minutosRestantes
    };
  }
  return { estado: 'abierta', texto: 'Abierta · cierra ' + hora, minutos: minutosRestantes };
}

// Recorre hoy, mañana, pasado... hasta encontrar el siguiente turno que abra.
function proximaApertura(horarios, hoy, minutosAhora) {
  for (let salto = 0; salto < 8; salto++) {
    const dia = (hoy + salto) % 7;
    const turnos = (horarios[dia] || []).slice().sort((a, b) => a.desde - b.desde);
    for (const turno of turnos) {
      if (salto === 0 && turno.desde <= minutosAhora) continue; // ya pasó hoy
      const hora = aTexto(turno.desde);
      if (salto === 0) return 'hoy ' + hora;
      if (salto === 1) return 'mañana ' + hora;
      return DIAS[dia].toLowerCase() + ' ' + hora;
    }
  }
  return null;
}

function tieneAlgunTurno(horarios) {
  return [0, 1, 2, 3, 4, 5, 6].some(d => (horarios[d] || []).length > 0);
}

/* -------------------------------------------------------------------------
   distanciaKm: fórmula de Haversine.
   Calcula la distancia en línea recta entre dos puntos de la Tierra
   (no la distancia manejando; para eso está el botón "Cómo llegar").
   ------------------------------------------------------------------------- */
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // radio de la Tierra en km
  const aRad = g => (g * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 0.8 -> "800 m" | 3.42 -> "3.4 km"
function distanciaATexto(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}
