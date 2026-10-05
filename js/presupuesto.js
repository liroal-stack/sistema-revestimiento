// ── PRESUPUESTO (dentro de Revestimientos) ───────────────────────────────────
// Formulario de hoja de presupuesto con logos, datos del cliente y una tabla de
// ítems editable. No se guarda en Supabase — vive solo en memoria mientras dura
// la sesión (se mantiene al cambiar de sub-pestaña dentro de Revestimientos,
// como el resto de la sección, pero no sobrevive a un F5). Se puede exportar a
// PDF (jsPDF + html2canvas, cargados por CDN en index.html) o mandar por
// WhatsApp/Gmail armando el texto a partir de los mismos datos.

const PRESUPUESTO_FILAS_PRECARGADAS = [
  'WALL PANEL INTERIOR', 'WALL PANEL EXTERIOR', 'PLACAS UV', 'PISOS',
  'CIELO RAZO LISO', 'CIELO RAZO ACANALADO', 'PIEDRA FLEXIBLE',
  'PIEDRA EXTERIOR POLIURETANO', 'PLACA ESPEJO'
];
const PRESUPUESTO_FILAS_VACIAS_INICIALES = 4;
const PRESUPUESTO_IVA_PCT = 21;

let presupuestoFilas = []; // [{ detalle, cantidad, precio, precargada }] — cantidad/precio quedan como string del input, se parsean al calcular
let presupuestoInicializado = false;

function presupuestoFilaNueva(detalle, precargada) {
  return { detalle: detalle || '', cantidad: '', precio: '', precargada: !!precargada };
}

function initPresupuesto() {
  if (!presupuestoInicializado) {
    presupuestoFilas = PRESUPUESTO_FILAS_PRECARGADAS.map(d => presupuestoFilaNueva(d, true));
    for (let i = 0; i < PRESUPUESTO_FILAS_VACIAS_INICIALES; i++) presupuestoFilas.push(presupuestoFilaNueva('', false));
    const fecha = document.getElementById('presupuestoFecha');
    if (fecha) fecha.value = formatDate(today());
    presupuestoInicializado = true;
  }
  presupuestoRenderFilas();
  presupuestoActualizarTotales();
}

// ── TABLA DE ÍTEMS ───────────────────────────────────────────────────────────
function presupuestoCalcularSubtotal(f) {
  return (parseFloat(f.cantidad) || 0) * (parseFloat(f.precio) || 0);
}
function presupuestoFormatSubtotal(f) {
  const s = presupuestoCalcularSubtotal(f);
  return s ? formatPrecio(s) : '—';
}

function presupuestoFilaHTML(f, i) {
  return `<tr>
    <td><input type="text" class="presupuesto-input presupuesto-detalle" value="${esc(f.detalle)}"
      placeholder="${f.precargada ? '' : 'Descripción'}" oninput="presupuestoActualizarCampo(${i},'detalle',this.value)"></td>
    <td><input type="number" class="presupuesto-input presupuesto-num" min="0" step="1" value="${esc(f.cantidad)}"
      placeholder="0" inputmode="numeric" oninput="presupuestoActualizarCampo(${i},'cantidad',this.value)"></td>
    <td><input type="number" class="presupuesto-input presupuesto-num" min="0" step="0.01" value="${esc(f.precio)}"
      placeholder="0,00" inputmode="decimal" oninput="presupuestoActualizarCampo(${i},'precio',this.value)"></td>
    <td class="presupuesto-subtotal" id="presupuestoSubtotal${i}">${presupuestoFormatSubtotal(f)}</td>
    <td class="presupuesto-del-cell">${!f.precargada
      ? `<button type="button" class="presupuesto-del" onclick="presupuestoQuitarFila(${i})" title="Eliminar fila" aria-label="Eliminar fila">✕</button>`
      : ''}</td>
  </tr>`;
}

function presupuestoRenderFilas() {
  const tbody = document.getElementById('presupuestoFilasBody');
  if (!tbody) return;
  tbody.innerHTML = presupuestoFilas.map((f, i) => presupuestoFilaHTML(f, i)).join('');
}

