// ── PROVEEDORES DINÁMICOS ─────────────────────────────────────────────────────
async function loadProveedores() {
  const data = await sbRequest('GET', '?select=*&order=created_at.asc', null, 'proveedores') || [];
  proveedoresMuebles = data.filter(p => p.modulo === 'muebles');
  proveedoresRev     = data.filter(p => p.modulo === 'revestimientos');
  if (proveedoresMuebles.length > 0) activeProveedor    = proveedoresMuebles[0].nombre;
  if (proveedoresRev.length > 0)     activeProveedorRev = proveedoresRev[0].nombre;
  renderProviderTabs('muebles');
  renderProviderTabs('revestimientos');
}

function renderProviderTabs(modulo) {
  const provs      = modulo === 'muebles' ? proveedoresMuebles : proveedoresRev;
  const activeProv = modulo === 'muebles' ? activeProveedor    : activeProveedorRev;
  const cid        = modulo === 'muebles' ? 'providerTabsMuebles' : 'providerTabsRev';
  const container  = document.getElementById(cid);
  if (!container) return;
  container.innerHTML = provs.map(p =>
    `<button class="prov-tab ${p.nombre === activeProv ? 'active' : ''}"
             onclick="switchProveedor('${p.modulo}', '${p.nombre.replace(/'/g, "\\'")}')">
       ${esc(p.nombre)}
       <span class="prov-del"
             onclick="event.stopPropagation();openDelProveedor(${p.id},'${p.modulo}','${p.nombre.replace(/'/g, "\\'")}')">×</span>
     </button>`
  ).join('') +
  `<button class="prov-add" onclick="openNewProvModal('${modulo}')" title="Nuevo proveedor">+</button>`;
}

function openNewProvModal(modulo) {
  newProvModulo = modulo;
  document.getElementById('newProvName').value = '';
  document.getElementById('newProvModal').classList.add('active');
  setTimeout(() => document.getElementById('newProvName').focus(), 150);
}

async function confirmAddProveedor() {
  const nombre = document.getElementById('newProvName').value.trim();
  if (!nombre) { showToast('Ingresá el nombre del proveedor', 'error'); return; }
  const existing = newProvModulo === 'muebles' ? proveedoresMuebles : proveedoresRev;
  if (existing.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
    showToast('Ya existe ese proveedor', 'error'); return;
  }
  try {
    const ins = await sbRequest('POST', '', { modulo: newProvModulo, nombre }, 'proveedores');
    const newP = ins[0];
    if (newProvModulo === 'muebles') proveedoresMuebles.push(newP);
    else proveedoresRev.push(newP);
    renderProviderTabs(newProvModulo);
    closeModal('newProvModal');
    await switchProveedor(newProvModulo, nombre);
    showToast('Proveedor "' + nombre + '" agregado', 'success');
  } catch(e) { showToast('Error al agregar proveedor', 'error'); }
}

function openDelProveedor(id, modulo, nombre) {
  delProvData = { id, modulo, nombre };
  document.getElementById('delProvName').textContent = nombre;
  document.getElementById('delProvModal').classList.add('active');
}

async function confirmDelProveedor() {
  if (!delProvData) return;
  const { id, modulo, nombre } = delProvData;
  const table = modulo === 'muebles' ? 'stock_muebles' : 'stock_revestimientos';
  try {
    await sbRequest('DELETE', '?proveedor=eq.' + encodeURIComponent(nombre), null, table);
    await sbRequest('DELETE', '?id=eq.' + id, null, 'proveedores');
    if (modulo === 'muebles') {
      proveedoresMuebles = proveedoresMuebles.filter(p => p.id !== id);
      delete stockMuebles[nombre];
      activeProveedor = proveedoresMuebles[0]?.nombre || '';
    } else {
      proveedoresRev = proveedoresRev.filter(p => p.id !== id);
      delete stockRevestimientos[nombre];
      activeProveedorRev = proveedoresRev[0]?.nombre || '';
    }
    renderProviderTabs(modulo);
    updateSectionTitle();
    renderTable();
    closeModal('delProvModal');
    showToast('Proveedor "' + nombre + '" eliminado', 'info');
  } catch(e) { showToast('Error al eliminar', 'error'); }
}

