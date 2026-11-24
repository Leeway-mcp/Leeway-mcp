// Leeway Guard · page world. Wraps every EIP-1193 wallet provider on the page (window.ethereum
// and EIP-6963 announcements) so transactions and permit signatures are checked before the
// wallet popup opens. Providers are patched in place, so dApps that grabbed a reference early
// are covered too. No page data leaves the browser except the request being checked.
(() => {
  if (window.__leewayGuard) return;
  const WATCH = new Set(['eth_sendTransaction', 'eth_signTypedData_v4', 'eth_signTypedData_v3']);
  const TAG = Symbol.for('leeway.guard.wrapped');
  const rejected = () => Object.assign(new Error('User rejected the request (Leeway Guard)'), { code: 4001 });

  /* ---------- private channel to the extension (handshake happens before page scripts run) ---------- */
  const channel = new MessageChannel();
  const port = channel.port1;
  let ready = false, seq = 0;
  const waiting = new Map();
  const queue = [];
  port.onmessage = (e) => {
    const m = e.data || {};
    if (!ready) { if (m.type === 'ack') { ready = true; queue.splice(0).forEach((q) => port.postMessage(q)); } return; }
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); w(m); }
  };
  window.postMessage({ __leewayGuard: 'hello' }, '*', [channel.port2]);
  const ask = (payload) => new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    const msg = { type: 'check', id, payload };
    if (ready) port.postMessage(msg); else queue.push(msg);
    // Connected: the overlay always answers (the user decides), so this is only a last resort.
    // Not connected (e.g. a sandboxed frame without the extension): don't hold the dApp hostage.
    setTimeout(() => { if (waiting.delete(id)) resolve({ decision: 'continue', reason: ready ? 'timeout' : 'guard not connected' }); }, ready ? 300_000 : 2_000);
  });

  async function guard(provider, original, args) {
    const method = args?.method;
    const params = Array.isArray(args?.params) ? args.params : [];
    let chainId = null, from = null;
    try { chainId = await original.call(provider, { method: 'eth_chainId' }); } catch { /* unknown chain: extension lets it through */ }
    const payload = { origin: location.host, chainId };
    if (method === 'eth_sendTransaction') {
      const tx = { ...(params[0] || {}) };
      if (!tx.from) { try { [from] = await original.call(provider, { method: 'eth_accounts' }); tx.from = from; } catch { /* ignore */ } }
      Object.assign(payload, { kind: 'tx', tx, from: tx.from });
    } else {
      // v3/v4: [address, typedData] (some wallets accept the reverse order)
      const [a, b] = params;
      const typed = typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) ? b : a;
      from = typed === a ? b : a;
      Object.assign(payload, { kind: 'typed', typed, from });
    }
    const r = await ask(payload);
    if (r.decision !== 'continue') throw rejected();
  }

  function wrap(provider) {
    if (!provider || typeof provider !== 'object' || provider[TAG] || typeof provider.request !== 'function') return provider;
    const original = provider.request;
    const request = async function (args) {
      if (WATCH.has(args?.method)) await guard(this || provider, original, args);
      return original.call(this || provider, args);
    };
    try {
      Object.defineProperty(provider, 'request', { value: request, writable: true, configurable: true });
      if (typeof provider.sendAsync === 'function') {
        const sendAsync = provider.sendAsync;
        Object.defineProperty(provider, 'sendAsync', { configurable: true, writable: true, value(payload, cb) {
          if (!WATCH.has(payload?.method)) return sendAsync.call(this || provider, payload, cb);
          guard(this || provider, original, payload).then(() => sendAsync.call(this || provider, payload, cb), (err) => cb(err, null));
        } });
      }
      Object.defineProperty(provider, TAG, { value: true });
    } catch { /* frozen provider: leave it untouched rather than break the wallet */ }
    return provider;
  }

  /* ---------- window.ethereum: wrap whatever is (or will be) there ---------- */
  let current;
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'ethereum');
    if (!desc || desc.configurable) {
      current = window.ethereum;
      Object.defineProperty(window, 'ethereum', { configurable: true, enumerable: true, get: () => current, set: (v) => { current = wrap(v); } });
    }
  } catch { /* another extension owns the property */ }
  wrap(window.ethereum);
  // wallets that use defineProperty replace our accessor: re-check for a while and on their init event
  let ticks = 0;
  const poll = setInterval(() => { wrap(window.ethereum); if (++ticks > 60) clearInterval(poll); }, 100);
  window.addEventListener('ethereum#initialized', () => wrap(window.ethereum));

  /* ---------- EIP-6963: patch announced providers before the dApp sees them ---------- */
  window.addEventListener('eip6963:announceProvider', (e) => wrap(e?.detail?.provider), true);

  Object.defineProperty(window, '__leewayGuard', { value: { version: '0.1.0' } });
})();