// Actualiza un campo sin re-renderizar toda la tabla (perdería el foco del
// input mientras se está escribiendo) — solo toca la celda de subtotal de esa
// fila. La única vez que hace falta agregar HTML nuevo es cuando se terminó de
// completar la última fila vacía: ahí se agrega la fila siguiente al final,
// sin tocar las que ya existen.
function presupuestoActualizarCampo(idx, campo, valor) {
  const fila = presupuestoFilas[idx];
  if (!fila) return;
  fila[campo] = valor;

  const celdaSubtotal = document.getElementById('presupuestoSubtotal' + idx);
  if (celdaSubtotal) celdaSubtotal.textContent = presupuestoFormatSubtotal(fila);

  const esUltima = idx === presupuestoFilas.length - 1;
  const tieneContenido = (fila.detalle || '').trim() || fila.cantidad || fila.precio;
  if (esUltima && !fila.precargada && tieneContenido) {
    const nueva = presupuestoFilaNueva('', false);
    presupuestoFilas.push(nueva);
    const tbody = document.getElementById('presupuestoFilasBody');
    if (tbody) tbody.insertAdjacentHTML('beforeend', presupuestoFilaHTML(nueva, presupuestoFilas.length - 1));
  }

  presupuestoActualizarTotales();
}

function presupuestoQuitarFila(idx) {
  presupuestoFilas.splice(idx, 1);
  // Siempre tiene que quedar al menos una fila vacía al final para seguir cargando
  const ultima = presupuestoFilas[presupuestoFilas.length - 1];
  if (!ultima || ultima.precargada) presupuestoFilas.push(presupuestoFilaNueva('', false));
  presupuestoRenderFilas();
  presupuestoActualizarTotales();
}

// ── TOTALES ───────────────────────────────────────────────────────────────────
function presupuestoCalcularTotalSinIva() {
  return presupuestoFilas.reduce((s, f) => s + presupuestoCalcularSubtotal(f), 0);
}
function presupuestoCalcularTotalConIva() {
  return presupuestoCalcularTotalSinIva() * (1 + PRESUPUESTO_IVA_PCT / 100);
}
function presupuestoActualizarTotales() {
  const elSin = document.getElementById('presupuestoTotalSinIva');
  const elCon = document.getElementById('presupuestoTotalConIva');
  if (elSin) elSin.textContent = formatPrecio(presupuestoCalcularTotalSinIva());
  if (elCon) elCon.textContent = formatPrecio(presupuestoCalcularTotalConIva());
}

// ── ESTADO / LIMPIAR ──────────────────────────────────────────────────────────
function presupuestoTieneDatos() {
  const campo = id => (document.getElementById(id)?.value || '').trim();
  if (campo('presupuestoCliente') || campo('presupuestoDireccion') || campo('presupuestoTelefono')) return true;
  return presupuestoFilas.some(f => f.cantidad || f.precio || (!f.precargada && (f.detalle || '').trim()));
}

function presupuestoLimpiar() {
  if (presupuestoTieneDatos() && !confirm('¿Limpiar el presupuesto? Se van a perder los datos cargados.')) return;

  document.getElementById('presupuestoCliente').value = '';
  document.getElementById('presupuestoDireccion').value = '';
  document.getElementById('presupuestoTelefono').value = '';
  document.getElementById('presupuestoFecha').value = formatDate(today());

  presupuestoFilas = PRESUPUESTO_FILAS_PRECARGADAS.map(d => presupuestoFilaNueva(d, true));
  for (let i = 0; i < PRESUPUESTO_FILAS_VACIAS_INICIALES; i++) presupuestoFilas.push(presupuestoFilaNueva('', false));

  presupuestoRenderFilas();
  presupuestoActualizarTotales();
  showToast('Presupuesto limpiado', 'info');
}

// ── TEXTO PARA WHATSAPP / EMAIL ───────────────────────────────────────────────
function presupuestoItemsCargados() {
  // Solo los ítems que tienen cantidad Y precio cuentan como "cargados" para
  // el mensaje — una fila con solo el detalle tipeado todavía no es un ítem
  // presupuestado.
  return presupuestoFilas.filter(f => f.cantidad && f.precio);
}

function presupuestoArmarMensaje() {
  const fecha = document.getElementById('presupuestoFecha')?.value || '';
  const cliente = document.getElementById('presupuestoCliente')?.value.trim() || '—';
  const lineas = presupuestoItemsCargados().map(f =>
    `${f.detalle || '(sin descripción)'}: ${f.cantidad} u. × ${formatPrecio(parseFloat(f.precio))} = ${formatPrecio(presupuestoCalcularSubtotal(f))}`
  );
  return `Presupuesto MM Espacios\nFecha: ${fecha}\nCliente: ${cliente}\n\n${lineas.join('\n')}\n\n` +
    `TOTAL s/IVA: ${formatPrecio(presupuestoCalcularTotalSinIva())}\nTOTAL c/IVA: ${formatPrecio(presupuestoCalcularTotalConIva())}`;
}

