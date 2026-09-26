// ── MÓDULO VENTAS (dentro de Revestimientos) ─────────────────────────────────
// Vende artículos del stock de TODOS los proveedores de Revestimientos (con
// filtro por proveedor), descuenta stock automáticamente y guarda el historial en la tabla `ventas` de Supabase.
//
// El carrito admite dos tipos de ítem (distinguidos por `source` en la clave
// "stock_<id>" / "precio_<id>", para no confundir ids de stock_revestimientos
// con ids de lista_precios que podrían coincidir numéricamente). Al confirmar
// la venta, cada ítem se guarda en `ventas.items` con `con_stock: true/false`
// para trazabilidad (ver esItemConStock()):
//   - source 'stock'  → viene del stock real, valida cantidad disponible y
//                        descuenta stock_revestimientos al confirmar la venta.
//                        Se guarda como con_stock: true.
//   - source 'precio' → viene de la Lista de Precios sin tener stock físico
//                        cargado (agregado desde js/lista-precios.js); se
//                        vende igual, sin tope de cantidad ni descuento de
//                        stock. Se guarda como con_stock: false.

let carrito         = {};    // { "stock_<id>"|"precio_<id>": { source, refId, cantidad, codigo, descripcion, precio, proveedor?, stockDisponible? } }
let historialVentas  = [];
let ventasCargadas  = false;

// Artículos vendibles de TODOS los proveedores de stock_revestimientos. Se traen
// una sola vez (ventaStockCache); ver getVentaStockItems() para cómo se combinan
// con lo que ya haya cargado la solapa Stock.
let ventaStockCache   = [];
let ventaStockCargado = false;

// Clase CSS del badge según proveedor (los que no figuran usan el gris genérico)
const VENTA_PROVEEDOR_CLASES = {
  'AMT Maderas': 'amt',
  'GB Market Espejos': 'gb',
  'ND Euromaglia': 'nd'
};

// Trae de una vez los artículos de todos los proveedores (solo una vez por
// sesión); también la usa el asistente de voz (js/jarvis.js) para buscar en
// todos los proveedores. Lanza el error si falla, para que cada llamador decida.
async function cargarVentaStock() {
  if (ventaStockCargado) return;
  ventaStockCache = await sbRequest('GET',
    '?select=id,proveedor,codigo,descripcion,cantidad,precio&order=proveedor.asc,descripcion.asc',
    null, 'stock_revestimientos') || [];
  ventaStockCargado = true;
}

