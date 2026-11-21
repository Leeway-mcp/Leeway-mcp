// Mandate MCP Playground: browser ports of the server tools, hitting the same public APIs.
// Shows the exact MCP JSON-RPC frames an agent would exchange with the server.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const round = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/* ---------- data layer (mirrors server/src/data.js) ---------- */
const CHAINS = {
  ethereum: { id: 1, rpc: 'https://ethereum-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  base: { id: 8453, rpc: 'https://base-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  arbitrum: { id: 42161, rpc: 'https://arbitrum-one-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  optimism: { id: 10, rpc: 'https://optimism-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  polygon: { id: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', symbol: 'POL', cg: 'polygon-ecosystem-token' },
  bsc: { id: 56, rpc: 'https://bsc-rpc.publicnode.com', symbol: 'BNB', cg: 'binancecoin' },
  avalanche: { id: 43114, rpc: 'https://avalanche-c-chain-rpc.publicnode.com', symbol: 'AVAX', cg: 'avalanche-2' },
};
const ALIASES = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', usdc: 'usd-coin', usdt: 'tether', tao: 'bittensor', fet: 'fetch-ai', render: 'render-token', near: 'near', virtual: 'virtual-protocol', avax: 'avalanche-2', pol: 'polygon-ecosystem-token', arb: 'arbitrum', op: 'optimism', link: 'chainlink', doge: 'dogecoin' };
const getJSON = async (url, init) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
  return r.json();
};
const rpc = async (chain, method, params = []) => {
  const out = await getJSON(CHAINS[chain].rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (out.error) throw new Error('RPC error: ' + out.error.message);
  return out.result;
};
const prices = (ids) => getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
const formatUnits = (v, dec = 18) => { const s = v.toString().padStart(dec + 1, '0'); const i = s.slice(0, -dec), f = s.slice(-dec).replace(/0+$/, ''); return f ? `${i}.${f.slice(0, 6)}` : i; };

/* ---------- policy (mirrors server/src/policy.js) ---------- */
export function evaluate({ valueUsd, merchant = '', flagged = false }, p) {
  const remaining = Math.max(0, p.daily - p.spent);
  const reasons = []; let decision = 'allow';
  const deny = (r) => { decision = 'deny'; reasons.push(r); };
  const ask = (r) => { if (decision !== 'deny') decision = 'needs_approval'; reasons.push(r); };
  if (flagged) deny('counterparty is flagged as malicious');
  if (valueUsd > p.hardCap) deny(`exceeds hard cap of $${p.hardCap}`);
  if (p.allowlist.length && merchant && !p.allowlist.includes(merchant) && valueUsd > p.micro) deny(`${merchant} is not on the allowlist`);
  if (decision !== 'deny') {
    if (valueUsd <= p.micro && p.spent + valueUsd <= p.daily) reasons.push(`within micro-payment allowance ($${p.micro})`);
    else {
      if (valueUsd > p.perTx) ask(`above per-transaction limit of $${p.perTx}`);
      if (valueUsd > remaining) ask(`above remaining daily budget ($${remaining.toFixed(2)} of $${p.daily})`);
      if (decision === 'allow' && p.requireApproval && valueUsd > p.micro) ask('owner requires approval for non-micro spends');
    }
  }
  if (decision === 'allow' && !reasons.length) reasons.push('within all limits');
  return { decision, reasons, remainingTodayUsd: round(remaining) };
}
const POLICY = { daily: 50, perTx: 25, hardCap: 500, micro: 1, allowlist: ['uniswap', 'aave'], requireApproval: true, spent: 0 };

/* ---------- tools ---------- */
const ADDR = /^0x[a-fA-F0-9]{40}$/;
const chainField = { key: 'chain', label: 'chain', type: 'select', options: Object.keys(CHAINS) };
const TOOLS = [
  { name: 'get_price', icon: '$', desc: 'Spot price, 24h change and market cap.', source: 'CoinGecko', fields: [{ key: 'tokens', label: 'tokens (comma-separated)', value: 'ETH, BTC, TAO, SOL' }],
    run: async ({ tokens }) => {
      const list = tokens.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
      if (!list.length) throw new ValidationError('tokens: at least one token required');
      const ids = list.map((t) => ALIASES[t.toLowerCase()] || t.toLowerCase());
      const d = await prices(ids);
      return list.map((t, i) => (d[ids[i]] ? { token: t, id: ids[i], price_usd: d[ids[i]].usd, change_24h_pct: round(d[ids[i]].usd_24h_change), market_cap_usd: Math.round(d[ids[i]].usd_market_cap) } : { token: t, error: 'not found' }));
    } },
  { name: 'trending_tokens', icon: '↗', desc: 'Most-searched tokens right now.', source: 'CoinGecko', fields: [],
    run: async () => (await getJSON('https://api.coingecko.com/api/v3/search/trending')).coins.slice(0, 8).map(({ item }) => ({ name: item.name, symbol: item.symbol, market_cap_rank: item.market_cap_rank, price_usd: item.data?.price ?? null, change_24h_pct: round(item.data?.price_change_percentage_24h?.usd) })) },
  { name: 'get_gas', icon: '⛽', desc: 'Gas price and USD cost of a transfer / swap.', source: 'EVM RPC', fields: [{ ...chainField, value: 'base' }],
    run: async ({ chain }) => {
      const c = CHAINS[chain];
      const [g, px] = await Promise.all([rpc(chain, 'eth_gasPrice'), prices([c.cg])]);
      const wei = BigInt(g), usd = px[c.cg]?.usd ?? 0;
      const cost = (u) => round(Number(wei * BigInt(u)) / 1e18 * usd, 4);
      return { chain, gas_gwei: round(Number(wei) / 1e9, 4), native_usd: usd, transfer_usd: cost(21000), swap_usd: cost(150000) };
    } },
  { name: 'get_balance', icon: '◎', desc: 'Native balance of any address, valued in USD.', source: 'EVM RPC', fields: [{ key: 'address', label: 'address', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }, { ...chainField, value: 'ethereum' }],
    run: async ({ address, chain }) => {
      if (!ADDR.test(address)) throw new ValidationError('address: must be a 0x-prefixed 20-byte hex address');
      const c = CHAINS[chain];
      const [b, px] = await Promise.all([rpc(chain, 'eth_getBalance', [address, 'latest']), prices([c.cg])]);
      const bal = formatUnits(BigInt(b));
      return { address, chain, symbol: c.symbol, balance: bal, value_usd: round(Number(bal) * (px[c.cg]?.usd ?? 0)) };
    } },
  { name: 'scan_token', icon: '⚠', desc: 'Honeypot / mint / tax / holder risk score.', source: 'GoPlus', fields: [{ key: 'address', label: 'token address', value: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }, { ...chainField, value: 'base' }],
    presets: [['USDC · Base', { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chain: 'base' }], ['PEPE · ETH', { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', chain: 'ethereum' }], ['SHIB · ETH', { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', chain: 'ethereum' }]],
    run: async ({ address, chain }) => {
      if (!ADDR.test(address)) throw new ValidationError('address: must be a 0x-prefixed 20-byte hex address');
      const d = await getJSON(`https://api.gopluslabs.io/api/v1/token_security/${CHAINS[chain].id}?contract_addresses=${address}`);
      const s = d.result?.[address.toLowerCase()];
      if (!s) return { address, chain, verdict: 'unknown', risk_score: null, flags: ['no security data: treat as high risk'] };
      const flags = []; let score = 0; const yes = (v) => v === '1';
      const hit = (c, pts, m) => { if (c) { score += pts; flags.push(m); } };
      hit(yes(s.is_honeypot), 60, 'honeypot: tokens cannot be sold'); hit(yes(s.cannot_sell_all), 25, 'cannot sell entire balance');
      hit(yes(s.is_mintable), 15, 'owner can mint new supply'); hit(yes(s.hidden_owner), 15, 'hidden owner');
      hit(yes(s.owner_change_balance), 25, 'owner can modify balances'); hit(yes(s.selfdestruct), 15, 'contract can self-destruct');
      hit(yes(s.is_blacklisted), 10, 'has blacklist function'); hit(yes(s.transfer_pausable), 10, 'transfers can be paused');
      hit(yes(s.is_proxy), 8, 'upgradeable proxy'); hit(s.is_open_source === '0', 20, 'contract source not verified');
      const bt = Number(s.buy_tax || 0) * 100, st = Number(s.sell_tax || 0) * 100;
      hit(bt > 10 || st > 10, 15, `high tax (buy ${bt.toFixed(1)}% / sell ${st.toFixed(1)}%)`);
      const top10 = (s.holders || []).slice(0, 10).reduce((a, h) => a + Number(h.percent || 0), 0) * 100;
      hit(top10 > 60, 12, `top 10 holders own ${top10.toFixed(1)}%`);
      score = Math.min(100, score);
      return { token: { name: s.token_name, symbol: s.token_symbol, holders: Number(s.holder_count || 0) }, risk_score: score, verdict: score >= 60 ? 'DANGEROUS: do not buy' : score >= 30 ? 'CAUTION: elevated risk' : 'No major red flags found', flags, taxes: { buy_pct: round(bt), sell_pct: round(st) }, top10_holders_pct: round(top10) };
    } },
  { name: 'check_address', icon: '⛨', desc: 'Phishing / drainer / sanctions reputation.', source: 'GoPlus', fields: [{ key: 'address', label: 'address', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }],
    run: async ({ address }) => {
      if (!ADDR.test(address)) throw new ValidationError('address: must be a 0x-prefixed 20-byte hex address');
      const d = await getJSON(`https://api.gopluslabs.io/api/v1/address_security/${address}`);
      const bad = Object.entries(d.result || {}).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k.replace(/_/g, ' '));
      return { address, flagged: bad.length > 0, flags: bad };
    } },
  { name: 'policy_check', icon: '⚖', desc: 'Ask the policy engine: allow, approve or deny.', source: 'Policy engine', money: true, fields: [{ key: 'value_usd', label: 'value_usd', value: '40', type: 'number' }, { key: 'merchant', label: 'merchant', value: 'uniswap' }],
    run: async ({ value_usd, merchant }) => {
      const v = Number(value_usd);
      if (!(v >= 0)) throw new ValidationError('value_usd: must be a non-negative number');
      return evaluate({ valueUsd: v, merchant: merchant.trim().toLowerCase() }, POLICY);
    } },
  { name: 'x402_quote', icon: '402', desc: 'Price an HTTP 402 paywalled resource.', source: 'x402 merchant', money: true, demo: true, fields: [{ key: 'url', label: 'url', value: 'https://api.meteo.xyz/v1/dubai' }],
    run: async ({ url }) => {
      try { new URL(url); } catch { throw new ValidationError('url: must be a valid URL'); }
      await wait(450); // browsers can't read cross-origin 402 bodies; this is the frame the server would parse
      const amount = 0.02;
      return { url, status: 402, paywalled: true, x402_version: 1, options: [{ scheme: 'exact', network: 'base', asset: 'USDC', amount_usd: amount, pay_to: '0x7a5c…9e21' }], policy: evaluate({ valueUsd: amount, merchant: new URL(url).host }, { ...POLICY, allowlist: [] }), note: 'demo response in the browser; the server fetches the URL for real' };
    } },
  { name: 'spending_report', icon: '▤', desc: "Today's spend, budget and limits.", source: 'Ledger', fields: [],
    run: async () => ({ day: new Date().toISOString().slice(0, 10), spentUsd: POLICY.spent, remainingUsd: POLICY.daily - POLICY.spent, policy: { dailyLimitUsd: POLICY.daily, perTxLimitUsd: POLICY.perTx, hardCapUsd: POLICY.hardCap, microAllowanceUsd: POLICY.micro, allowlist: POLICY.allowlist } }) },
];
class ValidationError extends Error {}

