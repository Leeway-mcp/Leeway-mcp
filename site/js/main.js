// Leeway MCP · UI interactions (no dependencies)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- nav ---------- */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 30);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const burger = $('#burger');
burger.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', open);
});
$$('#mobileMenu a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
}));

// active link by section
const links = $$('.nav__links a');
const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach((s) => spy.observe(s));

/* ---------- split hero title ---------- */
$$('[data-split]').forEach((el) => {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w"><span style="transition-delay:${0.08 * i + 0.15}s">${w}</span></span>`).join(' ');
});

/* ---------- reveal on scroll ---------- */
const groups = new Map();
$$('.reveal').forEach((el) => {
  const parent = el.parentElement;
  const idx = groups.get(parent) || 0;
  groups.set(parent, idx + 1);
  el.style.setProperty('--d', `${Math.min(idx * 0.08, 0.4)}s`);
});
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    e.target.querySelectorAll('[data-count]').forEach(countUp);
    if (e.target.matches('[data-count]')) countUp(e.target);
    io.unobserve(e.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal, .tokenomics').forEach((el) => io.observe(el));

/* ---------- count up ---------- */
function countUp(el) {
  if (el.dataset.done) return;
  el.dataset.done = 1;
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.decimals || '0', 10);
  const dur = reduced ? 1 : 1800;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    const v = target * (1 - Math.pow(1 - p, 4));
    el.textContent = v.toFixed(dec);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- ticker (live AI tokens via CoinGecko, static fallback) ---------- */
const COINS = [
  { id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', c: '#f7931a', g: '₿', p: 96420, ch: 1.2 },
  { id: 'ethereum', sym: 'ETH', name: 'Ethereum', c: '#627eea', g: 'Ξ', p: 3480, ch: -0.8 },
  { id: 'bittensor', sym: 'TAO', name: 'Bittensor', c: '#222', g: 'τ', p: 452.1, ch: 3.4 },
  { id: 'solana', sym: 'SOL', name: 'Solana', c: '#9945ff', g: 'S', p: 182.4, ch: 2.1 },
  { id: 'render-token', sym: 'RENDER', name: 'Render', c: '#e1251b', g: 'R', p: 7.12, ch: -1.6 },
  { id: 'fetch-ai', sym: 'FET', name: 'ASI Alliance', c: '#1f2a44', g: 'F', p: 1.38, ch: 4.2 },
  { id: 'near', sym: 'NEAR', name: 'NEAR', c: '#111', g: 'N', p: 5.84, ch: 0.9 },
  { id: 'virtual-protocol', sym: 'VIRTUAL', name: 'Virtuals', c: '#2bb5c8', g: 'V', p: 1.92, ch: 6.3 },
  { id: 'akash-network', sym: 'AKT', name: 'Akash', c: '#e33c2f', g: 'A', p: 3.1, ch: -2.2 },
  { id: 'the-graph', sym: 'GRT', name: 'The Graph', c: '#6747ed', g: 'G', p: 0.24, ch: 1.1 },
  { id: 'usd-coin', sym: 'USDC', name: 'USDC', c: '#2775ca', g: '$', p: 1.0, ch: 0.01 },
];
const fmt = (p) => p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
function renderTicker() {
  const html = COINS.map((c) => {
    const up = c.ch >= 0;
    return `<span class="tick"><i class="tick__ico" style="background:${c.c}">${c.g}</i>${c.name} <span class="tick__sym">(${c.sym})</span>
      <span class="tick__price">$${fmt(c.p)}</span><span class="tick__chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(c.ch).toFixed(2)}%</span></span>`;
  }).join('');
  $('#ticker').innerHTML = html + html;
}
renderTicker();
fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${COINS.map((c) => c.id).join(',')}&vs_currencies=usd&include_24hr_change=true`)
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((d) => {
    COINS.forEach((c) => {
      if (d[c.id]?.usd) { c.p = d[c.id].usd; c.ch = d[c.id].usd_24h_change ?? c.ch; }
    });
    renderTicker();
  })
  .catch(() => {});

/* ---------- sparklines ---------- */
$$('.spark-line').forEach((cv) => {
  const up = cv.dataset.trend === 'up';
  const dpr = Math.min(devicePixelRatio, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const pts = [];
  let v = up ? 0.75 : 0.25;
  for (let i = 0; i < 28; i++) {
    v += (Math.random() - 0.5) * 0.18 + (up ? -0.022 : 0.022);
    v = Math.max(0.08, Math.min(0.92, v));
    pts.push([(i / 27) * w, v * h]);
  }
  const col = up ? '33,211,107' : '255,59,59';
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(${col},.35)`); grad.addColorStop(1, `rgba(${col},0)`);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.5; ctx.stroke();
});

