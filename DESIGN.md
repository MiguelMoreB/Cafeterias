---
name: Mis Lugares
description: Tu lista es un talonario y el estado llega sellado encima.
colors:
  papel: "#f5eddd"
  papel-2: "#efe6d2"
  papel-3: "#e7dcc3"
  tinta: "#17120c"
  tinta-2: "#5d5039"
  tinta-3: "#776748"
  filete: "#cdbe9e"
  barra: "#17120c"
  tinta-barra: "#f5eddd"
  sello-abierta: "#146b43"
  sello-pronto: "#9e4807"
  sello-cerrada: "#5b45a0"
  sello-sin: "#6e6049"
  peligro: "#b3261e"
  marca: "#be2d1c"
  estrella: "#a8750c"
  foco: "#a62b1b"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  cifra:
    fontFamily: "Chivo Mono, ui-monospace, monospace"
    fontSize: "29px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.045em"
    fontVariation: "tabular-nums"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  label:
    fontFamily: "Chivo Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.14em"
rounded:
  sello: "4px"
  base: "6px"
  hoja: "14px"
  capsula: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
components:
  boton-primario:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.base}"
    padding: "0 15px"
    height: "44px"
    typography: "{typography.body}"
  boton-secundario:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.base}"
    padding: "0 15px"
    height: "44px"
  boton-peligro:
    backgroundColor: "transparent"
    textColor: "{colors.peligro}"
    rounded: "{rounded.base}"
    padding: "0 15px"
    height: "44px"
  sello-abierta:
    backgroundColor: "transparent"
    textColor: "{colors.sello-abierta}"
    rounded: "{rounded.sello}"
    padding: "3px 7px"
    typography: "{typography.label}"
  sello-cerrada:
    backgroundColor: "transparent"
    textColor: "{colors.sello-cerrada}"
    rounded: "{rounded.sello}"
    padding: "3px 7px"
    typography: "{typography.label}"
  campo:
    backgroundColor: "{colors.papel-2}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.base}"
    padding: "10px 12px"
    height: "44px"
  filtro-capsula:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.capsula}"
    padding: "0 13px"
    height: "38px"
  filtro-capsula-activo:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.capsula}"
    padding: "0 13px"
    height: "38px"
  accion-fuerte:
    backgroundColor: "{colors.marca}"
    textColor: "#ffffff"
    rounded: "{rounded.capsula}"
    padding: "0 14px"
    height: "44px"
---

# Design System: Mis Lugares

## Overview

**Creative North Star: "Boleto y Sello"**

La lista no es un catálogo: es un talonario. Cada lugar guardado es un boleto
impreso en cartulina cálida, y el dato que de verdad decide —¿está abierto?— no
se dice con un punto de color ni con una etiqueta discreta, sino que llega
**sellado encima**, con la palabra escrita y la estampa ladeada como si alguien
la hubiera puesto a mano. Lo que ya visitaste se imprime desvaído, que es lo que
le pasa a un boleto usado.

Es un sistema para leer de pie, con una mano, caminando por la calle. De ahí
salen casi todas sus reglas: la jerarquía la hace el tamaño y no el color (la
cifra de kilómetros va a 29px contra etiquetas de 11), el estado siempre lleva
texto además de tinta, y lo que más se toca vive abajo, en la zona del pulgar.
La anti-referencia explícita es el estándar de la categoría —tarjetas blancas
redondeadas con sombra, acento azul, botón flotante—, que reparte el peso por
igual entre nombre, dirección y estado cuando en la calle solo importan tres
cosas: qué es, si está abierto y a cuántos kilómetros.

El mundo es de imprenta, no de pantalla: color plano sin un solo degradado,
filetes de un píxel en lugar de cajas flotantes, y un papel que nunca es blanco
ni gris neutro. De noche el papel se vuelve tinta y las estampas se aclaran,
pero la gramática no cambia.

