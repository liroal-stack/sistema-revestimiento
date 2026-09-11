// ── STATE ─────────────────────────────────────────────────────────────────────
let activeModule       = 'colchones'; // 'colchones' | 'muebles' | 'revestimientos'
let activeProveedor    = '';
let activeProveedorRev = '';
let stockColchones     = [];
let stockMuebles       = {}; // { nombre: [] }
let stockRevestimientos = {}; // { nombre: [] }
let proveedoresMuebles = []; // [{ id, nombre }]
let proveedoresRev     = []; // [{ id, nombre }]
let newProvModulo      = '';
let delProvData        = null;

// Helpers: stock activo y tabla activa
function getActiveStock() {
  if (activeModule === 'colchones')      return stockColchones;
  if (activeModule === 'revestimientos') return stockRevestimientos[activeProveedorRev] || [];
  return stockMuebles[activeProveedor] || [];
}
function setActiveStock(arr) {
  if (activeModule === 'colchones')      { stockColchones = arr; return; }
  if (activeModule === 'revestimientos') { stockRevestimientos[activeProveedorRev] = arr; return; }
  stockMuebles[activeProveedor] = arr;
}
function getActiveTable() {
  if (activeModule === 'colchones')      return 'stock';
  if (activeModule === 'revestimientos') return 'stock_revestimientos';
  return 'stock_muebles';
}
function getActiveProvName() {
  if (activeModule === 'muebles')        return activeProveedor;
  if (activeModule === 'revestimientos') return activeProveedorRev;
  return '';
}

// ── MODULE / PROVIDER SWITCHING ───────────────────────────────────────────────
async function switchModule(mod) {
  if (!getPermissions().includes(mod)) return; // sin permiso para este módulo
  if (activeModule === mod) return;
  activeModule = mod;

  document.getElementById('tabColchones').classList.toggle('active',      mod === 'colchones');
  document.getElementById('tabMuebles').classList.toggle('active',        mod === 'muebles');
  document.getElementById('tabRevestimientos').classList.toggle('active', mod === 'revestimientos');
  document.getElementById('tabPedidos').classList.toggle('active',        mod === 'pedidos');

  document.getElementById('providerTabsMuebles').style.display = mod === 'muebles'        ? 'flex' : 'none';
  document.getElementById('providerTabsRev').style.display     = mod === 'revestimientos' ? 'flex' : 'none';

  // Sub-navegación Stock/Ventas: solo existe dentro de Revestimientos
  document.getElementById('revestSubtabs').style.display = mod === 'revestimientos' ? 'flex' : 'none';
  if (mod !== 'revestimientos') document.getElementById('moduleVentas').style.display = 'none';

  // Mostrar/ocultar módulo pedidos vs inventario
  const isStock = ['colchones','muebles','revestimientos'].includes(mod);
  document.getElementById('modulePedidos').style.display  = mod === 'pedidos' ? '' : 'none';
  document.getElementById('moduleStock').style.display    = isStock ? '' : 'none';
  // Mostrar toolbar correcto
  if (isStock) {
    const isColchones = mod === 'colchones';
    document.getElementById('toolbarColchones').style.display = isColchones ? '' : 'none';
    document.getElementById('toolbarGenerico').style.display  = isColchones ? 'none' : '';
  }

  updateSectionTitle();

  if (mod === 'pedidos') {
    initPedidos();
    return;
  } else if (mod === 'muebles') {
    if (!stockMuebles[activeProveedor]) await loadMuebles(activeProveedor);
    else renderTable();
  } else if (mod === 'revestimientos') {
    if (!activeProveedorRev && proveedoresRev.length > 0) activeProveedorRev = proveedoresRev[0].nombre;
    if (activeProveedorRev && !stockRevestimientos[activeProveedorRev]) await loadRevestimientos(activeProveedorRev);
    // Restaura la sub-vista (Stock o Ventas) en la que estaba el usuario antes de salir del módulo
    applyRevestSubview();
  } else {
    renderTable();
  }
}

