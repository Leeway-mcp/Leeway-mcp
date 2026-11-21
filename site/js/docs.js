// AURUM Docs interactions
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* scroll-spy */
const links = $$('.docs-side nav a');
const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const id = '#' + e.target.id;
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
    const active = links.find((a) => a.getAttribute('href') === id);
    active?.scrollIntoView({ block: 'nearest' });
  });
}, { rootMargin: '-20% 0px -70% 0px' });
targets.forEach((t) => spy.observe(t));

/* search: filters the sidebar and jumps to the first match on Enter */
const search = $('#docsSearch');
const index = targets.map((t) => ({ id: t.id, text: t.textContent.toLowerCase() }));
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  links.forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    const hit = !q || a.textContent.toLowerCase().includes(q) || index.find((x) => x.id === id)?.text.includes(q);
    a.classList.toggle('is-hidden', !hit);
  });
});
search.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const first = links.find((a) => !a.classList.contains('is-hidden'));
  if (first) { location.hash = first.getAttribute('href'); closeMenu(); }
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  if (e.key === 'Escape') { closeLightbox(); closeMenu(); }
});

/* mobile drawer */
const side = $('#docsSide'), menuBtn = $('#docsMenuBtn');
const closeMenu = () => { side.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); };
menuBtn.addEventListener('click', () => {
  const open = !side.classList.contains('is-open');
  side.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', open);
});
links.forEach((a) => a.addEventListener('click', closeMenu));

/* tabs */
$$('[data-tabs]').forEach((tabs) => {
  $$('[data-tab]', tabs).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', tabs).forEach((x) => x.classList.toggle('is-on', x === b));
    $$('[data-panel]', tabs).forEach((p) => p.classList.toggle('is-on', p.dataset.panel === b.dataset.tab));
  }));
});

/* copy buttons copy the code block that follows them */
$$('[data-copy-next]').forEach((b) => b.addEventListener('click', async () => {
  const code = b.closest('.code').querySelector('pre').innerText;
  try { await navigator.clipboard.writeText(code); } catch {}
  b.textContent = 'Copied'; b.classList.add('is-done');
  setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('is-done'); }, 1500);
}));

/* lightbox for screenshots */
const lb = $('#lightbox'), lbImg = $('#lightbox img');
function closeLightbox() { lb.hidden = true; }
$$('.shot img').forEach((img) => img.addEventListener('click', () => { lbImg.src = img.src; lbImg.alt = img.alt; lb.hidden = false; }));
lb.addEventListener('click', closeLightbox);

/* flash a tool card when jumped to */
addEventListener('hashchange', () => {
  const el = $(location.hash);
  if (el?.classList.contains('tool-doc')) { el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600); }
});
