// ── BÚSQUEDA GLOBAL ──────────────────────────────────────────────────────────
// Busca simultáneamente en Colchones (stock), Muebles (stock_muebles),
// Revestimientos (stock_revestimientos, todos los proveedores) y Lista de
// Precios (lista_precios) — solo en los módulos permitidos para el usuario
// activo (ver getPermissions() en js/auth.js). Reutiliza los mismos loaders y
// helpers de búsqueda que ya usan esos módulos (cargarVentaStock()/
// getVentaStockItems() de js/ventas.js, cargarListaPrecios()/resaltarTerminos()
// de js/lista-precios.js) en vez de duplicar lógica.

const BUSQUEDA_GLOBAL_MIN_CHARS   = 2;
const BUSQUEDA_GLOBAL_DEBOUNCE_MS = 300;
const BUSQUEDA_GLOBAL_MAX_ITEMS   = 5;
const BUSQUEDA_GLOBAL_HIST_KEY    = 'muhn_busquedas_recientes';
const BUSQUEDA_GLOBAL_HIST_MAX    = 5;

// Stock de Muebles de TODOS los proveedores, cargado en una sola consulta —
// mismo patrón que ventaStockCache en js/ventas.js: no se pisa lo que ya haya
// cargado la UI de Muebles (stockMuebles), solo se completa lo que falte.
let busquedaGlobalMueblesCache   = [];
let busquedaGlobalMueblesCargado = false;
async function cargarTodosMuebles() {
  if (busquedaGlobalMueblesCargado) return;
  busquedaGlobalMueblesCache = await sbRequest('GET',
    '?select=id,proveedor,codigo,descripcion,cantidad&order=proveedor.asc,descripcion.asc',
    null, 'stock_muebles') || [];
  busquedaGlobalMueblesCargado = true;
}
function getTodosMuebles() {
  const porProveedor = {};
  busquedaGlobalMueblesCache.forEach(r => { (porProveedor[r.proveedor] = porProveedor[r.proveedor] || []).push(r); });
  Object.keys(stockMuebles).forEach(p => { porProveedor[p] = stockMuebles[p]; }); // lo ya cargado por la UI manda
  return Object.values(porProveedor).flat();
}

// ── CONFIGURACIÓN POR MÓDULO ─────────────────────────────────────────────────
// cargar()  trae los datos si todavía no están en memoria (no hace nada si ya lo están)
// items()   devuelve el array plano a buscar
// ir()      navega al módulo, ejecuta la búsqueda ahí y hace scroll al resultado
const BUSQUEDA_GLOBAL_MODULOS = [
  {
    id: 'colchones', permiso: 'colchones', icono: '🛏', nombre: 'Colchones', claseBadge: 'bg-colchones',
    cargar: async () => { if (!stockColchones.length) await loadStock(); },
    items: () => stockColchones,
    ir: async (item, termino) => {
      await switchModule('colchones');
      const el = document.getElementById('searchInput');
      if (el) el.value = termino;
      renderTable();
      busquedaGlobalScrollAResultado(item.id);
    }
  },
  {
    id: 'muebles', permiso: 'muebles', icono: '🪑', nombre: 'Muebles', claseBadge: 'bg-muebles',
    cargar: cargarTodosMuebles,
    items: getTodosMuebles,
    ir: async (item, termino) => {
      await switchModule('muebles');
      await switchProveedor('muebles', item.proveedor);
      const el = document.getElementById('searchInputGenerico');
      if (el) el.value = termino;
      renderTable();
      busquedaGlobalScrollAResultado(item.id);
    }
  },
  {
    id: 'revestimientos', permiso: 'revestimientos', icono: '🏗', nombre: 'Revestimientos', claseBadge: 'bg-revestimientos',
    cargar: cargarVentaStock,
    items: getVentaStockItems,
    ir: async (item, termino) => {
      await switchModule('revestimientos');
      switchRevestSubview('stock');
      await switchProveedor('revestimientos', item.proveedor);
      const el = document.getElementById('searchInputGenerico');
      if (el) el.value = termino;
      renderTable();
      busquedaGlobalScrollAResultado(item.id);
    }
  },
  {
    id: 'precios', permiso: 'revestimientos', icono: '💰', nombre: 'Lista de Precios', claseBadge: 'bg-precios',
    cargar: cargarListaPrecios,
    items: () => listaPrecios,
    ir: async (item, termino) => {
      await switchModule('revestimientos');
      switchRevestSubview('precios');
      const fuente = LISTA_PRECIOS_FUENTES.find(f => f.filtro(item));
      if (fuente) switchListaPreciosFuente(fuente.id);
      const catSel = document.getElementById('preciosFiltroCategoria');
      if (catSel) { catSel.value = 'all'; renderCategoriaDropdownList(); }
      const el = document.getElementById('preciosBuscar');
      if (el) el.value = termino;
      renderListaPreciosResultados();
      busquedaGlobalScrollAResultado(item.id);
    }
  }
];