// ══ MÓDULO PEDIDOS ═══════════════════════════════════════════════════════════
let catalogo        = []; // artículos del catálogo MaxiKing
let pedidoActual    = {}; // {id: cantidad}
let historialPedidos = [];
let catalogoCargado = false;

const LOGO_B64_PEDIDO = null; // logo cargado desde archivo

async function initPedidos() {
  if (!catalogoCargado) {
    setLoading(true);
    try {
      catalogo = await sbRequest('GET', '?select=*&order=linea.asc,modelo.asc,medida.asc', null, 'catalogo_maxiking') || [];
      if (catalogo.length === 0) {
        // Seed en lotes de 50
        const lotes = [];
        for (let i = 0; i < CATALOGO_SEED.length; i += 50)
          lotes.push(CATALOGO_SEED.slice(i, i + 50));
        for (const lote of lotes)
          await sbRequest('POST', '', lote, 'catalogo_maxiking');
        catalogo = await sbRequest('GET', '?select=*&order=linea.asc,modelo.asc,medida.asc', null, 'catalogo_maxiking') || [];
      }
      catalogoCargado = true;

      // Cargar historial
      historialPedidos = await sbRequest('GET', '?select=*&order=created_at.desc', null, 'pedidos') || [];
      // Poblar filtro de líneas
      const lineas = [...new Set(catalogo.map(a => a.linea))];
      const sel = document.getElementById('pedidoFiltroLinea');
      sel.innerHTML = '<option value="all">Todas las líneas</option>' +
        lineas.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      // Fecha default hoy
      document.getElementById('pedidoFecha').value = today();
    } catch(e) {
      showToast('Error al cargar el catálogo: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }
  renderCatalogo();
}

function calcSugerido(item) {
  // Buscar en stock de colchones si hay artículo coincidente
  const keyword = item.modelo.split(' ')[0].toLowerCase();
  const medidaNum = item.medida.replace(/[^0-9x]/g,'');
  const enStock = stockColchones.find(s =>
    s.descripcion.toLowerCase().includes(keyword) &&
    s.descripcion.includes(medidaNum)
  );
  if (!enStock) return 0;
  return enStock.cantidad <= 1 ? 3 : enStock.cantidad <= 3 ? 2 : 0;
}

function renderCatalogo() {
  const buscar  = (document.getElementById('pedidoBuscar')?.value || '').toLowerCase();
  const linea   = document.getElementById('pedidoFiltroLinea')?.value || 'all';
  const tipo    = document.getElementById('pedidoFiltroTipo')?.value  || 'all';
  const soloSug = document.getElementById('pedidoSoloSugeridos')?.checked;

  const items = catalogo.filter(a => {
    const matchB = a.modelo.toLowerCase().includes(buscar) || a.linea.toLowerCase().includes(buscar);
    const matchL = linea === 'all' || a.linea === linea;
    const matchT = tipo  === 'all' || a.tipo  === tipo;
    const matchS = !soloSug || calcSugerido(a) > 0;
    return matchB && matchL && matchT && matchS;
  });

  const tbody = document.getElementById('catalogoBody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="icon">📋</span><p>No se encontraron artículos</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(a => {
      const sug = calcSugerido(a);
      const val = pedidoActual[a.id] || '';
      const hasVal = val > 0;
      return `<tr>
        <td><span class="td-codigo">${esc(a.linea)}</span></td>
        <td><span style="font-size:12px;text-transform:capitalize;color:var(--gray-500);">${esc(a.tipo)}</span></td>
        <td><span class="td-desc">${esc(a.modelo)}</span></td>
        <td><span class="date-chip">${esc(a.medida)}</span></td>
        <td class="center">
          ${getStockActual(a)}
        </td>
        <td class="center">
          ${sug > 0
            ? `<span class="badge-sug">${sug}</span>`
            : `<span class="badge-sug none">—</span>`}
        </td>
        <td class="center">
          <input type="number" class="qty-pedido ${hasVal ? 'has-value' : ''}"
            id="qp_${a.id}" value="${val || ''}" min="0" placeholder="0"
            inputmode="numeric"
            onchange="setPedidoCantidad(${a.id}, this.value)"
            oninput="this.classList.toggle('has-value', this.value > 0)">
        </td>
      </tr>`;
    }).join('');
  }
  document.getElementById('catalogoFooter').textContent =
    `${items.length} de ${catalogo.length} artículos`;
  updatePedidoStats();
}

function getStockActual(item) {
  const keyword  = item.modelo.split(' ')[0].toLowerCase();
  const medidaNum = item.medida.replace(/[^0-9x]/gi,'');
  const enStock  = stockColchones.find(s =>
    s.descripcion.toLowerCase().includes(keyword) && s.descripcion.includes(medidaNum)
  );
  if (!enStock) return `<span style="color:var(--gray-300);font-size:12px;">—</span>`;
  const qty = enStock.cantidad;
  const cls = qty === 0 ? 'zero' : qty <= 2 ? 'low' : 'ok';
  return `<span class="qty-display ${cls}" style="font-size:14px;">${qty}</span>`;
}

function setPedidoCantidad(id, val) {
  const n = parseInt(val);
  if (n > 0) pedidoActual[id] = n;
  else delete pedidoActual[id];
  updatePedidoStats();
  updateBtnPDF();
}

function updatePedidoStats() {
  const count = Object.keys(pedidoActual).length;
  const units = Object.values(pedidoActual).reduce((s,v) => s+v, 0);
  document.getElementById('pedidoContador').textContent = count;
  document.getElementById('pedidoUnidades').textContent = units;
}

function updateBtnPDF() {
  const btn = document.getElementById('btnGenerarPDF');
  btn.disabled = Object.keys(pedidoActual).length === 0;
}

function limpiarPedido() {
  pedidoActual = {};
  renderCatalogo();
  showToast('Pedido limpiado', 'info');
}

// ── GENERAR PDF ───────────────────────────────────────────────────────────────
async function generarPedidoPDF() {
  const items = catalogo.filter(a => pedidoActual[a.id]);
  if (!items.length) { showToast('No hay artículos en el pedido', 'error'); return; }
  const fecha   = document.getElementById('pedidoFecha').value || today();
  const fechaFmt = formatDate(fecha);
  const total   = Object.values(pedidoActual).reduce((s,v) => s+v, 0);

  // Guardar pedido en Supabase
  try {
    const articulos = items.map(a => ({
      id: a.id, linea: a.linea, tipo: a.tipo,
      modelo: a.modelo, medida: a.medida,
      cantidad: pedidoActual[a.id]
    }));
    await sbRequest('POST', '', { fecha, articulos, total_unidades: total }, 'pedidos');
    historialPedidos.unshift({ fecha, articulos, total_unidades: total, created_at: new Date().toISOString() });
  } catch(e) { console.warn('No se pudo guardar el pedido:', e.message); }

  // Agrupar por línea
  const grupos = {};
  items.forEach(a => {
    if (!grupos[a.linea]) grupos[a.linea] = [];
    grupos[a.linea].push(a);
  });

  const rows = Object.entries(grupos).map(([linea, arts]) => `
    <tr style="background:#f0f0f0;">
      <td colspan="4" style="font-weight:800;font-size:13px;padding:6px 10px;text-transform:uppercase;letter-spacing:1px;color:#1A1A1A;">${esc(linea)}</td>
    </tr>
    ${arts.map(a => `
      <tr>
        <td style="padding:6px 10px;font-size:12px;color:#555;text-transform:capitalize;">${esc(a.tipo)}</td>
        <td style="padding:6px 10px;font-weight:600;font-size:13px;">${esc(a.modelo)}</td>
        <td style="padding:6px 10px;font-size:12px;color:#777;">${esc(a.medida)}</td>
        <td style="padding:6px 10px;font-weight:900;font-size:18px;color:#C8102E;text-align:center;">${pedidoActual[a.id]}</td>
      </tr>`).join('')}
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800;900&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Exo 2',Arial,sans-serif; color:#1A1A1A; padding:32px; }
    .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #C8102E; padding-bottom:16px; margin-bottom:20px; }
    .logo-wrap { display:flex; align-items:center; gap:16px; }
    .logo-img { height:60px; }
    .header-info { text-align:right; }
    .header-info h1 { font-size:22px; font-weight:900; text-transform:uppercase; letter-spacing:2px; color:#1A1A1A; }
    .header-info p { font-size:13px; color:#757575; margin-top:4px; }
    .stats { display:flex; gap:24px; background:#f8f8f8; border:1px solid #E0E0E0; border-radius:6px; padding:12px 20px; margin-bottom:20px; }
    .stat { display:flex; flex-direction:column; }
    .stat-label { font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#757575; }
    .stat-value { font-size:26px; font-weight:900; color:#C8102E; line-height:1.1; }
    table { width:100%; border-collapse:collapse; }
    thead tr { background:#1A1A1A; color:white; }
    thead th { padding:8px 10px; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; text-align:left; }
    thead th:last-child { text-align:center; }
    tbody tr:nth-child(even):not([style*="background:#f0f0f0"]) { background:#FAFAFA; }
    tbody tr { border-bottom:1px solid #F0F0F0; }
    .footer { margin-top:24px; text-align:center; font-size:11px; color:#BDBDBD; border-top:1px solid #E0E0E0; padding-top:12px; }
    @media print { body { padding:20px; } }
  </style>
  </head><body>
  <div class="header">
    <div class="logo-wrap">
      <img class="logo-img" src="logo_muebleria.jpg">
    </div>
    <div class="header-info">
      <h1>Orden de Pedido</h1>
      <p>Proveedor: MaxiKing — Colchones y Sommiers</p>
      <p>Fecha: ${fechaFmt}</p>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><span class="stat-label">Artículos</span><span class="stat-value">${items.length}</span></div>
    <div class="stat"><span class="stat-label">Unidades totales</span><span class="stat-value">${total}</span></div>
  </div>
  <table>
    <thead><tr><th>Tipo</th><th>Modelo</th><th>Medida</th><th style="text-align:center;width:80px;">Cant.</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Mueblería Mühn · Pedido generado el ${fechaFmt} · Lista de precios vigente Julio 2026</div>
  </body></html>`;

  const iframe = document.getElementById('pdfPreview');
  iframe.srcdoc = html;
  document.getElementById('pdfOverlay').classList.add('active');
}

function closePdfOverlay() {
  document.getElementById('pdfOverlay').classList.remove('active');
}

function imprimirPDF() {
  const iframe = document.getElementById('pdfPreview');
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
}

// ── HISTORIAL ─────────────────────────────────────────────────────────────────
function openHistorial() {
  document.getElementById('pedidoFormSection').style.display  = 'none';
  document.getElementById('historialSection').style.display   = '';
  renderHistorial();
}

function volverAFormulario() {
  document.getElementById('historialSection').style.display  = 'none';
  document.getElementById('pedidoFormSection').style.display = '';
}

function renderHistorial() {
  const tbody = document.getElementById('historialBody');
  if (!historialPedidos.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="icon">📋</span><p>Sin pedidos registrados</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = historialPedidos.map((p, i) => `
    <tr>
      <td><span class="date-chip">${formatDate(p.fecha || p.created_at?.slice(0,10))}</span></td>
      <td class="center">${p.articulos?.length || 0}</td>
      <td class="center"><strong>${p.total_unidades}</strong></td>
      <td class="center">
        <div class="hist-acciones">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="verPedidoHistorial(${i})" title="Ver PDF">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

async function verPedidoHistorial(idx) {
  const p = historialPedidos[idx];
  if (!p) return;
  const arts = (p.articulos || []).map(a => ({
    id: a.id, linea: a.linea || '—', tipo: a.tipo || '—',
    modelo: a.modelo, medida: a.medida
  }));
  // Temporalmente setear pedidoActual y generar PDF
  const tmpPedido = {};
  (p.articulos || []).forEach(a => { tmpPedido[a.id] = a.cantidad; });
  const savedPedido = pedidoActual;
  pedidoActual = tmpPedido;
  // Necesitamos los articulos en catalogo para el PDF
  const savedCatalogo = catalogo;
  // Crear items temporales si no están en catálogo
  const tmpItems = (p.articulos || []).map(a => ({
    id: a.id, linea: a.linea, tipo: a.tipo, modelo: a.modelo, medida: a.medida
  }));
  catalogo = tmpItems;
  const savedFecha = document.getElementById('pedidoFecha').value;
  document.getElementById('pedidoFecha').value = p.fecha || p.created_at?.slice(0,10);
  await generarPedidoPDF();
  pedidoActual = savedPedido;
  catalogo = savedCatalogo;
  document.getElementById('pedidoFecha').value = savedFecha;
}
