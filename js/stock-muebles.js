// ── LOAD MUEBLES ──────────────────────────────────────────────────────────────
async function loadMuebles(proveedor) {
  setLoading(true);
  try {
    const data = await sbRequest('GET',
      `?select=*&proveedor=eq.${encodeURIComponent(proveedor)}&order=id.asc`,
      null, 'stock_muebles') || [];
    stockMuebles[proveedor] = data;
    // Seed Mosconi si está vacío
    if (proveedor === 'Mosconi' && data.length === 0) await seedMosconi();
    renderTable();
  } catch(e) {
    showToast('Error al cargar ' + proveedor, 'error');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function seedMosconi() {
  const d = '2026-04-24';
  const items = [
    ['10159', 'PORTAMICROONDAS + GRILL EXPRESS BLANCO MELAMINA', 2],
    ['10161', 'ORGANIZADOR 180 - BLANCO',                        2],
    ['57310', 'PLACARD 180 2 PTAS CORR VELVET - TISSA',          1],
    ['57312', 'PLACARD 180 2 PTAS CORR VELVET - BAMBU',          1],
    ['57314', 'PLACARD 220 3 PTAS CORR VELVET - TISSA',          1],
    ['57316', 'PLACARD 220 3 PTAS CORR VELVET - BAMBU',          1],
    ['80798', 'COMODA 4 CAJONES NATURE NEB GRIS',                1],
  ];
  const rows = items.map(([codigo, descripcion, cantidad]) => ({
    proveedor: 'Mosconi', codigo, descripcion, cantidad, fecha: d
  }));
  stockMuebles['Mosconi'] = await sbRequest('POST', '', rows, 'stock_muebles') || [];
}
