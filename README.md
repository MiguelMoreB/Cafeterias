# ☕ Cafeterías

App web (PWA) con **mi lista personal de cafeterías**: dirección, horario, si están
**abiertas / cierran pronto / cerradas**, a **cuántos km** están de mí y un **mapa**.

Sin servidor, sin cuenta, sin tarjeta de crédito: todo corre en el navegador y los
datos se guardan en el teléfono.

---

## Cómo está construida

HTML + CSS + JavaScript "a pelo" (sin React, sin build, sin `npm`). Se abre con
cualquier servidor estático.

```
index.html      La pantalla: barra, pestañas Lista/Mapa, y los dos modales.
styles.css      Colores y diseño. Los colores están arriba, en :root.
horarios.js     El cerebro: entiende horarios y decide abierto/cerrado. Sin pantalla.
osm.js          La conexión a internet: buscar lugares y traer sus horarios.
importar.js     Leer links de Google Maps y el CSV de Google Takeout.
app.js          Une todo: guarda datos, pinta la lista, el mapa y los modales.
sw.js           Service worker: permite instalarla y abrirla sin internet.
manifest.webmanifest / icono.svg   Para que se instale como app en el celular.
```

### Por qué OpenStreetMap y no Google Maps Platform

Google Maps Platform (la API de Places, la que da horarios oficiales) **exige una
cuenta de Google Cloud con tarjeta de crédito**, aunque el uso normal caiga dentro
del tramo gratis. Para evitar eso, la app usa alternativas abiertas:

| Para qué | Servicio | Costo |
|---|---|---|
| Buscar el lugar, dirección, coordenadas | **Nominatim** (OpenStreetMap) | Gratis, sin key |
| Traer el horario (`opening_hours`) | **Overpass API** (OpenStreetMap) | Gratis, sin key |
| Dibujar el mapa | **Leaflet** + mosaicos de OpenStreetMap | Gratis, sin key |
| "Cómo llegar" | Links normales de `google.com/maps` | Gratis, sin key |

El **trade-off honesto**: los horarios de OSM los captura la comunidad, así que hay
lugares que no los tienen o los tienen viejos. Por eso cada cafetería tiene un
**editor manual de horario**: lo capturas una vez y ya queda.

### Las dos formas de agregar (y por qué hay dos)

| Modo | Qué usa | Cuándo sirve |
|---|---|---|
| **📍 Cafeterías cerca de mí** | Overpass: *"dame todo lo que sea `amenity=cafe` a 3 km"* | El bueno. Busca por **etiqueta**, encuentra cafeterías locales y suele traer el horario en la misma respuesta. Necesita tu ubicación. |
| **Buscar por nombre** | Nominatim (el buscador de direcciones) | Para lugares de **otra ciudad**, donde no estás parado. |

Probándolo en el centro de Monterrey: el modo "cerca de mí" encontró **32** cafeterías;
la búsqueda por nombre de las mismas, **ninguna**. Por eso el orden de la pantalla
empuja al primero.

Un detalle importante de rendimiento: el filtro por nombre del modo cercano se hace
**en el teléfono**, no en el servidor. Overpass tiene índice por etiqueta, pero
filtrar por nombre con expresiones regulares lo obliga a revisar todo y la consulta
se cae por tiempo (devuelve 200 con un `remark`, no un error). La app detecta eso y
el 429 ("vas muy rápido") y te avisa que el servidor gratuito está saturado.

### Traer cafeterías desde Google Maps (`importar.js`)

OpenStreetMap no tiene mapeadas todas las cafeterías, sobre todo las chiquitas y las
nuevas. Google sí. Pero **un enlace de "compartir lista" no se puede leer**: Google no
tiene API pública de listas guardadas, y el navegador bloquea leer contenido de
google.com desde otra página (CORS). Lo que sí se puede leer es un **link de Maps**,
porque las coordenadas van escritas dentro de la propia URL:

```
https://www.google.com/maps/place/Cafe+X/@25.6694,-100.3098,17z/data=!3d25.6712!4d-100.3105
                                          └── centro de la vista ──┘      └── el lugar ──┘
```

Se prefiere el `!3d...!4d...` sobre el `@lat,lon`: el segundo es el centro del mapa,
que puede estar corrido unos metros; el primero es el punto del lugar.

Dos entradas, en el modal de agregar → **Traer desde Google Maps**:

1. **Pegar links** — uno o varios, una por línea. Opcionalmente `Mi nombre | https://...`
   para ponerle el nombre que tú quieras.