/* ---------- UI ---------- */
const toolsEl = $('#pgTools');
if (toolsEl) init();

function init() {
  let current = TOOLS[0], rpcId = 0, running = false;
  toolsEl.innerHTML = TOOLS.map((t, i) => `<button class="pg-tool${i ? '' : ' is-on'}" data-i="${i}"><i>${t.icon}</i><span><b>${t.name}</b><em>${t.desc}</em></span></button>`).join('');
  const select = (i) => {
    current = TOOLS[i];
    $$('.pg-tool').forEach((b) => b.classList.toggle('is-on', +b.dataset.i === i));
    $('#pgName').textContent = current.name;
    $('#pgDesc').textContent = current.desc;
    $('#pgSource').textContent = current.source;
    $('#pgHint').textContent = current.demo ? 'Demo frame · run the server for a real fetch' : current.source === 'Policy engine' || current.source === 'Ledger' ? 'Evaluated locally · same rules as the server' : `Real request to ${current.source} · no wallet needed`;
    $('#pgPipe').classList.toggle('no-policy', !current.money);
    $('#pgFields').innerHTML = (current.fields.length ? current.fields.map((f) => f.type === 'select'
      ? `<label class="fld"><span>${f.label}</span><select name="${f.key}">${f.options.map((o) => `<option${o === f.value ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`
      : `<label class="fld"><span>${f.label}</span><input name="${f.key}" value="${esc(f.value)}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} spellcheck="false" /></label>`).join('') : '<p class="fld-none">No parameters</p>')
      + (current.presets ? `<div class="presets">${current.presets.map(([l], k) => `<button type="button" data-p="${k}">${l}</button>`).join('')}</div>` : '');
    $$('.presets button').forEach((b) => b.addEventListener('click', () => {
      const vals = current.presets[+b.dataset.p][1];
      Object.entries(vals).forEach(([k, v]) => { const el = $(`#pgFields [name="${k}"]`); if (el) el.value = v; });
    }));
    resetPipe();
  };
  toolsEl.addEventListener('click', (e) => { const b = e.target.closest('.pg-tool'); if (b && !running) select(+b.dataset.i); });

  const resetPipe = () => $$('.pipe-step, .pipe-line').forEach((s) => s.classList.remove('is-on', 'is-err', 'is-run'));
  const light = async (step, cls = 'is-on', ms = 260) => {
    const el = $(`.pipe-step[data-step="${step}"]`);
    const line = el.previousElementSibling;
    if (line?.classList.contains('pipe-line')) { line.classList.add('is-on'); await wait(ms); }
    el.classList.remove('is-run'); el.classList.add(cls);
  };

  $$('.pg__tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.pg__tabs button').forEach((x) => x.classList.toggle('is-on', x === b));
    $$('.pg__panel').forEach((p) => p.classList.toggle('is-on', p.dataset.panel === b.dataset.out));
  }));

  $('#pgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (running) return;
    running = true;
    const btn = $('#pgRun'); btn.disabled = true; btn.classList.add('is-loading');
    const args = Object.fromEntries(new FormData(e.target).entries());
    const id = ++rpcId;
    const req = { jsonrpc: '2.0', id, method: 'tools/call', params: { name: current.name, arguments: args } };
    resetPipe();
    $('#pgResult').innerHTML = '<div class="pg__loading"><span></span><span></span><span></span></div>';
    const t0 = performance.now();
    let res, ok = true;
    try {
      await light('agent', 'is-on', 0);
      await light('validate');
      if (current.money) await light('policy');
      else $('.pipe-step[data-step="policy"]').previousElementSibling.classList.add('is-on');
      $('.pipe-step[data-step="fetch"]').classList.add('is-run');
      const data = await current.run(args);
      await light('fetch');
      res = { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } };
      await light('result');
      renderResult(current.name, data);
    } catch (err) {
      ok = false;
      const validation = err instanceof ValidationError;
      $$('.pipe-step.is-run').forEach((s) => s.classList.replace('is-run', 'is-err'));
      if (validation) $('.pipe-step[data-step="validate"]').classList.replace('is-on', 'is-err');
      res = validation
        ? { jsonrpc: '2.0', id, error: { code: -32602, message: `Input validation error: Invalid arguments for tool ${current.name}: ${err.message}` } }
        : { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'Error: ' + err.message }] } };
      $('#pgResult').innerHTML = `<div class="r-err"><b>${validation ? 'Rejected before execution' : 'Tool returned an error'}</b><span>${esc(err.message)}</span><small>${validation ? 'Schema validation stopped this call: nothing was sent anywhere.' : 'The agent receives isError: true and can retry or explain.'}</small></div>`;
    }
    const ms = Math.round(performance.now() - t0);
    $('#pgTime').innerHTML = `<i class="${ok ? 'ok' : 'bad'}">●</i> ${ms} ms`;
    $('#pgRpc').innerHTML = `<span class="c">// → request (client → mandate)</span>\n${hl(req)}\n\n<span class="c">// ← response (mandate → client)</span>\n${hl(res)}`;
    btn.disabled = false; btn.classList.remove('is-loading');
    running = false;
  });

  select(0);
}

