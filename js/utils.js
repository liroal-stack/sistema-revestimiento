function setLoading(on) {
  document.getElementById('loadingOverlay').style.display = on ? 'flex' : 'none';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0,10); }
function formatDate(s) { if(!s) return '—'; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showToast(msg, type='info') {
  const icons = {success:'✓',error:'✕',info:'ℹ'};
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation='toastOut 0.3s ease forwards'; setTimeout(()=>t.remove(),300); }, 2800);
}
function exportCSV() {
  const rows = ['Código,Descripción,Cantidad,Fecha',...getActiveStock().map(i=>`"${i.codigo}","${i.descripcion}",${i.cantidad},"${formatDate(i.fecha)}"`)].join('\n');
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([rows],{type:'text/csv;charset=utf-8;'})),download:'stock_colchones.csv'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV exportado', 'success');
}

function formatPrecio(v) {
  if (!v && v !== 0) return '—';
  return '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function togglePass(id) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
