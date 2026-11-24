// Leeway Guard end-to-end test: loads the unpacked extension into Chromium, serves a mock dApp
// with a fake EIP-1193 wallet, and checks that dangerous requests are stopped before the wallet
// sees them while safe ones pass. Checks run against live Base state (public RPC + GoPlus).
//
// Usage: node test/guard.test.mjs <dir with node_modules/playwright> [chromium executable] [shots dir]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(here, '..');
const [pwDir, exe, shotsDir = path.join(os.tmpdir(), 'leeway-guard-shots')] = process.argv.slice(2);
if (!pwDir) { console.error('usage: node test/guard.test.mjs <playwright dir> [chromium exe] [shots dir]'); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);
fs.mkdirSync(shotsDir, { recursive: true });

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EOA = '0x2222222222222222222222222222222222222222';
const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const now = Math.floor(Date.now() / 1000);

/* ---------- mock dApp with a fake wallet ---------- */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>SwapX · demo dApp</title>
<script>
  window.__calls = [];
  const mock = {
    isMetaMask: true,
    async request({ method, params }) {
      window.__calls.push(method);
      if (method === 'eth_chainId') return '0x2105';
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['${VITALIK}'];
      if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);
      if (method.startsWith('eth_signTypedData')) return '0x' + 'cd'.repeat(65);
      throw Object.assign(new Error('unsupported'), { code: 4200 });
    },
  };
  window.ethereum = mock; // assigned after the extension's document_start script, like a real wallet
  window.run = (args) => window.ethereum.request(args).then((r) => ({ ok: r }), (e) => ({ code: e.code, message: e.message }));
</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(60% 50% at 50% 30%,#1a2a5a,#06070d);font:15px system-ui;color:#dfe6ff}
.box{width:380px;padding:22px;border-radius:20px;background:#0d1226;border:1px solid #263160}.box h1{margin:0 0 14px;font-size:18px}.f{padding:16px;border-radius:14px;background:#141b38;margin-bottom:8px;font-size:22px}
button{width:100%;padding:14px;border:0;border-radius:14px;background:#4c6fff;color:#fff;font-size:16px;font-weight:600}</style></head>
<body><div class="box"><h1>SwapX</h1><div class="f">0.0 ETH</div><div class="f">0.0 USDC</div><button>Approve USDC</button></div></body></html>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dapp = `http://127.0.0.1:${server.address().port}/`;

/* ---------- browser with the unpacked extension ---------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-guard-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  ...(exe && { executablePath: exe }),
  viewport: { width: 1280, height: 820 },
  args: ['--headless=new', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
const ext = await context.newPage();
await ext.goto(`chrome-extension://${extId}/popup.html`);
const history = () => ext.evaluate(() => chrome.storage.local.get(['history', 'stats']));

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(dapp);
await page.waitForFunction(() => window.__leewayGuard && window.run);

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✕'} ${name}${extra ? `  · ${extra}` : ''}`); if (!cond) failed++; };

/** Fires a wallet request, waits for the verdict to be recorded, optionally screenshots, then answers with a key. */
async function scenario(args, key, shot) {
  const before = (await history()).stats?.checked ?? 0;
  await page.bringToFront(); // background tabs pause animations
  await page.evaluate((a) => { window.__res = undefined; window.__calls.length = 0; window.run(a).then((r) => { window.__res = r; }); }, args);
  const t0 = Date.now();
  let h;
  while (Date.now() - t0 < 30000) { h = await history(); if ((h.stats?.checked ?? 0) > before) break; await page.waitForTimeout(250); }
  await page.waitForTimeout(700); // overlay animation
  if (shot) await page.screenshot({ path: path.join(shotsDir, shot) });
  await page.bringToFront();
  await page.keyboard.press(key);
  await page.waitForFunction(() => window.__res !== undefined, null, { timeout: 10000 });
  const res = await page.evaluate(() => ({ res: window.__res, calls: [...window.__calls] }));
  return { verdict: h.history?.[0]?.verdict, method: h.history?.[0]?.method, ...res };
}

// (a) unlimited USDC approval to a plain wallet → DO_NOT_SIGN → Reject (primary) → 4001, wallet never asked
const DRAIN = '0x095ea7b3' + EOA.slice(2).padStart(64, '0') + 'f'.repeat(64);
const a = await scenario({ method: 'eth_sendTransaction', params: [{ from: VITALIK, to: USDC_BASE, data: DRAIN }] }, 'Enter', 'guard-do-not-sign.png');
check('(a) drainer approve → DO_NOT_SIGN', a.verdict === 'DO_NOT_SIGN', a.method);
check('(a) Reject returns EIP-1193 4001 to the dApp', a.res?.code === 4001, a.res?.message);
check('(a) the wallet never received eth_sendTransaction', !a.calls.includes('eth_sendTransaction'), a.calls.join(','));

// (b) small native transfer → SAFE_TO_SIGN → Continue (primary) → wallet receives it
const b = await scenario({ method: 'eth_sendTransaction', params: [{ from: VITALIK, to: EOA, value: '0x1c6bf52634000' }] }, 'Enter', 'guard-safe.png');
check('(b) 0.0005 ETH transfer → SAFE_TO_SIGN', b.verdict === 'SAFE_TO_SIGN', b.verdict);
check('(b) Continue passes the request to the wallet', b.calls.includes('eth_sendTransaction') && b.res?.ok?.startsWith('0x'), b.calls.join(','));

// (c) Permit2 PermitSingle, max amount, spender is a plain wallet → DO_NOT_SIGN → Escape rejects
const permit2 = {
  types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }], PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
  domain: { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2 }, primaryType: 'PermitSingle',
  message: { details: { token: USDC_BASE, amount: (2n ** 160n - 1n).toString(), expiration: String(now + 365 * 86400), nonce: '0' }, spender: EOA, sigDeadline: String(now + 3600) },
};
const c = await scenario({ method: 'eth_signTypedData_v4', params: [VITALIK, JSON.stringify(permit2)] }, 'Escape', 'guard-permit2.png');
check('(c) Permit2 unlimited to a wallet → DO_NOT_SIGN', c.verdict === 'DO_NOT_SIGN', c.method);
check('(c) Escape rejects, wallet never asked to sign', c.res?.code === 4001 && !c.calls.some((m) => m.startsWith('eth_signTypedData')));

// (d) EIP-2612 Permit, 1 USDC to a router contract, 1h deadline → not DO_NOT_SIGN; Continue reaches the wallet
const permit = {
  types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
  domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC_BASE }, primaryType: 'Permit',
  message: { owner: VITALIK, spender: KYBER_ROUTER, value: '1000000', nonce: '0', deadline: String(now + 3600) },
};
const d = await scenario({ method: 'eth_signTypedData_v4', params: [VITALIK, JSON.stringify(permit)] }, 'Enter');
check('(d) 1 USDC permit to a contract → SAFE_TO_SIGN or REVIEW', ['SAFE_TO_SIGN', 'REVIEW'].includes(d.verdict), d.verdict);
check('(d) Continue passes the signature request to the wallet', d.calls.includes('eth_signTypedData_v4') && d.res?.ok?.startsWith('0x'));

