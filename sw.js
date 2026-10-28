/* =========================================================================
   sw.js — Service Worker (lo que convierte la web en "app instalable")
   -------------------------------------------------------------------------
   Estrategia "red primero": siempre intenta bajar la versión más nueva;
   si no hay internet, sirve la copia guardada. Así nunca te quedas con una
   versión vieja pegada, pero la app abre aunque estés sin señal.

   Si cambias los archivos y no ves los cambios, sube el número de VERSION.
   ========================================================================= */

const VERSION = 'cafeterias-v11';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './horarios.js',
  './osm.js',
  './importar.js',
  './vigilancia.js',
  './app.js',
  './manifest.webmanifest',
  './icono.svg'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  // Borra las cachés de versiones anteriores.
  ev.waitUntil(
    caches.keys().then(claves =>
      Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* -------------------------------------------------------------------------
   Al tocar la notificación del modo paseo.

   Si la app ya está abierta en alguna pestaña, la traemos al frente y le
   mandamos un recado para que abra la pantalla "Cerca de ti". Si no hay
   ninguna abierta, la abrimos con ?cerca=1 para que lo haga al cargar.
   ------------------------------------------------------------------------- */
self.addEventListener('notificationclick', ev => {
  ev.notification.close();

  ev.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const ventana of abiertas) {
      if ('focus' in ventana) {
        ventana.postMessage({ tipo: 'abrir-cerca' });
        return ventana.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow('./index.html?cerca=1');
    }
  })());
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);

  // Las búsquedas a OpenStreetMap NO se cachean: siempre queremos el dato real.
  if (url.hostname.includes('nominatim') || url.hostname.includes('overpass')) return;

  ev.respondWith(
    fetch(ev.request)
      .then(resp => {
        // Guardamos una copia fresca para cuando no haya internet.
        const copia = resp.clone();
        caches.open(VERSION).then(c => c.put(ev.request, copia)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(ev.request).then(r => r || caches.match('./index.html')))
  );
});
