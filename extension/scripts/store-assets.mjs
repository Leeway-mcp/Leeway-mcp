// Renders the Chrome Web Store / AMO / Edge listing images into store/assets/:
//   screenshot-1-drainer.png … screenshot-5-scan.png (1280×800), promo-small-440x280.png,
//   promo-marquee-1400x560.png, store-icon-128.png (96×96 artwork, 16 px transparent padding).
// Screenshots use the REAL extension UI: the unpacked extension is loaded into Chromium, a mock
// dApp triggers real requests (checked against live chain data), and the captured overlay is
// framed with a headline.
//
// Usage: node scripts/store-assets.mjs <dir with node_modules/playwright> <chromium exe> [out dir]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(here, '..');
const [pwDir, exe, outArg] = process.argv.slice(2);
if (!pwDir || !exe) { console.error('usage: node scripts/store-assets.mjs <playwright dir> <chromium exe> [out dir]'); process.exit(1); }
const out = path.resolve(outArg || path.join(extDir, '..', 'store', 'assets'));
fs.mkdirSync(out, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EOA = '0x2222222222222222222222222222222222222222';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const now = Math.floor(Date.now() / 1000);
const MARK = (id = 'g') => `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".45" stop-color="#e7b94f"/><stop offset="1" stop-color="#8a5a17"/></linearGradient></defs><g fill="url(#${id})" transform="translate(0 -1.2)"><g transform="rotate(8 20 20)"><path d="M10 4V30.5H25Z"/><path d="M14.6 8.4 28.4 30.5H33Z"/></g><path d="M5 34.2h30l-2.6 3H7.6Z"/></g></svg>`;
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">';

/* ---------------- mock pages (fictional brands on .example domains) ---------------- */
const provider = `<script>
  window.__calls = [];
  window.ethereum = { isMetaMask: true, async request({ method }) {
    window.__calls.push(method);
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['${VITALIK}'];
    return '0x' + 'ab'.repeat(32);
  } };
  window.run = (a) => window.ethereum.request(a).catch(() => {});
</script>`;
const DAPP = `<!doctype html><html><head><meta charset="utf-8"><title>Swapzone</title>${FONTS}${provider}<style>
  *{box-sizing:border-box} body{margin:0;min-height:100vh;font:15px Inter,system-ui;color:#e6ebff;background:radial-gradient(70% 60% at 50% 0%,#24306b,#0a0d1f 60%,#06070e)}
  nav{display:flex;align-items:center;gap:26px;padding:18px 28px} nav b{font:600 18px 'Instrument Sans';letter-spacing:-.01em} nav span{color:#8d97c7} nav i{margin-left:auto;font:500 13px 'JetBrains Mono';padding:8px 12px;border-radius:999px;background:#151b3d;border:1px solid #2a3470;font-style:normal}
  .card{width:420px;margin:44px auto;padding:18px;border-radius:22px;background:#0f1430;border:1px solid #27306a;box-shadow:0 40px 80px -30px #000}
  .f{padding:16px 18px;border-radius:16px;background:#151b3d;margin-bottom:8px} .f small{color:#8d97c7} .f div{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font:500 30px 'Instrument Sans'} .f em{font:600 14px Inter;font-style:normal;padding:6px 10px;border-radius:999px;background:#0b0f26}
  button{width:100%;margin-top:6px;padding:16px;border:0;border-radius:16px;background:linear-gradient(180deg,#6d8bff,#4c6fff);color:#fff;font:600 16px Inter}
</style></head><body><nav><b>Swapzone</b><span>Swap</span><span>Pools</span><span>Rewards</span><i>0xd8dA…6045</i></nav>
<div class="card"><div class="f"><small>You pay</small><div>1,000<em>USDC</em></div></div><div class="f"><small>You receive</small><div>0.5843<em>ETH</em></div></div><button>Approve &amp; swap</button></div></body></html>`;
const SEND = DAPP.replace('<small>You pay</small><div>1,000<em>USDC</em></div>', '<small>Send</small><div>0.0005<em>ETH</em></div>').replace('<small>You receive</small><div>0.5843<em>ETH</em></div>', '<small>To</small><div style="font-size:18px">0x2222…2222<em>Base</em></div>').replace('Approve &amp; swap', 'Send');
const FEED = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title>${FONTS}<style>
  body{margin:0;min-height:100vh;background:#0b0b0f;font:15px Inter,system-ui;color:#e7e7ea}
  .col{width:600px;margin:0 auto;border-left:1px solid #222;border-right:1px solid #222;min-height:100vh}
  .post{padding:18px 20px;border-bottom:1px solid #222;display:flex;gap:12px} .av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3a3a48,#16161c);flex:none}
  .post b{font-weight:600} .post small{color:#777} .post p{margin:6px 0 0;line-height:1.5} code{font-family:'JetBrains Mono';font-size:13.5px;background:#1a2a4a;color:#cfe0ff;padding:1px 4px;border-radius:4px}
</style></head><body><div class="col">
  <div class="post"><div class="av"></div><div><b>degen alpha</b> <small>@alphacalls · 2m</small><p>New gem just launched, 100x incoming 🚀 CA: <code id="ca">${PEPE}</code> get in before it moons</p></div></div>
  <div class="post"><div class="av"></div><div><b>on-chain watcher</b> <small>@watcher · 9m</small><p>Reminder: never sign approvals you did not ask for. Check the spender first.</p></div></div>
  <div class="post"><div class="av"></div><div><b>market notes</b> <small>@notes · 21m</small><p>ETH gas on Base is under a cent again. Good time to rebalance.</p></div></div>
</div></body></html>`;
const pages = { '/': DAPP, '/send': SEND, '/feed': FEED };
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pages[req.url] || DAPP); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

/* ---------------- capture real extension UI ---------------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-assets-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false, executablePath: exe, viewport: { width: 1040, height: 500 }, deviceScaleFactor: 2,
  args: ['--headless=new', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`,
    `--host-resolver-rules=MAP app.swapzone.example:80 127.0.0.1:${port}, MAP feed.social.example:80 127.0.0.1:${port}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${extId}/popup.html`);
const checked = async () => (await ext.evaluate(() => chrome.storage.local.get('stats'))).stats?.checked ?? 0;

const page = await ctx.newPage();
async function capture(url, args, key = 'Escape') {
  await page.goto(url);
  await page.waitForFunction(() => window.__leewayGuard && window.run);
  const before = await checked();
  await page.bringToFront();
  await page.evaluate((a) => { window.run(a); }, args);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && (await checked()) <= before) await page.waitForTimeout(250);
  await page.waitForTimeout(900);
  const buf = await page.screenshot();
  await page.keyboard.press(key);
  return buf;
}
const DRAIN = '0x095ea7b3' + EOA.slice(2).padStart(64, '0') + 'f'.repeat(64);
const shots = {};
shots.drainer = await capture('http://app.swapzone.example/', { method: 'eth_sendTransaction', params: [{ from: VITALIK, to: USDC_BASE, data: DRAIN }] });
shots.safe = await capture('http://app.swapzone.example/send', { method: 'eth_sendTransaction', params: [{ from: VITALIK, to: EOA, value: '0x1c6bf52634000' }] }, 'Enter');
const permit2 = {
  types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }], PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
  domain: { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2 }, primaryType: 'PermitSingle',
  message: { details: { token: USDC_BASE, amount: (2n ** 160n - 1n).toString(), expiration: String(now + 365 * 86400), nonce: '0' }, spender: EOA, sigDeadline: String(now + 3600) },
};
shots.permit2 = await capture('http://app.swapzone.example/', { method: 'eth_signTypedData_v4', params: [VITALIK, JSON.stringify(permit2)] });

// scan toast: select the contract address in a post, run the same handler the context menu uses
await page.goto('http://feed.social.example/feed');
await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('ca')); getSelection().removeAllRanges(); getSelection().addRange(r); });
await page.bringToFront();
await ext.evaluate(async (pep) => {
  const result = await chrome.runtime.sendMessage({ type: 'scan', text: pep });
  // no "tabs" permission, so URLs are hidden: the feed is the active tab that is not this page
  const self = await chrome.tabs.getCurrent();
  const tab = (await chrome.tabs.query({ active: true })).find((t) => t.id !== self?.id);
  await chrome.tabs.sendMessage(tab.id, { type: 'leeway-toast', result });
}, PEPE);
await page.waitForTimeout(1200);
shots.scan = await page.screenshot();

