// ── LISTA DE PRECIOS (dentro de Revestimientos) ──────────────────────────────
// Buscador rápido de consulta contra la tabla `lista_precios` de Supabase.
// No tiene relación obligatoria con el stock: un artículo puede tener precio
// sin estar en stock (y viceversa) — se muestra un indicador para cada caso.
// Carga lazy: solo se pide a Supabase la primera vez que se entra a esta sub-vista.

let listaPrecios        = [];
let listaPreciosCargada = false;

// ── INIT ──────────────────────────────────────────────────────────────────────
async function initListaPrecios() {
  if (!listaPreciosCargada) {
    setLoading(true);
    try {
      listaPrecios = await sbRequest('GET', '?select=*&order=categoria.asc,descripcion.asc', null, 'lista_precios') || [];
      listaPreciosCargada = true;
      poblarPreciosFiltroCategoria();
    } catch(e) {
      showToast('Error al cargar la lista de precios', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  renderListaPreciosResultados();
}

function poblarPreciosFiltroCategoria() {
  const sel = document.getElementById('preciosFiltroCategoria');
  if (!sel) return;
  const categorias = [...new Set(listaPrecios.map(i => i.categoria).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const actual = sel.value;
  sel.innerHTML = '<option value="all">Todas las categorías</option>' +
    categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === actual) ? actual : 'all';
}

// Normaliza para búsqueda insensible a mayúsculas/minúsculas y acentos
function normalizarBusquedaPrecios(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
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
  const search     = normalizarBusquedaPrecios(searchRaw);
  const categoria  = document.getElementById('preciosFiltroCategoria')?.value || 'all';

  let items = listaPrecios;
  if (categoria !== 'all') items = items.filter(i => i.categoria === categoria);
  if (search.length >= 2) {
    items = items.filter(i => {
      const desc = normalizarBusquedaPrecios(i.descripcion);
      const cod  = normalizarBusquedaPrecios(i.codigo);
      return desc.includes(search) || cod.includes(search);
    });
  }

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="icon">🔍</span><p>No se encontraron artículos para tu búsqueda</p></div></td></tr>`;
    document.getElementById('preciosResultadosFooter').textContent = '';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const stockItem = buscarEnStock(item.codigo, item.descripcion);
    const stockCell = stockItem
      ? `<span class="qty-display ${stockItem.cantidad > 2 ? 'ok' : stockItem.cantidad > 0 ? 'low' : 'zero'}" style="cursor:default;">${stockItem.cantidad}</span>`
      : `<span class="precio-sin-stock">Sin stock</span>`;

    return `<tr>
      <td data-label="Código"><span class="td-codigo">${esc(item.codigo || '—')}</span></td>
      <td data-label="Descripción"><span class="td-desc">${esc(item.descripcion)}</span></td>
      <td data-label="Categoría"><span class="date-chip">${esc(item.categoria || '—')}</span></td>
      <td class="center" data-label="Stock">${stockCell}</td>
      <td data-label="Precio">
        <div class="precio-block">
          <div class="precio-item"><span class="precio-tag">S/IVA</span>${formatPrecio(item.precio_sin_iva)}</div>
          <div class="precio-item"><span class="precio-tag">C/IVA</span>${formatPrecio(item.precio_con_iva)}</div>
        </div>
      </td>
      <td class="center" data-label="Acciones">
        <button class="btn btn-primary btn-sm" onclick="addPrecioToCart(${item.id})"
          title="${stockItem ? 'Agregar a la venta' : 'Agregar a la venta (no descuenta stock)'}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Agregar
        </button>
      </td>
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