// non-watched methods are untouched
const plain = await page.evaluate(() => window.run({ method: 'eth_accounts' }));
check('read calls are not intercepted', plain.ok?.[0] === VITALIK);

// (e) popup shows counters
await ext.reload();
await ext.waitForTimeout(500);
const counters = await ext.evaluate(() => ({ checked: +document.getElementById('checked').textContent, warned: +document.getElementById('warned').textContent, blocked: +document.getElementById('blocked').textContent, items: document.querySelectorAll('#history li:not(.empty)').length }));
check('(e) popup counters', counters.checked >= 4 && counters.warned >= 2 && counters.blocked >= 2 && counters.items >= 4, JSON.stringify(counters));
await ext.setViewportSize({ width: 372, height: 620 });
await ext.screenshot({ path: path.join(shotsDir, 'guard-popup.png'), fullPage: true });

// (f) Scan with Leeway (same handler the context menu calls)
const scan = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'scan', text: 'is 0x6982508145454Ce325dDbE47a25d4ec3d2311933 legit?' }));
check('(f) scan: token risk for a selected address', scan.type === 'token' && scan.symbol === 'PEPE' && typeof scan.risk_score === 'number', `${scan.symbol} on ${scan.chain} · risk ${scan.risk_score}`);
const scan2 = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'scan', text: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }));
check('(f) scan: wallet address falls back to reputation', scan2.type === 'address' && scan2.flagged === false);

// pause on this site → requests pass straight through
await ext.evaluate((host) => chrome.storage.local.set({ paused: [host] }), new URL(dapp).host);
const p = await page.evaluate((args) => window.run(args), { method: 'eth_sendTransaction', params: [{ from: VITALIK, to: EOA, value: '0x1' }] });
check('paused site: request goes straight to the wallet', p.ok?.startsWith('0x'));
check('no page errors', errors.length === 0, errors.join(' | '));

await context.close();
server.close();
console.log(`\nshots: ${shotsDir}`);
console.log(failed ? `${failed} check(s) failed` : 'all guard checks passed');
process.exit(failed ? 1 : 0);
