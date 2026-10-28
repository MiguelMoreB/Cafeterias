/* =========================================================================
   vigilancia.js — "Modo paseo": avisarte cuando pasas cerca de una cafetería
   -------------------------------------------------------------------------
   LO QUE UNA APP WEB SÍ PUEDE Y LO QUE NO

   No puede: seguir tu ubicación en segundo plano. No existe permiso de
   "ubicación en segundo plano" para páginas web; eso solo lo tienen las apps
   nativas de la tienda. Si bloqueas el teléfono o te cambias de app, el
   navegador deja de leer el GPS. No es algo que falte programar: el navegador
   no lo deja, y punto.

   Sí puede: mientras la app esté abierta, leer tu ubicación continuamente y
   lanzarte NOTIFICACIONES de verdad (las de la barra del teléfono). Por eso
   esto es un "modo paseo" que tú enciendes al salir, no algo permanente.

   Para que no se apague a los segundos, el modo pide además mantener la
   pantalla encendida (Wake Lock). Gasta batería: por eso se enciende y se
   apaga a mano.

   LA REGLA DE LA HORA
   Cada cafetería avisada se apunta con la hora del aviso. No vuelve a
   aparecer en una notificación hasta que pase una hora, aunque te alejes y
   regreses. Así no te bombardea si das vueltas por la misma cuadra.
   ========================================================================= */

const RADIO_AVISO_KM = 2;                    // qué tan cerca para avisarte
const ESPERA_ENTRE_AVISOS_MS = 60 * 60 * 1000; // una hora por cafetería
const MINIMO_ENTRE_REVISIONES_MS = 30 * 1000;  // no revisar más seguido que esto
const CLAVE_AVISOS = 'avisos_cafeterias_v1';
const CLAVE_MODO = 'modo_paseo_activo';

let idSeguimiento = null;   // el "watch" del GPS
let bloqueoPantalla = null; // el Wake Lock
let ultimaRevision = 0;
let cercanasDetectadas = []; // lo último que se avisó, para la pantalla "Cerca de ti"

/* ---------------------- La libreta de avisos ---------------------------- */

function leerAvisos() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_AVISOS)) || {};
  } catch (e) {
    return {};
  }
}

function guardarAvisos(avisos) {
  localStorage.setItem(CLAVE_AVISOS, JSON.stringify(avisos));
}

// ¿Ya se avisó de esta cafetería hace menos de una hora?
function enEspera(id, avisos, ahora) {
  const cuando = avisos[id];
  return !!cuando && (ahora - cuando) < ESPERA_ENTRE_AVISOS_MS;
}

// Cuánto falta para que se pueda volver a avisar (en minutos).
function minutosDeEspera(id) {
  const cuando = leerAvisos()[id];
  if (!cuando) return 0;
  const faltan = ESPERA_ENTRE_AVISOS_MS - (Date.now() - cuando);
  return faltan > 0 ? Math.ceil(faltan / 60000) : 0;
}

// Limpia los avisos viejos para que el registro no crezca para siempre.
function limpiarAvisosViejos() {
  const avisos = leerAvisos();
  const ahora = Date.now();
  let cambio = false;
  for (const id of Object.keys(avisos)) {
    if (ahora - avisos[id] > ESPERA_ENTRE_AVISOS_MS) {
      delete avisos[id];
      cambio = true;
    }
  }
  if (cambio) guardarAvisos(avisos);
}

/* ------------------------- Encender y apagar ---------------------------- */

async function activarModoPaseo() {
  if (!navigator.geolocation) {
    return { ok: false, motivo: 'Este navegador no puede darme tu ubicación.' };
  }
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    return { ok: false, motivo: 'Las notificaciones necesitan que la app se abra desde un servidor (http://localhost o https), no como archivo suelto.' };
  }

  // 1) Permiso de notificaciones. Hay que pedirlo desde un toque tuyo:
  //    si no, el navegador lo rechaza sin preguntar.
  const permiso = await pedirPermisoNotificaciones();
  if (permiso !== 'granted') {
    return { ok: false, motivo: permiso === 'denied'
      ? 'Bloqueaste las notificaciones. Actívalas en el candado de la barra de direcciones y vuelve a intentar.'
      : 'Sin permiso de notificaciones no te puedo avisar.' };
  }

  // 2) Seguimiento del GPS. Precisión baja a propósito: para un radio de
  //    2 km sobra, y gasta mucha menos batería que la alta.
  idSeguimiento = navigator.geolocation.watchPosition(
    alMoverse,
    error => {
      console.warn('GPS', error);
      mostrarEstadoPaseo('No se pudo leer tu ubicación: ' + (error.message || 'error'));
    },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
  );

  await mantenerPantallaEncendida();
  localStorage.setItem(CLAVE_MODO, '1');
  limpiarAvisosViejos();
  return { ok: true };
}

