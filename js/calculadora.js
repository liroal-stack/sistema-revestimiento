// ── CALCULADORA DE MATERIALES (dentro de Revestimientos) ─────────────────────
// Combina dimensiones_productos (medidas/cobertura de cada presentación) con
// lista_precios (precio) para calcular cuántas unidades o cajas hacen falta
// para cubrir un ambiente, y el precio total. Reutiliza los loaders ya
// factorizados de lista-precios.js y ventas.js en vez de duplicar consultas.

let calcProductos        = []; // dimensiones_productos ya cruzado con su fila de lista_precios: { ...dim, lp }
let calcProductosCargados = false;
let calcAberturas        = []; // [{ descripcion, ancho, alto }]
let calcProductoSeleccionado = null; // uno de calcProductos
let calcUltimoResultado  = null;     // { cantidad, esCaja } del último cálculo renderizado

// ── CARGA (lazy, una sola vez por sesión) ────────────────────────────────────
async function cargarCalculadoraProductos() {
  if (calcProductosCargados) return;
  setLoading(true);
  try {
    const [dims] = await Promise.all([
      sbRequest('GET', '?select=*', null, 'dimensiones_productos'),
      cargarListaPrecios() // ya trae/cachea listaPrecios (ver js/lista-precios.js)
    ]);
    calcProductos = (dims || [])
      .map(d => {
        const lp = listaPrecios.find(p => p.codigo === d.lista_precios_codigo && p.proveedor === d.lista_precios_proveedor);
        return lp ? { ...d, lp } : null;
      })
      .filter(Boolean); // si algún vínculo quedó roto, se ignora esa fila en vez de romper la calculadora
    calcProductosCargados = true;
  } catch (e) {
    showToast('Error al cargar los productos de la calculadora', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function initCalculadora() {
  await cargarCalculadoraProductos();
  try { await cargarVentaStock(); } catch (e) { /* "Agregar a venta" simplemente no aparece si esto falla */ }
  calcRenderAberturas();
  calcActualizarResultado();
}

// ── PASO 1: SELECCIÓN DE PRODUCTO ────────────────────────────────────────────
function calcOnTipoChange() {
  calcRenderResultadosBusqueda();
}

function calcRenderResultadosBusqueda() {
  const cont = document.getElementById('calcProductoResultados');
  if (!cont) return;
  const tipo = document.getElementById('calcTipo')?.value;
  const tokens = tokenizarBusquedaPrecios(document.getElementById('calcBuscarProducto')?.value || '');

  let items = calcProductos.filter(d => d.tipo === tipo);
  if (tokens.length) {
    items = items.filter(d => {
      const haystack = normalizarPreservandoIndices(`${d.lp.descripcion} ${d.lista_precios_codigo} ${d.lista_precios_proveedor}`);
      return tokens.every(t => haystack.includes(t));
    });
  }
  const total = items.length;
  items = items.slice(0, 20); // la lista es para elegir, no para leer entera — se recorta igual que en otros buscadores del sistema

  if (!total) {
    cont.innerHTML = `<div class="calc-producto-vacio">No hay productos con dimensiones cargadas para este filtro</div>`;
  } else {
    cont.innerHTML = items.map(d => `
      <button type="button" class="calc-producto-opt"
        onclick="calcSeleccionarProducto('${d.lista_precios_codigo.replace(/'/g, "\\'")}','${d.lista_precios_proveedor.replace(/'/g, "\\'")}')">
        <span class="calc-producto-opt-codigo">${esc(d.lista_precios_codigo)}</span>
        <span class="calc-producto-opt-desc">${esc(d.lp.descripcion)}</span>
        <span class="calc-producto-opt-prov">${esc(d.lista_precios_proveedor)}</span>
      </button>`).join('') + (total > items.length ? `<div class="calc-producto-mas">y ${total - items.length} más — refiná la búsqueda</div>` : '');
  }
  cont.hidden = false;
}

function calcSeleccionarProducto(codigo, proveedor) {
  const d = calcProductos.find(x => x.lista_precios_codigo === codigo && x.lista_precios_proveedor === proveedor);
  if (!d) return;
  calcProductoSeleccionado = d;

  const resultados = document.getElementById('calcProductoResultados');
  if (resultados) resultados.hidden = true;
  const buscar = document.getElementById('calcBuscarProducto');
  if (buscar) buscar.value = '';
  document.getElementById('calcProductoSelector').hidden = true;

  calcRenderProductoElegido();
  calcActualizarResultado();
}

function calcCambiarProducto() {
  calcProductoSeleccionado = null;
  document.getElementById('calcProductoElegido').hidden = true;
  document.getElementById('calcProductoSelector').hidden = false;
  calcActualizarResultado();
}

// Cierra la lista de resultados al tocar/clickear afuera (mismo patrón que el
// dropdown de categorías de Precios, ver js/lista-precios.js)
document.addEventListener('click', e => {
  const cont = document.getElementById('calcProductoResultados');
  const selector = document.getElementById('calcProductoSelector');
  if (cont && !cont.hidden && selector && !selector.contains(e.target)) cont.hidden = true;
});

function calcRenderProductoElegido() {
  const wrap = document.getElementById('calcProductoElegido');
  if (!wrap) return;
  const d = calcProductoSeleccionado;
  if (!d) { wrap.hidden = true; return; }

  const esCaja = d.m2_por_caja != null;
  const presentacion = esCaja
    ? `📦 ${esc(d.notas || 'Caja')} — caja cubre ${formatM2(d.m2_por_caja)}`
    : `📐 ${esc(d.notas || 'Unidad')} — cubre ${formatM2(d.m2_por_unidad)} por unidad`;

  wrap.innerHTML = `
    <div class="calc-producto-elegido-codigo">${esc(d.lista_precios_codigo)} · ${esc(d.lista_precios_proveedor)}</div>
    <div class="calc-producto-elegido-desc">${esc(d.lp.descripcion)}</div>
    <div class="calc-producto-elegido-presentacion">${presentacion}</div>
    <button type="button" class="calc-producto-elegido-cambiar" onclick="calcCambiarProducto()">Cambiar producto</button>
  `;
  wrap.hidden = false;
}

// ── PASO 2: MEDIDAS DEL ESPACIO ──────────────────────────────────────────────
function calcOnModoChange() {
  const modo = document.querySelector('input[name="calcModo"]:checked')?.value || 'dimensiones';
  const elDim = document.getElementById('calcModoDimensiones');
  const elM2  = document.getElementById('calcModoM2Directos');
  if (elDim) elDim.hidden = modo !== 'dimensiones';
  if (elM2)  elM2.hidden  = modo !== 'm2directos';
  calcActualizarResultado();
}

function calcAgregarAbertura() {
  calcAberturas.push({ descripcion: '', ancho: 0, alto: 0 });
  calcRenderAberturas();
  calcActualizarResultado();
}
function calcQuitarAbertura(idx) {
  calcAberturas.splice(idx, 1);
  calcRenderAberturas();
  calcActualizarResultado();
}
function calcActualizarAbertura(idx, campo, valor) {
  if (!calcAberturas[idx]) return;
  calcAberturas[idx][campo] = campo === 'descripcion' ? valor : (parseFloat(valor) || 0);
  calcActualizarResultado();
}
function calcRenderAberturas() {
  const cont = document.getElementById('calcAberturasList');
  if (!cont) return;
  cont.innerHTML = calcAberturas.map((a, i) => `
    <div class="calc-abertura-row">
      <input type="text" class="form-control calc-abertura-desc" placeholder="Ej: Ventana"
        value="${esc(a.descripcion)}" oninput="calcActualizarAbertura(${i},'descripcion',this.value)">
      <input type="number" step="0.01" min="0" class="form-control calc-abertura-dim" placeholder="Ancho (m)"
        value="${a.ancho || ''}" oninput="calcActualizarAbertura(${i},'ancho',this.value)">
      <input type="number" step="0.01" min="0" class="form-control calc-abertura-dim" placeholder="Alto (m)"
        value="${a.alto || ''}" oninput="calcActualizarAbertura(${i},'alto',this.value)">
      <button type="button" class="calc-abertura-del" onclick="calcQuitarAbertura(${i})" title="Eliminar abertura" aria-label="Eliminar abertura">✕</button>
    </div>`).join('');
}

// m² brutos, antes del desperdicio: dimensiones del ambiente menos aberturas, o el valor directo
function calcM2Base() {
  const modo = document.querySelector('input[name="calcModo"]:checked')?.value || 'dimensiones';
  if (modo === 'm2directos') {
    return Math.max(0, parseFloat(document.getElementById('calcM2Directos')?.value) || 0);
  }
  const ancho = parseFloat(document.getElementById('calcAncho')?.value) || 0;
  const alto  = parseFloat(document.getElementById('calcAlto')?.value) || 0;
  const descuento = calcAberturas.reduce((s, a) => s + (a.ancho || 0) * (a.alto || 0), 0);
  return Math.max(0, ancho * alto - descuento);
}

function formatM2(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
}

// ── PASO 3 + 4: DESPERDICIO Y RESULTADO (todo se recalcula junto, en tiempo real) ──
function calcFila(label, valor) {
  return `<div class="calc-fila"><span class="calc-fila-label">${label}</span><span class="calc-fila-valor">${valor}</span></div>`;
}

function calcActualizarResultado() {
  const desperdicioActivo = document.getElementById('calcDesperdicioCheck')?.checked;
  const wrapPct = document.getElementById('calcDesperdicioInputWrap');
  if (wrapPct) wrapPct.hidden = !desperdicioActivo;

  const pctInput = document.getElementById('calcDesperdicioPct');
  const pctLabel = document.getElementById('calcDesperdicioPctLabel');
  const pct = Math.min(20, Math.max(5, parseFloat(pctInput?.value) || 10));
  if (pctLabel) pctLabel.textContent = pct + '%';

  const m2base  = calcM2Base();
  const m2final = desperdicioActivo ? m2base * (1 + pct / 100) : m2base;

  const textoDesperdicio = document.getElementById('calcM2ConDesperdicio');
  if (textoDesperdicio) {
    textoDesperdicio.textContent = desperdicioActivo && m2base > 0 ? `M² con desperdicio: ${formatM2(m2final)}` : '';
  }

  const panel  = document.getElementById('calcResultadoPanel');
  const btnWrap = document.getElementById('calcAgregarVentaWrap');
  if (!panel) return;

  if (!calcProductoSeleccionado) {
    panel.innerHTML = `<div class="empty-state"><span class="icon">🧮</span><p>Elegí un producto para ver el resultado</p></div>`;
    if (btnWrap) btnWrap.hidden = true;
    calcUltimoResultado = null;
    return;
  }
  if (m2base <= 0) {
    panel.innerHTML = `<div class="empty-state"><span class="icon">📏</span><p>Ingresá las medidas del espacio</p></div>`;
    if (btnWrap) btnWrap.hidden = true;
    calcUltimoResultado = null;
    return;
  }

  const d  = calcProductoSeleccionado;
  const lp = d.lp;
  const esCaja  = d.m2_por_caja != null;
  // Caso especial (cielorrasos MAXIPLACAS, PVC Simil Marmol, etc.): precio_sin_iva
  // es precio POR M², no por unidad/caja — independiente de si además se vende
  // por caja (ver notas de dimensiones_productos, p. ej. id 20: tiene m2_por_caja
  // Y "Precio x M2" a la vez).
  const esPorM2 = /precio\s*x\s*m2/i.test(d.notas || '');

  let cantidad, filasCantidad;
  if (esCaja) {
    cantidad = Math.ceil(m2final / d.m2_por_caja);
    const m2Cubiertos = cantidad * d.m2_por_caja;
    filasCantidad = calcFila('Cajas necesarias', `${cantidad} caja${cantidad === 1 ? '' : 's'}`)
      + calcFila('M² que cubren esas cajas', formatM2(m2Cubiertos))
      + calcFila('M² sobrantes', formatM2(m2Cubiertos - m2final));
  } else {
    cantidad = Math.ceil(m2final / d.m2_por_unidad);
    filasCantidad = calcFila('Unidades necesarias', `${cantidad} unidad${cantidad === 1 ? '' : 'es'}`);
  }

  let totalSinIva, totalConIva, filaPrecio;
  if (esPorM2) {
    totalSinIva = m2final * lp.precio_sin_iva;
    totalConIva = m2final * lp.precio_con_iva;
    filaPrecio = calcFila('Precio por m²', `${formatPrecio(lp.precio_sin_iva)} s/IVA · ${formatPrecio(lp.precio_con_iva)} c/IVA`);
  } else {
    totalSinIva = cantidad * lp.precio_sin_iva;
    totalConIva = cantidad * lp.precio_con_iva;
    filaPrecio = calcFila(esCaja ? 'Precio por caja' : 'Precio por unidad', `${formatPrecio(lp.precio_sin_iva)} s/IVA · ${formatPrecio(lp.precio_con_iva)} c/IVA`);
  }

  panel.innerHTML = `
    ${calcFila('M² a cubrir', desperdicioActivo ? `${formatM2(m2base)} → ${formatM2(m2final)} con desperdicio` : formatM2(m2base))}
    ${filasCantidad}
    ${filaPrecio}
    <div class="calc-total-row">
      <span class="calc-total-label">Precio total s/IVA</span>
      <span class="calc-total-valor">${formatPrecio(totalSinIva)}</span>
    </div>
    <div class="calc-total-row calc-total-row-principal">
      <span class="calc-total-label">Precio total c/IVA</span>
      <span class="calc-total-valor calc-total-valor-principal">${formatPrecio(totalConIva)}</span>
    </div>
  `;

  calcUltimoResultado = { cantidad, esCaja };

  // "Agregar a venta" solo si este producto (por código) también está en
  // stock_revestimientos — son catálogos distintos (lista de precios vs. stock
  // físico por proveedor), así que no siempre va a estar.
  const stockItem = typeof getVentaStockItems === 'function'
    ? getVentaStockItems().find(i => (i.codigo || '').toLowerCase() === (d.lista_precios_codigo || '').toLowerCase())
    : null;
  if (btnWrap) {
    btnWrap.hidden = !stockItem;
    if (stockItem) {
      const unidad = esCaja ? (cantidad === 1 ? 'caja' : 'cajas') : (cantidad === 1 ? 'unidad' : 'unidades');
      const btn = document.getElementById('calcAgregarVentaBtn');
      if (btn) { btn.textContent = `Agregar ${cantidad} ${unidad} a venta`; btn.dataset.stockId = stockItem.id; }
    }
  }
}

async function calcAgregarAVenta() {
  const btn = document.getElementById('calcAgregarVentaBtn');
  const stockId = parseInt(btn?.dataset.stockId);
  if (!calcUltimoResultado || !stockId) return;

  const antes = carrito['stock_' + stockId]?.cantidad || 0;
  await switchModule('revestimientos');
  switchRevestSubview('ventas');
  for (let i = 0; i < calcUltimoResultado.cantidad; i++) addToCart(stockId);
  const despues = carrito['stock_' + stockId]?.cantidad || 0;

  if (despues > antes) showToast(`${despues - antes} ${calcUltimoResultado.esCaja ? 'cajas' : 'unidades'} agregadas al carrito`, 'success');
}