**Key Characteristics:**
- Cartulina cálida de fondo, tinta casi negra, cuatro tintas de sello.
- Cero degradados, cero sombras de color, cero tarjetas flotantes.
- La medida (km, horas, folios) siempre en monoespaciada de cifras tabulares.
- El estado nunca se comunica solo por color: la palabra va dentro del sello.
- Barras de tinta arriba y abajo; el talonario de papel en medio.

## Colors

La paleta es de taller de impresión: un solo papel, una sola tinta de texto, y
tintas de sello que solo se destapan para decir estado.

### Primary
- **Rojo de Estampa** (`#be2d1c`): la marca. El logo, la acción fuerte de la
  barra de abajo (Ubicación), el cursor de los campos y la selección de texto.
  No dice estado nunca.

### Secondary
- **Verde de Sello** (`#146b43`): abierto, y por extensión cualquier estado
  vivo: el modo paseo encendido, la ubicación concedida, el boleto ponchado.
- **Naranja Quemado** (`#9e4807`): cierra pronto.
- **Violeta de Tinta** (`#5b45a0`): cerrado. Es violeta y no rojo a propósito:
  "cerrado" no es un error, y el rojo ya está ocupado por la marca y por borrar.
- **Ocre Apagado** (`#6e6049`): sin horario. Siempre con el borde punteado.

### Tertiary
- **Oro de Calificación** (`#a8750c`): las estrellas y el deslizador. Separado
  de las tintas de sello a propósito, aunque se parezca al naranja: una nota no
  es un estado.

### Neutral
- **Cartulina** (`#f5eddd`): el fondo de todo. En oscuro, `#14110c`.
- **Cartulina Segunda** (`#efe6d2`): bandas alternas del talonario y campos.
- **Tinta** (`#17120c`): texto principal, botones primarios y las dos barras.
- **Tinta Segunda** (`#5d5039`): texto secundario. Teñida del papel, 6.7:1.
- **Tinta Tercera** (`#776748`): texto de pista y estrellas vacías, 4.7:1.
- **Filete** (`#cdbe9e`): la línea de un píxel que divide el talonario.

### Named Rules

**La Regla del Sello.** Las cuatro tintas de sello (verde, naranja, violeta,
ocre) solo dicen estado. No decoran, no marcan selección, no rellenan botones.
Si una pantalla nueva necesita un acento, usa tinta o el rojo de estampa.

**La Regla de la Palabra.** Ningún estado se comunica solo por color. El sello
siempre lleva su palabra —ABIERTO, CIERRA PRONTO, CERRADO, SIN HORARIO— porque
la app se usa con sol encima de la pantalla y porque el color solo excluye a
quien no distingue rojo de verde.

## Typography

**Display / Body Font:** Archivo (con `system-ui` de respaldo)
**Label / Mono Font:** Chivo Mono (con `ui-monospace` de respaldo)

Las dos son de Omnibus-Type, una fundición latinoamericana, y las dos viven
autoalojadas en `assets/fonts/` como fuentes variables: la app abre igual sin
internet. Archivo nació para formularios y titulares de prensa, así que aguanta
el peso 800 a 19px sin volverse decorativa; Chivo Mono le da a toda medida el
aire de cifra impresa en un boleto.

### Hierarchy
- **Display** (800, 22px, 1.15, -0.02em): títulos de modal.
- **Title** (800, 19px, 1.12, -0.015em): el nombre del lugar en cada boleto.
- **Cifra** (Chivo Mono 700, 29px, 1, -0.045em, `tabular-nums`): los kilómetros.
  Es el número que decide, y por eso es lo más grande de la pantalla.
- **Body** (400, 15px, 1.45): texto corrido. Columna máxima de 760px.
- **Label** (Chivo Mono 700, 11px, 0.14em, mayúsculas): folios, contadores,
  leyenda del mapa, días del editor de horario, encabezados de sección.

### Named Rules