function desactivarModoPaseo() {
  if (idSeguimiento !== null) {
    navigator.geolocation.clearWatch(idSeguimiento);
    idSeguimiento = null;
  }
  soltarPantalla();
  localStorage.removeItem(CLAVE_MODO);
}

function modoPaseoActivo() {
  return idSeguimiento !== null;
}

function modoPaseoQuedoEncendido() {
  return localStorage.getItem(CLAVE_MODO) === '1';
}

async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return 'denied';
  }
}

/* ------------------- Mantener la pantalla encendida --------------------- */
/* Sin esto, el teléfono se duerme a los 30 segundos y el navegador deja de
   leer el GPS: el modo paseo se volvería inútil. No todos los navegadores
   tienen Wake Lock, así que si falla seguimos igual (solo avisa menos). */

async function mantenerPantallaEncendida() {
  if (!('wakeLock' in navigator)) return;
  try {
    bloqueoPantalla = await navigator.wakeLock.request('screen');
    // Si sales de la app y vuelves, el bloqueo se pierde: hay que rehacerlo.
    document.addEventListener('visibilitychange', rehacerBloqueo);
  } catch (e) {
    console.warn('No se pudo mantener la pantalla encendida', e);
  }
}

async function rehacerBloqueo() {
  if (document.visibilityState === 'visible' && modoPaseoActivo() && !bloqueoPantalla) {
    await mantenerPantallaEncendida();
  }
}

function soltarPantalla() {
  document.removeEventListener('visibilitychange', rehacerBloqueo);
  if (bloqueoPantalla) {
    bloqueoPantalla.release().catch(() => {});
    bloqueoPantalla = null;
  }
}

/* ---------------------- Cada vez que te mueves -------------------------- */

function alMoverse(posicion) {
  miUbicacion = { lat: posicion.coords.latitude, lon: posicion.coords.longitude };
  renderLista(); // las distancias se actualizan solas

  // El GPS puede disparar muchas veces seguidas; revisamos como mucho cada
  // medio minuto para no estar recalculando de más.
  const ahora = Date.now();
  if (ahora - ultimaRevision < MINIMO_ENTRE_REVISIONES_MS) return;
  ultimaRevision = ahora;

  revisarCercanas();
}

// Las que están dentro del radio Y abiertas ahora mismo.
function cafeteriasCercaYAbiertas() {
  if (!miUbicacion) return [];

  return cafeterias
    .map(cafe => ({
      cafe,
      km: distanciaKm(miUbicacion.lat, miUbicacion.lon, cafe.lat, cafe.lon),
      estado: estadoAhora(cafe.horarios)
    }))
    .filter(x => x.km <= RADIO_AVISO_KM &&
                 (x.estado.estado === 'abierta' || x.estado.estado === 'cierra_pronto'))
    .sort((a, b) => a.km - b.km);
}

async function revisarCercanas() {
  const cerca = cafeteriasCercaYAbiertas();
  cercanasDetectadas = cerca;
  pintarPanelCerca();

  if (cerca.length === 0) {
    mostrarEstadoPaseo('Modo paseo activo · ninguna abierta a menos de ' + RADIO_AVISO_KM + ' km');
    return;
  }

  // Aquí entra tu regla: las avisadas hace menos de una hora no cuentan.
  const avisos = leerAvisos();
  const ahora = Date.now();
  const porAvisar = cerca.filter(x => !enEspera(x.cafe.id, avisos, ahora));

  mostrarEstadoPaseo(`Modo paseo activo · ${cerca.length} abierta(s) cerca`);
  if (porAvisar.length === 0) return;

  // Pase lo que pase con la notificación, hay que apuntar la hora: si no,
  // un fallo aquí haría que te avisara una y otra vez de lo mismo.
  try {
    await notificar(porAvisar);
  } catch (e) {
    console.warn('Falló el aviso', e);
    avisarDentroDeLaApp(porAvisar);
  }

  for (const x of porAvisar) avisos[x.cafe.id] = ahora;
  guardarAvisos(avisos);
}

/* ---------------------------- La notificación --------------------------- */

