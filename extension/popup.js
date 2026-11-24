// Leeway Guard · popup: protection switch, per-site pause, counters and the last five checks.
// Built with DOM APIs only (no innerHTML).
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const LABEL = { SAFE_TO_SIGN: ['good', 'Looks safe'], REVIEW: ['warn', 'Review'], DO_NOT_SIGN: ['bad', 'Do not sign'], WILL_REVERT: ['bad', 'Would fail'], ERROR: ['warn', 'Not checked'] };
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid != null && kid !== '') el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

let host = null;
async function render() {
  const s = await api.runtime.sendMessage({ type: 'state' });
  $('enabled').checked = s.enabled !== false;
  const paused = host && (s.paused || []).includes(host);
  $('pause').checked = Boolean(paused);
  $('pause').disabled = !host;
  $('site').textContent = host || 'not a web page';
  $('status').classList.toggle('off', s.enabled === false || paused);
  $('statusText').textContent = s.enabled === false ? 'Protection is off' : paused ? `Paused on ${host}` : 'Protecting every site';
  for (const k of ['checked', 'warned', 'blocked']) $(k).textContent = (s.stats?.[k] ?? 0).toLocaleString('en-US');
  const items = (s.history || []).map((e) => {
    const [tone, label] = LABEL[e.verdict] || LABEL.REVIEW;
    return h('li', null, h('i', { class: tone }), h('span', null, h('b', null, label), h('small', null, `${e.site || ''} · ${e.method || ''}`)), h('time', null, ago(e.at)));
  });
  $('history').replaceChildren(...(items.length ? items : [h('li', { class: 'empty' }, 'Nothing checked yet. Open a dApp and press Swap or Sign.')]));
}

(async () => {
  try { const [tab] = await api.tabs.query({ active: true, currentWindow: true }); const u = new URL(tab?.url || ''); if (/^https?:$/.test(u.protocol)) host = u.host; } catch { /* no tab url */ }
  await render();
  $('enabled').addEventListener('change', async (e) => { await api.runtime.sendMessage({ type: 'set', values: { enabled: e.target.checked } }); render(); });
  $('pause').addEventListener('change', async (e) => {
    const s = await api.runtime.sendMessage({ type: 'state' });
    const set = new Set(s.paused || []);
    if (e.target.checked) set.add(host); else set.delete(host);
    await api.runtime.sendMessage({ type: 'set', values: { paused: [...set] } });
    render();
  });
})();
