// Leeway Guard · extension world. Binds the private channel from inject.js, asks the
// background to check each request, and shows the verdict in a closed shadow root that the
// page cannot read or restyle. The user always makes the final call.
// All UI is built with DOM APIs (no innerHTML), so no page-controlled string is ever parsed as HTML.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  /* ---------------- channel to inject.js ----------------
     Primary: a MessageChannel port transferred at document_start (private, page can't read it).
     Fallback: window.postMessage tagged with a per-page token, used only if the port transfer
     fails (seen in some Firefox builds). First acknowledged channel wins. */
  let mode = null, port = null, token = null;
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (!mode && d.__leewayGuard === 'hello' && e.ports?.[0]) {
      mode = 'port'; port = e.ports[0];
      port.onmessage = (m) => { if (m.data?.type === 'check') handle(m.data.id, m.data.payload); };
      port.postMessage({ type: 'ack' });
      return;
    }
    if (!mode && d.__leewayGuard === 'hello-fallback' && typeof d.token === 'string' && d.token.length >= 16) {
      mode = 'post'; token = d.token;
      window.postMessage({ __leewayGuardExt: token, type: 'ack' }, '*');
      return;
    }
    if (mode === 'post' && d.__leewayGuardPage === token && d.type === 'check') handle(d.id, d.payload);
  });
  const answer = (id, decision) => {
    if (mode === 'port') port?.postMessage({ id, decision });
    else if (mode === 'post') window.postMessage({ __leewayGuardExt: token, id, decision }, '*');
  };
  const timeout = (ms) => new Promise((_, bad) => setTimeout(() => bad(new Error('the check took too long')), ms));

  async function handle(id, payload) {
    let st = {};
    try { st = await api.runtime.sendMessage({ type: 'state' }); } catch { /* extension reloaded: still protect */ }
    if (st.enabled === false || (st.paused || []).includes(location.host)) return answer(id, 'continue');
    const ui = overlay(payload);
    let result;
    try {
      result = await Promise.race([api.runtime.sendMessage({ type: 'analyze', payload }), timeout(12_000)]);
      if (result?.error) throw new Error(result.error);
    } catch (err) {
      result = { verdict: 'ERROR', error: err.message };
    }
    if (result.verdict === 'UNSUPPORTED') {
      ui.close();
      toast({ tone: 'warn', title: 'Not checked', body: [h('p', null, `Chain ${parseInt(result.chainId, 16) || result.chainId || '?'} is not supported yet. The request went to your wallet unchecked.`)] });
      return answer(id, 'continue');
    }
    const decision = await ui.show(result);
    api.runtime.sendMessage({ type: 'decision', decision, verdict: result.verdict }).catch(() => {});
    answer(id, decision);
  }

  /* ---------------- tiny DOM builder ---------------- */
  const SVG = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const svg = attrs?.svg || ['svg', 'g', 'path', 'defs', 'linearGradient', 'stop'].includes(tag);
    const el = svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false || k === 'svg') continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.setAttribute('class', v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false || kid === '') continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const mark = () => h('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' },
    h('defs', null, h('linearGradient', { id: 'lgg', x1: '0', y1: '0', x2: '1', y2: '1' },
      h('stop', { offset: '0', 'stop-color': '#fff2c4' }), h('stop', { offset: '.45', 'stop-color': '#e7b94f' }), h('stop', { offset: '1', 'stop-color': '#8a5a17' }))),
    h('g', { fill: 'url(#lgg)', transform: 'translate(0 -1.2)' },
      h('g', { transform: 'rotate(8 20 20)' }, h('path', { d: 'M10 4V30.5H25Z' }), h('path', { d: 'M14.6 8.4 28.4 30.5H33Z' })),
      h('path', { d: 'M5 34.2h30l-2.6 3H7.6Z' })));

  /* ---------------- UI ---------------- */
  const short = (a) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '?');
  const money = (v) => (v == null ? '' : v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : v === 0 ? '$0' : '$' + +v.toPrecision(2));
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 1 ? 6 : 4 }) : String(x); };
  const VERDICT = {
    SAFE_TO_SIGN: ['good', 'Looks safe', 'Nothing unusual found in the simulation.'],
    REVIEW: ['warn', 'Review carefully', 'Something here deserves a second look.'],
    DO_NOT_SIGN: ['bad', 'Do not sign', 'This matches a known way to lose funds.'],
    WILL_REVERT: ['bad', 'Will fail', 'The transaction would revert and only burn gas.'],
    ERROR: ['neutral', 'Could not check', 'Leeway could not finish the check. Decide carefully.'],
  };
  const LOADING = { tx: 'Simulating on live chain state', typed: 'Reading the signature', message: 'Reading the message' };

  function host() {
    const el = document.createElement('leeway-guard');
    el.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = el.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
    (document.body || document.documentElement).appendChild(el);
    return { el, root };
  }
  const header = (origin) => h('header', null, mark(), h('b', null, 'Leeway Guard'), h('span', { class: 'site' }, origin));

  function overlay(payload) {
    const { el, root } = host();
    const card = h('div', { class: 'card is-loading', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Leeway Guard' },
      header(payload.origin),
      h('div', { class: 'verdict' }, h('i', { class: 'dot' }), h('div', null, h('b', null, 'Checking…'), h('span', null, LOADING[payload.kind] || LOADING.typed))),
      h('div', { class: 'shimmer' }, h('i'), h('i'), h('i')));
    root.append(h('div', { class: 'bd' }, card));
    let done;
    const picked = new Promise((r) => { done = r; });
    const close = () => el.remove();
    return {
      close,
      show(r) {
        const [tone, title, sub] = VERDICT[r.verdict] || VERDICT.REVIEW;
        const bad = tone === 'bad';
        const meta = [r.method, r.chain, r.gas?.cost_usd != null ? `gas ${money(r.gas.cost_usd)}` : ''].filter(Boolean).join(' · ');
        const warns = r.warnings || [];
        const finish = (d) => { document.removeEventListener('keydown', onKey, true); close(); done(d); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish('reject'); } };
        const reject = h('button', { class: `b ${bad ? 'b-primary' : 'b-ghost'}`, 'data-d': 'reject', onclick: () => finish('reject') }, 'Reject');
        const go = h('button', { class: `b ${bad ? 'b-ghost b-small' : 'b-primary'}`, 'data-d': 'continue', onclick: () => finish('continue') }, bad ? 'Sign anyway' : 'Continue to wallet');
        card.className = `card t-${tone}`;
        card.replaceChildren(...[
          header(payload.origin),
          h('div', { class: 'verdict' }, h('i', { class: 'dot' }), h('div', null, h('b', null, title), h('span', null, r.error || r.summary || sub))),
          meta ? h('p', { class: 'meta' }, meta) : null,
          r.revert_reason ? h('p', { class: 'revert' }, `↯ ${r.revert_reason}`) : null,
          section(r),
          warns.length ? h('ul', { class: 'warns' }, warns.map((w) => h('li', { class: w.severity === 'high' ? 'hi' : 'md' }, w.message))) : null,
          h('footer', null, reject, go),
          h('small', { class: 'foot' }, 'Checked locally · nothing was signed · ', h('span', null, 'See what you sign.')),
        ].filter(Boolean));
        document.addEventListener('keydown', onKey, true);
        (bad ? reject : go).focus();
        return picked;
      },
    };
  }

  const spender = (addr, isContract) => [h('code', null, short(addr)), isContract === false ? [' ', h('em', null, 'wallet')] : null];
  function section(r) {
    const rows = [];
    for (const c of r.asset_changes || []) {
      rows.push(h('div', { class: `row ${c.direction}` }, h('i', null, c.direction === 'out' ? '−' : '+'), h('b', null, `${num(c.amount)} ${c.symbol}`), h('span', null, money(c.value_usd))));
    }
    for (const a of r.approvals || []) {
      const what = a.type === 'all_nfts' ? 'All NFTs' : `${a.amount === 'unlimited' ? 'Unlimited' : num(a.amount)} ${a.symbol}`;
      rows.push(h('div', { class: 'row appr' }, h('i', null, '!'), h('b', null, what), h('span', null, 'approve → ', spender(a.spender || a.operator, a.spender_is_contract))));
    }
    for (const g of r.grants || []) {
      rows.push(h('div', { class: 'row appr' }, h('i', null, '✎'), h('b', null, `${g.amount === 'unlimited' ? 'Unlimited' : num(g.amount)} ${g.symbol}`),
        h('span', null, `${g.standard} → `, spender(g.spender, g.spender_is_contract), g.valid_until ? ` · until ${g.valid_until}` : null)));
    }
    if (r.message) rows.push(h('div', { class: 'row msg' }, h('pre', null, r.message)));
    for (const d of r.details || []) rows.push(h('div', { class: 'row det' }, h('code', null, d)));
    if (!rows.length && r.kind === 'tx' && r.verdict !== 'ERROR') rows.push(h('div', { class: 'row det' }, h('span', null, 'No assets leave or enter your wallet')));
    return rows.length ? h('div', { class: 'rows' }, rows) : null;
  }

  function toast({ tone = 'neutral', title, body }) {
    const { el, root } = host();
    el.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    root.append(h('div', { class: `toast t-${tone}` },
      h('header', null, mark(), h('b', null, title), h('button', { 'aria-label': 'Close', onclick: () => el.remove() }, '×')),
      body));
    setTimeout(() => el.remove(), 12_000);
    return el;
  }

  let pendingToast = null;
  api.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'leeway-toast') return;
    pendingToast?.remove();
    if (msg.pending) { pendingToast = toast({ title: 'Scanning…', body: [h('p', null, 'Checking the address on 4 chains.')] }); return; }
    pendingToast = null;
    const r = msg.result || {};
    if (r.error) return toast({ title: 'Scan failed', body: [h('p', null, r.error)] });
    if (r.type === 'token') {
      const tone = r.risk_score >= 60 ? 'bad' : r.risk_score >= 30 ? 'warn' : 'good';
      return toast({ tone, title: `${r.symbol} · risk ${r.risk_score}/100`, body: [
        h('p', { class: 'v' }, r.verdict),
        h('p', { class: 'sub' }, `${r.name} on ${r.chain} · ${Number(r.holders).toLocaleString('en-US')} holders`),
        r.flags?.length ? h('ul', { class: 'warns' }, r.flags.slice(0, 4).map((f) => h('li', { class: tone === 'bad' ? 'hi' : 'md' }, f))) : null,
      ] });
    }
    toast({ tone: r.flagged ? 'bad' : 'good', title: r.flagged ? 'Flagged address' : 'Address looks clean', body: [
      h('p', { class: 'sub' }, h('code', null, short(r.address))),
      h('p', null, r.flagged ? r.flags.join(', ') : 'No phishing, drainer or sanctions reports.'),
    ] });
  });

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bd { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(3, 3, 6, .62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: fade .2s ease both; font: 14px/1.45 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; color: #ececf1; }
    .card { position: relative; width: min(420px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 18px 18px 14px; border-radius: 16px; border: 1px solid rgba(231, 185, 79, .28); background: radial-gradient(120% 70% at 50% -10%, rgba(231, 185, 79, .14), transparent 60%), linear-gradient(180deg, #121219, #0a0a10); box-shadow: 0 40px 100px -30px rgba(0, 0, 0, .9), 0 0 0 1px rgba(255, 255, 255, .03) inset, 0 0 60px -30px rgba(231, 185, 79, .6); animation: pop .32s cubic-bezier(.2, .9, .2, 1.1) both; }
    header { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
    header svg { width: 22px; height: 22px; flex: none; filter: drop-shadow(0 2px 8px rgba(231, 185, 79, .4)); }
    header b { font: 600 13.5px/1 "Instrument Sans", "Inter", system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
    header .site { margin-left: auto; font: 11.5px/1 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #8a8a99; max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .verdict { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .08); background: rgba(255, 255, 255, .02); }
    .verdict b { display: block; font: 600 18px/1.2 "Instrument Sans", "Inter", system-ui, sans-serif; letter-spacing: -.01em; }
    .verdict span { display: block; font-size: 12.5px; color: #a6a6b4; margin-top: 2px; }
    .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: #8a8a99; box-shadow: 0 0 0 4px rgba(138, 138, 153, .15); }
    .is-loading .dot { background: #e7b94f; box-shadow: 0 0 0 4px rgba(231, 185, 79, .15); animation: pulse 1s ease-in-out infinite; }
    .t-good .verdict { border-color: rgba(33, 211, 107, .35); background: rgba(33, 211, 107, .06); } .t-good .dot { background: #21d36b; box-shadow: 0 0 0 4px rgba(33, 211, 107, .18), 0 0 14px #21d36b; } .t-good .verdict b { color: #3ee084; }
    .t-warn .verdict { border-color: rgba(255, 176, 32, .4); background: rgba(255, 176, 32, .06); } .t-warn .dot { background: #ffb020; box-shadow: 0 0 0 4px rgba(255, 176, 32, .18), 0 0 14px #ffb020; } .t-warn .verdict b { color: #ffc04d; }
    .t-bad { border-color: rgba(255, 70, 70, .45); box-shadow: 0 40px 100px -30px rgba(0, 0, 0, .9), 0 0 70px -25px rgba(255, 59, 59, .55); }
    .t-bad .verdict { border-color: rgba(255, 70, 70, .45); background: rgba(255, 59, 59, .08); } .t-bad .dot { background: #ff4545; box-shadow: 0 0 0 4px rgba(255, 69, 69, .2), 0 0 16px #ff4545; } .t-bad .verdict b { color: #ff6b6b; }
    .meta { margin: 10px 2px 0; font: 11.5px/1.5 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #8a8a99; overflow-wrap: anywhere; }
    .revert { margin: 10px 0 0; padding: 9px 11px; border-radius: 9px; font: 12px/1.4 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #ffd0d0; background: rgba(255, 59, 59, .07); border: 1px dashed rgba(255, 59, 59, .4); }
    .rows { display: grid; gap: 6px; margin-top: 12px; }
    .row { display: grid; grid-template-columns: 20px 1fr; gap: 2px 10px; align-items: baseline; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .07); background: #0c0c13; }
    .row i { font: 700 15px/1 "JetBrains Mono", ui-monospace, Consolas, monospace; font-style: normal; text-align: center; grid-row: span 2; align-self: center; }
    .row b { font: 600 14.5px/1.3 "Instrument Sans", "Inter", system-ui, sans-serif; overflow-wrap: anywhere; }
    .row span { font-size: 12px; color: #9a9aa8; grid-column: 2; }
    .row.out { border-left: 2px solid rgba(255, 69, 69, .7); } .row.out i { color: #ff5a5a; }
    .row.in { border-left: 2px solid rgba(33, 211, 107, .7); } .row.in i { color: #21d36b; }
    .row.appr { border-color: rgba(255, 176, 32, .3); background: repeating-linear-gradient(-45deg, rgba(255, 176, 32, .04) 0 8px, transparent 8px 16px), #0c0c13; } .row.appr i { color: #ffb020; }
    .t-bad .row.appr { border-color: rgba(255, 69, 69, .4); background: repeating-linear-gradient(-45deg, rgba(255, 59, 59, .06) 0 8px, transparent 8px 16px), #0c0c13; } .t-bad .row.appr i, .t-bad .row.appr b { color: #ff8a8a; }
    .row.det, .row.msg { grid-template-columns: 1fr; } .row.det code { font-size: 11.5px; color: #c9c9d4; }
    .row.msg pre { margin: 0; max-height: 170px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11.5px/1.55 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #d6d6de; }
    code { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; color: #e6e6ee; }
    em { font-style: normal; font: 600 9.5px/1 "JetBrains Mono", ui-monospace, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; padding: 2px 5px; border-radius: 3px; color: #1a0505; background: #ff5a5a; vertical-align: 1px; }
    .warns { list-style: none; margin: 12px 2px 0; padding: 0; display: grid; gap: 6px; }
    .warns li { position: relative; padding-left: 18px; font-size: 12.5px; color: #d6d6de; overflow-wrap: anywhere; }
    .warns li::before { content: "▲"; position: absolute; left: 0; top: 2px; font-size: 9px; }
    .warns .hi::before { color: #ff4545; } .warns .md::before { color: #ffb020; }
    footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 16px; }
    .b { cursor: pointer; border-radius: 10px; padding: 11px 16px; font: 600 13px/1 "Inter", system-ui, sans-serif; letter-spacing: .02em; border: 1px solid transparent; transition: transform .15s, box-shadow .2s, background .2s; }
    .b:focus-visible { outline: 2px solid #ffdf92; outline-offset: 2px; }
    .b-primary { flex: 1; color: #1a1205; background: linear-gradient(180deg, #fff2c4, #e7b94f 45%, #b98327); box-shadow: 0 10px 26px -10px rgba(231, 185, 79, .8), inset 0 1px 0 rgba(255, 255, 255, .6); }
    .b-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 30px -10px rgba(231, 185, 79, .9), inset 0 1px 0 rgba(255, 255, 255, .6); }
    .b-ghost { color: #e6e6ee; background: rgba(255, 255, 255, .04); border-color: rgba(255, 255, 255, .12); }
    .b-ghost:hover { background: rgba(255, 255, 255, .08); }
    .b-small { flex: none; padding: 11px 12px; font-size: 12px; color: #a6a6b4; }
    .foot { display: block; margin-top: 12px; text-align: center; font: 10.5px/1.4 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #6d6d7d; letter-spacing: .02em; }
    .foot span { color: #c9a24a; }
    .shimmer { display: grid; gap: 6px; margin-top: 12px; }
    .shimmer i { height: 40px; border-radius: 10px; background: linear-gradient(90deg, #0e0e15, #17171f, #0e0e15); background-size: 200% 100%; animation: sh 1.1s linear infinite; }
    .toast { width: 320px; padding: 12px 14px 13px; border-radius: 14px; border: 1px solid rgba(231, 185, 79, .3); background: linear-gradient(180deg, #121219, #0a0a10); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, .9); color: #ececf1; font: 13px/1.45 "Inter", system-ui, sans-serif; animation: pop .3s cubic-bezier(.2, .9, .2, 1.1) both; }
    .toast header { margin-bottom: 8px; } .toast header b { font-size: 12.5px; letter-spacing: .02em; text-transform: none; }
    .toast header button { margin-left: auto; cursor: pointer; border: 0; background: none; color: #8a8a99; font-size: 18px; line-height: 1; }
    .toast p { margin: 0 0 4px; color: #cfcfd8; } .toast .v { font-weight: 600; } .toast .sub { font-size: 12px; color: #8a8a99; }
    .toast.t-good { border-color: rgba(33, 211, 107, .45); } .toast.t-good .v { color: #3ee084; }
    .toast.t-warn { border-color: rgba(255, 176, 32, .5); } .toast.t-warn .v { color: #ffc04d; }
    .toast.t-bad { border-color: rgba(255, 69, 69, .55); } .toast.t-bad .v { color: #ff6b6b; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.97); } }
    @keyframes pulse { 50% { opacity: .35; } }
    @keyframes sh { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .bd, .card, .toast, .shimmer i, .is-loading .dot { animation: none; } }
  `;
})();