// Lista única de artículos vendibles. Para cada proveedor que la solapa Stock ya
// cargó se usan SUS objetos (son los que Stock mantiene al día al sumar/restar
// cantidades o editar/borrar artículos, así que Ventas nunca queda desactualizada
// respecto de eso); para el resto se usan las filas de ventaStockCache. Esas
// filas traen solo las columnas que necesita Ventas, por eso no se vuelcan en
// stockRevestimientos (que la solapa Stock espera completo).
function getVentaStockItems() {
  const porProveedor = {};
  ventaStockCache.forEach(r => { (porProveedor[r.proveedor] = porProveedor[r.proveedor] || []).push(r); });
  Object.keys(stockRevestimientos).forEach(p => { porProveedor[p] = stockRevestimientos[p]; });
  return Object.values(porProveedor).flat();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
// preserveCart=true evita vaciar el carrito: lo usa el flujo "Agregar a venta"
// de Lista de Precios, que agrega un ítem al carrito y recién después cambia a
// esta sub-vista (sin eso, este mismo init() borraría lo que se acaba de agregar).
async function initVentas(preserveCart) {
  const buscar = document.getElementById('ventaBuscar');
  if (buscar) buscar.value = '';
  if (!preserveCart) carrito = {};
  renderCart();
  renderVentaArticulos();

  // Los datos se piden a Supabase una sola vez: al pasar de una sub-pestaña a
  // otra (Stock → Ventas → Precios) se reutiliza lo que ya está en memoria.
  if (!ventasCargadas || !ventaStockCargado) {
    setLoading(true);
    try {
      if (!ventasCargadas) {
        try {
          historialVentas = await sbRequest('GET', '?select=*&order=fecha.desc,created_at.desc', null, 'ventas') || [];
          ventasCargadas = true;
        } catch(e) {
          showToast('Error al cargar historial de ventas', 'error');
          console.error(e);
        }
      }
      if (!ventaStockCargado) {
        try {
          await cargarVentaStock();
        } catch(e) {
          showToast('Error al cargar los artículos para vender', 'error');
          console.error(e);
        }
      }
    } finally {
      setLoading(false);
    }
    renderVentaArticulos();
  }

  updateVentasKPIs();
  renderVentasChart();
  renderHistorialVentas();
}

// ── LISTA DE ARTÍCULOS (izquierda) ────────────────────────────────────────────
// Rellena el selector de proveedor con los valores únicos de `proveedor` de los
// artículos cargados (nada hardcodeado). Solo reconstruye las opciones si el
// conjunto de proveedores cambió, para no cerrar el desplegable mientras se
// escribe en el buscador, y conserva la selección actual.
function poblarVentaFiltroProveedor(items) {
  const sel = document.getElementById('ventaFiltroProveedor');
  if (!sel) return;
  const proveedores = [...new Set(items.map(i => i.proveedor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const clave = proveedores.join('|');
  if (sel.dataset.proveedores === clave) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="all">Todos los proveedores</option>' +
    proveedores.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  sel.value = proveedores.includes(actual) ? actual : 'all';
  sel.dataset.proveedores = clave;
}

function renderVentaArticulos() {
  const todos = getVentaStockItems();
  poblarVentaFiltroProveedor(todos);

  // Búsqueda sin distinguir mayúsculas ni acentos, por descripción y código;
  // todas las palabras escritas tienen que aparecer (en cualquier orden).
  const terminos = normalizarBusquedaPrecios(document.getElementById('ventaBuscar')?.value || '')
    .split(/\s+/).filter(Boolean);
  const proveedor = document.getElementById('ventaFiltroProveedor')?.value || 'all';

  const items = todos.filter(i => {
    if (proveedor !== 'all' && i.proveedor !== proveedor) return false;
    if (!terminos.length) return true;
    const haystack = normalizarBusquedaPrecios(`${i.descripcion} ${i.codigo || ''}`);
    return terminos.every(t => haystack.includes(t));
  });

  // Primero los que tienen stock (por proveedor A→Z y luego por descripción);
  // los sin stock quedan al final con el mismo criterio.
  const grupo = i => (i.cantidad > 0 ? 0 : 1);
  items.sort((a, b) =>
    grupo(a) - grupo(b) ||
    (a.proveedor || '').localeCompare(b.proveedor || '', 'es') ||
    a.descripcion.localeCompare(b.descripcion, 'es')
  );

  const tbody = document.getElementById('ventaArticulosBody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="icon">📦</span><p>No se encontraron artículos</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const enCarrito  = carrito['stock_' + item.id]?.cantidad || 0;
    const disponible = item.cantidad;
    const sinStock   = disponible <= 0 || enCarrito >= disponible;
    const sinPrecio  = !item.precio;
    const qc = disponible > 2 ? 'ok' : disponible > 0 ? 'low' : 'zero';
    const provClase = VENTA_PROVEEDOR_CLASES[item.proveedor] || 'otro';
    return `<tr>
      <td><span class="venta-prov-badge ${provClase}">${esc(item.proveedor || '—')}</span></td>
      <td><span class="td-codigo">${esc(item.codigo || '—')}</span></td>
      <td>
        <span class="td-desc">${esc(item.descripcion)}</span>
        ${enCarrito ? `<div class="venta-en-carrito">${enCarrito} en el carrito</div>` : ''}
      </td>
      <td class="center">${disponible > 0
        ? `<span class="qty-display ${qc}" style="cursor:default;">${disponible}</span>`
        : `<span class="venta-badge-sin-stock">Sin stock</span>`}</td>
      <td><span class="td-precio ${sinPrecio ? 'cero' : ''}">${sinPrecio ? '— sin precio' : formatPrecio(item.precio)}</span></td>
      <td class="center">
        <button class="btn btn-primary btn-sm btn-icon" onclick="addToCart(${item.id})"
          ${sinStock || sinPrecio ? 'disabled' : ''}
          title="${sinPrecio ? 'Sin precio cargado' : sinStock ? 'Sin stock disponible' : 'Agregar al carrito'}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── CARRITO ───────────────────────────────────────────────────────────────────
function addToCart(id) {
  const item  = getVentaStockItems().find(i => i.id === id);
  if (!item) return;

  if (!item.precio) { showToast('Este artículo no tiene precio cargado', 'error'); return; }

  const key = 'stock_' + id;
  const actual = carrito[key]?.cantidad || 0;
  if (actual + 1 > item.cantidad) { showToast('No hay más stock disponible de este artículo', 'error'); return; }

  carrito[key] = {
    source: 'stock',
    refId: id,
    cantidad: actual + 1,
    codigo: item.codigo,
    descripcion: item.descripcion,
    precio: item.precio,
    proveedor: item.proveedor,
    stockDisponible: item.cantidad
  };
  renderCart();
  renderVentaArticulos();
}

// Agrega un artículo que viene de la Lista de Precios y NO tiene stock cargado:
// se vende igual (sin descontar stock, sin tope de cantidad). Lo llama
// addPrecioToCart() en js/lista-precios.js cuando el artículo no está en stock.
function addPrecioOnlyToCart(item) {
  if (!item || !item.precio_con_iva) { showToast('Este artículo no tiene precio cargado', 'error'); return; }

  const key = 'precio_' + item.id;
  const actual = carrito[key]?.cantidad || 0;

  carrito[key] = {
    source: 'precio',
    refId: item.id,
    cantidad: actual + 1,
    codigo: item.codigo,
    descripcion: item.descripcion,
    precio: item.precio_con_iva
  };
  renderCart();
  renderVentaArticulos();
  showToast(`${item.descripcion} agregado (sin stock)`, 'info');
}

function setCartQty(key, val) {
  const entry = carrito[key];
  if (!entry) return;
  const n = parseInt(val);
  if (isNaN(n) || n <= 0) { removeCartItem(key); return; }
  if (entry.source === 'stock' && n > entry.stockDisponible) {
    showToast(`Máximo disponible: ${entry.stockDisponible}`, 'error');
    entry.cantidad = entry.stockDisponible;
  } else {
    entry.cantidad = n;
  }
  renderCart();
  renderVentaArticulos();
}

function removeCartItem(key) {
  delete carrito[key];
  renderCart();
  renderVentaArticulos();
}

function calcCartTotal() {
  return Object.values(carrito).reduce((s, it) => s + it.cantidad * it.precio, 0);
}

function renderCart() {
  const wrap  = document.getElementById('cartItems');
  const total = document.getElementById('cartTotal');
  const count = document.getElementById('cartCount');
  const btn   = document.getElementById('btnConfirmarVenta');
  if (!wrap) return;

  const ids = Object.keys(carrito);
  if (count) count.textContent = ids.length;

  if (!ids.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="icon">🛒</span><p>El carrito está vacío</p></div>`;
    if (total) total.textContent = formatPrecio(0);
    if (btn) btn.disabled = true;
    return;
  }

  wrap.innerHTML = ids.map(key => {
    const it = carrito[key];
    const subtotal = it.cantidad * it.precio;
    const esPrecioOnly = it.source === 'precio';
    const maxAttr = esPrecioOnly ? '' : `max="${it.stockDisponible}"`;
    const badge = esPrecioOnly
      ? '<span class="badge-sin-stock-fisico">Sin stock físico</span>'
      : `<span class="badge-con-stock">${it.stockDisponible} disponibles</span>`;
    return `<div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-desc" title="${esc(it.descripcion)}">${esc(it.descripcion)}</div>
        <div class="cart-item-meta">${esc(it.codigo || '—')} · ${formatPrecio(it.precio)} c/u</div>
        <div class="cart-item-badge-row">${badge}</div>
      </div>
      <input type="number" class="cart-qty-input" value="${it.cantidad}" min="1" ${maxAttr}
        inputmode="numeric" onchange="setCartQty('${key}', this.value)">
      <div class="cart-item-subtotal">${formatPrecio(subtotal)}</div>
      <button class="cart-item-remove" onclick="removeCartItem('${key}')" title="Quitar">✕</button>
    </div>`;
  }).join('');

  if (total) total.textContent = formatPrecio(calcCartTotal());
  if (btn) btn.disabled = false;
}

function cancelarVenta() {
  if (!Object.keys(carrito).length) return;
  carrito = {};
  renderCart();
  renderVentaArticulos();
  showToast('Carrito vaciado', 'info');
}

// ── CONFIRMAR VENTA ────────────────────────────────────────────────────────────
async function confirmarVenta() {
  const ids = Object.keys(carrito);
  if (!ids.length) { showToast('El carrito está vacío', 'error'); return; }

  const stock = getVentaStockItems();

  // Revalidación defensiva por si el stock cambió desde que se armó el carrito.
  // Los ítems 'precio' (sin stock, agregados desde la Lista de Precios) no tienen
  // cantidad tope y no se revalidan contra stock_revestimientos.
  for (const key of ids) {
    const it = carrito[key];
    if (it.source !== 'stock') continue;
    const stockItem = stock.find(s => s.id === it.refId);
    if (!stockItem || it.cantidad > stockItem.cantidad) {
      showToast('El stock cambió, revisá el carrito antes de confirmar', 'error');
      renderVentaArticulos();
      renderCart();
      return;
    }
  }

  const items = ids.map(key => {
    const it = carrito[key];
    return {
      id: it.refId,
      con_stock: it.source === 'stock', // trazabilidad: si descontó stock_revestimientos o no
      codigo: it.codigo,
      descripcion: it.descripcion,
      proveedor: it.proveedor || activeProveedorRev,
      cantidad: it.cantidad,
      precio: it.precio,
      subtotal: it.cantidad * it.precio
    };
  });
  const total = items.reduce((s, i) => s + i.subtotal, 0);

  setLoading(true);
  try {
    const inserted = await sbRequest('POST', '', { fecha: today(), items, total }, 'ventas');
    historialVentas.unshift(inserted[0]);

    // Solo se descuenta stock_revestimientos para los ítems que realmente vienen
    // de stock (nunca para los que no tienen stock físico, aunque su id numérico
    // coincida con el de una fila de stock de otro proveedor).
    for (const item of items.filter(i => i.con_stock)) {
      const idx = stock.findIndex(s => s.id === item.id);
      if (idx >= 0) {
        const nuevaCantidad = Math.max(0, stock[idx].cantidad - item.cantidad);
        await sbRequest('PATCH', `?id=eq.${item.id}`, { cantidad: nuevaCantidad, fecha: today() }, 'stock_revestimientos');
        stock[idx].cantidad = nuevaCantidad;
        const enCache = ventaStockCache.find(s => s.id === item.id);
        if (enCache) enCache.cantidad = nuevaCantidad;
      }
    }

    registrarHistorial({
      modulo: 'Revestimientos',
      accion: 'Venta registrada',
      articulo: items.map(i => i.descripcion).join(', '),
      valorNuevo: total,
      detalle: [...new Set(items.map(i => i.proveedor))].join(', ')
    });

    carrito = {};
    renderCart();
    renderVentaArticulos();
    updateVentasKPIs();
    renderVentasChart();
    renderHistorialVentas();
    showToast(`Venta registrada: ${formatPrecio(total)}`, 'success');
  } catch(e) {
    showToast('Error al registrar la venta: ' + e.message, 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

// ── FECHAS / FILTROS ──────────────────────────────────────────────────────────
function ventaEnRango(fecha, tipo) {
  if (!fecha) return false;
  if (tipo === 'hoy') return fecha === today();

  const [y, m, d] = fecha.split('-').map(Number);
  const fechaDate  = new Date(y, m - 1, d);
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (tipo === 'semana') {
    const day = hoy.getDay(); // 0=Dom..6=Sáb
    const diffLunes = (day === 0 ? 6 : day - 1);
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diffLunes);
    return fechaDate >= lunes && fechaDate <= hoy;
  }
  if (tipo === 'mes') {
    return y === hoy.getFullYear() && (m - 1) === hoy.getMonth();
  }
  return true;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function calcArticuloMasVendidoMes() {
  const ventasMes = historialVentas.filter(v => ventaEnRango(v.fecha, 'mes'));
  const counts = {};
  ventasMes.forEach(v => (v.items || []).forEach(it => {
    counts[it.descripcion] = (counts[it.descripcion] || 0) + Number(it.cantidad || 0);
  }));
  let top = null, topQty = 0;
  Object.entries(counts).forEach(([desc, qty]) => {
    if (qty > topQty) { topQty = qty; top = desc; }
  });
  return top ? { desc: top, qty: topQty } : null;
}

function updateVentasKPIs() {
  const sum = tipo => historialVentas
    .filter(v => ventaEnRango(v.fecha, tipo))
    .reduce((s, v) => s + Number(v.total || 0), 0);

  const elHoy = document.getElementById('kpiVentasHoy');
  const elSemana = document.getElementById('kpiVentasSemana');
  const elMes = document.getElementById('kpiVentasMes');
  const elTop = document.getElementById('kpiTopArticulo');
  if (elHoy)    elHoy.textContent    = formatPrecio(sum('hoy'));
  if (elSemana) elSemana.textContent = formatPrecio(sum('semana'));
  if (elMes)    elMes.textContent    = formatPrecio(sum('mes'));
  if (elTop) {
    const top = calcArticuloMasVendidoMes();
    elTop.textContent = top ? `${top.desc} (${top.qty}u)` : '—';
  }
}

// ── GRÁFICO (Canvas nativo, sin librerías) ────────────────────────────────────
function renderVentasChart() {
  const canvas = document.getElementById('ventasChart');
  if (!canvas) return;
  const parentWidth = canvas.parentElement.clientWidth || 600;
  const cssW = parentWidth;
  const cssH = 160;
  const dpr  = window.devicePixelRatio || 1;

  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '').toUpperCase();
    dias.push({ key, label });
  }
  const totales = dias.map(d =>
    historialVentas.filter(v => v.fecha === d.key).reduce((s, v) => s + Number(v.total || 0), 0)
  );
  const max = Math.max(...totales, 1);

  const pad = { top: 12, bottom: 22, left: 6, right: 6 };
  const chartW = cssW - pad.left - pad.right;
  const chartH = cssH - pad.top - pad.bottom;
  const gap  = 14;
  const barW = (chartW - gap * (dias.length - 1)) / dias.length;

  dias.forEach((d, i) => {
    const val  = totales[i];
    const barH = max > 0 ? (val / max) * chartH : 0;
    const x = pad.left + i * (barW + gap);
    const y = pad.top + (chartH - barH);
    const esHoy = i === dias.length - 1;

    ctx.fillStyle = esHoy ? '#C8102E' : '#E0E0E0';
    drawRoundedTopRect(ctx, x, y, barW, Math.max(barH, 2), 4);
    ctx.fill();

    ctx.fillStyle = '#757575';
    ctx.font = '700 10px Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW / 2, cssH - 6);
  });
}

function drawRoundedTopRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

window.addEventListener('resize', () => {
  clearTimeout(window.__ventasChartResizeTimer);
  window.__ventasChartResizeTimer = setTimeout(() => {
    if (activeModule === 'revestimientos' && revestSubview === 'ventas') renderVentasChart();
  }, 150);
});

// ── HISTORIAL DE VENTAS ────────────────────────────────────────────────────────
function onVentaFiltroFechaChange() {
  const tipo = document.getElementById('ventaFiltroTipo').value;
  const esRango = tipo === 'rango';
  document.getElementById('ventaFiltroDesde').style.display = esRango ? '' : 'none';
  document.getElementById('ventaFiltroHasta').style.display = esRango ? '' : 'none';
  document.getElementById('ventaFiltroHastaLabel').style.display = esRango ? '' : 'none';
  renderHistorialVentas();
}

function renderHistorialVentas() {
  const tipo = document.getElementById('ventaFiltroTipo')?.value || 'mes';
  let items = historialVentas;

  if (tipo === 'rango') {
    const desde = document.getElementById('ventaFiltroDesde')?.value;
    const hasta = document.getElementById('ventaFiltroHasta')?.value;
    items = items.filter(v => (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta));
  } else {
    items = items.filter(v => ventaEnRango(v.fecha, tipo));
  }

  const tbody = document.getElementById('historialVentasBody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="icon">🧾</span><p>Sin ventas registradas en este período</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(v => {
      const idx = historialVentas.indexOf(v);
      return `<tr>
        <td><span class="date-chip">${formatDate(v.fecha)}</span></td>
        <td class="center">${(v.items || []).length}</td>
        <td><span class="td-precio">${formatPrecio(v.total)}</span></td>
        <td class="center">
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="verDetalleVenta(${idx})" title="Ver detalle">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="openEliminarVenta(${idx})" title="Eliminar venta">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }
  document.getElementById('historialVentasFooter').textContent = `${items.length} venta${items.length === 1 ? '' : 's'}`;
}

// Ventas guardadas antes de esta función no tienen `con_stock` (algunas ni
// siquiera tienen el `source` de la versión anterior) — en ese caso se asume
// que sí tenían stock físico, porque hasta entonces era la única opción posible.
function esItemConStock(it) {
  if (it.con_stock !== undefined) return !!it.con_stock;
  if (it.source !== undefined) return it.source === 'stock';
  return true;
}

function verDetalleVenta(idx) {
  const v = historialVentas[idx];
  if (!v) return;
  const rows = (v.items || []).map(it => {
    const badge = esItemConStock(it)
      ? '<span class="badge-con-stock">Con stock</span>'
      : '<span class="badge-sin-stock-fisico">Sin stock físico</span>';
    return `
    <tr>
      <td>
        <span class="td-desc" style="font-size:13px;">${esc(it.descripcion)}</span>
        <div style="margin-top:3px;">${badge}</div>
      </td>
      <td class="center">${it.cantidad}</td>
      <td>${formatPrecio(it.precio)}</td>
      <td>${formatPrecio(it.subtotal)}</td>
    </tr>`;
  }).join('');
  document.getElementById('ventaDetalleBody').innerHTML = `
    <div class="form-info" style="margin-bottom:14px;">
      Venta del <strong>${formatDate(v.fecha)}</strong> — Total: <strong>${formatPrecio(v.total)}</strong>
    </div>
    <div class="preview-scroll">
      <table class="preview-table">
        <thead><tr><th>Artículo</th><th class="center">Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  document.getElementById('ventaDetalleModal').classList.add('active');
}

// ── ELIMINAR VENTA ─────────────────────────────────────────────────────────────
// Borra solo el registro histórico de la venta. A propósito NO restaura stock:
// la venta ya descontó stock real en su momento (si correspondía) y deshacer
// eso acá sería una operación distinta (y más riesgosa) que "borrar el registro".
let ventaEliminarIdx = null;

function openEliminarVenta(idx) {
  const v = historialVentas[idx];
  if (!v) return;
  ventaEliminarIdx = idx;
  document.getElementById('ventaEliminarModal').classList.add('active');
}

async function confirmEliminarVenta() {
  const v = historialVentas[ventaEliminarIdx];
  if (!v) { closeModal('ventaEliminarModal'); return; }

  setLoading(true);
  try {
    await sbRequest('DELETE', `?id=eq.${v.id}`, null, 'ventas');
    historialVentas.splice(ventaEliminarIdx, 1);
    closeModal('ventaEliminarModal');
    renderHistorialVentas();
    updateVentasKPIs();
    renderVentasChart();
    showToast('Venta eliminada correctamente', 'success');
  } catch(e) {
    showToast('Error al eliminar la venta: ' + e.message, 'error');
    console.error(e);
  } finally {
    setLoading(false);
    ventaEliminarIdx = null;
  }
}
