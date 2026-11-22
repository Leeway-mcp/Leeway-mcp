// Leeway custom cursor: a gold dot that tracks instantly and a seal-like ring that follows
// with inertia. The ring opens up and pulls toward links and buttons, shows DRAG on the
// globe, tightens on press and steps aside for text fields. Only on fine pointers.
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (fine) {
  const root = document.createElement('div');
  root.className = 'cur is-hidden';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="cur__ring"><div class="cur__in">
      <svg viewBox="0 0 48 48"><circle class="cur__track" cx="24" cy="24" r="22"/><circle class="cur__arc" cx="24" cy="24" r="22" pathLength="100"/></svg>
      <span class="cur__label"></span>
    </div></div>
    <div class="cur__dot"></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('has-cur');

  const ring = root.querySelector('.cur__ring');
  const dot = root.querySelector('.cur__dot');
  const label = root.querySelector('.cur__label');
  const HOVER = 'a, button, [role="tab"], summary, select, label.toggle, .pg-tool, .tool, .chip, [data-node], input[type="range"], input[type="checkbox"], [data-cursor]';
  const TEXT = 'input:not([type="range"]):not([type="checkbox"]), textarea, [contenteditable="true"]';

  let x = -100, y = -100, rx = x, ry = y, target = null, state = '';
  const set = (s, text = '') => {
    if (s === state && label.textContent === text) return;
    root.classList.remove('is-hover', 'is-drag', 'is-text', 'is-press');
    if (s) root.classList.add(`is-${s}`);
    label.textContent = text;
    state = s;
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    root.classList.remove('is-hidden');
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest(TEXT)) { target = null; set('text'); return; }
    if (el.id === 'globe') { // the globe sets its own cursor intent inline
      const c = el.style.cursor;
      target = null;
      set(c === 'pointer' ? 'hover' : 'drag', c === 'pointer' ? 'OPEN' : c === 'grabbing' ? '' : 'DRAG');
      return;
    }
    const h = el.closest(HOVER);
    target = h && h.getBoundingClientRect().width < 360 ? h : null; // magnet only for compact targets
    set(h ? 'hover' : '', h?.dataset.cursor || '');
  }, { passive: true });

  addEventListener('pointerdown', () => root.classList.add('is-down'));
  addEventListener('pointerup', () => root.classList.remove('is-down'));
  document.addEventListener('mouseleave', () => root.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => root.classList.remove('is-hidden'));

  const ease = reduced ? 1 : 0.2;
  const frame = () => {
    let tx = x, ty = y;
    if (target && target.isConnected) { // gentle pull toward the centre of the hovered control
      const r = target.getBoundingClientRect();
      tx = x + (r.left + r.width / 2 - x) * 0.35;
      ty = y + (r.top + r.height / 2 - y) * 0.35;
    }
    rx += (tx - rx) * ease; ry += (ty - ry) * ease;
    ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
    requestAnimationFrame(frame);
  };
  frame();
}
