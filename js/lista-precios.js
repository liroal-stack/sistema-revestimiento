// ── LISTA DE PRECIOS (dentro de Revestimientos) ──────────────────────────────
// Buscador rápido de consulta contra la tabla `lista_precios` de Supabase.
// No tiene relación obligatoria con el stock: un artículo puede tener precio
// sin estar en stock (y viceversa) — se muestra un indicador para cada caso.
// Carga lazy: solo se pide a Supabase la primera vez que se entra a esta sub-vista.

let listaPrecios        = [];
let listaPreciosCargada = false;

// ── FUENTES DE LA LISTA DE PRECIOS ────────────────────────────────────────────
// Todos los artículos de lista_precios se traen en una sola consulta (son pocos)
// y cada "fuente" es simplemente un filtro sobre ese array, según el proveedor
// (u otro campo, si hiciera falta) que corresponda a ese catálogo. Para sumar
// una lista nueva en el futuro alcanza con agregar un objeto acá — la pestaña,
// el filtro de categorías y los resultados se arman solos a partir de esto.
const LISTA_PRECIOS_FUENTES = [
  {
    id: 'ccs',
    nombreCorto: 'CCS',
    nombreCompleto: 'Centro Construcción en Seco',
    filtro: item => item.proveedor === 'CCS'
  },
  {
    id: 'atm',
    nombreCorto: 'ATM',
    nombreCompleto: 'MAXIPLACAS (ATM Maderas)',
    filtro: item => item.proveedor === 'MAXIPLACAS (ATM MADERAS)'
  },
  {
    id: 'crev',
    nombreCorto: 'CREV',
    nombreCompleto: 'Cordoba Revestimiento',
    filtro: item => item.proveedor === 'Cordoba Revestimiento'
  }
];

let listaPreciosFuenteActiva = LISTA_PRECIOS_FUENTES[0]?.id || null;

function getListaPreciosFuenteActiva() {
  return LISTA_PRECIOS_FUENTES.find(f => f.id === listaPreciosFuenteActiva) || null;
}

// Artículos de listaPrecios que pertenecen a la fuente activa (o todos, si por
// algún motivo no hay ninguna fuente configurada)
function getItemsFuenteActiva() {
  const fuente = getListaPreciosFuenteActiva();
  return fuente ? listaPrecios.filter(fuente.filtro) : listaPrecios;
}

// ── CONVERSOR DE DÓLAR (solo pestaña "crev") ──────────────────────────────────
// Los artículos de la categoría "Cordoba Revestimiento - PVC" vienen con
// precio_sin_iva en USD; el resto de las fuentes (CCS, ATM, y "Cordoba
// Revestimiento - WPC") ya está en ARS. Esto es puramente una conversión de
// vista: nunca se escribe nada a Supabase.
const DOLAR_BNA_API_URL     = 'https://dolarapi.com/v1/dolares/oficial';
const DOLAR_BNA_TIMEOUT_MS  = 5000;

let dolarBNA                  = null;  // valor actualmente aplicado a la tabla (o null si no se cargó aún)
let dolarBNAUltimaActualizacion = null;  // Date de la última carga EXITOSA desde la API (null si el valor actual es manual)
let dolarBNAIntentoAutoCarga  = false; // evita reintentar solo la API cada vez que se vuelve a la pestaña

function esItemEnDolares(item) {
  return (item.categoria || '').includes('Cordoba Revestimiento - PVC');
}

