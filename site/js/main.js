// AURUM MCP · UI interactions (no dependencies)
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
    ['resolve_name', 'ENS / SNS / Basenames resolution in both directions.', 'read'],
    ['create_agent_wallet', 'Spin up a policy-bound smart wallet for an agent.', 'write'],
    ['set_policy', 'Update spend limits, allowlists and approval rules.', 'write'],
  ],
  risk: [
    ['scan_token', 'Honeypot, hidden mint, blacklist and tax analysis.', 'read'],
    ['scan_contract', 'Static analysis of dangerous functions and proxies.', 'read'],
    ['holder_concentration', 'Top-holder share and clustering of linked wallets.', 'read'],
    ['check_address', 'Sanctions, phishing and drainer reputation lookup.', 'read'],
    ['liquidity_lock', 'LP lock status, unlock dates and rug probability.', 'read'],
    ['explain_tx', 'Plain-English simulation of what a transaction will do.', 'read'],
  ],
  trade: [
    ['quote_swap', 'Best route across DEX aggregators, including price impact.', 'read'],
    ['simulate_swap', 'Fork simulation with exact output and state diff.', 'read'],
    ['execute_swap', 'Policy-checked execution with slippage guard.', 'write'],
    ['bridge_quote', 'Cross-chain routes compared on cost and time.', 'read'],
    ['limit_order', 'Place intent-based limit orders with expiry.', 'write'],
    ['revoke_approval', 'Find and revoke risky token allowances.', 'write'],
  ],
  pay: [
    ['x402_fetch', 'Fetch a paywalled resource and settle the 402 in USDC automatically.', 'write'],
    ['x402_quote', 'Preview the price of a 402 resource before paying.', 'read'],
    ['send_payment', 'Transfer stablecoins within policy limits.', 'write'],
    ['policy_check', 'Ask the policy engine: allow, needs approval or deny, with reasons.', 'read'],
    ['create_invoice', 'Let your agent sell its own services via x402.', 'write'],
    ['spending_report', 'Daily and weekly agent spend by tool and merchant.', 'read'],
  ],
};
// tools shipped in server/src/index.js today; the rest are on the roadmap
const LIVE = new Set(['get_price', 'trending_tokens', 'get_gas', 'get_balance', 'scan_token', 'check_address', 'policy_check', 'x402_quote', 'spending_report']);
function renderTools(cat) {
  $('#toolList').innerHTML = TOOLS[cat].map(([n, d, t], i) =>
    `<div class="tool-item" style="animation-delay:${i * 0.05}s"><div class="tool-item__head"><code>${n}()</code>${LIVE.has(n) ? '<em class="live">● live</em>' : '<em>soon</em>'}</div><p>${d}</p><small class="${t === 'write' ? 'w' : ''}">${t === 'write' ? 'write · policy-guarded' : 'read-only'}</small></div>`).join('');
}
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
  const tools = ['get_price', 'scan_token', 'get_gas', 'check_address', 'get_balance', 'x402_quote', 'trending_tokens'];
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

/* ---------- orbit coins ---------- */
(() => {
  const wrap = $('#orbitCoins');
  if (!wrap) return;
  const glyphs = ['A', 'Ξ', '$', 'τ', 'A', 'S', '◎', 'A', 'x'];
  const rings = [{ r: 220, cy: 370, n: 2, off: 0.35 }, { r: 350, cy: 420, n: 3, off: 0.2 }, { r: 480, cy: 470, n: 4, off: 0.1 }];
  const coins = [];
  let k = 0;
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const el = document.createElement('div');
      el.className = 'ocoin';
      el.innerHTML = `<i>${glyphs[k++ % glyphs.length]}</i>`;
      wrap.appendChild(el);
      coins.push({ el, ring, a: Math.PI + ring.off * Math.PI + (i / (ring.n - 1 || 1)) * (1 - 2 * ring.off) * Math.PI, speed: (ri % 2 ? -1 : 1) * 0.04 });
    }
  });
  let t0 = performance.now();
  const tick = (t) => {
    const dt = (t - t0) / 1000; t0 = t;
    const W = wrap.clientWidth, scale = Math.min(1, W / 980);
    coins.forEach((c) => {
      if (!reduced) c.a += c.speed * dt;
      const lo = Math.PI * (1 + c.ring.off * 0.6), hi = Math.PI * (2 - c.ring.off * 0.6);
      if (c.a > hi) c.a = lo; if (c.a < lo) c.a = hi;
      const x = W / 2 + Math.cos(c.a) * c.ring.r * scale;
      const y = (c.ring.cy - c.ring.r) * scale + c.ring.r * scale + Math.sin(c.a) * c.ring.r * scale;
      const edge = Math.min(c.a - lo, hi - c.a);
      const hide = scale < 0.6 && c.ring === rings[0];
      c.el.style.opacity = hide ? 0 : Math.min(1, edge * 3);
      c.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale < 0.6 ? 0.8 : 1})`;
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
    ['tool', '→ <b>quote_swap</b>({ from: "ETH", to: "USDC", amount: 0.5 })'],
    ['ok', '✓ best route: Uniswap v4 → 1,741.82 USDC · impact 0.03%'],
    ['tool', '→ <b>simulate_swap</b>({ route: "uni-v4", slippage: 0.3 })'],
    ['ok', '✓ simulation passed · min out 1,736.6 USDC · gas $0.41'],
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
    ['tool', '→ <b>x402_fetch</b>({ url: "api.meteo.xyz/v1/dubai" })'],
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
