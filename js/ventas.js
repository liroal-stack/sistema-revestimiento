// ── MÓDULO VENTAS (dentro de Revestimientos) ─────────────────────────────────
// Vende artículos del stock del proveedor activo de Revestimientos, descuenta
// stock automáticamente y guarda el historial en la tabla `ventas` de Supabase.

let carrito         = {};    // { stockId: { cantidad, codigo, descripcion, precio, stockDisponible } }
let historialVentas  = [];
let ventasCargadas  = false;

// ── INIT ──────────────────────────────────────────────────────────────────────
async function initVentas() {
  const buscar = document.getElementById('ventaBuscar');
  if (buscar) buscar.value = '';
  carrito = {};
  renderCart();
  renderVentaArticulos();

  if (!ventasCargadas) {
    setLoading(true);
    try {
      historialVentas = await sbRequest('GET', '?select=*&order=fecha.desc,created_at.desc', null, 'ventas') || [];
      ventasCargadas = true;
    } catch(e) {
      showToast('Error al cargar historial de ventas', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  updateVentasKPIs();
  renderVentasChart();
  renderHistorialVentas();
}

// ── LISTA DE ARTÍCULOS (izquierda) ────────────────────────────────────────────
function renderVentaArticulos() {
  const search = (document.getElementById('ventaBuscar')?.value || '').toLowerCase().trim();
  const stock  = stockRevestimientos[activeProveedorRev] || [];
  const items  = stock.filter(i =>
    !search ||
    i.descripcion.toLowerCase().includes(search) ||
    (i.codigo || '').toLowerCase().includes(search)
  );

  const tbody = document.getElementById('ventaArticulosBody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="icon">📦</span><p>No se encontraron artículos</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const enCarrito  = carrito[item.id]?.cantidad || 0;
    const disponible = item.cantidad;
    const sinStock   = disponible <= 0 || enCarrito >= disponible;
    const sinPrecio  = !item.precio;
    const qc = disponible > 2 ? 'ok' : disponible > 0 ? 'low' : 'zero';
    return `<tr>
      <td><span class="td-codigo">${esc(item.codigo || '—')}</span></td>
      <td>
        <span class="td-desc">${esc(item.descripcion)}</span>
        ${enCarrito ? `<div class="venta-en-carrito">${enCarrito} en el carrito</div>` : ''}
      </td>
      <td class="center"><span class="qty-display ${qc}" style="cursor:default;">${disponible}</span></td>
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
  const stock = stockRevestimientos[activeProveedorRev] || [];
  const item  = stock.find(i => i.id === id);
  if (!item) return;

  if (!item.precio) { showToast('Este artículo no tiene precio cargado', 'error'); return; }

  const actual = carrito[id]?.cantidad || 0;
  if (actual + 1 > item.cantidad) { showToast('No hay más stock disponible de este artículo', 'error'); return; }

  carrito[id] = {
    cantidad: actual + 1,
    codigo: item.codigo,
    descripcion: item.descripcion,
    precio: item.precio,
    stockDisponible: item.cantidad
  };
  renderCart();
  renderVentaArticulos();
}

function setCartQty(id, val) {
  const entry = carrito[id];
  if (!entry) return;
  const n = parseInt(val);
  if (isNaN(n) || n <= 0) { removeCartItem(id); return; }
  if (n > entry.stockDisponible) {
    showToast(`Máximo disponible: ${entry.stockDisponible}`, 'error');
    entry.cantidad = entry.stockDisponible;
  } else {
    entry.cantidad = n;
  }
  renderCart();
  renderVentaArticulos();
}

function removeCartItem(id) {
  delete carrito[id];
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

  wrap.innerHTML = ids.map(id => {
    const it = carrito[id];
    const subtotal = it.cantidad * it.precio;
    return `<div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-desc" title="${esc(it.descripcion)}">${esc(it.descripcion)}</div>
        <div class="cart-item-meta">${esc(it.codigo || '—')} · ${formatPrecio(it.precio)} c/u</div>
      </div>
      <input type="number" class="cart-qty-input" value="${it.cantidad}" min="1" max="${it.stockDisponible}"
        inputmode="numeric" onchange="setCartQty(${id}, this.value)">
      <div class="cart-item-subtotal">${formatPrecio(subtotal)}</div>
      <button class="cart-item-remove" onclick="removeCartItem(${id})" title="Quitar">✕</button>
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

  const stock = stockRevestimientos[activeProveedorRev] || [];

  // Revalidación defensiva por si el stock cambió desde que se armó el carrito
  for (const id of ids) {
    const it = carrito[id];
    const stockItem = stock.find(s => s.id === Number(id));
    if (!stockItem || it.cantidad > stockItem.cantidad) {
      showToast('El stock cambió, revisá el carrito antes de confirmar', 'error');
      renderVentaArticulos();
      renderCart();
      return;
    }
  }

  const items = ids.map(id => {
    const it = carrito[id];
    return {
      id: Number(id),
      codigo: it.codigo,
      descripcion: it.descripcion,
      proveedor: activeProveedorRev,
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

    for (const item of items) {
      const idx = stock.findIndex(s => s.id === item.id);
      if (idx >= 0) {
        const nuevaCantidad = Math.max(0, stock[idx].cantidad - item.cantidad);
        await sbRequest('PATCH', `?id=eq.${item.id}`, { cantidad: nuevaCantidad, fecha: today() }, 'stock_revestimientos');
        stock[idx].cantidad = nuevaCantidad;
      }
    }

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
          <button class="btn btn-ghost btn-sm btn-icon" onclick="verDetalleVenta(${idx})" title="Ver detalle">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }
  document.getElementById('historialVentasFooter').textContent = `${items.length} venta${items.length === 1 ? '' : 's'}`;
}

function verDetalleVenta(idx) {
  const v = historialVentas[idx];
  if (!v) return;
  const rows = (v.items || []).map(it => `
    <tr>
      <td><span class="td-desc" style="font-size:13px;">${esc(it.descripcion)}</span></td>
      <td class="center">${it.cantidad}</td>
      <td>${formatPrecio(it.precio)}</td>
      <td>${formatPrecio(it.subtotal)}</td>
    </tr>`).join('');
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
