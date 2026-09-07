// ── DATA ──────────────────────────────────────────────────────────────────────
let editingId = null, deletingId = null, qtyEditId = null;

// State aliases handled via getActiveStock() / setActiveStock()

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderTable() {
  // Mostrar toolbar correcto
  const tcol = document.getElementById('toolbarColchones');
  const tgen = document.getElementById('toolbarGenerico');
  if (tcol && tgen) {
    tcol.style.display = activeModule === 'colchones' ? '' : 'none';
    tgen.style.display = (activeModule === 'muebles' || activeModule === 'revestimientos') ? '' : 'none';
  }

  // Leer filtros según módulo activo
  const isColchones = activeModule === 'colchones';
  const search = isColchones
    ? (document.getElementById('searchInput')?.value || '').toLowerCase().trim()
    : (document.getElementById('searchInputGenerico')?.value || '').toLowerCase().trim();
  const filter = isColchones
    ? (document.getElementById('filterStock')?.value || 'all')
    : (document.getElementById('filterStockGenerico')?.value || 'all');
  const mobile  = window.innerWidth <= 640;

  // Filtros extra solo para colchones
  const filterTipo   = activeModule === 'colchones' ? (document.getElementById('filterTipo')?.value   || 'all') : 'all';
  const filterMedida = activeModule === 'colchones' ? (document.getElementById('filterMedida')?.value || 'all') : 'all';

  const activeStock = getActiveStock();

  // Poblar selector de medidas dinámicamente (solo en colchones)
  if (activeModule === 'colchones') {
    const selMedida = document.getElementById('filterMedida');
    if (selMedida) {
      const currentVal = selMedida.value;
      // Extraer medidas únicas de la descripcion (última palabra)
      const medidas = [...new Set(
        activeStock.map(i => {
          const parts = i.descripcion.trim().split(' ');
          return parts[parts.length - 1];
        }).filter(m => m && m !== '—')
      )].sort((a, b) => {
        // Ordenar numéricamente
        const na = parseFloat(a); const nb = parseFloat(b);
        return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
      });
      if (selMedida.options.length !== medidas.length + 1) {
        selMedida.innerHTML = '<option value="all">Todas las medidas</option>' +
          medidas.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        selMedida.value = currentVal;
      }
    }
  }

  // Normalizar búsqueda: quita acentos y artículos cortos para búsqueda flexible
  function normalizeSearch(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/\bde\b|\bdel\b|\bla\b|\blas\b|\blos\b|\bel\b/g, '') // quita artículos
      .replace(/\s+/g, ' ').trim();
  }

  const searchNorm = normalizeSearch(search);

  const items = activeStock.filter(item => {
    // Búsqueda normalizada — ignora "de", "del", acentos
    const descNorm = normalizeSearch(item.descripcion);
    const hit = search === '' ||
      descNorm.includes(searchNorm) ||
      item.descripcion.toLowerCase().includes(search) ||
      item.codigo.toLowerCase().includes(search);
    if (!hit) return false;

    // Filtro por tipo (COLCHON / SOMMIER)
    if (filterTipo !== 'all' && !item.descripcion.toUpperCase().startsWith(filterTipo)) return false;

    // Filtro por medida (última palabra de la descripcion)
    if (filterMedida !== 'all') {
      const parts = item.descripcion.trim().split(' ');
      const medida = parts[parts.length - 1];
      if (medida !== filterMedida) return false;
    }

    // Filtro por estado stock
    if (filter === 'ok')   return item.cantidad > 2;
    if (filter === 'low')  return item.cantidad > 0 && item.cantidad <= 2;
    if (filter === 'zero') return item.cantidad === 0;
    return true;
  });

  const tbody = document.getElementById('tableBody');

  // Mostrar columna precio solo en revestimientos
  const showPrecio = activeModule === 'revestimientos';
  updateTableHeader(showPrecio);

  const colspan = showPrecio ? 6 : 5;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><span class="icon">📦</span><p>No se encontraron artículos</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(({ id, codigo, descripcion, cantidad, fecha, precio }) => {
      const qc  = cantidad > 2 ? 'ok' : cantidad > 0 ? 'low' : 'zero';
      const rc  = cantidad > 2 ? '' : cantidad > 0 ? 'low-stock' : 'no-stock';
      const fch = fecha ? formatDate(fecha) : '—';
      const qty = `<div class="qty-control">
        <button class="qty-btn minus" onclick="quickQty(${id},-1)">−</button>
        <span class="qty-display ${qc}" onclick="openQtyModal(${id})" title="Editar cantidad">${cantidad}</span>
        <button class="qty-btn plus"  onclick="quickQty(${id},+1)">+</button>
      </div>`;
      const acts = `<div class="actions-cell">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openModal('edit',${id})" title="Editar artículo">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${id})" title="Eliminar">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>`;
      const precioCell = showPrecio
        ? `<span class="td-precio ${!precio ? 'cero' : ''}">${precio ? formatPrecio(precio) : '— sin precio'}</span>`
        : '';

      if (mobile) return `<tr class="${rc}">
        <td data-label="Código"><span class="td-codigo">${esc(codigo)}</span></td>
        <td data-label="Artículo"><span class="td-desc">${esc(descripcion)}</span></td>
        <td data-label="Cantidad" class="center">${qty}</td>
        ${showPrecio ? `<td data-label="Precio">${precioCell}</td>` : ''}
        <td data-label="Modificado"><span class="date-chip">${fch}</span></td>
        <td data-label="Acciones">${acts}</td>
      </tr>`;

      return `<tr class="${rc}">
        <td><span class="td-codigo">${esc(codigo)}</span></td>
        <td><span class="td-desc">${esc(descripcion)}</span></td>
        <td class="center">${qty}</td>
        ${showPrecio ? `<td>${precioCell}</td>` : ''}
        <td><span class="date-chip">${fch}</span></td>
        <td class="center">${acts}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('tableFooter').textContent = `Mostrando ${items.length} de ${activeStock.length} artículos`;
  updateKPIs();
}


function updateTableHeader(showPrecio) {
  const thead = document.querySelector('#tableBody').closest('table').querySelector('thead tr');
  if (!thead) return;
  thead.innerHTML = `
    <th>Código</th>
    <th>Descripción</th>
    <th class="center">Cantidad</th>
    ${showPrecio ? '<th>Precio Unit.</th>' : ''}
    <th>Últ. modificación</th>
    <th class="center">Acciones</th>`;
}

function updateKPIs() {
  const s = getActiveStock();
  document.getElementById('kpiTotal').textContent    = s.length;
  document.getElementById('kpiUnidades').textContent = s.reduce((a,i) => a + i.cantidad, 0);
  document.getElementById('kpiLow').textContent      = s.filter(i => i.cantidad > 0 && i.cantidad <= 2).length;
  document.getElementById('kpiZero').textContent     = s.filter(i => i.cantidad === 0).length;
}

// ── QUICK QTY ─────────────────────────────────────────────────────────────────
async function quickQty(id, delta) {
  const arr = getActiveStock();
  const idx = arr.findIndex(i => i.id === id);
  if (idx < 0) return;
  const nv = Math.max(0, arr[idx].cantidad + delta);
  const f  = today();
  try {
    await sbRequest('PATCH', `?id=eq.${id}`, { cantidad: nv, fecha: f }, getActiveTable());
    arr[idx].cantidad = nv;
    arr[idx].fecha = f;
    renderTable();
    showToast(`Stock: ${nv} u.`, 'success');
  } catch(e) { showToast('Error al actualizar', 'error'); }
}

// ── QTY MODAL ─────────────────────────────────────────────────────────────────
function openQtyModal(id) {
  const item = getActiveStock().find(i => i.id === id);
  if (!item) return;
  qtyEditId = id;
  document.getElementById('qtyItemName').textContent = item.descripcion;
  document.getElementById('qtyInput').value = item.cantidad;
  document.getElementById('qtyModal').classList.add('active');
  setTimeout(() => { const inp = document.getElementById('qtyInput'); inp.select(); inp.focus(); }, 120);
}
function qtyStep(d) {
  const inp = document.getElementById('qtyInput');
  inp.value = Math.max(0, (parseInt(inp.value) || 0) + d);
}
function qtyClamp() {
  const inp = document.getElementById('qtyInput');
  if (parseInt(inp.value) < 0 || isNaN(parseInt(inp.value))) inp.value = 0;
}
async function saveQty() {
  const val = parseInt(document.getElementById('qtyInput').value);
  if (isNaN(val) || val < 0) { showToast('Cantidad inválida', 'error'); return; }
  const arr = getActiveStock();
  const idx = arr.findIndex(i => i.id === qtyEditId);
  if (idx < 0) return;
  const f = today();
  try {
    await sbRequest('PATCH', `?id=eq.${qtyEditId}`, { cantidad: val, fecha: f }, getActiveTable());
    arr[idx].cantidad = val;
    arr[idx].fecha = f;
    closeModal('qtyModal'); renderTable();
    showToast(`Cantidad guardada: ${val} u.`, 'success');
  } catch(e) { showToast('Error al guardar', 'error'); }
}

// ── CRUD MODAL ────────────────────────────────────────────────────────────────
function openModal(mode, id) {
  editingId = null;
  ['fCodigo','fDesc','fCantidad','fFecha','fPrecio'].forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
  document.getElementById('fPrecioGroup').style.display = activeModule === 'revestimientos' ? '' : 'none';
  document.getElementById('formInfo').style.display = 'none';
  if (mode === 'edit' && id) {
    const item = getActiveStock().find(i => i.id === id);
    if (!item) return;
    editingId = id;
    document.getElementById('modalTitle').innerHTML = 'Editar <span>Artículo</span>';
    document.getElementById('fCodigo').value   = item.codigo;
    document.getElementById('fDesc').value     = item.descripcion;
    document.getElementById('fCantidad').value = item.cantidad;
    document.getElementById('fFecha').value    = item.fecha || '';
    if (activeModule === 'revestimientos') document.getElementById('fPrecio').value = item.precio || '';
    const info = document.getElementById('formInfo');
    info.style.display = 'block';
    info.innerHTML = `Editando: <strong>${esc(item.descripcion)}</strong>`;
  } else {
    document.getElementById('modalTitle').innerHTML = 'Nuevo <span>Artículo</span>';
    document.getElementById('fFecha').value = new Date().toISOString().slice(0,10);
  }
  document.getElementById('editModal').classList.add('active');
  setTimeout(() => document.getElementById('fDesc').focus(), 150);
}

async function saveItem() {
  const codigo   = document.getElementById('fCodigo').value.trim();
  const desc     = document.getElementById('fDesc').value.trim();
  const cantidad = parseInt(document.getElementById('fCantidad').value);
  const fecha    = document.getElementById('fFecha').value;
  const precio   = activeModule === 'revestimientos' ? (parseFloat(document.getElementById('fPrecio').value) || 0) : undefined;
  if (!desc)                           { showToast('La descripción es obligatoria', 'error'); return; }
  if (isNaN(cantidad) || cantidad < 0) { showToast('Ingresá una cantidad válida', 'error'); return; }
  const dup = getActiveStock().find(i => i.descripcion.toLowerCase() === desc.toLowerCase() && i.id !== editingId);
  if (dup) { showToast('Ya existe ese artículo', 'error'); return; }
  try {
    const table = getActiveTable();
    const precioField = precio !== undefined ? { precio } : {};
    if (editingId) {
      const updated = await sbRequest('PATCH', `?id=eq.${editingId}`, { codigo, descripcion: desc, cantidad, fecha, ...precioField }, table);
      const arr = getActiveStock();
      const idx = arr.findIndex(i => i.id === editingId);
      if (idx >= 0) arr[idx] = updated[0];
      showToast('Artículo actualizado', 'success');
    } else {
      const body = activeModule === 'colchones'
        ? { codigo, descripcion: desc, cantidad, fecha }
        : { proveedor: getActiveProvName(), codigo, descripcion: desc, cantidad, fecha, ...precioField };
      const inserted = await sbRequest('POST', '', body, table);
      getActiveStock().push(inserted[0]);
      showToast('Artículo agregado', 'success');
    }
    closeModal('editModal'); renderTable();
  } catch(e) { showToast('Error al guardar: ' + e.message, 'error'); }
}

function openDelete(id) {
  deletingId = id;
  const item = getActiveStock().find(i => i.id === id);
  document.getElementById('deleteName').textContent = item ? item.descripcion : '';
  document.getElementById('deleteModal').classList.add('active');
}
async function confirmDelete() {
  try {
    await sbRequest('DELETE', `?id=eq.${deletingId}`, null, getActiveTable());
    setActiveStock(getActiveStock().filter(i => i.id !== deletingId));
    closeModal('deleteModal'); renderTable();
    showToast('Artículo eliminado', 'info');
  } catch(e) { showToast('Error al eliminar', 'error'); }
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => {
    if (e.target === o) {
      o.classList.remove('active');
      if (o.id === 'scanModal') closeScanModal();
    }
  })
);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
  if (e.key === 'Enter') {
    if (document.getElementById('editModal').classList.contains('active')) saveItem();
    if (document.getElementById('qtyModal').classList.contains('active'))  saveQty();
  }
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderTable, 150); });

// ── OCR PIPELINE ──────────────────────────────────────────────────────────────
let ocrItems = []; // items detectados por OCR

function initOcrUI() {
  const noKeys   = document.getElementById('ocrNoKeys');
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (!noKeys || !analyzeBtn) return;
  if (keysConfigured()) {
    noKeys.style.display   = 'none';
    analyzeBtn.style.display = 'flex';
  } else {
    noKeys.style.display   = 'flex';
    analyzeBtn.style.display = 'none';
  }
}

async function analyzeWithOCR() {
  const img = document.getElementById('refImg');
  if (!img || !img.src || img.src === window.location.href) {
    showToast('Primero seleccioná una imagen', 'error'); return;
  }
  const gvKey = gvApiKey;
  const anKey = anApiKey;
  if (!gvKey || !anKey) { openSettings(); return; }

  const btn       = document.getElementById('analyzeBtn');
  const statusDiv = document.getElementById('ocrStatus');
  const statusTxt = document.getElementById('ocrStatusText');
  btn.disabled    = true;
  ocrItems        = [];
  document.getElementById('ocrPreviewWrap').style.display = 'none';
  document.getElementById('confirmScanBtn').style.display = 'none';

  function setStatus(type, msg) {
    statusDiv.style.display   = 'flex';
    statusDiv.className       = 'ocr-status ' + type;
    const spin = type === 'scanning'
      ? '<div class="spinner" style="width:16px;height:16px;border:2.5px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0;"></div>'
      : '';
    statusDiv.innerHTML       = spin + `<span>${msg}</span>`;
  }

  try {
    // Paso 1: comprimir imagen
    setStatus('scanning', 'Comprimiendo imagen...');
    const b64 = await compressToBase64(img.src, 1600, 0.85);

    // Paso 2: Google Vision OCR
    setStatus('scanning', 'Extrayendo texto con Google Vision...');
    const ocrText = await callGoogleVision(b64, gvKey);
    if (!ocrText || ocrText.trim().length < 20)
      throw new Error('No se detectó texto suficiente. Tomá la foto con mejor iluminación.');

    // Paso 3: Claude Haiku interpreta
    setStatus('scanning', 'Interpretando datos con IA...');
    const parsed = await callClaudeText(ocrText, anKey);

    if (!parsed.es_valido) {
      setStatus('error', '✕ No se detectaron artículos en el documento. Asegurate de que la lista de productos sea visible.');
      btn.disabled = false; return;
    }

    ocrItems = parsed.articulos || [];
    if (ocrItems.length === 0)
      throw new Error('No se detectaron artículos. Asegurate de que la tabla sea visible.');

    const fecha = parsed.fecha || today();
    document.getElementById('sfFecha').value = fecha;

    renderOcrPreview(ocrItems);
    setStatus('done', `✓ ${ocrItems.length} artículos detectados. Revisá y confirmá.`);
    document.getElementById('confirmScanBtn').style.display = 'inline-flex';

  } catch(e) {
    setStatus('error', '✕ ' + (e.message || 'Error desconocido'));
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function compressToBase64(src, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else                { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function callGoogleVision(base64, apiKey) {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
        }]
      })
    }
  );
  if (!res.ok) throw new Error(`Google Vision: error ${res.status}`);
  const data = await res.json();
  if (data.responses?.[0]?.error) throw new Error('Google Vision: ' + data.responses[0].error.message);
  return data.responses?.[0]?.fullTextAnnotation?.text || '';
}

async function callClaudeText(text, apiKey) {
  const needsPrecio = activeModule === 'revestimientos';

  const jsonSchema = needsPrecio
    ? `{"es_valido":true,"fecha":"YYYY-MM-DD","articulos":[{"codigo":"","descripcion":"","cantidad":0,"precio":0.00}]}`
    : `{"es_valido":true,"fecha":"YYYY-MM-DD","articulos":[{"codigo":"","descripcion":"","cantidad":0}]}`;

  const precioRegla = needsPrecio
    ? `- precio: precio unitario como número decimal (ej: 1234.50). Si no figura, usar 0`
    : '';

  const prompt = `Analizá este texto extraído de un documento comercial.
Puede ser una factura, remito, presupuesto, orden de compra, albarán o cualquier documento que liste artículos.

TEXTO:
${text.slice(0, 3000)}

Si el texto NO contiene ninguna lista o tabla de artículos/productos, responde: {"es_valido":false}

Si SÍ contiene artículos, extraé TODOS los que aparezcan en la lista o tabla de productos:
${jsonSchema}

Reglas:
- codigo: código o referencia del artículo si figura, sino ""
- descripcion: descripción completa y exacta del artículo tal como aparece
- cantidad: número entero de unidades. Si dice "2.00" usar 2. Si no hay cantidad clara, usar 1
${precioRegla}
- fecha: fecha del documento en YYYY-MM-DD. Si no figura, usar ""
- Ignorá líneas que sean notas, condiciones de pago, datos del transportista o texto administrativo
- Solo JSON válido, sin texto adicional, sin backticks, sin explicaciones`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Anthropic: ' + (err?.error?.message || `error ${res.status}`));
  }
  const data = await res.json();
  const raw   = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); }
  catch(e) { throw new Error('No se pudo interpretar la respuesta de IA'); }
}

function renderOcrPreview(items) {
  const showPrecio = activeModule === 'revestimientos';
  const tbody = document.getElementById('ocrPreviewBody');

  // Actualizar headers de la preview table
  const thead = tbody.closest('table').querySelector('thead tr');
  thead.innerHTML = `
    <th style="width:26px;">✓</th>
    <th>Código</th>
    <th>Descripción</th>
    <th style="width:54px;">Cant.</th>
    ${showPrecio ? '<th style="width:80px;">Precio</th>' : ''}
    <th>Estado</th>`;

  tbody.innerHTML = items.map((item, i) => {
    const existente = getActiveStock().find(s =>
      s.descripcion.toLowerCase() === item.descripcion.toLowerCase() ||
      (item.codigo && s.codigo === item.codigo)
    );
    const esValido = activeModule !== 'colchones' || isColchonOSomier(item.descripcion);
    const accion   = existente ? 'sum' : esValido ? 'new' : 'skip';
    const badge    = accion === 'sum'  ? '<span class="badge-sum">+Suma</span>'  :
                     accion === 'new'  ? '<span class="badge-new">Nuevo</span>'  :
                                        '<span class="badge-skip">Ignorar</span>';
    const precioCell = showPrecio
      ? `<td><input type="number" class="preview-qty-input" id="ocr_precio_${i}"
              value="${item.precio || 0}" min="0" step="0.01"
              style="width:72px;" inputmode="decimal"></td>`
      : '';
    return `<tr>
      <td><input type="checkbox" class="preview-check" id="ocr_chk_${i}" ${accion !== 'skip' ? 'checked' : ''}></td>
      <td style="font-family:monospace;font-size:11px;color:var(--gray-500);">${esc(item.codigo||'—')}</td>
      <td style="font-weight:600;font-size:12px;max-width:160px;">${esc(item.descripcion)}</td>
      <td><input type="number" class="preview-qty-input" id="ocr_qty_${i}" value="${item.cantidad}" min="0"></td>
      ${precioCell}
      <td>${badge}</td>
    </tr>`;
  }).join('');
  document.getElementById('ocrCount').textContent = items.length;
  document.getElementById('ocrPreviewWrap').style.display = '';
}

// ── SUBIR FACTURA (Opción B: referencia visual + carga manual) ────────────────
let sfItemsList = []; // artículos cargados manualmente

const COLCHON_KEYWORDS = ['colchon','colcho','colch','colc','col ','somier','sommier','som ','mattress'];
function isColchonOSomier(desc) {
  return COLCHON_KEYWORDS.some(k => desc.toLowerCase().includes(k));
}

function openScanModal() {
  sfItemsList = [];
  document.getElementById('scanStep1').style.display = '';
  document.getElementById('scanStep2').style.display = 'none';
  document.getElementById('confirmScanBtn').style.display = 'none';
  document.getElementById('sfList').style.display = 'none';
  document.getElementById('sfItems').innerHTML = '';
  document.getElementById('sfCodigo').value = '';
  document.getElementById('sfDesc').value = '';
  document.getElementById('sfCantidad').value = '';
  document.getElementById('sfFecha').value = today();
  document.getElementById('fileInput').value = '';
  document.getElementById('ocrStatus').style.display = 'none';
  document.getElementById('ocrPreviewWrap').style.display = 'none';
  ocrItems = [];
  document.getElementById('scanModal').classList.add('active');
  initOcrUI();
}

function closeScanModal() {
  document.getElementById('scanModal').classList.remove('active');
}

function changePicture() {
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInput').click();
}

function onDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('dragover'); }
function onDragLeave()  { document.getElementById('dropZone').classList.remove('dragover'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) showRefImage(file);
}
function onFileSelected(e) {
  const file = e.target.files[0];
  if (file) showRefImage(file);
}

function showRefImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const container = document.getElementById('refImgContainer');
    const img = document.getElementById('refImg');
    img.src = e.target.result;
    // Resetear zoom si ya estaba inicializado
    if (container._resetZoom) container._resetZoom(false);
    // Inicializar pan/zoom (solo una vez)
    if (!container._panZoomInit) {
      initImagePanZoom(container);
      container._panZoomInit = true;
    }
    document.getElementById('scanStep1').style.display = 'none';
    document.getElementById('scanStep2').style.display = 'flex';
    document.getElementById('ocrStatus').style.display = 'none';
    document.getElementById('ocrPreviewWrap').style.display = 'none';
    document.getElementById('confirmScanBtn').style.display = 'none';
    ocrItems = [];
    initOcrUI();
    setTimeout(() => document.getElementById('sfDesc').focus(), 150);
  };
  reader.readAsDataURL(file);
}

function addScanItem() {
  const codigo   = document.getElementById('sfCodigo').value.trim();
  const desc     = document.getElementById('sfDesc').value.trim();
  const cantidad = parseInt(document.getElementById('sfCantidad').value);
  const fecha    = document.getElementById('sfFecha').value || today();

  if (!desc)                           { showToast('Ingresá la descripción', 'error'); return; }
  if (isNaN(cantidad) || cantidad <= 0){ showToast('Ingresá una cantidad válida', 'error'); return; }

  // Verificar duplicado en la lista temporal
  const dupLocal = sfItemsList.find(i => i.descripcion.toLowerCase() === desc.toLowerCase());
  if (dupLocal) { showToast('Ya agregaste ese artículo a la lista', 'error'); return; }

  const existente = getActiveStock().find(s =>
    s.descripcion.toLowerCase() === desc.toLowerCase() ||
    (codigo && s.codigo === codigo)
  );
  // En muebles y revestimientos siempre crear nuevo; en colchones solo si es colchón/somier
  const esValido = activeModule !== 'colchones' || isColchonOSomier(desc);
  const accion = existente ? 'sum' : esValido ? 'new' : 'skip';

  sfItemsList.push({ codigo, descripcion: desc, cantidad, fecha, accion, existenteId: existente?.id || null });

  // Limpiar campos (excepto fecha)
  document.getElementById('sfCodigo').value   = '';
  document.getElementById('sfDesc').value     = '';
  document.getElementById('sfCantidad').value = '';
  document.getElementById('sfDesc').focus();

  renderSfList();
}

function removeSfItem(idx) {
  sfItemsList.splice(idx, 1);
  renderSfList();
}

function renderSfList() {
  const list   = document.getElementById('sfList');
  const items  = document.getElementById('sfItems');
  const count  = document.getElementById('sfCount');
  const btnCon = document.getElementById('confirmScanBtn');

  if (sfItemsList.length === 0) {
    list.style.display   = 'none';
    btnCon.style.display = 'none';
    return;
  }

  list.style.display   = '';
  btnCon.style.display = 'inline-flex';
  count.textContent    = sfItemsList.length;

  items.innerHTML = sfItemsList.map((item, i) => {
    const badge = item.accion === 'sum'  ? `<span class="badge-sum">+Suma</span>`  :
                  item.accion === 'new'  ? `<span class="badge-new">Nuevo</span>`  :
                                           `<span class="badge-skip">Ignorar</span>`;
    return `<div class="sf-item">
      <div class="sf-item-info">
        <div class="sf-item-desc" title="${esc(item.descripcion)}">${esc(item.descripcion)}</div>
        <div class="sf-item-meta">${item.codigo ? `Cód: ${esc(item.codigo)} · ` : ''}Cant: ${item.cantidad} · ${badge}</div>
      </div>
      <button class="sf-item-remove" onclick="removeSfItem(${i})" title="Quitar">✕</button>
    </div>`;
  }).join('');

  // Auto-scroll al último item agregado
  setTimeout(() => { items.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
}

// ── PAN / ZOOM EN IMAGEN DE FACTURA ──────────────────────────────────────────
function initImagePanZoom(container) {
  const img = container.querySelector('.ref-image');
  let scale = 1, tx = 0, ty = 0;
  let startTx = 0, startTy = 0, startX = 0, startY = 0;
  let isPanning = false;
  let initPinchDist = 0, initScale = 1;

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function maxPan() {
    const w = container.clientWidth, h = container.clientHeight;
    return {
      x: Math.max(0, (w * scale - w) / 2),
      y: Math.max(0, (h * scale - h) / 2)
    };
  }

  function apply(animated) {
    img.style.transition = animated ? 'transform 0.25s ease' : 'none';
    img.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale})`;
    container.style.cursor = scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in';
  }

  function reset(animated = true) {
    scale = 1; tx = 0; ty = 0; apply(animated);
  }

  function pinchDist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  // Doble toque para resetear
  let lastTap = 0;
  container.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 280 && e.touches.length === 0) reset();
    lastTap = now;
  });

  // Touch start
  container.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      isPanning = scale > 1;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTx = tx; startTy = ty;
    } else if (e.touches.length === 2) {
      initPinchDist = pinchDist(e.touches);
      initScale = scale;
    }
  }, { passive: false });

  // Touch move
  container.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom
      const dist = pinchDist(e.touches);
      scale = clamp(initScale * (dist / initPinchDist), 1, 5);
      const mp = maxPan();
      tx = clamp(tx, -mp.x, mp.x);
      ty = clamp(ty, -mp.y, mp.y);
      apply(false);
    } else if (e.touches.length === 1 && isPanning) {
      // Pan
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      const mp = maxPan();
      tx = clamp(startTx + dx, -mp.x, mp.x);
      ty = clamp(startTy + dy, -mp.y, mp.y);
      apply(false);
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    isPanning = false;
    if (scale <= 1.05) reset(true);
  });

  // Mouse: scroll para zoom, drag para pan (desktop)
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = clamp(scale * (e.deltaY < 0 ? 1.15 : 0.87), 1, 5);
    const mp = maxPan();
    tx = clamp(tx, -mp.x, mp.x);
    ty = clamp(ty, -mp.y, mp.y);
    apply(false);
  }, { passive: false });

  container.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    isPanning = true;
    startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
    container.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const mp = maxPan();
    tx = clamp(startTx + (e.clientX - startX), -mp.x, mp.x);
    ty = clamp(startTy + (e.clientY - startY), -mp.y, mp.y);
    apply(false);
  });
  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    container.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
  });

  // Exponer reset para cuando se cambia la imagen
  container._resetZoom = reset;
}

