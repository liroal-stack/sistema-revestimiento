// ── ASISTENTE DE VOZ "JARVIS" ────────────────────────────────────────────────
// Botón flotante → Web Speech API (es-AR) → Claude Haiku interpreta la intención
// y devuelve un JSON → se ejecuta la acción en la UI. Usa la misma API key de
// Anthropic que ya se configura en "API Keys" (anApiKey, ver js/supabase.js).
// Este archivo se carga al final: solo usa funciones de los demás archivos
// desde adentro de funciones, en runtime.

const JARVIS_MODEL      = 'claude-haiku-4-5-20251001';
const JARVIS_TIMEOUT_MS = 8000;

// Prompt base tal cual fue definido, más un agregado corto: (1) permite devolver
// un array cuando el comando necesita más de una acción (p. ej. "los precios de
// CCS" = ir a Precios + filtrar CCS), (2) da ejemplos y (3) el contexto actual
// (proveedores reales) para que el nombre devuelto coincida con los del sistema.
const JARVIS_PROMPT_BASE =
`Eres un asistente de gestión de stock para una mueblería y local de revestimientos. El usuario te dará un comando de voz y vos tenés que interpretarlo y devolver SOLO un JSON con la acción a ejecutar. Las acciones posibles son:
- { accion: 'buscar', modulo: 'revestimientos'|'colchones'|'muebles'|'precios', termino: 'texto a buscar' }
- { accion: 'filtrar_proveedor', modulo: 'revestimientos'|'precios', proveedor: 'nombre del proveedor' }
- { accion: 'navegar', modulo: 'colchones'|'muebles'|'revestimientos'|'pedidos'|'historial' }
- { accion: 'navegar_sub', modulo: 'revestimientos', sub: 'stock'|'ventas'|'precios' }
- { accion: 'no_entendido', mensaje: 'explicacion breve de por que no se entendio' }
Devolvé SOLO el JSON, sin texto adicional, sin markdown, sin backticks.`;

function jarvisPromptSistema() {
  const provStock  = (typeof proveedoresRev !== 'undefined' ? proveedoresRev : []).map(p => p.nombre).join(', ') || '—';
  const provPrecio = LISTA_PRECIOS_FUENTES.map(f => `${f.nombreCorto} (${f.nombreCompleto})`).join(', ');
  return JARVIS_PROMPT_BASE + `

Si el comando necesita más de una acción, devolvé un array JSON con las acciones en orden, por ejemplo [ {accion:'navegar_sub', modulo:'revestimientos', sub:'precios'}, {accion:'filtrar_proveedor', modulo:'precios', proveedor:'CCS'} ]. Para un comando simple devolvé un solo objeto. En "termino" poné solo las palabras clave del producto, en singular y sin artículos ni verbos.
Ejemplos: "Mostrame todos los cielorrasos" -> buscar en revestimientos "cielorraso". "Qué espejos hay en stock" -> buscar en revestimientos "espejo". "Ir a colchones" -> navegar colchones. "Buscá placa Superboard 10mm en precios" -> buscar en precios "superboard 10". "Mostrame los precios de CCS" -> [navegar_sub precios, filtrar_proveedor precios CCS]. "Cuánto cuesta el Sommier 100cm" -> buscar en precios "sommier 100". "Ir a ventas" -> navegar_sub revestimientos ventas.
Contexto del sistema: proveedores del stock de revestimientos: ${provStock}. Listas de precios (proveedor filtrable en "precios"): ${provPrecio}. Para filtrar_proveedor usá el nombre tal cual figura en estas listas.`;
}

const JARVIS_MODULOS = {
  colchones: 'Colchones', muebles: 'Muebles', revestimientos: 'Revestimientos',
  pedidos: 'Pedidos', historial: 'Historial', precios: 'Precios'
};
const JARVIS_SUBS = { stock: 'Stock', ventas: 'Ventas', precios: 'Precios' };

let jarvisEstado = 'idle';   // 'idle' | 'escuchando' | 'procesando'
let jarvisRec    = null;
let jarvisAbort  = null;     // AbortController de la llamada a Claude en curso
let jarvisSesion = 0;        // se incrementa con cada activación, para ignorar respuestas de sesiones canceladas

// Error "esperado" (permisos, proveedor inexistente...) cuyo mensaje se muestra tal cual
class JarvisError extends Error {}

// ── UI: botón + banner ───────────────────────────────────────────────────────
function jarvisToast(msg, ok) {
  showToast(msg, ok ? 'voz-ok' : 'voz-error');
}