// popup, large
await ext.setViewportSize({ width: 372, height: 600 });
await ext.reload();
await ext.waitForTimeout(800);
const ph = await ext.evaluate(() => Math.ceil(document.body.getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).marginBottom || 0)));
shots.popup = await ext.screenshot({ clip: { x: 0, y: 0, width: 372, height: Math.min(600, ph + 14) } });
await ctx.close();
server.close();

/* ---------------- compose branded images ---------------- */
const uri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const BASE_CSS = `*{box-sizing:border-box;margin:0} body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,system-ui;color:#ececf1;
  background:radial-gradient(60% 70% at 85% 0%,rgba(231,185,79,.20),transparent 60%),radial-gradient(50% 60% at 0% 100%,rgba(70,90,200,.18),transparent 60%),#07070b}
  .grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:3px 3px;opacity:.6;pointer-events:none}
  .brand{display:flex;align-items:center;gap:10px;font:600 15px 'Instrument Sans';letter-spacing:.12em;text-transform:uppercase} .brand svg{width:26px;height:26px;filter:drop-shadow(0 4px 14px rgba(231,185,79,.5))}
  h1{font:500 50px/1.04 'Instrument Sans';letter-spacing:-.03em} h1 span{background:linear-gradient(180deg,#fff2c4,#e7b94f 60%,#b98327);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:17px;line-height:1.5;color:#a6a6b4}
  .chip{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;font:500 12px 'JetBrains Mono';letter-spacing:.06em;text-transform:uppercase;color:#e9dcb8;border:1px solid rgba(231,185,79,.3);background:rgba(231,185,79,.06)}
  .chip i{width:6px;height:6px;border-radius:50%;background:#e7b94f;box-shadow:0 0 10px #e7b94f}
  .win{border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:#0b0b12;box-shadow:0 60px 120px -40px rgba(0,0,0,.95),0 0 90px -40px rgba(231,185,79,.45)}
  .bar{display:flex;align-items:center;gap:7px;padding:11px 14px;background:#111119;border-bottom:1px solid rgba(255,255,255,.06)} .bar b{width:10px;height:10px;border-radius:50%;background:#2a2a35}
  .bar b:nth-child(1){background:#ff5f57}.bar b:nth-child(2){background:#febc2e}.bar b:nth-child(3){background:#28c840}
  .url{margin-left:14px;flex:1;max-width:420px;padding:6px 12px;border-radius:7px;background:#07070c;font:12px 'JetBrains Mono';color:#8a8a99}
  .ext{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:rgba(231,185,79,.12);border:1px solid rgba(231,185,79,.4)} .ext svg{width:15px;height:15px}
  .win img{display:block;width:100%}`;
