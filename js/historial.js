// ── HISTORIAL DE AUDITORÍA ───────────────────────────────────────────────────
// 1) registrarHistorial(): inserta un evento en la tabla `historial` de Supabase.
//    Es "silencioso": nunca lanza ni muestra errores, y no se espera (await) en
//    los flujos que lo llaman, para no frenar ni interrumpir la operación real.
// 2) Pestaña "Historial" (solo sergio): consulta de solo lectura con filtros y
//    paginación. Este archivo se carga antes que ui.js/stock-*.js, pero sus
//    funciones solo se invocan en runtime, cuando todo el resto ya existe.

const HISTORIAL_TABLA     = 'historial';
const HISTORIAL_PAGE_SIZE = 50;

const HISTORIAL_MODULOS = {
  colchones: 'Colchones',
  muebles: 'Muebles',
  revestimientos: 'Revestimientos',
  pedidos: 'Pedidos'
};

// ── REGISTRO DE EVENTOS ──────────────────────────────────────────────────────
// valor_anterior / valor_nuevo / detalle son opcionales. Los valores numéricos se
// mandan como texto (las columnas de valor son text).
async function registrarHistorial({ modulo, accion, articulo, valorAnterior, valorNuevo, detalle }) {
  try {
    const usuario = getCurrentUser();
    if (!usuario) return;
    const fila = {
      usuario,
      modulo,
      accion,
      articulo: articulo == null ? null : String(articulo),
      valor_anterior: valorAnterior == null ? null : String(valorAnterior),
      valor_nuevo: valorNuevo == null ? null : String(valorNuevo),
      detalle: detalle == null || detalle === '' ? null : String(detalle)
    };
    await sbRequest('POST', '', fila, HISTORIAL_TABLA);
  } catch (e) {
    // silencioso a propósito: el historial nunca debe interrumpir al usuario
  }
}

// Módulo/proveedor del stock activo (Colchones no tiene proveedor). Se usa desde
// ui.js, donde el mismo código atiende Colchones, Muebles y Revestimientos.
function historialModuloActivo() {
  return HISTORIAL_MODULOS[activeModule] || activeModule;
}
function historialProveedorActivo() {
  return activeModule === 'colchones' ? '' : getActiveProvName();
}

// Atajo para eventos del stock activo (ajuste, alta, baja, edición). El detalle
// siempre lleva el proveedor (Muebles/Revestimientos) seguido del texto extra.
function registrarHistorialStock(accion, articulo, extra) {
  try {
    extra = extra || {};
    const detalle = [historialProveedorActivo(), extra.detalle].filter(Boolean).join(' · ');
    return registrarHistorial({
      modulo: historialModuloActivo(),
      accion,
      articulo,
      valorAnterior: extra.valorAnterior,
      valorNuevo: extra.valorNuevo,
      detalle
    });
  } catch (e) {
    return Promise.resolve(); // silencioso
  }
}

// ── PESTAÑA HISTORIAL ────────────────────────────────────────────────────────
let auditPagina   = 0;
let auditFiltros  = { periodo: 'hoy', desde: '', hasta: '', modulo: 'all', usuario: 'all' };
let auditHayMas   = false;

function initAuditoria() {
  auditPagina = 0;
  resetAuditFiltrosUI();
  auditFiltros = leerAuditFiltros();
  cargarAuditoria();
}

function resetAuditFiltrosUI() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('auditPeriodo', 'hoy');
  set('auditModulo', 'all');
  set('auditUsuario', 'all');
  set('auditDesde', '');
  set('auditHasta', '');
  onAuditPeriodoChange();
}

function onAuditPeriodoChange() {
  const custom = document.getElementById('auditPeriodo')?.value === 'rango';
  const box = document.getElementById('auditRango');
  if (box) box.style.display = custom ? '' : 'none';
}

function leerAuditFiltros() {
  const val = id => document.getElementById(id)?.value || '';
  return {
    periodo: val('auditPeriodo') || 'hoy',
    desde: val('auditDesde'),
    hasta: val('auditHasta'),
    modulo: val('auditModulo') || 'all',
    usuario: val('auditUsuario') || 'all'
  };
}

function auditBuscar() {
  auditFiltros = leerAuditFiltros();
  if (auditFiltros.periodo === 'rango' && auditFiltros.desde && auditFiltros.hasta && auditFiltros.desde > auditFiltros.hasta) {
    showToast('La fecha "Desde" no puede ser posterior a "Hasta"', 'error');
    return;
  }
  auditPagina = 0;
  cargarAuditoria();
}

