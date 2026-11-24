// Phase 3 test: wallet, policy-gated execution, approvals, x402 payments and the HTTP transport.
// No real funds: a throwaway key, a local x402 merchant that verifies the EIP-3009 signature,
// and Base Sepolia only for reading the USDC EIP-712 domain.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { verifyTypedData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-exec-'));
const key = generatePrivateKey();
const agent = privateKeyToAccount(key).address;
const ENV = {
  ...process.env, LEEWAY_AGENT_KEY: key, LEEWAY_LEDGER: path.join(dir, 'ledger.json'), LEEWAY_APPROVALS: path.join(dir, 'approvals.json'),
  LEEWAY_EXECUTION_CHAINS: 'base-sepolia,base', LEEWAY_TELEGRAM_BOT_TOKEN: '', LEEWAY_ALLOWLIST: '',
  LEEWAY_APPROVAL_WEBHOOK_SECRET: 'whsec-test-secret',
};
const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PAY_TO = '0x2222222222222222222222222222222222222222';
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✕'} ${name}${extra ? `  · ${extra}` : ''}`); if (!cond) failed++; };

/* ---------- local x402 merchant (v1 body + v2 header variants) ---------- */
const verified = [];
const merchant = http.createServer(async (req, res) => {
  const price = req.url.includes('big') ? '5000000' : '20000'; // 5 USDC or 0.02 USDC
  const v2 = req.url.includes('v2');
  const requirement = { scheme: 'exact', network: v2 ? 'eip155:84532' : 'base-sepolia', asset: USDC_SEPOLIA, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
  const header = req.headers[v2 ? 'payment-signature' : 'x-payment'];
  if (!header) {
    if (v2) {
      res.writeHead(402, { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({ x402Version: 2, resource: { url: req.url }, accepts: [{ ...requirement, amount: price }] })).toString('base64') });
      return res.end('{}');
    }
    res.writeHead(402, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ x402Version: 1, accepts: [{ ...requirement, maxAmountRequired: price, resource: req.url, description: 'weather' }] }));
  }
  const p = JSON.parse(Buffer.from(header, 'base64').toString());
  const { signature, authorization: a } = p.payload;
  const ok = await verifyTypedData({
    address: a.from, signature, primaryType: 'TransferWithAuthorization',
    domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC_SEPOLIA },
    types: { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
    message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
  });
  const right = ok && a.to.toLowerCase() === PAY_TO.toLowerCase() && a.value === price && (v2 ? p.x402Version === 2 && Boolean(p.accepted) : p.x402Version === 1 && p.scheme === 'exact');
  verified.push(right);
  const receipt = Buffer.from(JSON.stringify({ success: right, transaction: right ? '0x' + 'ab'.repeat(32) : '', network: requirement.network, payer: a.from })).toString('base64');
  res.writeHead(right ? 200 : 402, { 'Content-Type': 'application/json', [v2 ? 'PAYMENT-RESPONSE' : 'X-PAYMENT-RESPONSE']: receipt });
  res.end(JSON.stringify(right ? { city: 'Dubai', temp_c: 31 } : { error: 'bad payment' }));
});
await new Promise((r) => merchant.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${merchant.address().port}`;

/* ---------- approval webhook receiver (stands in for Zapier / Make / an email sender) ---------- */
const hooks = [];
const hookSrv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const want = 'sha256=' + crypto.createHmac('sha256', 'whsec-test-secret').update(raw).digest('hex');
    hooks.push({ body: JSON.parse(raw), sigOk: req.headers['x-leeway-signature'] === want });
    res.writeHead(200); res.end('ok');
  });
});
await new Promise((r) => hookSrv.listen(0, '127.0.0.1', r));
ENV.LEEWAY_APPROVAL_WEBHOOK = `http://127.0.0.1:${hookSrv.address().port}/hook`;

/* ---------- stdio client ---------- */
const client = new Client({ name: 'leeway-exec-test', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.js'], env: ENV }));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  try { return r.isError ? { error: text } : JSON.parse(text); } catch { return { error: text }; }
};

const { tools } = await client.listTools();
check('17 tools registered', tools.length === 17, tools.map((t) => t.name).slice(11).join(', '));

const w = await call('wallet_info', {});
check('wallet_info shows the agent address, never the key', w.address === agent && !JSON.stringify(w).includes(key.slice(2, 20)), `${w.address} · executes on ${w.execution_chains}`);

const main = await call('send_transaction', { chain: 'ethereum', to: PAY_TO, value: '0.001' });
check('mainnet execution is off by default', /not enabled/.test(main.error || ''), (main.error || '').slice(7, 70));

const empty = await call('send_transaction', { chain: 'base-sepolia', to: PAY_TO, value: '0.001' });
check('unfunded transfer is blocked by simulation, nothing broadcast', empty.status === 'blocked' && empty.reason === 'WILL_REVERT', empty.simulation?.revert_reason);

const small = await call('x402_pay', { url: `${base}/weather` });
check('x402 v1: $0.02 paid automatically within the micro-allowance', small.status === 'paid' && small.receipt?.success && verified.at(-1) === true, `${small.amount_usd} USDC · ${small.body}`);

const v2 = await call('x402_pay', { url: `${base}/v2/weather` });
check('x402 v2: PAYMENT-SIGNATURE header, signature verified by merchant', v2.status === 'paid' && verified.at(-1) === true, v2.receipt?.network);

const cap = await call('x402_pay', { url: `${base}/big`, max_usd: 1 });
check('max_usd guard refuses a $5 price', cap.status === 'blocked' && /above max_usd/.test(cap.reason));

const pending = await call('x402_pay', { url: `${base}/big` });
check('$5 payment parks as pending_approval', pending.status === 'pending_approval' && /^[0-9A-F]{6}$/.test(pending.approval_id), `id ${pending.approval_id} · ${pending.reasons?.join('; ')}`);
const hook = hooks.find((h) => h.body.approval?.id === pending.approval_id);
check('webhook receives the approval request, HMAC-signed', Boolean(hook) && hook.sigOk && hook.body.type === 'approval_requested' && hook.body.approval.value_usd === 5, hook ? hook.body.approve_hint : 'no webhook call');
check('pending response lists the webhook channel', Array.isArray(pending.notified_via) && pending.notified_via.includes('webhook'), JSON.stringify(pending.notified_via));

const st = await call('approval_status', { approval_id: pending.approval_id });
check('approval_status: pending', st.status === 'pending');

const early = await call('x402_pay', { url: `${base}/big`, approval_id: pending.approval_id });
check('using an approval before the owner decides is refused', early.status === 'blocked' && /pending/.test(early.reason));

execFileSync(process.execPath, ['src/index.js', 'approve', pending.approval_id], { env: ENV });
const st2 = await call('approval_status', { approval_id: pending.approval_id });
check('owner approves from the CLI', st2.status === 'approved' && st2.decided_by === 'cli');

const mismatch = await call('x402_pay', { url: `${base}/big?other`, approval_id: pending.approval_id });
check('approval cannot be reused for different parameters', mismatch.status === 'blocked' && /different parameters/.test(mismatch.reason));

const paid = await call('x402_pay', { url: `${base}/big`, approval_id: pending.approval_id });
check('approved $5 payment goes through', paid.status === 'paid' && paid.approved_by === pending.approval_id && verified.at(-1) === true);

const replay = await call('x402_pay', { url: `${base}/big`, approval_id: pending.approval_id });
check('approval cannot be replayed', replay.status === 'blocked' && /already used/.test(replay.reason));

// ERC-20 sell with an unfunded wallet on Base: the plan must be exact approve + swap, simulated
// together, and blocked before anything is signed (no hash, nothing broadcast)
const erc = await call('execute_swap', { chain: 'base', sell: 'USDC', buy: 'ETH', amount: '5' });
const ercJson = JSON.stringify(erc);
check('ERC-20 sell plans two steps: exact approve, then swap', erc.plan?.length === 2 && erc.plan[0].step === 'approve' && erc.plan[0].exact === true && erc.plan[0].amount === '5' && erc.plan[1].step === 'swap', erc.plan ? `approve ${erc.plan[0]?.amount} ${erc.plan[0]?.symbol} → ${erc.plan[0]?.spender?.slice(0, 10)}…` : erc.error || erc.reason);
check('both steps simulated together: approve succeeds, swap needs funds', erc.quote?.simulation?.steps?.length === 2 && erc.quote.simulation.steps[0].status === 'success' && erc.quote.simulation.steps[1].status === 'reverted', erc.quote?.simulation?.steps?.map((x) => `${x.method.split('(')[0]}:${x.status}`).join(' → '));
check('unfunded ERC-20 sell is blocked before signing, never unlimited', erc.status === 'blocked' && !erc.hash && !/unlimited/i.test(ercJson), erc.reason?.slice(0, 90));
const nat = await call('execute_swap', { chain: 'base', sell: 'ETH', buy: 'USDC', amount: '0.001' });
check('native sell keeps working: single step, blocked when unfunded', nat.status === 'blocked' && nat.plan?.length === 1 && nat.plan[0].step === 'swap' && !nat.hash, nat.reason?.slice(0, 70));

const rep = await call('spending_report', {});
check('ledger recorded the spends', Math.abs(rep.spentUsd - 5.04) < 1e-6, `$${rep.spentUsd} spent today`);
await client.close();

/* ---------- HTTP transport ---------- */
const port = 39000 + Math.floor(Math.random() * 500);
const agentToken = 'agent-token-0123456789', adminToken = 'admin-token-9876543210';
const srv = spawn(process.execPath, ['src/index.js', 'http', '--port', String(port)], { env: { ...ENV, LEEWAY_HTTP_TOKEN: agentToken, LEEWAY_ADMIN_TOKEN: adminToken }, stdio: ['ignore', 'ignore', 'pipe'] });
await new Promise((r, j) => { srv.stderr.on('data', (d) => { if (String(d).includes('ready')) r(); }); setTimeout(() => j(new Error('http server did not start')), 40000); });
const url = `http://127.0.0.1:${port}`;
const noAuth = await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
check('HTTP: request without token is rejected', noAuth.status === 401);
const hc = new Client({ name: 'leeway-http-test', version: '0.0.1' });
await hc.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${agentToken}` } } }));
const ht = await hc.listTools();
const hw = await hc.callTool({ name: 'wallet_info', arguments: {} });
check('HTTP: remote agent lists tools and calls them', ht.tools.length === 17 && JSON.parse(hw.content[0].text).address === agent);
await hc.close();
const agentAsAdmin = await fetch(`${url}/approvals`, { headers: { Authorization: `Bearer ${agentToken}` } });
check('HTTP: the agent token cannot reach the approval endpoint', agentAsAdmin.status === 401);
const asAdmin = await fetch(`${url}/approvals`, { headers: { Authorization: `Bearer ${adminToken}` } });
check('HTTP: the owner token lists approvals', asAdmin.status === 200 && (await asAdmin.json()).length >= 1);
srv.kill();
merchant.close();
hookSrv.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall execution checks passed');
process.exit(failed ? 1 : 0);