/* ---------- tools catalog ---------- */
const TOOLS = {
  market: [
    ['get_price', 'Spot price, 24h change, market cap and volume for any token.', 'read'],
    ['get_ohlcv', 'Candles at any interval for charts and agent technical analysis.', 'read'],
    ['get_gas', 'Live gas price plus the USD cost of a transfer and a swap.', 'read'],
    ['trending_tokens', 'The most searched tokens right now, with price and 24h change.', 'read'],
    ['get_token_info', 'Supply, holders, contract metadata and verified socials.', 'read'],
    ['defi_yields', 'Best lending and LP yields with TVL and risk score.', 'read'],
  ],
  wallet: [
    ['get_balance', 'Native balance of any address on 7 EVM chains, valued in USD.', 'read'],
    ['get_portfolio', 'Cross-chain portfolio with PnL and allocation breakdown.', 'read'],
    ['tx_history', 'Decoded transaction history in human-readable form.', 'read'],
    ['approval_status', 'Pending, approved, denied or expired: the owner decides, never the agent.', 'read'],
    ['wallet_info', 'Agent wallet address, enabled chains and balances. Never exposes the key.', 'read'],
    ['set_policy', 'Update spend limits, allowlists and approval rules.', 'write'],
  ],
  risk: [
    ['scan_token', 'Honeypot, hidden mint, blacklist and tax analysis.', 'read'],
    ['scan_contract', 'Static analysis of dangerous functions and proxies.', 'read'],
    ['holder_concentration', 'Top-holder share and clustering of linked wallets.', 'read'],
    ['check_address', 'Sanctions, phishing and drainer reputation lookup.', 'read'],
    ['liquidity_lock', 'LP lock status, unlock dates and rug probability.', 'read'],
    ['approval_audit', 'Every open allowance a wallet has granted, riskiest first.', 'read'],
  ],
  trade: [
    ['swap_quote', 'Best DEX route with price impact, token risk and policy checks built in.', 'read'],
    ['simulate_tx', 'Dry-run any transaction on live state: assets out/in, approvals, revert reason.', 'read'],
    ['execute_swap', 'Swap from the agent wallet: quoted, simulated, policy-checked, approved if needed.', 'write'],
    ['bridge_quote', 'Cross-chain routes compared on cost and time.', 'read'],
    ['limit_order', 'Place intent-based limit orders with expiry.', 'write'],
    ['revoke_approval', 'Find and revoke risky token allowances.', 'write'],
  ],
  pay: [
    ['x402_pay', 'Pay a 402 resource in USDC (x402 v1 + v2) within policy and get the content back.', 'write'],
    ['x402_quote', 'Preview the price of a 402 resource before paying.', 'read'],
    ['send_transaction', 'Any transfer or call from the agent wallet: simulated, gated, signed.', 'write'],
    ['policy_check', 'Ask the policy engine: allow, needs approval or deny, with reasons.', 'read'],
    ['create_invoice', 'Let your agent sell its own services via x402.', 'write'],
    ['spending_report', 'Daily and weekly agent spend by tool and merchant.', 'read'],
  ],
};
// tools shipped in server/src/index.js today; the rest are on the roadmap
const LIVE = new Set(['get_price', 'trending_tokens', 'get_gas', 'get_balance', 'scan_token', 'check_address', 'swap_quote', 'simulate_tx', 'policy_check', 'x402_quote', 'spending_report', 'wallet_info', 'send_transaction', 'execute_swap', 'x402_pay', 'approval_status']);
function renderTools(cat) {
  $('#toolList').innerHTML = TOOLS[cat].map(([n, d, t], i) =>
    `<div class="tool-item" style="animation-delay:${i * 0.05}s"><div class="tool-item__head"><code>${n}()</code>${LIVE.has(n) ? '<em class="live">● live</em>' : '<em>soon</em>'}</div><p>${d}</p><small class="${t === 'write' ? 'w' : ''}">${t === 'write' ? 'write · policy-guarded' : 'read-only'}</small></div>`).join('');
}
// Equity Rails (roadmap phase 4): agents managing tokenized stocks under the same guardrails
TOOLS.equity = [
  ['get_equity_quote', 'Tokenized stock price on-chain next to the real exchange reference price.', 'read'],
  ['parity_check', 'Parity Guard: premium/discount of a tokenized share vs. its underlying. Blocks buys outside the band.', 'read'],
  ['market_hours', 'Is the underlying market open? Holidays, pre-market and halts.', 'read'],
  ['corporate_actions', 'Upcoming dividends, splits and earnings for a ticker.', 'read'],
  ['equity_policy', 'Per-ticker caps, sector limits and a no-leverage rule for stock portfolios.', 'write'],
  ['execute_equity', 'Buy or sell a tokenized share, only if parity and policy both pass.', 'write'],
];
renderTools('market');
$$('.tool').forEach((b) => b.addEventListener('click', () => {
  $$('.tool').forEach((x) => x.classList.toggle('is-on', x === b));
  renderTools(b.dataset.cat);
}));

