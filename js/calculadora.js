// ── CALCULADORA DE MATERIALES (dentro de Revestimientos) ─────────────────────
// Sección 1: alta/edición/baja de medidas de artículos (tabla medidas_articulos
// en Supabase). m2_por_unidad es una columna GENERATED ALWAYS AS por la base
// — nunca se manda en el insert/update, la calcula y la devuelve Postgres solo.
// Sección 2: calculadora de cuántas unidades o cajas hacen falta para cubrir
// una superficie, sin precios. El resultado se puede enviar como ítem (sin
// precio unitario) a la sub-pestaña Presupuesto.

const MEDIDA_TIPO_LABEL = { revestimiento: 'Revestimiento', cielorraso: 'Cielorraso', piso: 'Piso' };

let medidasArticulos = []; // filas de medidas_articulos
let medidasCargadas  = false;
let medidaEditandoId = null; // id de la medida en edición, o null si el formulario es para un alta nueva

let calcArticuloSeleccionado = null; // una fila de medidasArticulos
let calcAberturas            = [];   // [{ descripcion, ancho, alto }]
let calcUltimoResultado      = null; // { cantidad, esCaja, nombre } del último cálculo renderizado

// ── CARGA (lazy, una sola vez por sesión) ────────────────────────────────────
async function cargarMedidasArticulos() {
  if (medidasCargadas) return;
  setLoading(true);
  try {
    medidasArticulos = await sbRequest('GET', '?select=*&order=nombre.asc', null, 'medidas_articulos') || [];
    medidasCargadas = true;
  } catch (e) {
    showToast('Error al cargar las medidas de artículos', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function initCalculadora() {
  await cargarMedidasArticulos();
  medidasRenderTabla();
  medidaActualizarPreview();
  calcRenderAberturas();
  calcPoblarSelectorArticulos();
  calcActualizarResultado();
}

function formatM2(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
}

// ══ SECCIÓN 1 — GESTIÓN DE MEDIDAS ══════════════════════════════════════════
function medidaM2PorUnidad(anchoMm, largoMm) {
  return (anchoMm / 1000) * (largoMm / 1000);
}

function medidaActualizarPreview() {
  const preview = document.getElementById('medidaPreview');
  if (!preview) return;
  const ancho = parseFloat(document.getElementById('medidaAncho')?.value);
  const largo = parseFloat(document.getElementById('medidaLargo')?.value);
  if (!ancho || !largo) { preview.textContent = ''; return; }
  const m2 = medidaM2PorUnidad(ancho, largo);
  preview.textContent = `Esta tira cubre ${m2.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} m² por unidad`;
}

function medidaLimpiarFormulario() {
  document.getElementById('medidaNombre').value = '';
  document.getElementById('medidaTipo').value = 'revestimiento';
  document.getElementById('medidaAncho').value = '';
  document.getElementById('medidaLargo').value = '';
  document.getElementById('medidaUnidadesPorCaja').value = '';
  document.getElementById('medidaNotas').value = '';
  medidaEditandoId = null;
  document.getElementById('medidaCancelarBtn').hidden = true;
  document.getElementById('medidaGuardarBtn').textContent = 'Guardar medida';
  medidaActualizarPreview();
}

function medidaCancelarEdicion() {
  medidaLimpiarFormulario();
}

async function medidaGuardar() {
  const nombre = document.getElementById('medidaNombre').value.trim();
  const tipo = document.getElementById('medidaTipo').value;
  const ancho = parseFloat(document.getElementById('medidaAncho').value);
  const largo = parseFloat(document.getElementById('medidaLargo').value);
  const unidadesPorCajaRaw = document.getElementById('medidaUnidadesPorCaja').value.trim();
  const notas = document.getElementById('medidaNotas').value.trim();

  if (!nombre) { showToast('Ingresá el nombre del artículo', 'error'); return; }
  if (!ancho || ancho <= 0) { showToast('Ingresá un ancho válido', 'error'); return; }
  if (!largo || largo <= 0) { showToast('Ingresá un largo válido', 'error'); return; }

  // m2_por_unidad NO se manda: es GENERATED ALWAYS en la tabla, Postgres la calcula sola
  const payload = {
    nombre, tipo, ancho_mm: ancho, largo_mm: largo,
    unidades_por_caja: unidadesPorCajaRaw ? parseInt(unidadesPorCajaRaw, 10) : null,
    notas: notas || null
  };

  setLoading(true);
  try {
    if (medidaEditandoId) {
      const updated = await sbRequest('PATCH', `?id=eq.${medidaEditandoId}`, payload, 'medidas_articulos');
      const idx = medidasArticulos.findIndex(m => m.id === medidaEditandoId);
      if (idx >= 0) medidasArticulos[idx] = updated[0];
      showToast('Medida actualizada', 'success');
    } else {
      const inserted = await sbRequest('POST', '', payload, 'medidas_articulos');
      medidasArticulos.push(inserted[0]);
      showToast('Medida guardada', 'success');
    }
    medidasArticulos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    medidaLimpiarFormulario();
    medidasRenderTabla();
    calcPoblarSelectorArticulos();
  } catch (e) {
    showToast('Error al guardar la medida', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function medidaEditar(id) {
  const m = medidasArticulos.find(x => x.id === id);
  if (!m) return;
  medidaEditandoId = id;
  document.getElementById('medidaNombre').value = m.nombre;
  document.getElementById('medidaTipo').value = m.tipo;
  document.getElementById('medidaAncho').value = m.ancho_mm;
  document.getElementById('medidaLargo').value = m.largo_mm;
  document.getElementById('medidaUnidadesPorCaja').value = m.unidades_por_caja ?? '';
  document.getElementById('medidaNotas').value = m.notas || '';
  document.getElementById('medidaCancelarBtn').hidden = false;
  document.getElementById('medidaGuardarBtn').textContent = 'Guardar cambios';
  medidaActualizarPreview();
  document.getElementById('medidaNombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function medidaEliminar(id) {
  const m = medidasArticulos.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`¿Eliminar "${m.nombre}"?`)) return;

  setLoading(true);
  try {
    await sbRequest('DELETE', `?id=eq.${id}`, null, 'medidas_articulos');
    medidasArticulos = medidasArticulos.filter(x => x.id !== id);
    if (medidaEditandoId === id) medidaLimpiarFormulario();
    medidasRenderTabla();
    calcPoblarSelectorArticulos();
    if (calcArticuloSeleccionado?.id === id) {
      calcArticuloSeleccionado = null;
      const select = document.getElementById('calcArticuloSelect');
      if (select) select.value = '';
      calcRenderArticuloInfo();
      calcActualizarResultado();
    }
    showToast('Medida eliminada', 'info');
  } catch (e) {
    showToast('Error al eliminar la medida', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function medidasRenderTabla() {
  const tbody = document.getElementById('medidasTablaBody');
  if (!tbody) return;
  if (!medidasArticulos.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="icon">📏</span><p>No hay medidas guardadas. Agregá tu primer artículo arriba.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = medidasArticulos.map(m => `
    <tr>
      <td>${esc(m.nombre)}</td>
      <td>${esc(MEDIDA_TIPO_LABEL[m.tipo] || m.tipo)}</td>
      <td class="center">${esc(m.ancho_mm)} mm</td>
      <td class="center">${esc(m.largo_mm)} mm</td>
      <td class="center">${formatM2(m.m2_por_unidad)}</td>
      <td class="center">${m.unidades_por_caja ?? '—'}</td>
      <td>${esc(m.notas || '—')}</td>
      <td class="calc-medida-acciones">
        <button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="medidaEditar(${m.id})" title="Editar" aria-label="Editar">✏</button>
        <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="medidaEliminar(${m.id})" title="Eliminar" aria-label="Eliminar">🗑</button>
      </td>
    </tr>`).join('');
}

// ══ SECCIÓN 2 — CALCULADORA ══════════════════════════════════════════════════
// PASO 1: artículo
function calcPoblarSelectorArticulos() {
  const select = document.getElementById('calcArticuloSelect');
  const sinArticulos = document.getElementById('calcSinArticulos');
  const conArticulos = document.getElementById('calcConArticulos');
  if (!select) return;

  const hay = medidasArticulos.length > 0;
  if (sinArticulos) sinArticulos.hidden = hay;
  if (conArticulos) conArticulos.hidden = !hay;
  if (!hay) return;

  const valorActual = select.value;
  select.innerHTML = `<option value="">Elegí un artículo...</option>` +
    medidasArticulos.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
  if (valorActual && medidasArticulos.some(m => String(m.id) === valorActual)) select.value = valorActual;
}

function calcIrAGestionMedidas() {
  const campo = document.getElementById('medidaNombre');
  if (!campo) return;
  campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  campo.focus();
}

function calcOnArticuloChange() {
  const id = document.getElementById('calcArticuloSelect')?.value;
  calcArticuloSeleccionado = medidasArticulos.find(m => String(m.id) === String(id)) || null;
  calcRenderArticuloInfo();
  calcActualizarResultado();
}

function calcRenderArticuloInfo() {
  const wrap = document.getElementById('calcArticuloInfo');
  if (!wrap) return;
  const m = calcArticuloSeleccionado;
  if (!m) { wrap.hidden = true; wrap.innerHTML = ''; return; }

  let html = `<div class="calc-articulo-info-linea">📐 Tira de ${esc(m.ancho_mm)}mm × ${esc(m.largo_mm)}mm — cubre ${formatM2(m.m2_por_unidad)} por unidad</div>`;
  if (m.unidades_por_caja) {
    html += `<div class="calc-articulo-info-linea">📦 Caja de ${m.unidades_por_caja} unidades cubre ${formatM2(m.m2_por_unidad * m.unidades_por_caja)}</div>`;
  }
  if (m.notas) html += `<div class="calc-articulo-info-notas">${esc(m.notas)}</div>`;
  wrap.innerHTML = html;
  wrap.hidden = false;
}

// PASO 2: superficie a cubrir
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

// PASO 3 + 4: desperdicio y resultado (todo se recalcula junto, en tiempo real)
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

  const panel = document.getElementById('calcResultadoPanel');
  const btnWrap = document.getElementById('calcAgregarPresupuestoWrap');
  if (!panel) return;

  const m = calcArticuloSeleccionado;
  if (!m) {
    panel.innerHTML = `<div class="empty-state"><span class="icon">🧮</span><p>Elegí un artículo para ver el resultado</p></div>`;
    if (btnWrap) btnWrap.hidden = true;
    calcUltimoResultado = null;
    return;
  }
  if (m2final <= 0) {
    panel.innerHTML = `<div class="empty-state"><span class="icon">📏</span><p>Ingresá la superficie a cubrir</p></div>`;
    if (btnWrap) btnWrap.hidden = true;
    calcUltimoResultado = null;
    return;
  }

  const esCaja = m.unidades_por_caja != null;
  let cantidad, m2Cubiertos, filaExtra = '';
  if (esCaja) {
    const m2PorCaja = m.m2_por_unidad * m.unidades_por_caja;
    cantidad = Math.ceil(m2final / m2PorCaja);
    const unidadesTotales = cantidad * m.unidades_por_caja;
    m2Cubiertos = cantidad * m2PorCaja;
    filaExtra = calcFila('Unidades totales', `${cantidad} caja${cantidad === 1 ? '' : 's'} × ${m.unidades_por_caja} = ${unidadesTotales} unidades`);
  } else {
    cantidad = Math.ceil(m2final / m.m2_por_unidad);
    m2Cubiertos = cantidad * m.m2_por_unidad;
  }
  const sobrante = m2Cubiertos - m2final;

  panel.innerHTML = `
    ${calcFila('M² a cubrir', desperdicioActivo ? `${formatM2(m2base)} → ${formatM2(m2final)} con desperdicio` : formatM2(m2base))}
    <div class="calc-resultado-cantidad">
      <span class="calc-resultado-cantidad-num">${cantidad}</span>
      <span class="calc-resultado-cantidad-label">${esCaja ? (cantidad === 1 ? 'caja necesaria' : 'cajas necesarias') : (cantidad === 1 ? 'unidad necesaria' : 'unidades necesarias')}</span>
    </div>
    ${filaExtra}
    ${calcFila(esCaja ? 'M² que cubren esas cajas' : 'M² que cubren esas unidades', formatM2(m2Cubiertos))}
    ${calcFila('M² sobrantes', formatM2(sobrante))}
  `;

  calcUltimoResultado = { cantidad, esCaja, nombre: m.nombre };
  if (btnWrap) btnWrap.hidden = false;
}

function calcAgregarAlPresupuesto() {
  if (!calcUltimoResultado) return;
  window.agregarItemPresupuesto(calcUltimoResultado.nombre, calcUltimoResultado.cantidad, null);
}