async function switchProveedor(modulo, nombre) {
  if (modulo === 'muebles') {
    if (activeProveedor === nombre) return;
    activeProveedor = nombre;
  } else {
    if (activeProveedorRev === nombre) return;
    activeProveedorRev = nombre;
  }
  renderProviderTabs(modulo);
  updateSectionTitle();
  const stockObj = modulo === 'muebles' ? stockMuebles : stockRevestimientos;
  if (!stockObj[nombre]) {
    if (modulo === 'muebles') await loadMuebles(nombre);
    else await loadRevestimientos(nombre);
  } else if (!(modulo === 'revestimientos' && revestSubview === 'ventas')) {
    renderTable();
  }
  // Si se cambió de proveedor estando en la sub-vista Ventas, se permanece ahí
  // mostrando el carrito y la lista de artículos del proveedor recién elegido.
  if (modulo === 'revestimientos' && revestSubview === 'ventas') initVentas();
}

function updateSectionTitle() {
  const t = document.getElementById('sectionTitle');
  if (!t) return;
  if (activeModule === 'colchones')          t.innerHTML = '<span>■</span>Colchones — Inventario';
  else if (activeModule === 'muebles')       t.innerHTML = `<span>■</span>Muebles — ${activeProveedor}`;
  else if (activeModule === 'revestimientos') t.innerHTML = `<span>■</span>Revestimientos — ${activeProveedorRev}`;
  else                                       t.innerHTML = '<span>■</span>Pedidos — MaxiKing';
}