/* ---------- copy ---------- */
$$('.copy').forEach((b) => b.addEventListener('click', async () => {
  const text = b.dataset.copy || $('#' + b.dataset.copyTarget)?.innerText || '';
  try { await navigator.clipboard.writeText(text); } catch {}
  const old = b.textContent; b.textContent = 'Copied'; b.classList.add('is-done');
  setTimeout(() => { b.textContent = old; b.classList.remove('is-done'); }, 1600);
}));

/* ---------- tilt cards ---------- */
if (!reduced && matchMedia('(hover: hover)').matches) {
  $$('[data-tilt]').forEach((el) => {
    const base = getComputedStyle(el).transform;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
      el.style.transform = `translateY(-12px) rotateX(${(0.5 - y) * 14}deg) rotateY(${(x - 0.5) * 18}deg) scale(1.04)`;
      el.style.zIndex = 2;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = base === 'none' ? '' : base; el.style.zIndex = ''; });
  });
}

/* ---------- hero live feed ---------- */
(() => {
  const r = (a, b) => Math.floor(a + Math.random() * (b - a));
  const tools = ['get_price', 'scan_token', 'get_gas', 'check_address', 'get_balance', 'x402_quote', 'trending_tokens', 'swap_quote', 'simulate_tx'];
  const merchants = ['meteo.xyz', 'newsapi.ai', 'chainstats.io', 'llm-router.dev', 'maps.agent'];
  const feeds = [
    () => [`agent#${r(1000, 9999)} → paid <b>0.0${r(1, 9)} USDC</b>`, 'x402', ''],
    () => [`tool: <b>${tools[r(0, tools.length)]}</b> · ${r(90, 260)}ms`, '●', 'ok'],
    () => Math.random() < 0.75
      ? [`policy: <b>${merchants[r(0, merchants.length)]}</b> allowed ✓`, 'guard', '']
      : [`policy: <b>$${r(60, 900)} spend</b> held for approval`, 'hold', ''],
  ];
  const tags = $$('[data-feed]');
  if (!tags.length || reduced) return;
  let k = 0;
  setInterval(() => {
    const tag = tags[k % tags.length];
    const [html, badge, cls] = feeds[+tag.dataset.feed]();
    tag.classList.add('is-swap');
    setTimeout(() => {
      tag.querySelector('span').innerHTML = html;
      const em = tag.querySelector('em'); em.textContent = badge; em.className = cls;
      tag.classList.remove('is-swap');
    }, 300);
    k++;
  }, 1600);
})();