2. **CSV de Google Takeout** — la exportación oficial de tus listas guardadas
   (<https://takeout.google.com/>). Ojo: el producto es **"Guardados"**, no "Maps";
   "Maps" trae tus reseñas y preferencias, y "Maps (tus lugares)" los lugares
   etiquetados en JSON. Cada lista sale como un CSV con columnas `Title, Note, URL`.

   **Advertencia:** varias filas de Takeout traen una URL **sin coordenadas** (del tipo
   `.../maps/place/Nombre/data=!4m2!3m1!1s0x8662...`, que es un identificador interno de
   Google). Para esas, la app busca el lugar por nombre en Nominatim, y si tampoco así
   aparece, te la lista en "sin ubicar" con su liga para que la abras y pegues la URL
   larga.

Después de ubicarlas, la app hace **una sola** consulta a Overpass que cubre todos los
puntos importados y le pega a cada una el horario de la cafetería de OSM que esté a
menos de 120 m. Una consulta por cafetería serían decenas de llamadas y el servidor
gratuito nos cortaría.

**Límite conocido:** los links cortos (`maps.app.goo.gl/...` del botón Compartir) **no
traen coordenadas dentro**; hay que abrirlos para que Google los expanda, y eso el
navegador no nos deja hacerlo. La app los detecta y te los lista aparte con un botón
para abrirlos, y de ahí copias la dirección larga.

### Cuando Google no da las coordenadas, y OSM no da los horarios

Es el caso normal, no la excepción. Estas son las tres salidas, de la más
automática a la más manual:

**Coordenadas**

1. **KML de Google My Maps** (lo más automático). Entra a
   <https://www.google.com/mymaps> → *Crear un mapa nuevo* → *Importar* → sube el CSV
   de Takeout. El geocodificador de Google le pone coordenadas a cada lugar. Luego
   *⋮ → Exportar a KML/KMZ* → marca *Exportar como KML* y sube ese archivo a la app.
   Es usar el geocodificador de Google sin API key ni tarjeta.
2. **Pegar el link largo** de cada cafetería (trae el punto exacto dentro).
3. **"Poner en el mapa"**: tocas el punto y ya. Nunca falla y no depende de nadie.

**Horarios**

1. **Pegar el horario de Google Maps**: abres el lugar, despliegas la semana, la
   copias y la pegas en el detalle → *Interpretar*. `parsearHorarioPegado()` entiende
   formato 24 h y a. m./p. m., dos turnos por día, "Cerrado", "Abierto las 24 horas",
   rangos tipo "lunes a viernes", español e inglés, y hasta el texto pegado sin saltos
   de línea (`lunes8:00–20:00martes...`).
2. **Buscar horario en OSM** (botón del detalle) para las que sí estén mapeadas.
3. Escribirlo a mano, día por día.

### Una decisión importante: nunca adivinar en silencio

Cuando una fila del CSV no trae coordenadas, la app la busca por nombre. Durante las
pruebas, "Cafetería del barrio" se agregó como **"Café del Barrio Viejo" de la Ciudad
de México** — nombre creíble, lugar equivocado, y sin ningún aviso.

Por eso ahora `esCandidatoRazonable()` exige dos cosas antes de aceptar una
coincidencia: que compartan alguna palabra con peso (ignorando "café", "de", "el"...)
y que no esté a más de 100 km de ti. Y si aun así se acepta, la cafetería queda
marcada **"ubicación por confirmar"** en la lista hasta que la confirmes en el mapa.
Es preferible dejarla pendiente a meterte un dato falso que parece bueno.

### Cómo se decide "abierta / cierra pronto / cerrada"

En `horarios.js`. Todo se convierte a **minutos desde la medianoche** (08:00 = 480):

1. Se busca un turno de **hoy** que contenga la hora actual → **abierta**.
2. Si no, se revisan los turnos de **ayer** que cruzan la medianoche (18:00–02:00).
3. Si faltan **60 minutos o menos** para cerrar → **cierra pronto** (ámbar).
4. Si está cerrada, se busca la siguiente apertura → *"Cerrada · abre mañana 08:00"*.

La lista se vuelve a pintar **cada minuto**, así el contador va bajando solo.

### Cómo se calcula la distancia

`navigator.geolocation` (el GPS del navegador, con tu permiso) da tu latitud y
longitud, y la fórmula de **Haversine** en `horarios.js` calcula los km **en línea
recta**. No es la distancia manejando — para eso está el botón "Cómo llegar".

> La ubicación solo funciona en `https://` o en `http://localhost`. Si abres el
> `index.html` con doble clic (`file://`) el navegador la bloquea.

### Dónde se guardan mis datos

En `localStorage`, es decir: **solo en ese navegador, en ese dispositivo**. Nadie más
los ve y no viajan a ningún servidor. Si borras los datos del navegador, se borran.

Para respaldar, abre la consola del navegador (F12) y usa:

```js
exportarLista()          // copia tu lista al portapapeles
importarLista('[...]')   // la pega de vuelta en otro dispositivo
```

---

## Cómo correrla

Desde esta carpeta:

```bash
python -m http.server 8777
```

Y abre <http://localhost:8777>

Para probarla en el celular (misma red wifi): averigua la IP de la PC con `ipconfig`
y entra a `http://ESA-IP:8777`. Ojo: en esa dirección el navegador **no** dará
ubicación (no es `https` ni `localhost`); para eso hay que publicarla.

---

## Cómo usarla

1. **📍** (barra de arriba) → da permiso de ubicación: aparecen los kilómetros y el
   orden por cercanía.
2. **＋** → **📍 Cafeterías cerca de mí** → sale la lista de las que hay alrededor;
   toca la que quieras agregar. (O escribe un nombre y luego el botón, para filtrar.)
3. Si OpenStreetMap tenía horario, se guarda solo. Si no, se abre el editor para capturarlo.
4. Pestaña **Mapa** → todas tus cafeterías con color según su estado.
5. Toca una tarjeta → editar horario, notas, "Cómo llegar" o eliminar.

---

## Repositorio privado

El repo es **privado** en GitHub. Una advertencia útil: **GitHub Pages no publica
repos privados en el plan gratuito**, así que mientras sea privado, la app se usa en
local (`python -m http.server`). Si algún día quieres abrirla desde el celular en la
calle, hay dos caminos: hacer el repo público y usar Pages, o publicarla gratis en
Netlify/Cloudflare Pages conectando el repo privado.