function busquedaGlobalScrollAResultado(id) {
  setTimeout(() => {
    const fila = document.querySelector(`[data-id="${id}"]`);
    if (!fila) return;
    fila.scrollIntoView({ block: 'center', behavior: 'smooth' });
    fila.classList.add('busqueda-global-flash');
    setTimeout(() => fila.classList.remove('busqueda-global-flash'), 1600);
  }, 200); // le da tiempo al renderTable()/renderListaPreciosResultados() de recién llamarse
}

// ── HISTORIAL DE BÚSQUEDAS RECIENTES ─────────────────────────────────────────
function busquedaGlobalGetHistorial() {
  try { return JSON.parse(sessionStorage.getItem(BUSQUEDA_GLOBAL_HIST_KEY)) || []; }
  catch (e) { return []; }
}
function busquedaGlobalGuardarHistorial(termino) {
  try {
    let hist = busquedaGlobalGetHistorial().filter(t => t.toLowerCase() !== termino.toLowerCase());
    hist.unshift(termino);
    hist = hist.slice(0, BUSQUEDA_GLOBAL_HIST_MAX);
    sessionStorage.setItem(BUSQUEDA_GLOBAL_HIST_KEY, JSON.stringify(hist));
  } catch (e) { /* sessionStorage no disponible: se omite el historial, no es crítico */ }
}

// ── APERTURA / CIERRE DEL MODAL ──────────────────────────────────────────────
function abrirBusquedaGlobal() {
  if (!getCurrentUser()) return;
  const overlay = document.getElementById('busquedaGlobalOverlay');
  const input   = document.getElementById('busquedaGlobalInput');
  if (!overlay || !input) return;
  overlay.hidden = false;
  input.value = '';
  busquedaGlobalRenderEstadoInicial();
  setTimeout(() => input.focus(), 50);
}

function cerrarBusquedaGlobal() {
  const overlay = document.getElementById('busquedaGlobalOverlay');
  if (overlay) overlay.hidden = true;
  clearTimeout(busquedaGlobalDebounceTimer);
  busquedaGlobalSesion++; // invalida cualquier búsqueda en curso
}

function busquedaGlobalOnKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); cerrarBusquedaGlobal(); }
}

// Ctrl+K / Cmd+K abre (o cierra si ya está abierta) el buscador desde cualquier pantalla
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') {
    e.preventDefault();
    const overlay = document.getElementById('busquedaGlobalOverlay');
    if (overlay && !overlay.hidden) cerrarBusquedaGlobal();
    else abrirBusquedaGlobal();
  }
});

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
let busquedaGlobalDebounceTimer = null;
let busquedaGlobalSesion = 0;

function busquedaGlobalOnInput() {
  const termino = document.getElementById('busquedaGlobalInput').value;
  clearTimeout(busquedaGlobalDebounceTimer);
  if (termino.trim().length < BUSQUEDA_GLOBAL_MIN_CHARS) {
    busquedaGlobalSesion++; // corta cualquier búsqueda en vuelo, ya no aplica
    busquedaGlobalRenderEstadoInicial();
    return;
  }
  busquedaGlobalDebounceTimer = setTimeout(() => busquedaGlobalEjecutar(termino), BUSQUEDA_GLOBAL_DEBOUNCE_MS);
}