function jarvisSetEstado(estado, oido) {
  jarvisEstado = estado;
  const btn    = document.getElementById('jarvisBtn');
  const banner = document.getElementById('jarvisBanner');
  if (btn) {
    btn.classList.toggle('escuchando', estado === 'escuchando');
    btn.classList.toggle('procesando', estado === 'procesando');
    btn.setAttribute('aria-pressed', estado === 'escuchando' ? 'true' : 'false');
  }
  if (!banner) return;
  if (estado === 'idle') { banner.hidden = true; return; }
  const texto = estado === 'escuchando' ? '🎤 Escuchando... hablá ahora' : '⏳ Procesando...';
  banner.innerHTML = `<span>${texto}</span>` + (oido ? `<small>“${esc(oido)}”</small>` : '');
  banner.hidden = false;
}

// ── ENTRADA: toque en el botón ───────────────────────────────────────────────
function jarvisToggle() {
  if (jarvisEstado === 'escuchando') { try { jarvisRec.stop(); } catch (_) {} return; }
  if (jarvisEstado === 'procesando') { jarvisCancelar(); return; }
  jarvisIniciar();
}

function jarvisCancelar() {
  jarvisSesion++;
  try { jarvisRec && jarvisRec.abort(); } catch (_) {}
  try { jarvisAbort && jarvisAbort.abort(); } catch (_) {}
  jarvisSetEstado('idle');
}

function jarvisIniciar() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { jarvisToast('❌ Tu navegador no soporta comandos de voz. Usá Chrome o Safari'); return; }
  if (!getCurrentUser()) return;
  if (!anApiKey) {
    jarvisToast('❌ Falta la API Key de Anthropic. Cargala en "API Keys"');
    return;
  }

  const sesion = ++jarvisSesion;
  const rec = new SR();
  jarvisRec = rec;
  rec.lang = 'es-AR';
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let texto = null, huboError = false;

  rec.onresult = e => {
    if (sesion !== jarvisSesion) return;
    texto = (e.results[0] && e.results[0][0] && e.results[0][0].transcript || '').trim();
    if (texto) jarvisProcesar(texto, sesion);
  };
  rec.onerror = e => {
    if (sesion !== jarvisSesion) return;
    huboError = true;
    jarvisSetEstado('idle');
    if (e.error === 'aborted') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      jarvisToast('❌ Permití el acceso al micrófono para usar comandos de voz');
    } else if (e.error === 'no-speech') {
      jarvisToast('❌ No escuché nada. Intentá de nuevo');
    } else {
      jarvisToast('❌ No pude escuchar el comando. Intentá de nuevo');
    }
  };
  rec.onend = () => {
    if (sesion !== jarvisSesion) return;
    // terminó sin resultado ni error (p. ej. silencio o se paró a mano)
    if (!texto && !huboError && jarvisEstado === 'escuchando') {
      jarvisSetEstado('idle');
      jarvisToast('❌ No escuché nada. Intentá de nuevo');
    }
  };

  try {
    rec.start();
    jarvisSetEstado('escuchando');
  } catch (e) {
    jarvisSetEstado('idle');
    jarvisToast('❌ No pude iniciar el micrófono. Intentá de nuevo');
  }
}