/* ---------- magnetic buttons ---------- */
if (!reduced && matchMedia('(hover: hover)').matches) {
  $$('.btn').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      b.style.transform = `translate(${x * 0.18}px, ${y * 0.3 - 2}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

/* ---------- why cards: cursor spotlight + subtle 3D tilt ---------- */
(() => {
  const grid = $('#whyGrid');
  if (!grid) return;
  const cards = $$('.why', grid);
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  grid.addEventListener('pointermove', (e) => {
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
  }, { passive: true });
  if (!fine || reduced) return;
  cards.forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-4px)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
})();

/* ---------- Leeway Guard mock: click "Approve & swap" → overlay blocks a drainer → toast ---------- */
(() => {
  const mock = $('#gdMock');
  if (!mock) return;
  const cursor = $('.gd-cursor', mock), confirmBtn = $('#gdConfirm'), rejectBtn = $('#gdReject');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (reduced) { mock.classList.add('is-guard'); return; } // static, informative final frame
  const point = (el, dx = 0.55, dy = 0.6) => {
    const m = mock.getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - m.left + r.width * dx, r.top - m.top + r.height * dy];
  };
  const moveTo = ([x, y]) => { cursor.style.setProperty('--cx', `${x}px`); cursor.style.setProperty('--cy', `${y}px`); };
  const press = async (cls) => { mock.classList.add(cls); cursor.style.scale = '0.85'; await sleep(180); mock.classList.remove(cls); cursor.style.scale = ''; };
  let visible = false, running = false;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible && !running) loop(); }, { threshold: 0.35 }).observe(mock);
  async function loop() {
    running = true;
    while (visible) {
      mock.classList.add('is-reset');
      mock.classList.remove('is-guard', 'is-safe');
      const m = mock.getBoundingClientRect();
      moveTo([m.width * 0.82, m.height * 0.94]);
      await sleep(60); mock.classList.remove('is-reset');
      await sleep(900);
      moveTo(point(confirmBtn)); await sleep(1250);
      await press('is-press-confirm');
      await sleep(250);
      mock.classList.add('is-guard'); await sleep(3200);
      moveTo(point(rejectBtn)); await sleep(1200);
      await press('is-press-reject');
      mock.classList.remove('is-guard'); mock.classList.add('is-safe');
      await sleep(2800);
      mock.classList.remove('is-safe'); await sleep(900);
    }
    running = false;
  }
})();

/* ---------- agent terminal demo ---------- */
const DEMOS = [
  [
    ['user', 'Is $PEPE2 safe to buy?'],
    ['agent', 'Let me check the contract before giving an answer.'],
    ['tool', '→ <b>scan_token</b>({ chain: "base", token: "0x7a3…PEPE2" })'],
    ['warn', '⚠ owner can mint · 12% sell tax · blacklist() present'],
    ['tool', '→ <b>holder_concentration</b>({ token: "0x7a3…PEPE2" })'],
    ['warn', '⚠ top 5 wallets hold 71% · 3 linked to deployer'],
    ['tool', '→ <b>liquidity_lock</b>({ pool: "PEPE2/WETH" })'],
    ['deny', '✕ LP unlocked · removable at any time'],
    ['agent', 'Risk score 91/100: likely a rug. I would not buy this. Want me to check another token?'],
  ],
  [
    ['user', 'Swap 0.5 ETH to USDC at the best rate'],
    ['tool', '→ <b>swap_quote</b>({ chain: "base", sell: "ETH", buy: "USDC", amount: "0.5" })'],
    ['ok', '✓ best route via Uniswap v4 → 1,741.82 USDC · impact 0.03% · token curated'],
    ['tool', '→ <b>simulate_tx</b>({ to: "router", value: "0.5", data: "0xe21f…" })'],
    ['ok', '✓ −0.5 ETH · +1,741.8 USDC · no approvals · gas $0.004'],
    ['tool', '→ policy.check({ value_usd: 1741, daily_limit: 50 })'],
    ['warn', '⚠ above daily limit · approval requested via Telegram'],
    ['ok', '✓ approved by owner · 0x91c…e2 confirmed in block 21,904,113'],
    ['agent', 'Done. Swapped 0.5 ETH for 1,741.79 USDC. Receipt saved to your audit log.'],
  ],
  [
    ['user', 'Buy the weather API data for Dubai'],
    ['tool', '→ <b>x402_quote</b>({ url: "api.meteo.xyz/v1/dubai" })'],
    ['ok', '✓ 402 Payment Required · price 0.02 USDC · network base'],
    ['tool', '→ policy.check({ merchant: "meteo.xyz", value_usd: 0.02 })'],
    ['ok', '✓ within micro-payment allowance ($1/day)'],
    ['tool', '→ <b>x402_pay</b>({ url: "api.meteo.xyz/v1/dubai" })'],
    ['ok', '✓ paid 0.02 USDC · settled in 1.9s · 200 OK'],
    ['agent', 'Dubai: 31°C, humidity 48%, wind NW 14 km/h. Paid 2 cents, no API key needed.'],
  ],
  [
    ['user', 'Send 5 ETH to 0x9f…a11'],
    ['tool', '→ <b>check_address</b>({ address: "0x9f…a11" })'],
    ['deny', '✕ flagged: drainer contract · reported 214 times'],
    ['tool', '→ policy.check({ value_usd: 17400, recipient: "0x9f…a11" })'],
    ['deny', '✕ BLOCKED · recipient not on allowlist · exceeds hard cap'],
    ['agent', 'I can\'t do this. The address is a known drainer and the transfer breaks your policy. Nothing was sent.'],
  ],
];
let demoRun = 0;
async function playDemo(i) {
  const run = ++demoRun;
  const body = $('#termBody');
  body.innerHTML = '';
  for (const [type, text] of DEMOS[i]) {
    if (run !== demoRun) return;
    const ln = document.createElement('div');
    ln.className = `ln ln--${type}`;
    body.appendChild(ln);
    if (type === 'user' || type === 'agent') {
      const caret = document.createElement('span'); caret.className = 'caret';
      for (let c = 0; c <= text.length; c++) {
        if (run !== demoRun) return;
        ln.textContent = text.slice(0, c); ln.appendChild(caret);
        await wait(reduced ? 0 : type === 'user' ? 28 : 14);
      }
      caret.remove();
      await wait(350);
    } else {
      ln.innerHTML = text;
      await wait(reduced ? 0 : 520);
    }
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
$$('.prompt').forEach((b) => b.addEventListener('click', () => {
  $$('.prompt').forEach((x) => x.classList.toggle('is-on', x === b));
  playDemo(+b.dataset.demo);
}));
const termIO = new IntersectionObserver((e) => {
  if (e[0].isIntersecting) { playDemo(0); termIO.disconnect(); }
}, { threshold: 0.35 });
termIO.observe($('#termBody'));

/* ---------- roadmap progress ---------- */
// ascent rail fills with scroll; the orb rides the tip
(() => {
  const asc = $('#ascent'), fill = $('#ascentFill'), orb = $('#ascentOrb');
  if (!asc) return;
  const stages = $$('.stage', asc);
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = asc.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight * 0.55 - r.top) / r.height));
    fill.style.transform = `scaleY(${p})`;
    orb.style.transform = `translate(-50%, ${p * r.height}px)`;
    stages.forEach((s) => {
      const sr = s.getBoundingClientRect();
      s.classList.toggle('is-passed', sr.top + 40 < innerHeight * 0.55);
    });
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
  const lad = $('#ladder');
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { lad.classList.add('is-in'); o.disconnect(); } }, { threshold: 0.3 }).observe(lad);
})();

/* ---------- subscribe ---------- */
$('#subscribe').addEventListener('submit', (e) => {
  e.preventDefault();
  e.target.querySelector('.subscribe__ok').hidden = false;
  e.target.reset();
});

/* ---------- cursor glow ---------- */
if (matchMedia('(hover: hover)').matches && !reduced) {
  const g = $('#cursorGlow');
  let x = -999, y = -999, cx = x, cy = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  const loop = () => { cx += (x - cx) * 0.12; cy += (y - cy) * 0.12; g.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; requestAnimationFrame(loop); };
  loop();
}

/* ---------- post art (procedural network image) ---------- */
$$('.post-art').forEach((cv) => {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = cv.clientWidth || 300, h = cv.clientHeight || 190;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.5, w * 0.7);
  bg.addColorStop(0, '#3a2408'); bg.addColorStop(1, '#07070c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const nodes = Array.from({ length: 40 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2.5 + 1 }));
  const t0 = performance.now();
  const draw = (t) => {
    const s = (t - t0) / 1000;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    nodes.forEach((n, i) => {
      const nx = n.x + Math.sin(s * 0.5 + i) * 4, ny = n.y + Math.cos(s * 0.4 + i) * 4;
      n.cx = nx; n.cy = ny;
    });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (d < 70) { ctx.strokeStyle = `rgba(240,190,90,${(1 - d / 70) * 0.5})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke(); }
    }
    nodes.forEach((n) => {
      const g = ctx.createRadialGradient(n.cx, n.cy, 0, n.cx, n.cy, n.r * 5);
      g.addColorStop(0, 'rgba(255,215,130,.9)'); g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.cx, n.cy, n.r * 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe7b0'; ctx.beginPath(); ctx.arc(n.cx, n.cy, n.r * 0.7, 0, 7); ctx.fill();
    });
    if (!reduced) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
});