function busquedaGlobalRenderEstadoInicial() {
  const body = document.getElementById('busquedaGlobalBody');
  if (!body) return;
  const termino = document.getElementById('busquedaGlobalInput')?.value.trim() || '';
  if (termino.length > 0) { body.innerHTML = ''; return; } // 1 caracter: esperar a que escriba más, sin mensaje
  const hist = busquedaGlobalGetHistorial();
  if (!hist.length) { body.innerHTML = ''; return; }
  body.innerHTML = `
    <div class="busqueda-global-recientes">
      <div class="busqueda-global-recientes-titulo">Búsquedas recientes:</div>
      <div class="busqueda-global-chips">
        ${hist.map(t => `<button type="button" class="busqueda-global-chip" onclick="busquedaGlobalDesdeChip('${esc(t).replace(/'/g, "\\'")}')">${esc(t)}</button>`).join('')}
      </div>
    </div>`;
}

function busquedaGlobalDesdeChip(termino) {
  const input = document.getElementById('busquedaGlobalInput');
  if (!input) return;
  input.value = termino;
  busquedaGlobalEjecutar(termino);
}

async function busquedaGlobalEjecutar(terminoCrudo) {
  const termino = terminoCrudo.trim();
  if (termino.length < BUSQUEDA_GLOBAL_MIN_CHARS) return;
  const sesion = ++busquedaGlobalSesion;
  const body = document.getElementById('busquedaGlobalBody');
  if (!body) return;

  const tokens = tokenizarBusquedaPrecios(termino);
  const permisos = getPermissions();
  const modulos = BUSQUEDA_GLOBAL_MODULOS.filter(m => permisos.includes(m.permiso));

  // Spinner inmediato; el texto "Buscando..." solo aparece si tarda más de 2s
  // (con datos ya en memoria una búsqueda es instantánea y nunca llega a verse)
  body.innerHTML = `<div class="busqueda-global-cargando"><div class="spinner"></div><span id="busquedaGlobalCargandoTexto"></span></div>`;
  const timerLento = setTimeout(() => {
    if (sesion !== busquedaGlobalSesion) return;
    const t = document.getElementById('busquedaGlobalCargandoTexto');
    if (t) t.textContent = 'Buscando...';
  }, 2000);

  try {
    await Promise.all(modulos.map(m => m.cargar()));
  } catch (e) {
    console.error(e);
  }
  clearTimeout(timerLento);
  if (sesion !== busquedaGlobalSesion) return; // el usuario ya cerró o escribió otra cosa

  const resultados = modulos.map(m => {
    const coincidencias = m.items().filter(item => {
      const haystack = normalizarPreservandoIndices(`${item.descripcion} ${item.codigo || ''}`);
      return tokens.every(t => haystack.includes(t));
    });
    return { modulo: m, coincidencias };
  }).filter(r => r.coincidencias.length > 0);

  if (!resultados.length) {
    body.innerHTML = `<div class="empty-state"><span class="icon">🔍</span><p>No se encontraron resultados para '${esc(termino)}'</p></div>`;
    busquedaGlobalGuardarHistorial(termino);
    return;
  }

  body.innerHTML = resultados.map(r => busquedaGlobalRenderSeccion(r.modulo, r.coincidencias, tokens, termino)).join('');
  busquedaGlobalGuardarHistorial(termino);
}

function busquedaGlobalRenderSeccion(modulo, coincidencias, tokens, termino) {
  const visibles = coincidencias.slice(0, BUSQUEDA_GLOBAL_MAX_ITEMS);
  const restantes = coincidencias.length - visibles.length;
  return `
    <div class="busqueda-global-seccion">
      <div class="busqueda-global-seccion-titulo">
        <span>${modulo.icono} ${modulo.nombre.toUpperCase()}</span>
        <span class="busqueda-global-seccion-count">(${coincidencias.length} resultado${coincidencias.length === 1 ? '' : 's'})</span>
      </div>
      ${visibles.map(item => busquedaGlobalRenderItem(modulo, item, tokens, termino)).join('')}
      ${restantes > 0 ? `<button type="button" class="busqueda-global-ver-mas" onclick="busquedaGlobalVerMas('${modulo.id}', '${esc(termino).replace(/'/g, "\\'")}')">Ver los ${restantes} restantes en ${esc(modulo.nombre)} →</button>` : ''}
    </div>`;
}

function busquedaGlobalRenderItem(modulo, item, tokens, termino) {
  const cantidad = item.cantidad;
  const tieneCantidad = cantidad !== undefined;
  const sinStock = tieneCantidad && cantidad <= 0;
  const precio = modulo.id === 'precios' ? item.precio_con_iva : item.precio;
  const idx = BUSQUEDA_GLOBAL_MODULOS.indexOf(modulo);
  return `
    <button type="button" class="busqueda-global-item" onclick="busquedaGlobalIrAResultado(${idx}, ${item.id}, '${esc(termino).replace(/'/g, "\\'")}')">
      <span class="busqueda-global-item-badge ${modulo.claseBadge}">${modulo.nombre}</span>
      <span class="busqueda-global-item-info">
        <span class="busqueda-global-item-codigo">${esc(item.codigo || '—')}</span>
        <span class="busqueda-global-item-desc">${resaltarTerminos(item.descripcion, tokens, 'strong', '')}</span>
      </span>
      <span class="busqueda-global-item-dato">
        ${sinStock ? '<span class="busqueda-global-sin-stock">Sin stock</span>' : ''}
        ${!sinStock && tieneCantidad ? `<span class="busqueda-global-cantidad">${cantidad} u.</span>` : ''}
        ${precio ? `<span class="busqueda-global-precio">${formatPrecio(precio)}</span>` : ''}
      </span>
    </button>`;
}

async function busquedaGlobalIrAResultado(idxModulo, id, termino) {
  const modulo = BUSQUEDA_GLOBAL_MODULOS[idxModulo];
  if (!modulo) return;
  const item = modulo.items().find(i => i.id === id);
  if (!item) return;
  cerrarBusquedaGlobal();
  await modulo.ir(item, termino);
}

async function busquedaGlobalVerMas(moduloId, termino) {
  const modulo = BUSQUEDA_GLOBAL_MODULOS.find(m => m.id === moduloId);
  if (!modulo) return;
  const tokens = tokenizarBusquedaPrecios(termino);
  const primero = modulo.items().find(item => {
    const haystack = normalizarPreservandoIndices(`${item.descripcion} ${item.codigo || ''}`);
    return tokens.every(t => haystack.includes(t));
  });
  cerrarBusquedaGlobal();
  if (primero) await modulo.ir(primero, termino);
  else await switchModule(modulo.id === 'precios' ? 'revestimientos' : modulo.id);
}