function hl(obj) {
  return esc(JSON.stringify(obj, null, 2))
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/:\s(&quot;.*?&quot;)/g, ': <span class="s">$1</span>')
    .replace(/:\s(-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
}

/* ---------- result renderers ---------- */
const money = (v) => v == null ? 'n/a' : v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toPrecision(3);
const chg = (v) => v == null ? '' : `<em class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(2)}%</em>`;
function renderResult(name, d) {
  const out = $('#pgResult');
  const R = {
    get_price: () => `<div class="r-grid">${d.map((p) => p.error ? `<div class="r-card"><b>${esc(p.token)}</b><span class="down">not found</span></div>` : `<div class="r-card"><small>${esc(p.token.toUpperCase())}</small><b>${money(p.price_usd)}</b>${chg(p.change_24h_pct)}</div>`).join('')}</div>`,
    trending_tokens: () => `<ol class="r-list">${d.map((t) => `<li><span>${esc(t.name)} <small>${esc(t.symbol)}</small></span><span>${t.price_usd != null ? money(t.price_usd) : ''} ${chg(t.change_24h_pct)}</span></li>`).join('')}</ol>`,
    get_gas: () => `<div class="r-big"><b>${d.gas_gwei}</b><span>gwei on ${esc(d.chain)}</span></div><div class="r-grid r-grid--2"><div class="r-card"><small>Transfer</small><b>${money(d.transfer_usd)}</b></div><div class="r-card"><small>Swap</small><b>${money(d.swap_usd)}</b></div></div>`,
    get_balance: () => `<div class="r-big"><b>${Number(d.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })} <small>${d.symbol}</small></b><span>≈ ${money(d.value_usd)} · ${esc(d.chain)}</span></div><code class="r-addr">${esc(d.address)}</code>`,
    scan_token: () => {
      const s = d.risk_score ?? 100, col = s >= 60 ? '#ff3b3b' : s >= 30 ? '#ffb020' : '#21d36b';
      const C = 2 * Math.PI * 46;
      return `<div class="r-scan"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" class="g-bg"/><circle cx="55" cy="55" r="46" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="--to:${C * (1 - s / 100)}" class="g-anim" transform="rotate(-90 55 55)"/><text x="55" y="60" text-anchor="middle">${d.risk_score ?? '?'}</text></svg>
        <div><b style="color:${col}">${esc(d.verdict)}</b><span>${d.token ? `${esc(d.token.name)} (${esc(d.token.symbol)}) · ${d.token.holders.toLocaleString('en-US')} holders` : ''}</span>
        <ul>${(d.flags.length ? d.flags : ['no risk flags']).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div></div>`;
    },
    check_address: () => `<div class="r-verdict ${d.flagged ? 'bad' : 'good'}"><b>${d.flagged ? '✕ Flagged' : '✓ Clean'}</b><span>${d.flagged ? d.flags.map(esc).join(', ') : 'No phishing, drainer or sanctions flags found.'}</span></div><code class="r-addr">${esc(d.address)}</code>`,
    policy_check: () => decisionHTML(d),
    x402_quote: () => `<div class="r-big"><b>${money(d.options[0].amount_usd)} <small>USDC</small></b><span>402 Payment Required · ${esc(d.options[0].network)} · scheme ${esc(d.options[0].scheme)}</span></div>${decisionHTML(d.policy)}<p class="r-note">${esc(d.note)}</p>`,
    spending_report: () => `<div class="r-big"><b>${money(d.remainingUsd)}</b><span>left of ${money(d.policy.dailyLimitUsd)} today</span></div><div class="r-bar"><i style="width:${(d.spentUsd / d.policy.dailyLimitUsd) * 100}%"></i></div><div class="r-grid r-grid--3"><div class="r-card"><small>Per tx</small><b>${money(d.policy.perTxLimitUsd)}</b></div><div class="r-card"><small>Hard cap</small><b>${money(d.policy.hardCapUsd)}</b></div><div class="r-card"><small>Micro</small><b>${money(d.policy.microAllowanceUsd)}</b></div></div>`,
  };
  out.innerHTML = R[name]();
}
const decisionHTML = (d) => `<div class="r-verdict ${d.decision === 'allow' ? 'good' : d.decision === 'deny' ? 'bad' : 'warn'}"><b>${d.decision.toUpperCase().replace('_', ' ')}</b><span>${d.reasons.map(esc).join(' · ')}</span></div>`;

/* ---------- policy simulator ---------- */
(() => {
  const ids = ['simValue', 'simDaily', 'simTx', 'simMerchant', 'simFlag', 'simInject'];
  if (!$('#simValue')) return;
  const C = 2 * Math.PI * 52;
  const arc = $('#simArc');
  arc.style.strokeDasharray = C;
  const update = () => {
    const v = +$('#simValue').value, daily = +$('#simDaily').value, tx = +$('#simTx').value;
    $('#simValueOut').textContent = '$' + v; $('#simDailyOut').textContent = '$' + daily; $('#simTxOut').textContent = '$' + tx;
    const p = { ...POLICY, daily, perTx: tx, spent: 0 };
    const r = evaluate({ valueUsd: v, merchant: $('#simMerchant').value, flagged: $('#simFlag').checked }, p);
    if ($('#simInject').checked) r.reasons.unshift('injected instruction ignored: limits are enforced in code, not in the prompt');
    const box = $('#simResult');
    box.dataset.d = r.decision;
    $('#simDecision').textContent = r.decision === 'needs_approval' ? 'APPROVE?' : r.decision.toUpperCase();
    $('#simBudget').textContent = `$${Math.max(0, daily - (r.decision === 'allow' ? v : 0))} left today`;
    arc.style.strokeDashoffset = C * (1 - Math.min(1, v / Math.max(daily, 1)));
    $('#simReasons').innerHTML = r.reasons.map((x) => `<li>${esc(x)}</li>`).join('');
  };
  ids.forEach((id) => $('#' + id).addEventListener('input', update));
  update();
})();