**La Regla de la Medida.** Chivo Mono es para medir, no para "verse técnico":
kilómetros, horas, folios, calificaciones, rangos de horario. Texto corrido en
monoespaciada es un error del sistema.

**La Regla del Piso de 11.** Ningún texto funcional baja de 11px, por delicado
que se vea. La app se lee caminando.

## Layout

Una sola columna. En celular ocupa el ancho completo con 16px de respiro
lateral; a partir de 720px la columna se fija en 760px y se centra. Las dos
barras (cabecera y barra de abajo) siguen yendo de borde a borde porque son
mobiliario, no contenido, pero su contenido se alinea con esa misma columna
mediante `padding-inline: max(16px, calc((100% - 760px) / 2))`, sin envoltorios
extra en el HTML.

La barra de categorías es `sticky` arriba: cambiar de categoría es lo que más
cambia lo que ves. La barra de acciones es `fixed` abajo, con
`env(safe-area-inset-bottom)`, porque la app se usa con una mano y el pulgar no
llega a la esquina superior.

Ritmo de espaciado: 4 / 8 / 12 / 16 / 22. Dentro de un boleto, 11px arriba y
10 abajo, con 8px entre el bloque de nombre y la fila del sello. Blanco táctil
mínimo de 44px en todo lo que se toca; 38px en las cápsulas de filtro, que
viven dentro de una fila ya generosa.

Por debajo de 400px se encogen las **pestañas** (quedan en ícono), nunca los
botones de acción: un ícono de lista o de mapa se entiende solo, "Agregar" y
"Ubicación" no.

## Elevation & Depth

**No hay sistema de elevación.** Este mundo es de imprenta: la profundidad no
existe, la separación sí. Las jerarquías se construyen con tres recursos y solo
tres: el **filete** de un píxel que divide filas, la **banda alterna** de
`papel-2` en los boletos pares, y el **cambio de campo** (las barras de tinta
contra el papel).

Las dos únicas sombras del sistema son funcionales y están fuera del papel: el
globo de Leaflet sobre el mapa (`0 6px 20px rgba(0,0,0,.28)`) y el mensajito
flotante (`0 8px 24px rgba(0,0,0,.3)`). Ambas tienen desplazamiento y desenfoque
reales; un halo de color a cero píxeles de desplazamiento no es profundidad, es
adorno, y no entra.

### Named Rules

**La Regla del Papel Plano.** Nada de lo que vive sobre la cartulina proyecta
sombra. Si algo necesita separarse, lleva filete, banda o borde completo. Si
necesita un borde, es entero: un filete de un solo lado sobre una caja
redondeada es una costura, no un diseño.

## Shapes

Tres radios y nada más: **4px** para el sello, **6px** para campos y botones
rectangulares, **999px** para las cápsulas (filtros, pestañas, acciones de la
barra de abajo). La hoja del modal lleva 14px, pero solo arriba, porque sube
desde el borde inferior de la pantalla.

La silueta recurrente es el **rectángulo ladeado**: el sello gira −2.5°, los
marcadores del mapa y los puntos de la leyenda giran −8°, y el logo gira −11°.
Es lo que convierte una caja en una estampa puesta a mano.

Los íconos se dibujan a trazo **1.75** sobre rejilla de 24, con extremos y
uniones redondeados, y viven como `<symbol>` en un sprite al inicio del HTML.
Los emojis que aparecen en la app son los que el usuario escribe para sus
categorías: eso es un dato suyo, no iconografía del sistema.

## Components

**El Sello** — la jugada de la casa. Caja de borde 2px girada −2.5°, con la
palabra del estado en Chivo Mono 11px, versalitas, 0.12em. El color lo pone la
clase de estado; `desconocido` además cambia el borde a punteado. Al pintarse
hace una sola prensada (escala 1.12 → 1, rotación −5° → −2.5°, opacidad 0 → 1)
en 360ms con salida exponencial. Es el único movimiento autoral del sistema, y
`prefers-reduced-motion` lo apaga. Aparece en el talonario, en el detalle y en
el panel "cerca de ti": una sola forma para un solo dato.