async function confirmScan() {
  // Combinar items OCR + manuales
  const allItems = [];

  // Items del OCR preview
  ocrItems.forEach((item, i) => {
    const chk = document.getElementById(`ocr_chk_${i}`);
    if (!chk?.checked) return;
    const qty = parseInt(document.getElementById(`ocr_qty_${i}`)?.value) || 0;
    if (qty <= 0) return;
    const existente = getActiveStock().find(s =>
      s.descripcion.toLowerCase() === item.descripcion.toLowerCase() ||
      (item.codigo && s.codigo === item.codigo)
    );
    const esValido = activeModule !== 'colchones' || isColchonOSomier(item.descripcion);
    allItems.push({
      codigo: item.codigo || '', descripcion: item.descripcion,
      cantidad: qty, fecha: document.getElementById('sfFecha').value || today(),
      precio: activeModule === 'revestimientos'
        ? (parseFloat(document.getElementById(`ocr_precio_${i}`)?.value) || 0)
        : undefined,
      accion: existente ? 'sum' : esValido ? 'new' : 'skip',
      existenteId: existente?.id || null
    });
  });

  // Items manuales
  sfItemsList.forEach(item => allItems.push(item));

  if (!allItems.length) { showToast('Agregá al menos un artículo', 'error'); return; }
  let sumados = 0, nuevos = 0, ignorados = 0;
  setLoading(true);
  try {
    for (const item of allItems) {
      if (item.accion === 'sum' && item.existenteId) {
        const arr = getActiveStock(); const idx = arr.findIndex(s => s.id === item.existenteId);
        if (idx >= 0) {
          const arr = getActiveStock();
          const nv = arr[idx].cantidad + item.cantidad;
          const updated = await sbRequest('PATCH', `?id=eq.${item.existenteId}`, { cantidad: nv, fecha: item.fecha }, getActiveTable());
          arr[idx] = updated[0];
          sumados++;
        }
      } else if (item.accion === 'new') {
        const body = activeModule === 'colchones'
          ? { codigo: item.codigo || '', descripcion: item.descripcion, cantidad: item.cantidad, fecha: item.fecha }
          : { proveedor: getActiveProvName(), codigo: item.codigo || '', descripcion: item.descripcion, cantidad: item.cantidad, fecha: item.fecha,
              ...(item.precio !== undefined ? { precio: item.precio } : {}) };
        const inserted = await sbRequest('POST', '', body, getActiveTable());
        getActiveStock().push(inserted[0]);
        nuevos++;
      } else {
        ignorados++;
      }
    }
    closeScanModal();
    renderTable();
    const msgs = [];
    if (sumados)   msgs.push(`${sumados} actualizados`);
    if (nuevos)    msgs.push(`${nuevos} nuevos`);
    if (ignorados) msgs.push(`${ignorados} ignorados`);
    showToast(`Importado: ${msgs.join(', ')}`, 'success');
  } catch(e) {
    showToast('Error al importar: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── INIT (disparado acá porque ui.js es el último archivo en cargar) ────────
init();
