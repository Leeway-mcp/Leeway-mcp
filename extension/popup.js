// Leeway Guard · popup: protection switch, per-site pause, counters and the last five checks.
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const LABEL = { SAFE_TO_SIGN: ['good', 'Looks safe'], REVIEW: ['warn', 'Review'], DO_NOT_SIGN: ['bad', 'Do not sign'], WILL_REVERT: ['bad', 'Would fail'], ERROR: ['warn', 'Not checked'] };
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  const h = s.history || [];
  $('history').innerHTML = h.length ? h.map((e) => { const [tone, label] = LABEL[e.verdict] || LABEL.REVIEW; return `<li><i class="${tone}"></i><span><b>${label}</b><small>${esc(e.site)} · ${esc(e.method || '')}</small></span><time>${ago(e.at)}</time></li>`; }).join('')
    : '<li class="empty">Nothing checked yet. Open a dApp and press Swap or Sign.</li>';
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