**El Boleto** (`.tarjeta`) — rejilla de dos columnas separada por un filete.
Izquierda: folio (la posición dentro del orden elegido, y en el primero también
por qué va primero), nombre a 19px/800, dirección recortada a una línea.
Derecha: la cifra de kilómetros, centrada verticalmente, con su unidad debajo
en 11px. Abajo, cruzando las dos columnas: sello, detalle del horario,
calificación y el cuadro de ponchado. Al visitarse, todo el boleto baja a 52%
de opacidad, el nombre se tacha y el folio gana " · visitado".

**Cápsula de estado** (`.capsula`, modo paseo) — el chip empieza a la izquierda
y **cruza** a la derecha al encenderse, con la cápsula cambiando de relleno a la
vez. No es un interruptor genérico: es el único control del sistema que anuncia
que algo está corriendo.

**Cápsula de filtro** (`.filtro`) — aro con un chip hueco; al activarse el aro
se rellena de tinta y el chip se vuelve sólido. Checkbox real por debajo, con
anillo de foco propio.

**Cuadro de ponchado** (`.visitada-caja`) — blanco táctil de 44px con un cuadro
de 24px dentro. Marcado: relleno verde y una palomita dibujada en SVG embebido,
nunca un carácter tipográfico.

**Estrellas** — cinco botones de 42px, cada uno con un glifo de 30px. El relleno
parcial son **dos estrellas encimadas**: la gris de base y la dorada encima,
recortada con `clip-path: inset()` al porcentaje. El recorte se mide sobre el
glifo, nunca sobre el botón: el botón mide 42px y la estrella 30, así que
medirlo sobre el botón haría que un 4.1 se viera vacío y un 4.9 lleno.

**Campos** — fondo `papel-2`, borde `filete` de 1.5px, radio 6, 44px de alto.
Los `select` traen su flecha dibujada con dos degradados de 45°, no una imagen.

**Barra de abajo** — campo de tinta fijo. Izquierda: pestañas Lista/Mapa como
segmento con relleno de 3px y la activa en pastilla invertida. Derecha: Agregar
(contorno) y Ubicación (relleno de marca, que pasa a verde cuando la ubicación
ya está concedida).

**Marcadores del mapa** — cuadro de 18px girado −8° con borde de 3px en la tinta
de estado y relleno de papel; con varias categorías, 28px con el emoji dentro.
Repiten a propósito la forma del sello. Tu posición es un disco con borde de
marca y un halo del mismo color al 24%.

## Do's and Don'ts

**Do** usar filete, banda alterna o borde entero para separar; el sistema no
tiene sombras sobre el papel.
**Do** poner toda medida en Chivo Mono con cifras tabulares, para que las
columnas de kilómetros se comparen de un vistazo.
**Do** escribir la palabra dentro de cada sello, siempre, aunque el color ya lo
diga.
**Do** dejar los emojis de categoría como están: son datos del usuario.
**Do** probar cualquier pantalla nueva en los dos temas; el tema oscuro no es
una variante, es la mitad del uso.

**Don't** usar las tintas de sello para nada que no sea estado.
**Don't** meter degradados, vidrio esmerilado ni sombras de color.
**Don't** envolver los boletos en tarjetas con sombra: eso es exactamente el
estándar de categoría que este mundo rechaza.
**Don't** bajar texto funcional de 11px.
**Don't** sustituir un ícono por un emoji o por un carácter tipográfico; se
dibuja en el sprite, a trazo 1.75.
**Don't** poner un filete de un solo lado sobre una caja redondeada.
**Don't** añadir un segundo momento de movimiento: la prensada del sello es el
único, y existe para que el dato más importante se note al llegar.