function presupuestoArmarMensajeFormal() {
  const fecha = document.getElementById('presupuestoFecha')?.value || '';
  const cliente = document.getElementById('presupuestoCliente')?.value.trim() || '';
  const lineas = presupuestoItemsCargados().map(f =>
    `  - ${f.detalle || '(sin descripción)'}: ${f.cantidad} u. x ${formatPrecio(parseFloat(f.precio))} = ${formatPrecio(presupuestoCalcularSubtotal(f))}`
  );
  return `Estimado/a${cliente ? ' ' + cliente : ''},\n\nLe hacemos llegar el presupuesto solicitado con fecha ${fecha}.\n\nDetalle:\n${lineas.join('\n')}\n\n` +
    `TOTAL s/IVA: ${formatPrecio(presupuestoCalcularTotalSinIva())}\nTOTAL c/IVA (${PRESUPUESTO_IVA_PCT}%): ${formatPrecio(presupuestoCalcularTotalConIva())}\n\n` +
    `Quedamos a disposición por cualquier consulta.\n\nSaludos cordiales,\nMM Espacios`;
}

function presupuestoEnviarWhatsapp() {
  if (!presupuestoItemsCargados().length) { showToast('Cargá al menos un ítem con cantidad y precio', 'error'); return; }
  const telefono = (document.getElementById('presupuestoTelefono')?.value || '').replace(/\D/g, '');
  const url = (telefono ? `https://wa.me/54${telefono}` : 'https://wa.me/') + '?text=' + encodeURIComponent(presupuestoArmarMensaje());
  window.open(url, '_blank', 'noopener');
}

function presupuestoEnviarEmail() {
  if (!presupuestoItemsCargados().length) { showToast('Cargá al menos un ítem con cantidad y precio', 'error'); return; }
  const fecha = document.getElementById('presupuestoFecha')?.value || '';
  const cliente = document.getElementById('presupuestoCliente')?.value.trim() || 'Cliente';
  const asunto = `Presupuesto MM Espacios - ${cliente} - ${fecha}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(presupuestoArmarMensajeFormal())}`;
}

// ── PDF (jsPDF + html2canvas, ver CDN en index.html) ─────────────────────────
async function presupuestoGenerarPDF() {
  const jsPDFCtor = window.jspdf?.jsPDF;
  if (!jsPDFCtor || !window.html2canvas) {
    showToast('No se pudo cargar el generador de PDF. Revisá tu conexión', 'error');
    return;
  }
  const hoja = document.getElementById('presupuestoHoja');
  if (!hoja) return;

  setLoading(true);
  hoja.classList.add('presupuesto-capturando'); // oculta las "✕" de borrar fila y los bordes de los inputs en la captura
  try {
    const canvas = await html2canvas(hoja, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDFCtor({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
    const cliente = (document.getElementById('presupuestoCliente')?.value.trim() || 'presupuesto')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos antes de limpiar, si no "Pérez" queda "P_rez" en vez de "Perez"
      .replace(/[^a-z0-9]+/gi, '_');
    pdf.save(`Presupuesto_${cliente}_${today()}.pdf`);
  } catch (e) {
    console.error(e);
    showToast('Error al generar el PDF', 'error');
  } finally {
    hoja.classList.remove('presupuesto-capturando');
    setLoading(false);
  }
}

// ── INTEGRACIÓN CON LA CALCULADORA (u otro módulo futuro) ────────────────────
// window.agregarItemPresupuesto('WALL PANEL INTERIOR', 12, 8500) agrega el ítem
// a la primera fila vacía disponible (o crea una si no hay) y cambia a esta
// sub-pestaña. Expuesta en window explícitamente para que quede claro que es
// un punto de integración pensado para llamarse desde otros módulos.
window.agregarItemPresupuesto = async function agregarItemPresupuesto(descripcion, cantidad, precioUnitario) {
  if (!presupuestoInicializado) {
    presupuestoFilas = PRESUPUESTO_FILAS_PRECARGADAS.map(d => presupuestoFilaNueva(d, true));
    for (let i = 0; i < PRESUPUESTO_FILAS_VACIAS_INICIALES; i++) presupuestoFilas.push(presupuestoFilaNueva('', false));
    presupuestoInicializado = true;
  }

  let fila = presupuestoFilas.find(f => !f.precargada && !(f.detalle || '').trim() && !f.cantidad && !f.precio);
  if (!fila) { fila = presupuestoFilaNueva('', false); presupuestoFilas.push(fila); }
  fila.detalle = descripcion || '';
  fila.cantidad = cantidad != null ? String(cantidad) : '';
  fila.precio = precioUnitario != null ? String(precioUnitario) : '';

  if (presupuestoFilas[presupuestoFilas.length - 1] === fila) {
    presupuestoFilas.push(presupuestoFilaNueva('', false));
  }

  await switchModule('revestimientos');
  switchRevestSubview('presupuesto');
  presupuestoRenderFilas();
  presupuestoActualizarTotales();
  showToast(`${esc(descripcion || 'Ítem')} agregado al presupuesto`, 'success');
};
