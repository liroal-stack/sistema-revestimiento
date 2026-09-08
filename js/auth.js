// ── AUTENTICACIÓN ─────────────────────────────────────────────────────────────
// Login con dos usuarios fijos. Las contraseñas NUNCA se guardan en texto plano:
// solo se compara el hash SHA-256 (Web Crypto API, nativa del navegador, sin
// librerías externas) contra el hash guardado abajo. La sesión vive en
// sessionStorage (se pierde al cerrar el navegador/pestaña).

const AUTH_USERS = {
  suny: {
    // hash SHA-256 de "4321"
    hash: 'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3',
    permisos: ['muebles'],
    logo: 'logo_muebleria.jpg'
  },
  sergio: {
    // hash SHA-256 de "1234"
    hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    permisos: ['colchones', 'revestimientos', 'pedidos'],
    logo: 'Logo-MM.png'
  }
};

const AUTH_SESSION_KEY = 'muhn_session';

const AUTH_TAB_IDS = {
  colchones: 'tabColchones',
  muebles: 'tabMuebles',
  revestimientos: 'tabRevestimientos',
  pedidos: 'tabPedidos'
};

// ── HASH ──────────────────────────────────────────────────────────────────────
async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SESIÓN ────────────────────────────────────────────────────────────────────
function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.usuario || !session.token || !AUTH_USERS[session.usuario]) return null;
    return session.usuario;
  } catch (e) {
    return null;
  }
}

function getPermissions() {
  const user = getCurrentUser();
  if (!user) return [];
  return AUTH_USERS[user].permisos;
}

function checkSession() {
  const user = getCurrentUser();
  if (user) { enterApp(user); return true; }
  return false;
}

// ── LOGIN / LOGOUT ────────────────────────────────────────────────────────────
async function login() {
  const userEl  = document.getElementById('authUser');
  const passEl  = document.getElementById('authPass');
  const errorEl = document.getElementById('authError');
  const btn     = document.getElementById('authLoginBtn');

  const usuario = userEl.value.trim().toLowerCase();
  const clave   = passEl.value;
  errorEl.style.display = 'none';

  if (!usuario || !clave) { showAuthError(); return; }

  if (btn) btn.disabled = true;
  try {
    const datos = AUTH_USERS[usuario];
    const hash  = await hashPassword(clave);
    if (!datos || hash !== datos.hash) { showAuthError(); return; }

    const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2));
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ usuario, token }));
    passEl.value = '';
    enterApp(usuario);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  location.reload();
}

function showAuthError() {
  const errorEl = document.getElementById('authError');
  errorEl.textContent = 'Usuario o contraseña incorrectos';
  errorEl.style.display = 'block';
}

// ── APLICAR PERMISOS EN LA UI ─────────────────────────────────────────────────
async function enterApp(user) {
  const permisos = getPermissions();

  // Si el módulo activo por defecto (colchones) no está permitido, cambiar ANTES de destapar
  // la app — evita el parpadeo de un módulo que el usuario no debería ver. init() (disparado al
  // final de ui.js) ya está cargando los proveedores en paralelo; se vuelve a pedir acá y se
  // espera, para no quedar con Muebles/Revestimientos apuntando a un proveedor todavía vacío.
  if (permisos.length && typeof activeModule !== 'undefined' && !permisos.includes(activeModule)) {
    if (typeof loadProveedores === 'function') await loadProveedores();
    await switchModule(permisos[0]);
  }

  Object.entries(AUTH_TAB_IDS).forEach(([mod, tabId]) => {
    const tab = document.getElementById(tabId);
    if (tab) tab.style.display = permisos.includes(mod) ? '' : 'none';
  });

  const headerLogo = document.getElementById('headerLogo');
  if (headerLogo && AUTH_USERS[user]) headerLogo.src = AUTH_USERS[user].logo;

  const screen = document.getElementById('loginScreen');
  if (screen) screen.classList.add('hidden');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function initAuth() {
  const yaLogueado = checkSession();
  if (!yaLogueado) {
    const userEl = document.getElementById('authUser');
    if (userEl) setTimeout(() => userEl.focus(), 150);
  }
}