// ── CLAUDE HAIKU ─────────────────────────────────────────────────────────────
async function jarvisConsultarClaude(texto) {
  const ctl = new AbortController();
  jarvisAbort = ctl;
  let vencio = false;
  const timer = setTimeout(() => { vencio = true; ctl.abort(); }, JARVIS_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'x-api-key': anApiKey
      },
      body: JSON.stringify({
        model: JARVIS_MODEL,
        max_tokens: 400,
        temperature: 0,
        system: jarvisPromptSistema(),
        messages: [{ role: 'user', content: texto }]
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new JarvisError('❌ Error de Claude: ' + esc(String(err?.error?.message || res.status)));
    }
    const data = await res.json();
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (e) {
    if (e.name === 'AbortError') {
      if (vencio) throw new JarvisError('⏱️ Jarvis tardó demasiado en responder. Intentá de nuevo');
      throw e; // cancelado a mano
    }
    if (e instanceof JarvisError) throw e;
    throw new JarvisError('❌ No pude conectar con el asistente. Revisá tu conexión');
  } finally {
    clearTimeout(timer);
  }
}

// Devuelve siempre un array de acciones válidas
function jarvisParsear(raw) {
  const limpio = raw.replace(/```json|```/gi, '').trim();
  let data;
  try { data = JSON.parse(limpio); }
  catch (_) {
    const m = limpio.match(/[\[{][\s\S]*[\]}]/);
    if (!m) return null;
    try { data = JSON.parse(m[0]); } catch (__) { return null; }
  }
  if (data && Array.isArray(data.acciones)) data = data.acciones;
  const lista = (Array.isArray(data) ? data : [data]).filter(a => a && typeof a.accion === 'string');
  return lista.length ? lista : null;
}

async function jarvisProcesar(texto, sesion) {
  jarvisSetEstado('procesando', texto);
  try {
    const raw = await jarvisConsultarClaude(texto);
    if (sesion !== jarvisSesion) return;
    const acciones = jarvisParsear(raw);
    if (!acciones) { jarvisToast('❌ No entendí el comando. Intentá de nuevo'); return; }

    const mensajes = [];
    for (const a of acciones) {
      if (sesion !== jarvisSesion) return;
      const m = await jarvisEjecutar(a);
      if (m) mensajes.push(m);
    }
    if (mensajes.length) jarvisToast('✅ ' + mensajes.join(' · '), true);
  } catch (e) {
    if (e.name === 'AbortError' || sesion !== jarvisSesion) return; // cancelado por el usuario
    if (e instanceof JarvisError) jarvisToast(e.message);
    else { console.error(e); jarvisToast('❌ No pude ejecutar el comando. Intentá de nuevo'); }
  } finally {
    if (sesion === jarvisSesion) jarvisSetEstado('idle');
  }
}

// ── EJECUCIÓN DE ACCIONES ────────────────────────────────────────────────────
const jarvisNorm = s => normalizarBusquedaPrecios(String(s || ''));
const jarvisTokens = s => jarvisNorm(s).split(/\s+/).filter(Boolean);
const jarvisEsperar = (cond, ms) => new Promise(res => {
  const t0 = Date.now();
  (function tick() { if (cond() || Date.now() - t0 > ms) res(cond()); else setTimeout(tick, 100); })();
});

async function jarvisIrAModulo(mod) {
  if (!getPermissions().includes(mod)) {
    throw new JarvisError(`❌ No tenés acceso a ${JARVIS_MODULOS[mod] || mod}`);
  }
  await switchModule(mod);
}

// Elige, entre candidatos [{ valor, textos: [...] }], el que mejor coincide con lo dicho
function jarvisElegir(dicho, candidatos) {
  const d = jarvisNorm(dicho);
  if (!d) return null;
  const igual = candidatos.find(c => c.textos.some(t => jarvisNorm(t) === d));
  if (igual) return igual.valor;
  const parcial = candidatos.find(c => c.textos.some(t => {
    const n = jarvisNorm(t);
    return n && (n.includes(d) || d.includes(n));
  }));
  return parcial ? parcial.valor : null;
}

function jarvisContar(items, tokens, campoProveedor) {
  const cuenta = {};
  items.forEach(i => {
    const h = jarvisNorm(`${i.descripcion} ${i.codigo || ''}`);
    if (tokens.every(t => h.includes(t))) cuenta[campoProveedor(i)] = (cuenta[campoProveedor(i)] || 0) + 1;
  });
  return cuenta;
}

async function jarvisAccion_buscar(a) {
  const termino = String(a.termino || '').trim();
  if (!termino) throw new JarvisError('❌ No entendí qué querés buscar. Intentá de nuevo');
  const mod = a.modulo;
  if (!JARVIS_MODULOS[mod] || mod === 'pedidos' || mod === 'historial') {
    throw new JarvisError('❌ No sé buscar en ese módulo. Intentá de nuevo');
  }
  const tokens = jarvisTokens(termino);
  let extra = '';

  if (mod === 'colchones' || mod === 'muebles') {
    await jarvisIrAModulo(mod);
    document.getElementById(mod === 'colchones' ? 'searchInput' : 'searchInputGenerico').value = termino;
    renderTable();

  } else if (mod === 'revestimientos') {
    await jarvisIrAModulo('revestimientos');
    switchRevestSubview('stock');
    // El stock se ve por proveedor: si el activo no tiene resultados pero otro sí,
    // se cambia a ese (p. ej. "espejos" vive en GB Market Espejos).
    try { await cargarVentaStock(); } catch (_) {}
    const cuenta = jarvisContar(getVentaStockItems(), tokens, i => i.proveedor);
    if (!cuenta[activeProveedorRev]) {
      const mejor = Object.keys(cuenta).sort((x, y) => cuenta[y] - cuenta[x])[0];
      if (mejor) { await switchProveedor('revestimientos', mejor); extra = ` (${esc(mejor)})`; }
    }
    document.getElementById('searchInputGenerico').value = termino;
    renderTable();

  } else { // precios
    await jarvisIrAModulo('revestimientos');
    switchRevestSubview('precios');
    await jarvisEsperar(() => listaPreciosCargada, JARVIS_TIMEOUT_MS);
    // Igual que arriba: si la lista activa no tiene resultados pero otra sí, se cambia
    const fuenteActiva = getListaPreciosFuenteActiva();
    const hayEnActiva = jarvisContar(getItemsFuenteActiva(), tokens, () => 'x').x;
    if (!hayEnActiva) {
      const otra = LISTA_PRECIOS_FUENTES.find(f => f !== fuenteActiva &&
        jarvisContar(listaPrecios.filter(f.filtro), tokens, () => 'x').x);
      if (otra) { switchListaPreciosFuente(otra.id); extra = ` (${esc(otra.nombreCorto)})`; }
    }
    // categoría en "todas" para que el término no quede filtrado por una elegida antes
    const sel = document.getElementById('preciosFiltroCategoria');
    if (sel) { sel.value = 'all'; renderCategoriaDropdownList(); }
    document.getElementById('preciosBuscar').value = termino;
    renderListaPreciosResultados();
  }
  return `Buscando '${esc(termino)}' en ${JARVIS_MODULOS[mod]}${extra}`;
}

async function jarvisAccion_filtrar(a) {
  const dicho = String(a.proveedor || '').trim();
  if (!dicho) throw new JarvisError('❌ No entendí qué proveedor querés. Intentá de nuevo');

  if (a.modulo === 'precios') {
    await jarvisIrAModulo('revestimientos');
    switchRevestSubview('precios');
    await jarvisEsperar(() => listaPreciosCargada, JARVIS_TIMEOUT_MS);
    const id = jarvisElegir(dicho, LISTA_PRECIOS_FUENTES.map(f => ({ valor: f.id, textos: [f.id, f.nombreCorto, f.nombreCompleto] })));
    if (!id) throw new JarvisError(`❌ No encontré el proveedor '${esc(dicho)}' en Precios`);
    switchListaPreciosFuente(id);
    const f = LISTA_PRECIOS_FUENTES.find(x => x.id === id);
    return `Filtrando por ${esc(f.nombreCorto)} en Precios`;
  }

  if (a.modulo === 'revestimientos') {
    await jarvisIrAModulo('revestimientos');
    if (revestSubview === 'ventas') {
      // En Ventas el filtro es el selector de proveedor de la lista de artículos
      await jarvisEsperar(() => document.getElementById('ventaFiltroProveedor')?.options.length > 1, JARVIS_TIMEOUT_MS);
      const sel = document.getElementById('ventaFiltroProveedor');
      const valor = jarvisElegir(dicho, [...sel.options].filter(o => o.value !== 'all').map(o => ({ valor: o.value, textos: [o.value] })));
      if (!valor) throw new JarvisError(`❌ No encontré el proveedor '${esc(dicho)}' en Ventas`);
      sel.value = valor;
      renderVentaArticulos();
      return `Filtrando por ${esc(valor)} en Ventas`;
    }
    switchRevestSubview('stock');
    const nombre = jarvisElegir(dicho, proveedoresRev.map(p => ({ valor: p.nombre, textos: [p.nombre] })));
    if (!nombre) throw new JarvisError(`❌ No encontré el proveedor '${esc(dicho)}' en Revestimientos`);
    await switchProveedor('revestimientos', nombre);
    return `Mostrando ${esc(nombre)} en Revestimientos`;
  }
  throw new JarvisError('❌ No sé filtrar por proveedor en ese módulo. Intentá de nuevo');
}

async function jarvisEjecutar(a) {
  switch (a.accion) {
    case 'buscar':
      return jarvisAccion_buscar(a);

    case 'filtrar_proveedor':
      return jarvisAccion_filtrar(a);

    case 'navegar':
      if (!JARVIS_MODULOS[a.modulo] || a.modulo === 'precios') throw new JarvisError('❌ No sé a dónde ir. Intentá de nuevo');
      await jarvisIrAModulo(a.modulo);
      return `Yendo a ${JARVIS_MODULOS[a.modulo]}`;

    case 'navegar_sub':
      if (!JARVIS_SUBS[a.sub]) throw new JarvisError('❌ No sé a dónde ir. Intentá de nuevo');
      await jarvisIrAModulo('revestimientos');
      switchRevestSubview(a.sub);
      return `Yendo a Revestimientos › ${JARVIS_SUBS[a.sub]}`;

    case 'no_entendido':
    default:
      throw new JarvisError('❌ No entendí el comando. Intentá de nuevo' + (a.mensaje ? ` (${esc(a.mensaje)})` : ''));
  }
}