const shotHtml = ({ title, sub, chips, img, url }) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>:root{--w:1280px;--h:800px}${BASE_CSS}
  .top{position:absolute;left:64px;top:52px;right:64px;display:flex;justify-content:space-between;align-items:flex-start}
  .copy{position:absolute;left:64px;top:112px;width:1152px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px}
  .copy .sub{max-width:480px;font-size:16px;text-align:right}
  .shot{position:absolute;left:120px;right:120px;top:244px}
</style></head><body><div class="grain"></div>
  <div class="top"><div class="brand">${MARK()}Leeway Guard</div><div style="display:flex;gap:8px">${chips.map((c) => `<span class="chip"><i></i>${c}</span>`).join('')}</div></div>
  <div class="copy"><h1>${title}</h1><p class="sub">${sub}</p></div>
  <div class="shot"><div class="win"><div class="bar"><b></b><b></b><b></b><span class="url">${url}</span><span class="ext">${MARK('g2')}</span></div><img src="${img}"></div></div>
</body></html>`;
const popupHtml = (img) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>:root{--w:1280px;--h:800px}${BASE_CSS}
  .l{position:absolute;left:96px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:22px}
  .p{position:absolute;right:150px;top:70px;width:372px;border-radius:16px;overflow:hidden;border:1px solid rgba(231,185,79,.35);box-shadow:0 60px 120px -30px rgba(0,0,0,.95),0 0 100px -30px rgba(231,185,79,.55);transform:scale(1.12);transform-origin:top right}
  .p img{display:block;width:100%} ul{list-style:none;padding:0;display:grid;gap:12px;font-size:16px;color:#cfcfd8} li{display:flex;gap:12px;align-items:center} li i{width:22px;height:22px;border-radius:50%;flex:none;display:grid;place-items:center;font:700 12px 'JetBrains Mono';font-style:normal;color:#1a1205;background:linear-gradient(180deg,#fff2c4,#e7b94f)}
</style></head><body><div class="grain"></div><div class="l"><div class="brand">${MARK()}Leeway Guard</div>
  <h1>Every check, <span>one click away.</span></h1><p class="sub">Turn protection on or off, pause it on a trusted site and see what was checked, warned and rejected.</p>
  <ul><li><i>✓</i>Runs locally in your browser</li><li><i>✓</i>No account, no telemetry</li><li><i>✓</i>Works with any EIP-1193 wallet</li></ul></div>
  <div class="p"><img src="${img}"></div></body></html>`;
