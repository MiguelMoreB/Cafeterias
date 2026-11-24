# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una persona sola, con su teléfono en una mano, en la calle de una ciudad
mexicana (la evidencia real es Ciudad de México). Dos trabajos principales,
confirmados por el usuario y de igual peso:

1. **Decidir en la calle**: "de mis lugares, ¿cuál tengo cerca y está abierto
   ahora?"
2. **Llevar su registro**: marcar lo que ya visitó y calificarlo con su propia
   nota, para acordarse de cuáles le gustaron.

Un tercer trabajo, menos frecuente: **planear** a dónde ir otro día, buscando
por día de la semana y hora.

La usa tanto de día como de noche, según el día (café en la mañana, bar en la
noche). No hay otro público: es una app personal, de un solo dueño, en un repo
privado.

## Product Purpose

Es el atlas personal de los lugares que **tú ya elegiste**. No descubre lugares
nuevos ni opina por ti: toma la lista que tú guardaste y la vuelve accionable en
la calle, respondiendo de un vistazo qué está abierto, a cuántos kilómetros, y
qué tan bueno te pareció.

Éxito: que el usuario pueda sacar el teléfono, mirar una pantalla y decidir a
dónde caminar, sin leer, sin buscar y sin internet.

## Positioning

Lo que un buscador de lugares no puede copiar: **la lista es del usuario y las
calificaciones son suyas**. Google dice qué opina el público; esta app dice qué
opinas tú. Y como todo vive en el teléfono, funciona sin señal y sin cuenta.

El mecanismo propio es el cruce de tres datos que nadie más cruza al mismo
tiempo para una lista personal: **horario real → estado ahora mismo**,
**ubicación → distancia**, y **categoría propia → qué estoy viendo**.

## Operating Context

- Se usa de pie, caminando, con una mano, a veces con sol sobre la pantalla y a
  veces de noche.
- Se instala como PWA. Para que funcionen ubicación, notificaciones y modo
  paseo tiene que servirse por `https://`; abierta como archivo local solo
  sirve la lista y el mapa.
- Los datos entran de Google Maps (listas guardadas, Takeout, links largos,
  KML/KMZ) y de OpenStreetMap (Nominatim y Overpass). **No hay API de pago ni
  llave de Google**: el usuario no quiere dar tarjeta.
- Todo se guarda en `localStorage` bajo la llave `cafeterias_v1`. No hay
  servidor, ni cuenta, ni sincronización.
- Hay un archivo de ejemplo real, `ejemplos/ruta-del-cafe-cdmx.json`, con 58
  cafeterías de CDMX con dirección, coordenadas y semana completa de horarios.

## Capabilities and Constraints

Funciones confirmadas que **ninguna rediseño puede perder**:

- Lista y mapa de los lugares guardados, con pestañas entre ambos.
- Estado calculado en vivo: abierta / cierra pronto / cerrada / sin horario.
- Distancia en kilómetros desde la ubicación del usuario.
- Buscador por nombre, colonia o calle.
- Filtros: solo abiertas ahora, ocultar visitadas.
- Orden: más cercanas, por nombre, abiertas primero, mejor calificadas, peor
  calificadas.
- Planear por horario: día de la semana + hora + modo (abiertas a esa hora /
  abren a esa hora o antes / cierran a esa hora o después).
- Categorías creadas por el usuario, con emoji y nombre, que **aíslan** lista,
  mapa, modo paseo e importación. Administrar: crear, renombrar, borrar.
- Calificación propia de 0.1 a 5, con un decimal. 0 significa "sin calificar",
  no "malo".
- Marcar visitado, y mandar los visitados al final de la lista.
- Modo paseo: avisa con notificación cuando pasas cerca de un lugar abierto.
  Ajustes de radio, espera entre avisos, margen antes del cierre y solo no
  visitados. Mantiene la pantalla encendida con Wake Lock.
- Agregar: buscar por nombre, "cerca de mí", escribir a mano, pegar links de
  Google Maps, importar CSV / KML / KMZ / JSON, captura guiada una por una.
- Editar el detalle: categoría, calificación, horario día por día, pegar el
  horario de Google Maps e interpretarlo, notas, corregir ubicación en el mapa,
  buscar horario en OSM, eliminar.

Restricciones técnicas:

- **Sin paso de compilación, sin npm, sin framework.** HTML, CSS y JS a pelo.
  La máquina del usuario no tiene node ni npm.
- Leaflet 1.9.4 y OpenStreetMap por CDN. Nada más se descarga.
- El service worker cachea por versión; cualquier archivo nuevo tiene que
  entrar en su lista y subir el número de versión.
- Una web **no puede** leer el GPS en segundo plano. El modo paseo solo
  funciona con la app abierta y la pantalla encendida; esto es un límite del
  navegador, no una carencia a disimular.
- El usuario programa a nivel básico: el código y sus comentarios van en
  español y explican el porqué, no solo el qué.

Abierto, sin decidir:

- Dónde se publica (GitHub Pages con repo público, o Cloudflare Pages /
  Netlify con repo privado).
- Si el importador JSON debe conservar `visitada` y `categoria` al reimportar.

## Brand Commitments

- Nombre de la app: **Mis Lugares** (decisión del usuario, 2026-11-24).
  Sustituye a "Cafeterías", que se quedó corto cuando aparecieron las
  categorías.
- La palabra genérica en toda la interfaz es **lugar**, no "cafetería".
- Todo el texto visible va en **español de México**, en segunda persona
  ("tienes", "toca"), sin tecnicismos.
- La app nunca muestra la calificación de Google. La nota es del usuario.

## Evidence on Hand

- `ejemplos/ruta-del-cafe-cdmx.json`: 58 lugares reales de CDMX con nombre,
  dirección, coordenadas y horario de los 7 días. Contenido real, no inventado.
- `herramientas/extraer-lista-google.py`: extrae una lista compartida de Google
  Maps a JSON con coordenadas y horarios.
- `README.md`: registro de cada decisión técnica y de los resultados medidos.
- No existen: usuarios reales además del dueño, métricas, reseñas, precios ni
  despliegue público. Nada de eso debe inventarse.

## Product Principles

1. **Decidir, no explorar.** La pantalla responde "¿a dónde voy ahora?" antes
   que cualquier otra cosa.
2. **Mostrar la falla, no disimularla.** Si un horario no se pudo leer, si una
   ubicación quedó aproximada o si un servidor está saturado, la app lo dice.
   Nunca degrada en silencio.
3. **El dato es del usuario.** Su lista, su categoría, su calificación, su
   teléfono. Nada sale a un servidor.
4. **Gratis de verdad.** Ninguna función puede depender de una llave de pago.
5. **Una mano, en movimiento.** Los blancos táctiles y los contrastes se
   diseñan para alguien caminando, no para un escritorio.

## Accessibility & Inclusion

- Objetivo táctil mínimo de 44 px: se usa en movimiento, con una mano.
- Contraste mínimo AA (4.5:1 en texto, 3:1 en elementos de interfaz) en los dos
  temas, claro y oscuro, porque se usa bajo el sol y de noche.
- El estado abierto / cierra pronto / cerrado **nunca** se comunica solo por
  color: siempre lleva texto o forma.
- Respeta `prefers-reduced-motion` y `prefers-color-scheme`.