// El "$ valor" grande del widget siempre refleja el tipo de cambio actualmente
// aplicado a la tabla; el input de carga manual es un campo aparte (no se
// autocompleta con la carga automática) para no pisarle al usuario lo que
// esté escribiendo si la API tarda en responder.
function formatearValorDolar(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actualizarValorDolarUI() {
  const valorEl = document.getElementById('preciosDolarValor');
  if (valorEl) valorEl.textContent = formatearValorDolar(dolarBNA);
}

function renderDolarWidget() {
  const widget = document.getElementById('preciosDolarWidget');
  if (!widget) return;
  widget.hidden = listaPreciosFuenteActiva !== 'crev';
  if (!widget.hidden) {
    actualizarValorDolarUI();
    actualizarMetaDolar();
  }
}

function actualizarMetaDolar(mensaje) {
  const meta = document.getElementById('preciosDolarMeta');
  if (!meta) return;
  if (mensaje) {
    meta.textContent = mensaje;
  } else if (dolarBNAUltimaActualizacion) {
    const hh = String(dolarBNAUltimaActualizacion.getHours()).padStart(2, '0');
    const mm = String(dolarBNAUltimaActualizacion.getMinutes()).padStart(2, '0');
    meta.textContent = `Última actualización: ${hh}:${mm} hs`;
  } else {
    meta.textContent = '';
  }
}

async function cargarDolarBNA() {
  dolarBNAIntentoAutoCarga = true;
  const btn = document.getElementById('preciosDolarActualizarBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  actualizarMetaDolar('Consultando BNA…');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOLAR_BNA_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(DOLAR_BNA_API_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const venta = Number(data.venta);
    if (!isFinite(venta) || venta <= 0) throw new Error('Valor inválido');

    dolarBNA = venta;
    dolarBNAUltimaActualizacion = new Date();
    actualizarValorDolarUI();
    actualizarMetaDolar();
    renderListaPreciosResultados();
  } catch (e) {
    dolarBNAUltimaActualizacion = null;
    actualizarMetaDolar('No se pudo obtener el valor automáticamente');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar desde BNA'; }
  }
}

function aplicarDolarManual() {
  const input = document.getElementById('preciosDolarInput');
  if (!input) return;
  const valor = Number((input.value || '').trim().replace(',', '.'));
  if (!isFinite(valor) || valor <= 0) {
    showToast('Ingresá un valor de dólar válido', 'error');
    return;
  }
  dolarBNA = valor;
  dolarBNAUltimaActualizacion = null; // valor manual: no viene de la API
  actualizarValorDolarUI();
  actualizarMetaDolar();
  renderListaPreciosResultados();
}

function renderListaPreciosFuenteTabs() {
  const wrap = document.getElementById('preciosFuenteTabs');
  if (!wrap) return;
  wrap.innerHTML = LISTA_PRECIOS_FUENTES.map(f => `
    <button class="precios-fuente-tab ${f.id === listaPreciosFuenteActiva ? 'active' : ''}"
      onclick="switchListaPreciosFuente('${f.id}')" title="${esc(f.nombreCompleto)}">
      <span class="precios-fuente-nombre">${esc(f.nombreCorto)}</span>
      <span class="precios-fuente-subtitulo">${esc(f.nombreCompleto)}</span>
    </button>`).join('');
}

function switchListaPreciosFuente(fuenteId) {
  if (listaPreciosFuenteActiva === fuenteId) return;
  listaPreciosFuenteActiva = fuenteId;
  renderListaPreciosFuenteTabs();
  const buscar = document.getElementById('preciosBuscar');
  if (buscar) buscar.value = '';
  poblarPreciosFiltroCategoria();
  renderDolarWidget();
  renderListaPreciosResultados();

  if (fuenteId === 'crev' && dolarBNA === null && !dolarBNAIntentoAutoCarga) {
    cargarDolarBNA();
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function initListaPrecios() {
  if (!listaPreciosCargada) {
    setLoading(true);
    try {
      listaPrecios = await sbRequest('GET', '?select=*&order=categoria.asc,descripcion.asc', null, 'lista_precios') || [];
      console.log(`[lista-precios] Supabase devolvió ${listaPrecios.length} registros de lista_precios`);
      listaPreciosCargada = true;
      poblarPreciosFiltroCategoria();
    } catch(e) {
      showToast('Error al cargar la lista de precios', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  renderListaPreciosFuenteTabs();
  renderDolarWidget();
  renderListaPreciosResultados();
}

function poblarPreciosFiltroCategoria() {
  const sel = document.getElementById('preciosFiltroCategoria');
  if (!sel) return;
  const categorias = [...new Set(getItemsFuenteActiva().map(i => i.categoria).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const actual = sel.value;
  sel.innerHTML = '<option value="all">Todas las categorías</option>' +
    categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === actual) ? actual : 'all';
  renderCategoriaDropdownList();
}

// ── DROPDOWN PERSONALIZADO DE CATEGORÍAS ──────────────────────────────────────
// El <select> nativo #preciosFiltroCategoria sigue siendo la única fuente de
// verdad del valor elegido (arriba lo rellena poblarPreciosFiltroCategoria());
// esto es solo la capa visual/interactiva de filas alternadas encima. Elegir
// una opción acá actualiza ese <select> y llama a renderListaPreciosResultados()
// — lo mismo que dispararía su "onchange" si se usara directamente.

// Reconstruye la lista de <li> a partir de las <option> del select oculto, y
// resalta cuál está seleccionada. Se llama cada vez que cambian las categorías
// disponibles (poblarPreciosFiltroCategoria) o cambia la selección.
function renderCategoriaDropdownList() {
  const nativeSel = document.getElementById('preciosFiltroCategoria');
  const list = document.getElementById('preciosCategoriaList');
  if (!nativeSel || !list) return;

  list.innerHTML = [...nativeSel.options].map(opt => {
    const seleccionada = opt.value === nativeSel.value;
    return `<li class="precios-categoria-opt ${seleccionada ? 'selected' : ''}"
        role="option" aria-selected="${seleccionada}"
        onclick="seleccionarCategoria('${opt.value.replace(/'/g, "\\'")}')">
        ${esc(opt.textContent)}
      </li>`;
  }).join('');

  const label = document.getElementById('preciosCategoriaLabel');
  const actual = [...nativeSel.options].find(o => o.value === nativeSel.value);
  if (label) label.textContent = actual ? actual.textContent : 'Todas las categorías';
}

function toggleCategoriaDropdown(forzarCerrado) {
  const dropdown = document.getElementById('preciosCategoriaDropdown');
  const btn = document.getElementById('preciosCategoriaBtn');
  if (!dropdown || !btn) return;
  const abrir = forzarCerrado === true ? false : !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', abrir);
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
}

function seleccionarCategoria(valor) {
  const nativeSel = document.getElementById('preciosFiltroCategoria');
  if (!nativeSel) return;
  nativeSel.value = valor;
  renderCategoriaDropdownList();
  toggleCategoriaDropdown(true);
  renderListaPreciosResultados();
}

// Cerrar el dropdown al tocar/clickear fuera de él (desktop y mobile: el touch
// también dispara "click" en los navegadores)
document.addEventListener('click', e => {
  const dropdown = document.getElementById('preciosCategoriaDropdown');
  if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target)) {
    toggleCategoriaDropdown(true);
  }
});

// Normaliza para búsqueda insensible a mayúsculas/minúsculas y acentos
function normalizarBusquedaPrecios(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Misma normalización pero SIN trim: al no recortar espacios, cada carácter del
// resultado queda en el mismo índice que en el string original (los acentos
// precompuestos de una letra se decomponen a "letra base" + marca diacrítica,
// y al quitar la marca vuelve a quedar 1 carácter — el largo no cambia). Eso es
// lo que permite resaltarTerminos() ubicar las coincidencias en el texto original
// sin tener que armar un mapa de índices aparte.
function normalizarPreservandoIndices(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Separa la búsqueda en palabras normalizadas, descartando las de 1 carácter
// (no aportan significado y solo generarían ruido en los resultados).
function tokenizarBusquedaPrecios(str) {
  return normalizarBusquedaPrecios(str).split(/\s+/).filter(t => t.length >= 2);
}

// Envuelve en <mark> las coincidencias de `terminos` dentro de `texto`, sobre el
// texto original (con sus acentos/mayúsculas tal cual), escapando todo el resto
// para no introducir HTML. Si un término aparece varias veces, o dos términos se
// superponen, los rangos se fusionan para no anidar/romper el marcado.
function resaltarTerminos(texto, terminos) {
  if (!terminos || !terminos.length) return esc(texto);
  const normTexto = normalizarPreservandoIndices(texto);

  const rangos = [];
  terminos.forEach(t => {
    let desde = 0;
    let pos;
    while ((pos = normTexto.indexOf(t, desde)) !== -1) {
      rangos.push([pos, pos + t.length]);
      desde = pos + 1;
    }
  });
  if (!rangos.length) return esc(texto);

  rangos.sort((a, b) => a[0] - b[0]);
  const fusionados = [rangos[0]];
  for (let i = 1; i < rangos.length; i++) {
    const ultimo = fusionados[fusionados.length - 1];
    if (rangos[i][0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], rangos[i][1]);
    else fusionados.push(rangos[i]);
  }

  let html = '';
  let cursor = 0;
  fusionados.forEach(([desde, hasta]) => {
    html += esc(texto.slice(cursor, desde));
    html += `<mark class="precio-highlight">${esc(texto.slice(desde, hasta))}</mark>`;
    cursor = hasta;
  });
  html += esc(texto.slice(cursor));
  return html;
}

// Busca coincidencia en el stock de revestimientos del proveedor activo, por
// código o por descripción (mismo criterio que usa js/ventas.js).
function buscarEnStock(codigo, descripcion) {
  const stock = stockRevestimientos[activeProveedorRev] || [];
  return stock.find(s =>
    (codigo && s.codigo && s.codigo.toLowerCase() === codigo.toLowerCase()) ||
    s.descripcion.toLowerCase() === (descripcion || '').toLowerCase()
  );
}

// ── BÚSQUEDA / RENDER ─────────────────────────────────────────────────────────
function renderListaPreciosResultados() {
  const tbody = document.getElementById('preciosResultadosBody');
  if (!tbody) return;

  const searchRaw  = document.getElementById('preciosBuscar')?.value || '';
  const terminos   = tokenizarBusquedaPrecios(searchRaw);
  const categoria  = document.getElementById('preciosFiltroCategoria')?.value || 'all';

  let items = getItemsFuenteActiva();
  if (categoria !== 'all') items = items.filter(i => i.categoria === categoria);

  if (terminos.length) {
    // Multi-término tipo AND: solo quedan los artículos cuya descripción o
    // código contienen TODAS las palabras buscadas (no hace falta que estén
    // juntas ni en orden). Entre los que quedan, se ordena por cantidad de
    // términos coincidentes (en la práctica siempre = terminos.length, por el
    // AND) y luego alfabéticamente por descripción.
    items = items
      .map(item => {
        const haystack = normalizarPreservandoIndices(`${item.descripcion} ${item.codigo || ''}`);
        const coincidencias = terminos.filter(t => haystack.includes(t)).length;
        return { item, coincidencias };
      })
      .filter(x => x.coincidencias === terminos.length)
      .sort((a, b) =>
        b.coincidencias - a.coincidencias ||
        a.item.descripcion.localeCompare(b.item.descripcion, 'es')
      )
      .map(x => x.item);
  }

  const contador = document.getElementById('preciosResultadosCount');
  if (contador) {
    contador.textContent = `${items.length} artículo${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'}`;
  }

  const mostrarConversion = listaPreciosFuenteActiva === 'crev';
  const tableWrap = document.querySelector('.precios-table-wrap');
  if (tableWrap) tableWrap.classList.toggle('mostrar-ars', mostrarConversion);

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${mostrarConversion ? 7 : 5}"><div class="empty-state"><span class="icon">🔍</span><p>No se encontraron artículos para tu búsqueda</p></div></td></tr>`;
    document.getElementById('preciosResultadosFooter').textContent = '';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const stockItem = buscarEnStock(item.codigo, item.descripcion);
    const stockCell = stockItem
      ? `<span class="qty-display ${stockItem.cantidad > 2 ? 'ok' : stockItem.cantidad > 0 ? 'low' : 'zero'}" style="cursor:default;">${stockItem.cantidad}</span>`
      : `<span class="precio-sin-stock">Sin stock</span>`;

    // Columnas de conversión USD → ARS: solo con la pestaña CREV activa. Los
    // artículos "Cordoba Revestimiento - PVC" (precio_sin_iva en USD) muestran
    // las columnas completas; los "Cordoba Revestimiento - WPC" (ya en ARS) no
    // necesitan conversión, así que ocupan colspan="2" con un único valor — la
    // tabla "adapta" sus columnas según la categoría de cada fila en vez de
    // repetir el mismo precio dos veces.
    let celdasConversion = '';
    if (mostrarConversion) {
      if (esItemEnDolares(item)) {
        const arsSinIva = dolarBNA != null ? item.precio_sin_iva * dolarBNA : null;
        const arsConIva = dolarBNA != null ? item.precio_sin_iva * dolarBNA * 1.21 : null;
        celdasConversion = `
      <td class="precios-td-usd" data-label="Precio USD">
        <div class="precio-ars-block">
          <span class="precio-ars-valor">${formatPrecio(item.precio_sin_iva)}</span>
          <span class="precio-moneda-badge usd">USD</span>
        </div>
      </td>
      <td class="precios-td-ars" data-label="ARS">
        <div class="precio-block">
          <div class="precio-item"><span class="precio-tag">S/IVA</span>${formatPrecio(arsSinIva)}</div>
          <div class="precio-item"><span class="precio-tag">C/IVA</span>${formatPrecio(arsConIva)}</div>
        </div>
      </td>`;
      } else {
        celdasConversion = `
      <td class="precios-td-ars" colspan="2" data-label="Precio ARS">
        <div class="precio-ars-block">
          <span class="precio-ars-valor">${formatPrecio(item.precio_sin_iva)}</span>
          <span class="precio-moneda-badge ars">ARS</span>
        </div>
      </td>`;
      }
    }

    return `<tr>
      <td data-label="Código"><span class="td-codigo">${esc(item.codigo || '—')}</span></td>
      <td data-label="Descripción"><span class="td-desc">${resaltarTerminos(item.descripcion, terminos)}</span></td>
      <td data-label="Categoría"><span class="date-chip">${esc(item.categoria || '—')}</span></td>
      <td class="center" data-label="Stock">${stockCell}</td>
      <td data-label="Precio">
        <div class="precio-block">
          <div class="precio-item"><span class="precio-tag">S/IVA</span>${formatPrecio(item.precio_sin_iva)}</div>
          <div class="precio-item"><span class="precio-tag">C/IVA</span>${formatPrecio(item.precio_con_iva)}</div>
        </div>
      </td>${celdasConversion}
    </tr>`;
  }).join('');

  document.getElementById('preciosResultadosFooter').textContent =
    `${items.length} artículo${items.length === 1 ? '' : 's'}`;
}

// Agrega un artículo de la Lista de Precios al carrito de Ventas: si coincide con
// stock real usa el flujo normal (valida cantidad); si no, se agrega igual sin
// descontar stock. Cambia automáticamente a la sub-pestaña Ventas.
function addPrecioToCart(id) {
  const item = listaPrecios.find(i => i.id === id);
  if (!item) return;

  const stockItem = buscarEnStock(item.codigo, item.descripcion);
  if (stockItem) addToCart(stockItem.id);
  else addPrecioOnlyToCart(item);

  switchRevestSubview('ventas', { preserveCart: true });
}