/* ---------- hero: Leeway Guard verdict card cycles between a drainer and a safe swap ---------- */
(() => {
  const card = document.getElementById('heroGuard');
  if (!card || reduced) return;
  const STATES = [
    { cls: 'is-bad', meta: 'simulated · base', title: 'Do not sign', sub: 'approve(address,uint256)', line: 'unlimited USDC → <code>0x2222…2222</code> <em>wallet</em>', main: 'Reject', alt: 'Sign anyway' },
    { cls: 'is-good', meta: 'simulated · base', title: 'Safe to sign', sub: 'swap(...) · KyberSwap router', line: '<span class="down">−0.05 ETH</span> · <span class="up">+85.49 USDC</span> · gas $0.004', main: 'Continue', alt: 'Reject' },
  ];
  const q = (k) => card.querySelector(`[data-hg="${k}"]`);
  let i = 0, timer = null;
  const swap = () => {
    i = (i + 1) % STATES.length;
    const s = STATES[i];
    // swap in place and fade the new content in: never an empty card, even if timers lag
    card.classList.remove('is-bad', 'is-good', 'is-flip');
    card.classList.add(s.cls);
    q('meta').textContent = s.meta; q('title').textContent = s.title; q('sub').textContent = s.sub;
    q('line').innerHTML = s.line; q('main').textContent = s.main; q('alt').textContent = s.alt;
    void card.offsetWidth;
    card.classList.add('is-flip');
  };
  // step aside only when the globe's city card actually lands on top of this one
  const city = document.getElementById('globeCard');
  let watch = null;
  const overlap = () => {
    if (!city?.classList.contains('is-on')) return card.classList.remove('is-under');
    const a = city.getBoundingClientRect(), c = card.getBoundingClientRect();
    const k = 12; // only a real overlap, not two cards touching
    card.classList.toggle('is-under', a.left + k < c.right && a.right - k > c.left && a.top + k < c.bottom && a.bottom - k > c.top);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !timer) { timer = setInterval(swap, 6000); watch = setInterval(overlap, 250); }
    else if (!e.isIntersecting && timer) { clearInterval(timer); clearInterval(watch); timer = watch = null; }
  }).observe(card);
})();

