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

1. **＋** → escribe el nombre de la cafetería + la ciudad → elige el resultado correcto.
2. Si OpenStreetMap tenía horario, se guarda solo. Si no, se abre el editor para capturarlo.
3. **📍** → da permiso de ubicación y aparecen los kilómetros y el orden por cercanía.
4. Pestaña **Mapa** → todas tus cafeterías con color según su estado.
5. Toca una tarjeta → editar horario, notas, "Cómo llegar" o eliminar.

---

## Repositorio privado

El repo es **privado** en GitHub. Una advertencia útil: **GitHub Pages no publica
repos privados en el plan gratuito**, así que mientras sea privado, la app se usa en
local (`python -m http.server`). Si algún día quieres abrirla desde el celular en la
calle, hay dos caminos: hacer el repo público y usar Pages, o publicarla gratis en
Netlify/Cloudflare Pages conectando el repo privado.