// ── LOAD COLCHONES ────────────────────────────────────────────────────────────
async function loadStock() {
  setLoading(true);
  try {
    stockColchones = await sbRequest('GET', '?select=*&order=descripcion.asc', null, 'stock') || [];
    if (stockColchones.length === 0) {
      showToast('Cargando artículos...', 'info');
      await seedColchones();
    }
    renderTable();
  } catch(e) {
    showToast('Error al conectar: ' + e.message, 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function seedColchones() {
  // Lista completa de colchones y sommiers separados por medida
  const items = [
    // BONNEL SYSTEM
    ['COLCHON','ESMERALDA','80cm'],['COLCHON','ESMERALDA','100cm'],['COLCHON','ESMERALDA','140cm'],
    ['COLCHON','SIESTA EN LA QUEBRADA DOBLE CONFORT','80cm'],['COLCHON','SIESTA EN LA QUEBRADA DOBLE CONFORT','100cm'],['COLCHON','SIESTA EN LA QUEBRADA DOBLE CONFORT','130cm'],['COLCHON','SIESTA EN LA QUEBRADA DOBLE CONFORT','140cm'],
    ['COLCHON','ESPEJO DE LUNA','80cm'],['COLCHON','ESPEJO DE LUNA','100cm'],['COLCHON','ESPEJO DE LUNA','130cm'],['COLCHON','ESPEJO DE LUNA','140cm'],
    ['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','80cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','100cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','140cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','160cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','160x200cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','180x200cm'],['COLCHON','ESPEJO DE LUNA CON DOBLE PILLOW TOP','200x200cm'],
    ['COLCHON','CORRAL DE NUBES CON DOBLE PILLOW TOP','100cm'],['COLCHON','CORRAL DE NUBES CON DOBLE PILLOW TOP','140cm'],['COLCHON','CORRAL DE NUBES CON DOBLE PILLOW TOP','160x200cm'],['COLCHON','CORRAL DE NUBES CON DOBLE PILLOW TOP','180x200cm'],['COLCHON','CORRAL DE NUBES CON DOBLE PILLOW TOP','200x200cm'],
    // POCKET SYSTEM
    ['COLCHON','VALLE DE SUEÑOS','100cm'],['COLCHON','VALLE DE SUEÑOS','140cm'],['COLCHON','VALLE DE SUEÑOS','160x200cm'],['COLCHON','VALLE DE SUEÑOS','180x200cm'],['COLCHON','VALLE DE SUEÑOS','200x200cm'],
    ['COLCHON','SILENCIO DE CIELO GRAND','100cm'],['COLCHON','SILENCIO DE CIELO GRAND','140cm'],['COLCHON','SILENCIO DE CIELO GRAND','160x200cm'],['COLCHON','SILENCIO DE CIELO GRAND','180x200cm'],['COLCHON','SILENCIO DE CIELO GRAND','200x200cm'],
    // ESPUMA FLEXIBLE
    ['COLCHON','AMANECER','80cm'],['COLCHON','AMANECER','100cm'],
    ['COLCHON','ATARDECER','80cm'],['COLCHON','ATARDECER','100cm'],['COLCHON','ATARDECER','130cm'],['COLCHON','ATARDECER','140cm'],
    ['COLCHON','HOTELERO','80cm'],['COLCHON','HOTELERO','100cm'],['COLCHON','HOTELERO','130cm'],['COLCHON','HOTELERO','140cm'],
    ['COLCHON','ARMONIA 22cm','80cm'],['COLCHON','ARMONIA 22cm','100cm'],['COLCHON','ARMONIA 22cm','130cm'],['COLCHON','ARMONIA 22cm','140cm'],
    ['COLCHON','ARMONIA 26cm','130cm'],['COLCHON','ARMONIA 26cm','140cm'],
    ['COLCHON','BRISAS','80cm'],['COLCHON','BRISAS','100cm'],['COLCHON','BRISAS','130cm'],['COLCHON','BRISAS','140cm'],
    ['COLCHON','BRISAS CON DOBLE PILLOW TOP','80cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','100cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','130cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','140cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','160cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','160x200cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','180cm'],['COLCHON','BRISAS CON DOBLE PILLOW TOP','180x200cm'],
    ['COLCHON','CREPUSCULO','100cm'],['COLCHON','CREPUSCULO','140cm'],['COLCHON','CREPUSCULO','160cm'],['COLCHON','CREPUSCULO','160x200cm'],['COLCHON','CREPUSCULO','180cm'],['COLCHON','CREPUSCULO','180x200cm'],
    // SOMMIERS SEPARADOS
    ['SOMMIER','SOMMIER BASE','80cm'],['SOMMIER','SOMMIER BASE','100cm'],['SOMMIER','SOMMIER BASE','130cm'],['SOMMIER','SOMMIER BASE','140cm'],
    ['SOMMIER','ATARDECER','80cm'],['SOMMIER','ATARDECER','80x200cm'],['SOMMIER','ATARDECER','90cm'],['SOMMIER','ATARDECER','90x200cm'],['SOMMIER','ATARDECER','100cm'],['SOMMIER','ATARDECER','100x200cm'],['SOMMIER','ATARDECER','130cm'],['SOMMIER','ATARDECER','140cm'],
    ['SOMMIER','HOTELERO','80cm'],['SOMMIER','HOTELERO','80x200cm'],['SOMMIER','HOTELERO','90cm'],['SOMMIER','HOTELERO','90x200cm'],['SOMMIER','HOTELERO','100cm'],['SOMMIER','HOTELERO','100x200cm'],['SOMMIER','HOTELERO','130cm'],['SOMMIER','HOTELERO','140cm'],
    ['SOMMIER','ESPEJO DE LUNA','80cm'],['SOMMIER','ESPEJO DE LUNA','80x200cm'],['SOMMIER','ESPEJO DE LUNA','90cm'],['SOMMIER','ESPEJO DE LUNA','90x200cm'],['SOMMIER','ESPEJO DE LUNA','100cm'],['SOMMIER','ESPEJO DE LUNA','100x200cm'],['SOMMIER','ESPEJO DE LUNA','140cm'],
    ['SOMMIER','BRISAS','80cm'],['SOMMIER','BRISAS','80x200cm'],['SOMMIER','BRISAS','90cm'],['SOMMIER','BRISAS','90x200cm'],['SOMMIER','BRISAS','100cm'],['SOMMIER','BRISAS','100x200cm'],['SOMMIER','BRISAS','140cm'],
    ['SOMMIER','CREPUSCULO','80cm'],['SOMMIER','CREPUSCULO','90cm'],['SOMMIER','CREPUSCULO','90x200cm'],['SOMMIER','CREPUSCULO','100cm'],['SOMMIER','CREPUSCULO','130cm'],['SOMMIER','CREPUSCULO','140cm'],
    ['SOMMIER','CORRAL DE NUBES','80cm'],['SOMMIER','CORRAL DE NUBES','90cm'],['SOMMIER','CORRAL DE NUBES','90x200cm'],['SOMMIER','CORRAL DE NUBES','100cm'],['SOMMIER','CORRAL DE NUBES','130cm'],['SOMMIER','CORRAL DE NUBES','140cm'],
    ['SOMMIER','SILENCIO DE CIELO','80cm'],['SOMMIER','SILENCIO DE CIELO','90cm'],['SOMMIER','SILENCIO DE CIELO','90x200cm'],['SOMMIER','SILENCIO DE CIELO','100cm'],['SOMMIER','SILENCIO DE CIELO','130cm'],['SOMMIER','SILENCIO DE CIELO','140cm'],
    ['SOMMIER','ECO CUERO','Única'],
    // JACKARD
    ['COLCHON','CLASICO JACKARD','80cm'],['COLCHON','CLASICO JACKARD','100cm'],
    ['COLCHON','PICASSO','80cm'],['COLCHON','PICASSO','100cm'],['COLCHON','PICASSO','130cm'],['COLCHON','PICASSO','140cm'],
    ['COLCHON','CONSULAR','80cm'],['COLCHON','CONSULAR','100cm'],['COLCHON','CONSULAR','130cm'],['COLCHON','CONSULAR','140cm'],
    ['COLCHON','ZAFIRO','80cm'],['COLCHON','ZAFIRO','100cm'],['COLCHON','ZAFIRO','140cm'],['COLCHON','ZAFIRO','160x200cm'],['COLCHON','ZAFIRO','180x200cm'],['COLCHON','ZAFIRO','200x200cm'],
    ['COLCHON','COLCHON MAXIKINGBOX','80cm'],['COLCHON','COLCHON MAXIKINGBOX','100cm'],['COLCHON','COLCHON MAXIKINGBOX','140cm'],['COLCHON','COLCHON MAXIKINGBOX','160x200cm'],
    ['SOMMIER','PICASSO','80cm'],['SOMMIER','PICASSO','80x200cm'],['SOMMIER','PICASSO','90x200cm'],['SOMMIER','PICASSO','100cm'],['SOMMIER','PICASSO','100x200cm'],['SOMMIER','PICASSO','130cm'],['SOMMIER','PICASSO','140cm'],
    ['SOMMIER','CONSULAR','80cm'],['SOMMIER','CONSULAR','80x200cm'],['SOMMIER','CONSULAR','100cm'],['SOMMIER','CONSULAR','130cm'],['SOMMIER','CONSULAR','140cm'],
    ['SOMMIER','ARMONIA','80cm'],['SOMMIER','ARMONIA','80x200cm'],['SOMMIER','ARMONIA','100cm'],['SOMMIER','ARMONIA','130cm'],['SOMMIER','ARMONIA','140cm'],
    ['SOMMIER','ZAFIRO','80cm'],['SOMMIER','ZAFIRO','80x200cm'],['SOMMIER','ZAFIRO','100cm'],['SOMMIER','ZAFIRO','130cm'],['SOMMIER','ZAFIRO','140cm'],
    ['SOMMIER','ESMERALDA','80cm'],['SOMMIER','ESMERALDA','100cm'],['SOMMIER','ESMERALDA','130cm'],['SOMMIER','ESMERALDA','140cm'],
    ['SOMMIER','SIESTA','80cm'],['SOMMIER','SIESTA','100cm'],['SOMMIER','SIESTA','130cm'],['SOMMIER','SIESTA','140cm'],
    // ESPUMA ESPECIALES
    ['COLCHON','ATARDECER INFANTIL','80cm'],['SOMMIER','ATARDECER INFANTIL','80cm'],
    ['COLCHON','SANITARIO','80cm'],
    ['COLCHON','SILLON CAMA PLEGABLE','80cm'],
    // PROMO JULIO 2026
    ['COLCHON','IBIZA','80cm'],['COLCHON','IBIZA','100cm'],['COLCHON','IBIZA','130cm'],['COLCHON','IBIZA','140cm'],
    ['COLCHON','TURIN','80cm'],['COLCHON','TURIN','100cm'],['COLCHON','TURIN','130cm'],['COLCHON','TURIN','140cm'],
    ['SOMMIER','ECO PROMO','80cm'],['SOMMIER','ECO PROMO','100cm'],['SOMMIER','ECO PROMO','130cm'],['SOMMIER','ECO PROMO','140cm'],
    ['COLCHON','ESMERALDA BICONICOS','80cm'],['COLCHON','ESMERALDA BICONICOS','100cm'],['COLCHON','ESMERALDA BICONICOS','140cm'],
    ['SOMMIER','ESMERALDA BICONICOS','80cm'],['SOMMIER','ESMERALDA BICONICOS','100cm'],['SOMMIER','ESMERALDA BICONICOS','140cm'],
  ];

  const rows = items.map(([tipo, modelo, medida]) => ({
    codigo: '',
    descripcion: `${tipo} ${modelo} ${medida}`,
    cantidad: 0,
    fecha: today()
  }));

  console.log(`Insertando ${rows.length} artículos en stock...`);
  stockColchones = [];
  const lotes = [];
  for (let i = 0; i < rows.length; i += 50)
    lotes.push(rows.slice(i, i + 50));
  for (const lote of lotes) {
    const inserted = await sbRequest('POST', '', lote, 'stock') || [];
    stockColchones.push(...inserted);
  }
  console.log(`Stock cargado: ${stockColchones.length} artículos`);
}

// Catálogo completo (insertar en Supabase si está vacío)
const CATALOGO_SEED = [
  // ── BONNEL SYSTEM ────────────────────────────────────────────────────────
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESMERALDA",medida:"80cm",descripcion:"Funda de tela Raso Colchonero completamente matelaseada",espesor_cm:24},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESMERALDA",medida:"100cm",descripcion:"Funda de tela Raso Colchonero completamente matelaseada",espesor_cm:24},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESMERALDA",medida:"140cm",descripcion:"Funda de tela Raso Colchonero completamente matelaseada",espesor_cm:24},
  {linea:"Bonnel System",tipo:"colchon",modelo:"SIESTA EN LA QUEBRADA DOBLE CONFORT",medida:"80cm",descripcion:"Completamente matelaseado con un pillow top",espesor_cm:28},
  {linea:"Bonnel System",tipo:"colchon",modelo:"SIESTA EN LA QUEBRADA DOBLE CONFORT",medida:"100cm",descripcion:"Completamente matelaseado con un pillow top",espesor_cm:28},
  {linea:"Bonnel System",tipo:"colchon",modelo:"SIESTA EN LA QUEBRADA DOBLE CONFORT",medida:"130cm",descripcion:"Completamente matelaseado con un pillow top",espesor_cm:28},
  {linea:"Bonnel System",tipo:"colchon",modelo:"SIESTA EN LA QUEBRADA DOBLE CONFORT",medida:"140cm",descripcion:"Completamente matelaseado con un pillow top",espesor_cm:28},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA",medida:"80cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:25},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA",medida:"100cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:25},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA",medida:"130cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:25},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA",medida:"140cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:25},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"80cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"100cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"140cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"160cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"160x200cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"180x200cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"ESPEJO DE LUNA CON DOBLE PILLOW TOP",medida:"200x200cm",descripcion:"Matelaseado en tela de jackard belga con manijas",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"CORRAL DE NUBES CON DOBLE PILLOW TOP",medida:"100cm",descripcion:"Matelaseado en tela de tejido de punto y chenille",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"CORRAL DE NUBES CON DOBLE PILLOW TOP",medida:"140cm",descripcion:"Matelaseado en tela de tejido de punto y chenille",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"CORRAL DE NUBES CON DOBLE PILLOW TOP",medida:"160x200cm",descripcion:"Matelaseado en tela de tejido de punto y chenille",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"CORRAL DE NUBES CON DOBLE PILLOW TOP",medida:"180x200cm",descripcion:"Matelaseado en tela de tejido de punto y chenille",espesor_cm:30},
  {linea:"Bonnel System",tipo:"colchon",modelo:"CORRAL DE NUBES CON DOBLE PILLOW TOP",medida:"200x200cm",descripcion:"Matelaseado en tela de tejido de punto y chenille",espesor_cm:30},

  // ── POCKET SYSTEM ────────────────────────────────────────────────────────
  {linea:"Pocket System",tipo:"colchon",modelo:"VALLE DE SUEÑOS",medida:"100cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:26},
  {linea:"Pocket System",tipo:"colchon",modelo:"VALLE DE SUEÑOS",medida:"140cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:26},
  {linea:"Pocket System",tipo:"colchon",modelo:"VALLE DE SUEÑOS",medida:"160x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:26},
  {linea:"Pocket System",tipo:"colchon",modelo:"VALLE DE SUEÑOS",medida:"180x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:26},
  {linea:"Pocket System",tipo:"colchon",modelo:"VALLE DE SUEÑOS",medida:"200x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:26},
  {linea:"Pocket System",tipo:"colchon",modelo:"SILENCIO DE CIELO GRAND",medida:"100cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:30},
  {linea:"Pocket System",tipo:"colchon",modelo:"SILENCIO DE CIELO GRAND",medida:"140cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:30},
  {linea:"Pocket System",tipo:"colchon",modelo:"SILENCIO DE CIELO GRAND",medida:"160x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:30},
  {linea:"Pocket System",tipo:"colchon",modelo:"SILENCIO DE CIELO GRAND",medida:"180x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:30},
  {linea:"Pocket System",tipo:"colchon",modelo:"SILENCIO DE CIELO GRAND",medida:"200x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:30},

  // ── ESPUMA FLEXIBLE ───────────────────────────────────────────────────────
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"AMANECER",medida:"80cm",descripcion:"Funda de tapa de Sabana lisa y banda Matelaseada",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"AMANECER",medida:"100cm",descripcion:"Funda de tapa de Sabana lisa y banda Matelaseada",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ATARDECER",medida:"80cm",descripcion:"Funda de tela de Sabana completamente matelaseada",espesor_cm:20},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ATARDECER",medida:"100cm",descripcion:"Funda de tela de Sabana completamente matelaseada",espesor_cm:20},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ATARDECER",medida:"130cm",descripcion:"Funda de tela de Sabana completamente matelaseada",espesor_cm:20},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ATARDECER",medida:"140cm",descripcion:"Funda de tela de Sabana completamente matelaseada",espesor_cm:20},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"HOTELERO",medida:"80cm",descripcion:"Funda Tapa y banda en tela de Sabana lisa",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"HOTELERO",medida:"100cm",descripcion:"Funda Tapa y banda en tela de Sabana lisa",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"HOTELERO",medida:"130cm",descripcion:"Funda Tapa y banda en tela de Sabana lisa",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"HOTELERO",medida:"140cm",descripcion:"Funda Tapa y banda en tela de Sabana lisa",espesor_cm:18},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 22cm",medida:"80cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 22cm",medida:"100cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 22cm",medida:"130cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 22cm",medida:"140cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 26cm",medida:"130cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:26},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"ARMONIA 26cm",medida:"140cm",descripcion:"Funda Tapa y banda de Jacqard completamente matelaseado",espesor_cm:26},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS",medida:"80cm",descripcion:"Funda matelaseada en tela de jackard",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS",medida:"100cm",descripcion:"Funda matelaseada en tela de jackard",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS",medida:"130cm",descripcion:"Funda matelaseada en tela de jackard",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS",medida:"140cm",descripcion:"Funda matelaseada en tela de jackard",espesor_cm:22},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"80cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"100cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"130cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"140cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"160cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"160x200cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"180cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"BRISAS CON DOBLE PILLOW TOP",medida:"180x200cm",descripcion:"Funda matelaseada en tela de jackard con pillow top",espesor_cm:30},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"100cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"140cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"160cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"160x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"180cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},
  {linea:"Espuma Flexible",tipo:"colchon",modelo:"CREPUSCULO",medida:"180x200cm",descripcion:"Matelaseado en tela de tejido de punto y Jackard",espesor_cm:28},

  // ── SOMMIERS — CADA MODELO SEPARADO ──────────────────────────────────────
  {linea:"Sommiers",tipo:"sommier",modelo:"SOMMIER BASE",medida:"80cm",descripcion:"Sommier base",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SOMMIER BASE",medida:"100cm",descripcion:"Sommier base",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SOMMIER BASE",medida:"130cm",descripcion:"Sommier base",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SOMMIER BASE",medida:"140cm",descripcion:"Sommier base",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"80cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"80x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"90cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"90x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"100cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"100x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"130cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ATARDECER",medida:"140cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"80cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"80x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"90cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"90x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"100cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"100x200cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"130cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"HOTELERO",medida:"140cm",descripcion:"Continental con funda sabana Matelaseada + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"90cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"100x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ESPEJO DE LUNA",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"90cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"100x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"BRISAS",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"90cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CREPUSCULO",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"90cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"CORRAL DE NUBES",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"90cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"SILENCIO DE CIELO",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas con rueda",espesor_cm:0},
  {linea:"Sommiers",tipo:"sommier",modelo:"ECO CUERO",medida:"Única",descripcion:"Continental c/funda simil ecocuero y tela antideslizante + patas fijas",espesor_cm:0},

  // ── JACKARD ───────────────────────────────────────────────────────────────
  {linea:"Jackard",tipo:"colchon",modelo:"CLASICO JACKARD",medida:"80cm",descripcion:"Espuma completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Jackard",tipo:"colchon",modelo:"CLASICO JACKARD",medida:"100cm",descripcion:"Espuma completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Jackard",tipo:"colchon",modelo:"PICASSO",medida:"80cm",descripcion:"Espuma de Alta Resistencia matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Jackard",tipo:"colchon",modelo:"PICASSO",medida:"100cm",descripcion:"Espuma de Alta Resistencia matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Jackard",tipo:"colchon",modelo:"PICASSO",medida:"130cm",descripcion:"Espuma de Alta Resistencia matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Jackard",tipo:"colchon",modelo:"PICASSO",medida:"140cm",descripcion:"Espuma de Alta Resistencia matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Jackard",tipo:"colchon",modelo:"CONSULAR",medida:"80cm",descripcion:"Totalmente matelaseado en tela de Jackard con manijas",espesor_cm:28},
  {linea:"Jackard",tipo:"colchon",modelo:"CONSULAR",medida:"100cm",descripcion:"Totalmente matelaseado en tela de Jackard con manijas",espesor_cm:28},
  {linea:"Jackard",tipo:"colchon",modelo:"CONSULAR",medida:"130cm",descripcion:"Totalmente matelaseado en tela de Jackard con manijas",espesor_cm:28},
  {linea:"Jackard",tipo:"colchon",modelo:"CONSULAR",medida:"140cm",descripcion:"Totalmente matelaseado en tela de Jackard con manijas",espesor_cm:28},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"80cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"100cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"140cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"160x200cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"180x200cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"ZAFIRO",medida:"200x200cm",descripcion:"Espuma de Alta Densidad matelaseado en tela de Jackard",espesor_cm:30},
  {linea:"Jackard",tipo:"colchon",modelo:"COLCHON MAXIKINGBOX",medida:"80cm",descripcion:"Espuma enrollado en caja",espesor_cm:22},
  {linea:"Jackard",tipo:"colchon",modelo:"COLCHON MAXIKINGBOX",medida:"100cm",descripcion:"Espuma enrollado en caja",espesor_cm:22},
  {linea:"Jackard",tipo:"colchon",modelo:"COLCHON MAXIKINGBOX",medida:"140cm",descripcion:"Espuma enrollado en caja",espesor_cm:22},
  {linea:"Jackard",tipo:"colchon",modelo:"COLCHON MAXIKINGBOX",medida:"160x200cm",descripcion:"Espuma enrollado en caja",espesor_cm:22},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"90x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"100x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"PICASSO",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"CONSULAR",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"CONSULAR",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"CONSULAR",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"CONSULAR",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"CONSULAR",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ARMONIA",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ARMONIA",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ARMONIA",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ARMONIA",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ARMONIA",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ZAFIRO",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ZAFIRO",medida:"80x200cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ZAFIRO",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ZAFIRO",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ZAFIRO",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ESMERALDA",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ESMERALDA",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ESMERALDA",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"ESMERALDA",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"SIESTA",medida:"80cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"SIESTA",medida:"100cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"SIESTA",medida:"130cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},
  {linea:"Jackard",tipo:"sommier",modelo:"SIESTA",medida:"140cm",descripcion:"Continental con funda de Jackard Matelaseado + patas fijas",espesor_cm:0},

  // ── ESPUMA ESPECIALES ─────────────────────────────────────────────────────
  {linea:"Espuma Especiales",tipo:"colchon",modelo:"ATARDECER INFANTIL",medida:"80cm",descripcion:"Funda de tela de Sabana diseño infantil completamente matelaseada",espesor_cm:20},
  {linea:"Espuma Especiales",tipo:"sommier",modelo:"ATARDECER INFANTIL",medida:"80cm",descripcion:"Sommier línea infantil",espesor_cm:0},
  {linea:"Espuma Especiales",tipo:"colchon",modelo:"SANITARIO",medida:"80cm",descripcion:"Funda impermeable en tela de bagum de alta resistencia",espesor_cm:18},
  {linea:"Espuma Especiales",tipo:"conjunto",modelo:"FRIDA 2 EN 1",medida:"80cm",descripcion:"Colchon + Sommier integrado de Espuma totalmente matelaseado",espesor_cm:0},
  {linea:"Espuma Especiales",tipo:"conjunto",modelo:"FRIDA 2 EN 1",medida:"140cm",descripcion:"Colchon + Sommier integrado de Espuma totalmente matelaseado",espesor_cm:0},
  {linea:"Espuma Especiales",tipo:"colchon",modelo:"SILLON CAMA PLEGABLE",medida:"80cm",descripcion:"Funda en tela de sabana. Multifuncion asiento y cama plegable",espesor_cm:20},

  // ── ALMOHADAS ─────────────────────────────────────────────────────────────
  {linea:"Almohadas",tipo:"almohada",modelo:"VISCO LITE",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"VISCO KIDS",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"VISCO CHANNEL",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"VISCO AIRY 70",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"VISCO AIRY 90",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"HR SENSACION LATEX 70",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"HR SENSACION LATEX 90",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"SENSACION LATEX CERVICAL",medida:"Estándar",descripcion:"Almohada viscoelástica",espesor_cm:0},
  {linea:"Almohadas",tipo:"almohada",modelo:"NATURIS",medida:"Especial",descripcion:"Almohada especial",espesor_cm:0},

  // ── CUNAS ─────────────────────────────────────────────────────────────────
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"100x70x13cm",descripcion:"Colchón de cuna",espesor_cm:13},
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"100x50x13cm",descripcion:"Colchón de cuna",espesor_cm:13},
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"100x65x13cm",descripcion:"Colchón de cuna",espesor_cm:13},
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"120x60x13cm",descripcion:"Colchón de cuna",espesor_cm:13},
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"130x60x13cm",descripcion:"Colchón de cuna",espesor_cm:13},
  {linea:"Cunas",tipo:"colchon",modelo:"COLCHON DE CUNA",medida:"140x80x13cm",descripcion:"Colchón de cuna",espesor_cm:13},

  // ── PROMO JULIO 2026 ──────────────────────────────────────────────────────
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"IBIZA",medida:"80cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"IBIZA",medida:"100cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"IBIZA",medida:"130cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"IBIZA",medida:"140cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:26},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"TURIN",medida:"80cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"TURIN",medida:"100cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"TURIN",medida:"130cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"TURIN",medida:"140cm",descripcion:"Espuma de Alta Resistencia completamente matelaseado en tela de Jackard",espesor_cm:20},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ECO PROMO",medida:"80cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ECO PROMO",medida:"100cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ECO PROMO",medida:"130cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ECO PROMO",medida:"140cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"ESMERALDA BICONICOS",medida:"80cm",descripcion:"Resortes Biconicos con marco perimetral de Espuma + Funda Matelaseada",espesor_cm:28},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"ESMERALDA BICONICOS",medida:"100cm",descripcion:"Resortes Biconicos con marco perimetral de Espuma + Funda Matelaseada",espesor_cm:28},
  {linea:"Promo Julio 2026",tipo:"colchon",modelo:"ESMERALDA BICONICOS",medida:"140cm",descripcion:"Resortes Biconicos con marco perimetral de Espuma + Funda Matelaseada",espesor_cm:28},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ESMERALDA BICONICOS",medida:"80cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ESMERALDA BICONICOS",medida:"100cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
  {linea:"Promo Julio 2026",tipo:"sommier",modelo:"ESMERALDA BICONICOS",medida:"140cm",descripcion:"Estructura de Madera recubierta en Tela de Jackard Matelaseado + Patas fijas",espesor_cm:0},
];

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  setLoading(true);
  try {
    await Promise.all([loadSettings(), loadProveedores()]);
    await loadStock();
  } catch(e) {
    showToast('Error al iniciar la aplicación', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}
