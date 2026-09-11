// ── LOAD REVESTIMIENTOS ───────────────────────────────────────────────────────
async function loadRevestimientos(proveedor) {
  setLoading(true);
  try {
    const data = await sbRequest('GET',
      `?select=*&proveedor=eq.${encodeURIComponent(proveedor)}&order=id.asc`,
      null, 'stock_revestimientos') || [];
    stockRevestimientos[proveedor] = data;
    renderTable();
  } catch(e) {
    showToast('Error al cargar Revestimientos', 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function seedRevestimientos() {
  const d = '2026-05-08';
  const items = [
    // Factura 1 — Saavedra y J.P. Lopez
    ['REV981', 'REVESTIMIENTO INTERIOR EPS CONCEPT DRYMAT MADERA OSCURO 120X12X2900mm', 12],
    ['GD701',  'CIELORRASO PVC DRYMAT MADERA ASH X 5.95M',                              2],
    ['GD702',  'CIELORRASO PVC DRYMAT 250X7MM WALNUT X 5.95M',                          2],
    ['GD703',  'CIELORRASO PVC DRYMAT 250X7MM CHERRY X 5.95M',                          2],
    ['GD901',  'CIELORRASO PVC DRYMAT ACANALADO 300X9MM MAPLE X 5.95M',                 4],
    ['GD902',  'CIELORRASO PVC DRYMAT ACANALADO 300X9MM BAMBO X 5.95M',                 2],
    ['GD903',  'CIELORRASO PVC DRYMAT ACANALADO 300X9MM FIR X 5.95M',                   2],
    ['PLA945', 'PLACA SIMPLISIMA CANTERA VENUS 1.20X2.40X6mm',                          1],
    ['PLA841', 'PLACA SIMPLISIMA MADERA VETEADA SOFT 1200X2400X6mm',                    1],
    ['PLA844', 'PLACA SIMPLISIMA MOSAICO GRECCO 1.20X2.40X6mm',                         1],
    ['PER973', 'PERFIL ANGULO PVC NEGRO X 3M',                                          2],
    // Factura 2 — Saavedra y J.P. Lopez
    ['PLA952', 'PLACA UV DRYMAT CALACAITA GOLDEN 3mm X1.22 X 2.44M',                   5],
    ['PLA953', 'PLACA UV DRYMAT EMPERADOR 3mm X1.22 X 2.44M',                           6],
    ['PLA959', 'PLACA UV DRYMAT CREMA MARFIL 3mm X1.22 X 2.44M',                        5],
    ['PLA961', 'PLACA UV DRYMAT IMPERIAL 3mm X1.22 X 2.44M',                            3],
    ['PLA962', 'PLACA UV DRYMAT PIEDRA TERRAZO 3mm X1.22 X 2.44M',                      5],
    ['PLA963', 'PLACA UV DRYMAT SAHARA 3mm X1.22 X 2.44M',                              5],
    ['REV970', 'REVESTIMIENTO INTERIOR EPS DRYMAT MADERA CLARO 120X20X2900mm',         12],
    ['REV973', 'REVESTIMIENTO INTERIOR EPS DRYMAT MADERA GRIS 120X20X2900mm',          12],
    ['REV976', 'REVESTIMIENTO INTERIOR EPS DRYMAT MADERA OSCURO 120X20X2900mm',        12],
    ['REV979', 'REVESTIMIENTO INTERIOR EPS CONCEPT DRYMAT MADERA CLARO 120X12X2900mm', 12],
    ['REV980', 'REVESTIMIENTO INTERIOR EPS CONCEPT DRYMAT GRIS 120X12X2900mm',         12],
    // Remito 3 — Centro de la Construcción
    ['PER962', 'PERFIL DE INICIO/TERMINACION PARA PLACAS UV COLOR PLATA X 3M',          2],
    ['PER963', 'PERFIL DE INICIO/TERMINACION PARA PLACAS UV COLOR NEGRO X 3M',          2],
    ['PER984', 'PERFIL ANGULO EXTERNO P/ PLACAS UV COLOR PLATA X 3M',                   4],
    ['PER985', 'PERFIL ANGULO EXTERNO P/ PLACAS UV COLOR NEGRO X 3M',                   4],
    ['PER980', 'PERFIL DE UNION PARA PLACAS UV COLOR NEGRO X 3M',                       2],
    ['PER981', 'PERFIL DE UNION PARA PLACAS UV COLOR PLATA X 3M',                       2],
  ];
  const rows = items.map(([codigo, descripcion, cantidad]) => ({
    proveedor: 'Saavedra y J.P. Lopez', codigo, descripcion, cantidad, fecha: d
  }));
  stockRevestimientos['Saavedra y J.P. Lopez'] = await sbRequest('POST', '', rows, 'stock_revestimientos') || [];
}

// ── SUB-NAVEGACIÓN STOCK / VENTAS ─────────────────────────────────────────────
let revestSubview = 'stock'; // 'stock' | 'ventas' — se recuerda mientras dure la sesión

// Sincroniza el DOM (pestañas activas, secciones visibles + fade) con revestSubview
// actual, sin cambiar su valor. Se usa tanto al hacer clic en una solapa como al
// volver a entrar a Revestimientos desde otro módulo (para restaurar la sub-vista).
function applyRevestSubview() {
  const view = revestSubview;
  document.getElementById('subtabStock').classList.toggle('active', view === 'stock');
  document.getElementById('subtabVentas').classList.toggle('active', view === 'ventas');

  const elStock  = document.getElementById('moduleStock');
  const elVentas = document.getElementById('moduleVentas');
  elStock.style.display  = view === 'stock'  ? '' : 'none';
  elVentas.style.display = view === 'ventas' ? '' : 'none';

  // Animación fade sutil al mostrar la sección activa
  const shown = view === 'stock' ? elStock : elVentas;
  shown.classList.remove('revest-fade-in');
  void shown.offsetWidth; // fuerza reflow para poder reiniciar la animación
  shown.classList.add('revest-fade-in');

  if (view === 'ventas') initVentas();
  else renderTable();
}

function switchRevestSubview(view) {
  if (activeModule !== 'revestimientos') return;
  if (revestSubview === view) return;
  revestSubview = view;
  applyRevestSubview();
}

async function syncCatalogoToStock() {
  // Solo colchones y sommiers del catálogo
  const aptos = catalogo.filter(a => a.tipo === 'colchon' || a.tipo === 'sommier');
  const nuevos = [];

  for (const item of aptos) {
    // Descripcion normalizada: "Colchón MODELO MEDIDA"
    const tipoLabel = item.tipo === 'colchon' ? 'Colchón' : 'Sommier';
    const desc = `${tipoLabel} ${item.modelo} ${item.medida}`;

    // Verificar si ya existe en stock por descripcion o codigo similar
    const existe = stockColchones.find(s =>
      s.descripcion.toLowerCase() === desc.toLowerCase()
    );
    if (!existe) {
      nuevos.push({
        codigo: item.linea.slice(0,4).toUpperCase() + '-' + item.id,
        descripcion: desc,
        cantidad: 0,
        fecha: today()
      });
    }
  }

  if (nuevos.length === 0) return;

  // Insertar en lotes de 50
  showToast(`Agregando ${nuevos.length} artículos del catálogo al stock...`, 'info');
  const lotes = [];
  for (let i = 0; i < nuevos.length; i += 50)
    lotes.push(nuevos.slice(i, i + 50));
  for (const lote of lotes) {
    const inserted = await sbRequest('POST', '', lote, 'stock') || [];
    stockColchones.push(...inserted);
  }
  showToast(`✓ ${nuevos.length} artículos sincronizados al stock de Colchones`, 'success');
}
