---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["styles.css","app.js"]
---

Scope: la pantalla única de la PWA (lista, mapa y sus modales). Modo del visitante: Operate.

Audiencia: una persona sola, de pie, con una mano, en la calle de la CDMX, de día y de noche.
Trabajo: decidir a dónde ir ahora (cerca + abierto) y llevar su registro (visitado + su propia calificación). Tercero: planear otro día por hora.
Acción principal: tocar un lugar y saber en un segundo si está abierto y a cuántos km.
Contenido real: `ejemplos/ruta-del-cafe-cdmx.json`, 58 lugares de CDMX con horarios completos.
Restricciones: sin build, sin npm, sin framework; Leaflet por CDN; todo en `localStorage`; tipografías autoalojadas; español de México; se construye clara y oscura.

## Direction contract

THESIS: la lista es un talonario y el estado llega sellado encima. Esta pantalla
se niega al arreglo por defecto de la categoría —tarjetas blancas redondeadas
con sombra, acento azul y botón flotante— porque esa tarjeta reparte el peso
por igual entre nombre, dirección y estado, y en la calle solo importan tres
datos: qué es, si está abierto y a cuántos km.

OWN-WORLD: cartulina de boleto cálida (#F5EDDD claro / #15120E oscuro), tinta
casi negra, filetes de un píxel en lugar de cajas, y cuatro tintas de sello que
solo se usan para estado: verde abierta, naranja cierra pronto, violeta cerrada,
ocre punteado sin horario. Archivo autoalojada para texto, Chivo Mono para toda
medida (km, horas, folios). Cero degradados, cero sombras de color, cero
tarjetas flotantes. Iconos SVG dibujados a trazo 1.75 en rejilla de 24; los
emojis que se vean son los que el usuario escribió para sus categorías, que son
datos, no iconografía.

STORY: el usuario abre la app en la banqueta, lee el sello del primer boleto y
la cifra de kilómetros sin enfocar la vista, y camina. Al volver, marca el
boleto como visitado y le pone su nota. Entiende que la lista es suya y que la
app no opina.

FIRST VIEWPORT: cabecera con el nombre y el interruptor del modo paseo; debajo,
la tira de pestañas de categoría como lengüetas de talonario. Luego el campo de
búsqueda y una fila de cápsulas de filtro con el conteo a la derecha. El resto
de la pantalla es el filo de boletos, separados por filetes de un píxel: folio
y nombre a la izquierda, dirección en una línea, y a la derecha la cifra de
kilómetros en Chivo Mono a 30px. Bajo cada nombre, el sello del estado con su
palabra, la hora y la calificación. La acción principal vive abajo, en la zona
del pulgar: conmutador Lista/Mapa a la izquierda, agregar y ubicación a la
derecha.

FORM: «Boleto y Sello», séptima de mis siete direcciones ordenadas por
resonancia (Metro, rotulación, pizarrón de mercado, lotería, talavera, papel
picado, boleto y sello). seed:bff3c3b4606f0eb7

Raises recibidos de las descartadas:
- de variable-font-specimen: jerarquía por escala, no por color — la cifra de km
  enorme contra etiquetas monoespaciadas de 9px.
- de aww2-zoo-gardens-guide-map: color plano total, y el modo paseo como cápsula
  cuyo chip cruza al encenderse.
- de design-annual-s-plate-section: filetes de un píxel en lugar de tarjetas,
  sobre papel cálido que nunca es gris neutro.
- de pop-culture-shelf-character-goods-catalog: el orden es estado visible — cada
  boleto lleva su folio, que es su posición en el orden actual.

Retadores que quedaron como alternativas vivas: mapa de orientación ISOM
(gana en claridad, pierde en identificación) y carpeta de cupones de aerolínea
(mismo mecanismo, más lejos de casa).

Signature move: el sello. Un componente `.sello` rotado -2.5°, borde de 2px y
versalitas monoespaciadas, que aparece en la lista, en el detalle y en el globo
del mapa, y que al pintarse hace una sola prensada (escala 1.06 → 1) con salida
exponencial, anulada bajo `prefers-reduced-motion`. Lo visitado recibe un
segundo sello y se imprime desvaído, como un boleto usado.

Decisiones abiertas: dónde se publica la app; si el importador JSON debe
conservar `visitada` y `categoria` al reimportar.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
