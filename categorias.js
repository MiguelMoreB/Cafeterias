/* =========================================================================
   categorias.js — Agrupar los lugares por tipo
   -------------------------------------------------------------------------
   La app nació solo para cafeterías. Con categorías pasa a servir para
   bares, comida japonesa, panaderías o lo que quieras, sin que se mezclen
   en la lista ni en el mapa.

   Cada lugar guarda el `id` de su categoría. La categoría activa decide qué
   ves: si eliges "Bares", la lista y el mapa muestran solo bares, y lo que
   importes o agregues se guarda ahí. Con "Todas" ves todo junto, y en el
   mapa cada marcador lleva su emoji para distinguirlos.

   Nota sobre los nombres internos: el arreglo de lugares se sigue llamando
   `cafeterias` en el código. Renombrarlo tocaría cinco archivos y no aporta
   nada funcional; se deja así a propósito.
   ========================================================================= */

const CLAVE_CATEGORIAS = 'categorias_v1';
const CLAVE_CATEGORIA_ACTIVA = 'categoria_activa';
const TODAS = '__todas__';

// La que se crea sola la primera vez, para que lo que ya tenías no se pierda.
const CATEGORIA_INICIAL = { id: 'cat_cafeterias', nombre: 'Cafeterías', emoji: '☕' };

function leerCategorias() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_CATEGORIAS));
    if (Array.isArray(guardadas) && guardadas.length > 0) return guardadas;
  } catch (e) {
    console.warn('Categorías ilegibles, se reinician', e);
  }
  return [Object.assign({}, CATEGORIA_INICIAL)];
}

function guardarCategorias(lista) {
  localStorage.setItem(CLAVE_CATEGORIAS, JSON.stringify(lista));
}

function categoriaPorId(id) {
  return leerCategorias().find(c => c.id === id) || null;
}

/* ----------------------- La categoría que estás viendo ------------------ */

function categoriaActiva() {
  const guardada = localStorage.getItem(CLAVE_CATEGORIA_ACTIVA);
  if (guardada === TODAS) return TODAS;
  // Si la categoría guardada ya no existe (la borraste), caemos en la primera.
  return categoriaPorId(guardada) ? guardada : leerCategorias()[0].id;
}

function fijarCategoriaActiva(id) {
  localStorage.setItem(CLAVE_CATEGORIA_ACTIVA, id);
}

// La categoría donde cae lo nuevo. Con "Todas" seleccionada no hay una
// obvia, así que usamos la primera de la lista.
function categoriaParaGuardar() {
  const activa = categoriaActiva();
  return activa === TODAS ? leerCategorias()[0].id : activa;
}

// ¿Este lugar se ve con la categoría que está seleccionada?
function perteneceAVista(lugar) {
  const activa = categoriaActiva();
  return activa === TODAS || categoriaDeLugar(lugar) === activa;
}

// Los lugares guardados antes de que existieran las categorías no tienen
// el campo: se tratan como de la primera categoría.
function categoriaDeLugar(lugar) {
  // Si el id ya no existe (categoría borrada en otro dispositivo o datos
  // importados de otro teléfono), usamos la primera: si no, el lugar quedaría
  // invisible en todas las vistas salvo "Todas".
  const lista = leerCategorias();
  if (lugar.categoria && lista.some(c => c.id === lugar.categoria)) return lugar.categoria;
  return lista[0].id;
}

function emojiDeLugar(lugar) {
  const cat = categoriaPorId(categoriaDeLugar(lugar));
  return cat ? cat.emoji : '📍';
}

/* --------------------------- Crear y editar ----------------------------- */

function crearCategoria(nombre, emoji) {
  const limpio = String(nombre || '').trim();
  if (!limpio) return { ok: false, motivo: 'Ponle un nombre a la categoría.' };

  const lista = leerCategorias();
  if (lista.some(c => c.nombre.toLowerCase() === limpio.toLowerCase())) {
    return { ok: false, motivo: 'Ya tienes una categoría con ese nombre.' };
  }

  const nueva = {
    id: 'cat_' + Date.now().toString(36) + Math.random().toString(16).slice(2, 5),
    nombre: limpio,
    emoji: (String(emoji || '').trim() || '📍').slice(0, 4)
  };
  lista.push(nueva);
  guardarCategorias(lista);
  return { ok: true, categoria: nueva };
}

function renombrarCategoria(id, nombre, emoji) {
  const lista = leerCategorias();
  const cat = lista.find(c => c.id === id);
  if (!cat) return { ok: false, motivo: 'Esa categoría ya no existe.' };

  const limpio = String(nombre || '').trim();
  if (!limpio) return { ok: false, motivo: 'El nombre no puede quedar vacío.' };

  cat.nombre = limpio;
  if (emoji) cat.emoji = String(emoji).trim().slice(0, 4);
  guardarCategorias(lista);
  return { ok: true };
}

/* -------------------------------------------------------------------------
   Borrar una categoría es la operación delicada: puede tener lugares
   dentro. En vez de borrarlos en silencio, se mueven a otra categoría, y
   quien llama tiene que decir a cuál.
   ------------------------------------------------------------------------- */
function borrarCategoria(id, idDestino) {
  const lista = leerCategorias();
  if (lista.length <= 1) {
    return { ok: false, motivo: 'Tiene que quedar al menos una categoría.' };
  }
  if (!lista.some(c => c.id === id)) {
    return { ok: false, motivo: 'Esa categoría ya no existe.' };
  }

  let movidos = 0;
  for (const lugar of cafeterias) {
    if (categoriaDeLugar(lugar) === id) {
      lugar.categoria = idDestino;
      movidos++;
    }
  }
  if (movidos > 0) DB.guardar(cafeterias);

  guardarCategorias(lista.filter(c => c.id !== id));
  if (categoriaActiva() === id) fijarCategoriaActiva(leerCategorias()[0].id);
  return { ok: true, movidos };
}

function cuantosEnCategoria(id) {
  return cafeterias.filter(l => categoriaDeLugar(l) === id).length;
}

/* -------------------------------------------------------------------------
   Migración: a los lugares viejos (los que importaste antes de que esto
   existiera) se les pone la primera categoría. Se corre una vez al abrir.
   ------------------------------------------------------------------------- */
function migrarLugaresSinCategoria() {
  const primera = leerCategorias()[0].id;
  let cambios = 0;
  for (const lugar of cafeterias) {
    if (!lugar.categoria) {
      lugar.categoria = primera;
      cambios++;
    }
  }
  if (cambios > 0) DB.guardar(cafeterias);
  return cambios;
}