const promoHtml = (w, h, big, img) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>:root{--w:${w}px;--h:${h}px}${BASE_CSS}
  .c{position:absolute;inset:0;display:flex;align-items:center;gap:${big ? 40 : 22}px;padding:0 ${big ? 76 : 36}px}
  .m{width:${big ? 180 : 104}px;height:${big ? 180 : 104}px;flex:none;border-radius:${big ? 42 : 26}px;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#1d1d28,#0a0a10);border:1px solid rgba(231,185,79,.35);box-shadow:0 30px 80px -20px rgba(0,0,0,.9),0 0 80px -20px rgba(231,185,79,.55)}
  .m svg{width:66%;height:66%;filter:drop-shadow(0 6px 20px rgba(231,185,79,.5))}
  .t b{display:block;font:600 ${big ? 26 : 13}px 'Instrument Sans';letter-spacing:.16em;text-transform:uppercase;color:#e9dcb8;margin-bottom:${big ? 14 : 6}px}
  .t{max-width:${big ? 400 : 260}px} .t h1{font-size:${big ? 70 : 34}px} .t p{margin-top:${big ? 18 : 8}px;font-size:${big ? 18 : 12.5}px;line-height:1.45;color:#a6a6b4}
  .shotw{position:absolute;right:-96px;top:100px;width:640px;transform:perspective(1400px) rotateY(-16deg) rotateX(4deg);transform-origin:left center}
</style></head><body><div class="grain"></div><div class="c"><div class="m">${MARK()}</div><div class="t"><b>Leeway Guard</b><h1>See what<br><span>you sign.</span></h1>
  <p>${big ? 'Simulates every wallet transaction and signature before your wallet opens. Free · open source · no account.' : 'Wallet firewall · free · open source'}</p></div></div>${img ? `<div class="shotw"><div class="win"><div class="bar"><b></b><b></b><b></b><span class="url">app.swapzone.example</span></div><img src="${img}"></div></div>` : ''}</body></html>`;
const iconHtml = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:128px;height:128px;background:transparent;display:grid;place-items:center}
  .m{width:96px;height:96px;border-radius:22px;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#20202c,#0a0a10);box-shadow:inset 0 0 0 1px rgba(231,185,79,.45)} .m svg{width:68px;height:68px}
</style></head><body><div class="m">${MARK()}</div></body></html>`;

const browser = await chromium.launch({ executablePath: exe });
async function render(html, w, h, file, transparent = false) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, file), omitBackground: transparent });
  await p.close();
  console.log(`  ${file}  ${w}×${h}`);
}
const S = [
  ['screenshot-1-drainer.png', { title: 'Blocks drainers<br><span>before your wallet opens.</span>', sub: 'An unlimited USDC approval to a plain wallet: the most common way to lose everything. Leeway catches it first.', chips: ['Transaction firewall'], img: uri(shots.drainer), url: 'app.swapzone.example' }],
  ['screenshot-2-safe.png', { title: 'Know exactly<br><span>what leaves your wallet.</span>', sub: 'Every transaction is simulated on live chain state: assets out and in, USD values, approvals and gas.', chips: ['Live simulation'], img: uri(shots.safe), url: 'app.swapzone.example/send' }],
  ['screenshot-3-permit2.png', { title: 'Reads the signatures<br><span>drainers love.</span>', sub: 'Permit and Permit2 requests decoded into plain facts: token, amount, spender, how long it stays valid.', chips: ['Signature firewall'], img: uri(shots.permit2), url: 'app.swapzone.example' }],
  ['screenshot-5-scan.png', { title: 'Scan any address,<br><span>on any page.</span>', sub: 'Right-click a contract address in a post or a chat: token risk <span style=\"white-space:nowrap\">0–100</span> or the address reputation in a second.', chips: ['Scan with Leeway'], img: uri(shots.scan), url: 'feed.social.example' }],
];
console.log(`rendering into ${out}`);
for (const [file, o] of S) await render(shotHtml(o), 1280, 800, file);
await render(popupHtml(uri(shots.popup)), 1280, 800, 'screenshot-4-popup.png');
await render(promoHtml(440, 280, false), 440, 280, 'promo-small-440x280.png');
await render(promoHtml(1400, 560, true, uri(shots.drainer)), 1400, 560, 'promo-marquee-1400x560.png');
await render(iconHtml, 128, 128, 'store-icon-128.png', true);
await browser.close();
console.log('done');
