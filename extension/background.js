// Leeway Guard · background. Runs every check locally with the same core as the Leeway MCP
// server, keeps counters in local storage, owns the "Scan with Leeway" context menu.
import { simulateTx } from './lib/onchain.js';
import { ctx, chainName } from './lib/chains.js';
import { analyzeTypedData, scanAddress } from './lib/analyze.js';

const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { enabled: true, paused: [], stats: { checked: 0, warned: 0, blocked: 0 }, history: [] };

async function state() { return { ...DEFAULTS, ...(await api.storage.local.get(Object.keys(DEFAULTS))) }; }

async function remember(entry, bump) {
  const s = await state();
  for (const k of bump) s.stats[k] = (s.stats[k] || 0) + 1;
  if (entry) s.history = [entry, ...s.history].slice(0, 5);
  await api.storage.local.set({ stats: s.stats, history: s.history });
}

async function analyze(p) {
  const chain = chainName(p.chainId);
  if (p.kind === 'tx') {
    if (!chain) return { verdict: 'UNSUPPORTED', chainId: p.chainId };
    const tx = p.tx || {};
    if (!tx.to) return { verdict: 'REVIEW', kind: 'tx', chain, method: 'contract deployment', asset_changes: [], approvals: [], warnings: [{ severity: 'medium', message: 'this transaction deploys a new contract' }] };
    const r = await simulateTx(ctx, { chain, from: tx.from || p.from, to: tx.to, data: tx.data || tx.input || '0x', valueWei: BigInt(tx.value || 0) });
    return { ...r, kind: 'tx', verdict: r.verdict === 'NEEDS_APPROVAL' ? 'REVIEW' : r.verdict };
  }
  if (p.kind === 'typed') {
    let typed = p.typed;
    if (typeof typed === 'string') typed = JSON.parse(typed);
    const r = await analyzeTypedData(ctx, { chainId: p.chainId, from: p.from, typed });
    if (!r.chain && !r.grants.length) return { ...r, verdict: 'REVIEW' };
    return r;
  }
  throw new Error('unknown request');
}

api.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === 'state') return state();
    if (msg?.type === 'analyze') {
      const r = await analyze(msg.payload);
      if (r.verdict !== 'UNSUPPORTED') {
        await remember({ at: Date.now(), site: msg.payload.origin, verdict: r.verdict, method: r.method }, ['checked', ...(['REVIEW', 'DO_NOT_SIGN', 'WILL_REVERT'].includes(r.verdict) ? ['warned'] : [])]);
      }
      return r;
    }
    if (msg?.type === 'decision') { if (msg.decision === 'reject') await remember(null, ['blocked']); return { ok: true }; }
    if (msg?.type === 'scan') return scanAddress(ctx, msg.text); // also used as a test hook
    if (msg?.type === 'set') { await api.storage.local.set(msg.values); return state(); }
    return { error: 'unknown message' };
  })().then(reply, (e) => reply({ error: e?.message || String(e) }));
  return true; // async reply
});

async function menus() {
  try { await api.contextMenus.removeAll(); } catch { /* none yet */ }
  api.contextMenus.create({ id: 'leeway-scan', title: 'Scan with Leeway', contexts: ['selection'] });
}
api.runtime.onInstalled.addListener(menus);
api.runtime.onStartup?.addListener(menus);
api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'leeway-scan' || !tab?.id) return;
  api.tabs.sendMessage(tab.id, { type: 'leeway-toast', pending: true }).catch(() => {});
  const result = await scanAddress(ctx, info.selectionText).catch((e) => ({ error: e.message }));
  api.tabs.sendMessage(tab.id, { type: 'leeway-toast', result }).catch(() => {});
});
