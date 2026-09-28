// ── UX TÁCTIL: scroll automático al enfocar un campo ─────────────────────────
// En tablet (y celular) el teclado virtual puede tapar el campo que se está
// completando. Al enfocar cualquier input/select/textarea se lo desplaza al
// centro de la pantalla, dándole tiempo al teclado a abrirse primero. Se limita
// a dispositivos de puntero "coarse" (touch): en desktop, con mouse y sin
// teclado virtual, este scroll extra no aporta nada y sería una distracción.
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!el.matches || !el.matches('input, select, textarea')) return;
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300); // le da tiempo al teclado virtual a terminar de abrirse
  });
}