async function notificar(lista) {
  const titulo = lista.length === 1
    ? '☕ ' + lista[0].cafe.nombre + ' está abierta'
    : `☕ ${lista.length} cafeterías abiertas cerca de ti`;

  const cuerpo = lista.slice(0, 4)
    .map(x => `${x.cafe.nombre} · ${distanciaATexto(x.km)} · ${x.estado.texto}`)
    .join('\n') + (lista.length > 4 ? `\n…y ${lista.length - 4} más` : '');

  try {
    // En el celular hay que mostrarlas desde el service worker: el
    // constructor new Notification() no funciona en Android.
    const registro = await navigator.serviceWorker.ready;
    await registro.showNotification(titulo, {
      body: cuerpo,
      icon: 'icono.svg',
      badge: 'icono.svg',
      tag: 'cafeterias-cerca',   // una sola notificación, se va reemplazando
      renotify: true,
      requireInteraction: false,
      data: { abrirCerca: true }
    });
  } catch (e) {
    // Si la notificación no sale (permiso revocado, navegador que no las
    // soporta, service worker caído), el modo NO se queda mudo: el aviso
    // aparece dentro de la app.
    console.warn('No se pudo notificar, aviso dentro de la app', e);
    avisarDentroDeLaApp(lista);
  }
}

// Plan B: una barra tocable arriba de la lista.
function avisarDentroDeLaApp(lista) {
  const aviso = document.getElementById('avisoUbicacion');
  if (!aviso) return;

  aviso.textContent = lista.length === 1
    ? `☕ ${lista[0].cafe.nombre} está abierta a ${distanciaATexto(lista[0].km)} · toca para ver`
    : `☕ ${lista.length} cafeterías abiertas cerca · toca para ver`;
  aviso.classList.add('aviso-tocable');
  toast(aviso.textContent);
}

/* --------------------------- Pantalla "Cerca" --------------------------- */

function abrirPanelCerca() {
  pintarPanelCerca();
  document.getElementById('modalCerca').hidden = false;
}

function pintarPanelCerca() {
  const ul = document.getElementById('listaCerca');
  if (!ul) return;
  ul.innerHTML = '';

  // Si el modo no está corriendo, calculamos con la última ubicación conocida.
  const lista = cercanasDetectadas.length ? cercanasDetectadas : cafeteriasCercaYAbiertas();

  if (lista.length === 0) {
    const vacio = document.createElement('li');
    vacio.className = 'nota-pendientes';
    vacio.textContent = miUbicacion
      ? `Ninguna cafetería abierta a menos de ${RADIO_AVISO_KM} km de ti.`
      : 'Todavía no sé dónde estás. Toca 📍 arriba para darme tu ubicación.';
    ul.appendChild(vacio);
    return;
  }

  for (const x of lista) {
    const li = document.createElement('li');
    li.className = 'tarjeta ' + x.estado.estado;

    const cuerpo = document.createElement('div');
    cuerpo.className = 'tarjeta-cuerpo';

    const titulo = document.createElement('h3');
    titulo.textContent = x.cafe.nombre;

    const dir = document.createElement('p');
    dir.className = 'dir';
    dir.textContent = x.cafe.direccion || '';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const estado = document.createElement('span');
    estado.className = 'estado ' + x.estado.estado;
    estado.textContent = x.estado.texto;
    const km = document.createElement('span');
    km.className = 'km';
    km.textContent = '· a ' + distanciaATexto(x.km);
    meta.append(estado, km);

    const espera = minutosDeEspera(x.cafe.id);
    if (espera > 0) {
      const chip = document.createElement('span');
      chip.className = 'aviso-aprox';
      chip.textContent = `ya avisada · otra vez en ${espera} min`;
      meta.appendChild(chip);
    }

    cuerpo.append(titulo, dir, meta);
    cuerpo.addEventListener('click', () => {
      document.getElementById('modalCerca').hidden = true;
      abrirDetalle(x.cafe.id);
    });

    const ir = document.createElement('a');
    ir.className = 'btn secundario chico';
    ir.href = linkComoLlegar(x.cafe);
    ir.target = '_blank';
    ir.rel = 'noopener';
    ir.textContent = 'Ir';

    li.append(cuerpo, ir);
    ul.appendChild(li);
  }
}

function mostrarEstadoPaseo(texto) {
  const aviso = document.getElementById('avisoUbicacion');
  if (aviso) aviso.textContent = texto;
}
