// ── SETTINGS / API KEYS (guardadas en Supabase) ──────────────────────────────
let gvApiKey = ''; // en memoria, cargadas desde Supabase al iniciar
let anApiKey = '';

async function loadSettings() {
  try {
    const data = await sbRequest('GET', '?select=clave,valor', null, 'configuracion') || [];
    data.forEach(row => {
      if (row.clave === 'gv_api_key') gvApiKey = row.valor;
      if (row.clave === 'an_api_key') anApiKey = row.valor;
    });
    updateSettingsDot();
  } catch(e) {
    console.warn('No se pudieron cargar las API Keys desde Supabase:', e.message);
  }
}

function openSettings() {
  document.getElementById('settingsGVKey').value = gvApiKey;
  document.getElementById('settingsANKey').value = anApiKey;
  document.getElementById('settingsModal').classList.add('active');
  setTimeout(() => document.getElementById('settingsGVKey').focus(), 150);
}

async function saveSettings() {
  const gv = document.getElementById('settingsGVKey').value.trim();
  const an = document.getElementById('settingsANKey').value.trim();
  if (!gv || !an) { showToast('Ingresá las dos keys para guardar', 'error'); return; }

  const btn = document.querySelector('#settingsModal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Upsert en Supabase usando merge-duplicates (clave es UNIQUE)
    await sbUpsertConfig('gv_api_key', gv);
    await sbUpsertConfig('an_api_key', an);
    gvApiKey = gv;
    anApiKey = an;
    closeModal('settingsModal');
    updateSettingsDot();
    showToast('API Keys guardadas en la nube ☁', 'success');
  } catch(e) {
    showToast('Error al guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Guardar'; }
  }
}

async function sbUpsertConfig(clave, valor) {
  const res = await fetch(`${SB_URL}/rest/v1/configuracion`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ clave, valor })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
}

function updateSettingsDot() {
  const dot = document.getElementById('settingsDot');
  dot.className = 'settings-dot ' + (gvApiKey && anApiKey ? 'ok' : gvApiKey || anApiKey ? 'err' : '');
}

function keysConfigured() {
  return !!gvApiKey && !!anApiKey;
}