function auditLimpiar() {
  resetAuditFiltrosUI();
  auditFiltros = leerAuditFiltros();
  auditPagina = 0;
  cargarAuditoria();
}

function auditPaginaCambiar(delta) {
  const nueva = auditPagina + delta;
  if (nueva < 0 || (delta > 0 && !auditHayMas)) return;
  auditPagina = nueva;
  cargarAuditoria();
}

// Rango [desde, hasta) en hora local del navegador, como ISO UTC para Supabase
function auditRangoFechas(f) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  let desde = null, hasta = null;
  if (f.periodo === 'hoy') {
    desde = ini;
  } else if (f.periodo === 'semana') {
    desde = new Date(ini);
    const dia = (ini.getDay() + 6) % 7; // lunes = 0
    desde.setDate(ini.getDate() - dia);
  } else if (f.periodo === 'mes') {
    desde = new Date(ini.getFullYear(), ini.getMonth(), 1);
  } else if (f.periodo === 'rango') {
    if (f.desde) { const [y, m, d] = f.desde.split('-').map(Number); desde = new Date(y, m - 1, d); }
    if (f.hasta) { const [y, m, d] = f.hasta.split('-').map(Number); hasta = new Date(y, m - 1, d + 1); }
  }
  return { desde: desde && desde.toISOString(), hasta: hasta && hasta.toISOString() };
}

async function cargarAuditoria() {
  const tbody = document.getElementById('auditBody');
  if (!tbody) return;
  const { desde, hasta } = auditRangoFechas(auditFiltros);

  let filtro = '?select=*&order=created_at.desc,id.desc';
  if (desde) filtro += `&created_at=gte.${encodeURIComponent(desde)}`;
  if (hasta) filtro += `&created_at=lt.${encodeURIComponent(hasta)}`;
  if (auditFiltros.modulo !== 'all')  filtro += `&modulo=eq.${encodeURIComponent(auditFiltros.modulo)}`;
  if (auditFiltros.usuario !== 'all') filtro += `&usuario=eq.${encodeURIComponent(auditFiltros.usuario)}`;
  // Se piden PAGE_SIZE + 1 filas para saber si existe una página siguiente
  filtro += `&limit=${HISTORIAL_PAGE_SIZE + 1}&offset=${auditPagina * HISTORIAL_PAGE_SIZE}`;

  setLoading(true);
  try {
    const filas = await sbRequest('GET', filtro, null, HISTORIAL_TABLA) || [];
    auditHayMas = filas.length > HISTORIAL_PAGE_SIZE;
    renderAuditoria(filas.slice(0, HISTORIAL_PAGE_SIZE));
  } catch (e) {
    showToast('Error al cargar el historial', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function auditFormatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function auditClaseFila(accion) {
  if (accion === 'Artículo eliminado') return 'audit-row-del';
  if (accion === 'Venta registrada')   return 'audit-row-venta';
  if (accion === 'Artículo creado')    return 'audit-row-nuevo';
  return '';
}

function renderAuditoria(filas) {
  const tbody = document.getElementById('auditBody');
  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="icon">🕘</span><p>No hay registros para el período seleccionado</p></div></td></tr>`;
  } else {
    const cel = v => (v == null || v === '') ? '—' : esc(v);
    tbody.innerHTML = filas.map(r => `<tr class="${auditClaseFila(r.accion)}">
      <td data-label="Fecha y hora"><span class="date-chip">${auditFormatFecha(r.created_at)}</span></td>
      <td data-label="Usuario">${cel(r.usuario)}</td>
      <td data-label="Módulo">${cel(r.modulo)}</td>
      <td data-label="Acción"><span class="td-desc">${cel(r.accion)}</span></td>
      <td data-label="Artículo">${cel(r.articulo)}</td>
      <td data-label="Valor anterior">${cel(r.valor_anterior)}</td>
      <td data-label="Valor nuevo">${cel(r.valor_nuevo)}</td>
      <td data-label="Detalle">${cel(r.detalle)}</td>
    </tr>`).join('');
  }

  const desde = filas.length ? auditPagina * HISTORIAL_PAGE_SIZE + 1 : 0;
  const hasta = auditPagina * HISTORIAL_PAGE_SIZE + filas.length;
  const info = document.getElementById('auditPageInfo');
  if (info) info.textContent = filas.length ? `Registros ${desde}–${hasta} · Página ${auditPagina + 1}` : '';
  const prev = document.getElementById('auditPrev');
  const next = document.getElementById('auditNext');
  if (prev) prev.disabled = auditPagina === 0;
  if (next) next.disabled = !auditHayMas;
}