/* ---------- the voyage: pinned scroll story ---------- */
(() => {
  const sec = $('#voyage');
  if (!sec) return;
  const track = $('#vyTrack'), route = $('#vyRoute'), done = $('#vyRouteDone'), ship = $('#vyShip');
  const wpWrap = $('#vyWps'), cards = $$('.vy-card', sec), steps = $$('.vy-progress span', sec), bar = $('#vyBar'), coords = $('#vyCoords');
  const L = route.getTotalLength();
  const WP = [0.12, 0.38, 0.63, 0.88];
  const NAMES = ['Read the sea', 'Simulate', 'Ask the captain', 'Sign & sail'];
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const wps = WP.map((f, i) => {
    const p = route.getPointAtLength(f * L);
    const g = el('g', { class: 'vy-wp', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` });
    g.append(el('circle', { r: 16, class: 'vy-wp__halo' }), el('circle', { r: 10, class: 'vy-wp__dot' }));
    const num = el('text', { class: 'vy-wp__num', 'text-anchor': 'middle', y: 3.6 }); num.textContent = String(i + 1).padStart(2, '0');
    const lbl = el('text', { class: 'vy-wp__lbl', 'text-anchor': 'middle', y: i % 2 ? 32 : -22 }); lbl.textContent = NAMES[i];
    g.append(num, lbl);
    wpWrap.append(g);
    return g;
  });
  done.style.strokeDasharray = `${L} ${L}`;

  const isStatic = () => reduced || matchMedia('(max-width: 900px), (max-height: 620px)').matches;
  let staticMode = null, active = -1, shown = -1, visible = false, raf = 0;

  const place = (p) => {
    const at = Math.max(0.001, Math.min(0.999, p)) * L;
    const a = route.getPointAtLength(at), b = route.getPointAtLength(Math.min(L, at + 6));
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const tilt = Math.max(-16, Math.min(16, ang * 0.3)); // keep the sails readable: heel, don't spin
    const bob = Math.sin(performance.now() / 650) * 1.6;
    ship.setAttribute('transform', `translate(${a.x.toFixed(1)} ${(a.y + bob).toFixed(1)}) rotate(${tilt.toFixed(1)})`);
    done.style.strokeDashoffset = (L - at).toFixed(1);
    if (coords) coords.textContent = `LAT ${(24 + (520 - a.y) / 40).toFixed(2)}°N · LON ${(10 + a.x / 20).toFixed(2)}°E · HDG ${String(Math.round((90 + ang + 360) % 360)).padStart(3, '0')}°`;
  };
  const setChapter = (i) => {
    if (i === active) return;
    active = i;
    wps.forEach((w, k) => w.classList.toggle('is-lit', k <= i));
    steps.forEach((s, k) => s.classList.toggle('is-on', k <= i));
    if (i !== shown) { shown = i; cards.forEach((c, k) => c.classList.toggle('is-on', k === i)); }
  };
  const progress = () => {
    const r = track.getBoundingClientRect();
    const span = r.height - innerHeight;
    return span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
  };
  let smooth = 0, last = performance.now();
  const frame = () => {
    raf = 0;
    if (staticMode || !visible) return;
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    const p = progress();
    smooth += (p - smooth) * (1 - Math.exp(-dt * 9)); // frame-rate independent easing
    if (Math.abs(p - smooth) < 0.0005) smooth = p;
    place(smooth);
    bar.style.transform = `scaleX(${smooth.toFixed(4)})`;
    let ch = 0;
    WP.forEach((f, k) => { if (p + 0.03 >= f) ch = k; }); // chapters follow the real scroll position
    setChapter(ch);
    raf = requestAnimationFrame(frame);
  };
  const apply = () => {
    const s = isStatic();
    if (s === staticMode) return;
    staticMode = s;
    sec.classList.toggle('voyage--static', s);
    if (s) { place(0.999); wps.forEach((w) => w.classList.add('is-lit')); cards.forEach((c) => c.classList.add('is-on')); active = shown = -1; }
    else { cards.forEach((c, k) => c.classList.toggle('is-on', k === 0)); active = shown = -1; smooth = progress(); setChapter(0); if (visible && !raf) raf = requestAnimationFrame(frame); }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !staticMode && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { rootMargin: '100px 0px' }).observe(track);
  addEventListener('resize', apply, { passive: true });
  apply();
  if (!staticMode) place(0);
})();

/* ---------- cross-page transitions: native View Transitions, gold curtain fallback ---------- */
(() => {
  if (reduced || 'PageRevealEvent' in window) return; // native cross-document transitions handle it
  const curtain = document.createElement('div');
  curtain.className = 'sail-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<svg viewBox="0 0 40 40"><defs><linearGradient id="scG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".45" stop-color="#e7b94f"/><stop offset="1" stop-color="#8a5a17"/></linearGradient></defs><g fill="url(#scG)" transform="translate(0 -1.2)"><g transform="rotate(8 20 20)"><path d="M10 4V30.5H25Z"/><path d="M14.6 8.4 28.4 30.5H33Z"/></g><path d="M5 34.2h30l-2.6 3H7.6Z"/></g></svg>';
  document.body.appendChild(curtain);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) return; // in-page anchor
    e.preventDefault();
    curtain.classList.add('is-in');
    setTimeout(() => { location.href = url.href; }, 360);
  });
  addEventListener('pageshow', (e) => { if (e.persisted) curtain.classList.remove('is-in'); }); // back/forward cache
})();
