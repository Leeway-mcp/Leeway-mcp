// Execution: the only code path that signs. Every action runs the same gate:
//   1. simulate on live state   2. policy decision   3. human approval when asked
//   4. sign + broadcast         5. record the spend in the ledger
import { simulateTx, swapQuote, NATIVE } from './onchain.js';
import { assertCanExecute, sendTransaction, publicClient } from './wallet.js';
import { createApproval, consume } from './approvals.js';
import { telegramEnabled } from './telegram.js';
import { notifyApproval, webhookEnabled } from './notify.js';
import { record } from './policy.js';
import { CHAINS } from './data.js';
import { randomBytes } from 'node:crypto';

const lc = (s) => String(s).toLowerCase();
const howToApprove = (id) => [
  telegramEnabled ? 'tap Approve in the Telegram message' : null,
  webhookEnabled() ? 'use the approval notification (webhook)' : null,
  `run \`npx leeway-mcp approve ${id}\``,
  'or POST /approvals/' + id + '/approve on the admin endpoint',
].filter(Boolean).join(', ');

async function gate({ kind, params, summary, valueUsd, policy, verdict, approvalId }) {
  if (approvalId) {
    const why = consume(approvalId, params);
    if (why) return { ok: false, out: { status: 'blocked', reason: why } };
    return { ok: true, approvedBy: approvalId };
  }
  const needsHuman = policy.decision === 'needs_approval' || verdict === 'REVIEW' || verdict === 'NEEDS_APPROVAL';
  if (!needsHuman) return { ok: true };
  const reasons = [...policy.reasons, ...(verdict === 'REVIEW' ? ['simulation raised warnings'] : [])];
  const a = createApproval({ kind, params, summary, valueUsd, reasons });
  const notified = await notifyApproval(a);
  return { ok: false, out: { status: 'pending_approval', approval_id: a.id, expires_at: a.expires_at, reasons, notified_via: notified, next: `Ask the owner to approve (${howToApprove(a.id)}), then call this tool again with the same arguments and approval_id: "${a.id}". Do not retry without it.` } };
}

/** send_transaction: any call or transfer from the agent wallet. */
export async function executeTx(ctx, { chain, to, data = '0x', valueWei = 0n, approvalId }) {
  const account = assertCanExecute(chain);
  const params = { kind: 'tx', chain, to: lc(to), data: lc(data || '0x'), value: valueWei.toString() };
  const sim = await simulateTx(ctx, { chain, from: account.address, to, data, valueWei });
  if (['WILL_REVERT', 'DO_NOT_SIGN'].includes(sim.verdict)) return { status: 'blocked', reason: sim.verdict, simulation: sim };
  const summary = `${sim.method} → ${to} on ${chain}` + (sim.value_out_usd ? `, sends $${sim.value_out_usd}` : '');
  const g = await gate({ kind: 'tx', params, summary, valueUsd: sim.value_out_usd, policy: sim.policy, verdict: sim.verdict, approvalId });
  if (!g.ok) return { ...g.out, simulation: sim };
  const sent = await sendTransaction(chain, { to, data, valueWei });
  if (sim.value_out_usd) record({ valueUsd: sim.value_out_usd, memo: `tx ${sent.hash} on ${chain}` });
  return { status: 'sent', ...sent, from: account.address, asset_changes: sim.asset_changes, value_usd: sim.value_out_usd, approved_by: g.approvedBy ?? 'policy' };
}

/**
 * execute_swap: quote → build → simulate → policy → approval → send.
 * ERC-20 sells whose router allowance is short become a two-step plan: approve the EXACT amount,
 * then swap. Both steps are simulated together before anything is signed, and one human approval
 * covers both. If the swap fails after the approve was mined, the exact allowance stays in place;
 * it only covers this amount and is used by the next identical swap.
 */
export async function executeSwap(ctx, { chain, sell, buy, amount, slippageBps = 50, approvalId }) {
  const account = assertCanExecute(chain);
  const params = { kind: 'swap', chain, sell: lc(sell), buy: lc(buy), amount: String(amount), slippageBps };
  const q = await swapQuote(ctx, { chain, sell, buy, amount, slippageBps, sender: account.address });
  if (q.verdict === 'DO_NOT_SWAP' || q.simulation?.status !== 'success') {
    const sim = q.simulation;
    const reason = sim?.status === 'reverted' ? `simulation reverts: ${sim.revert_reason}${sim.hint ? ` (${sim.hint})` : ''}` : sim?.note || q.verdict;
    return { status: 'blocked', reason, plan: q.plan, quote: q };
  }
  const steps = q.plan?.length > 1 ? `approve exactly ${q.plan[0].amount} ${q.plan[0].symbol}, then swap` : 'swap';
  const g = await gate({ kind: 'swap', params, summary: `Swap ${amount} ${q.sell.symbol} → ≥${q.buy.min_out} ${q.buy.symbol} on ${chain} via ${q.route.aggregator} (${steps})`, valueUsd: q.value_in_usd, policy: q.policy, verdict: q.verdict === 'REVIEW' ? 'REVIEW' : 'OK', approvalId });
  if (!g.ok) return { ...g.out, plan: q.plan, quote: q };
  // rebuild right before sending so the route is fresh; min_out still protects the trade
  const fresh = await swapQuote(ctx, { chain, sell, buy, amount, slippageBps, sender: account.address, includeTx: true });
  const tx = fresh.simulation?.status === 'success' ? fresh.tx : null;
  if (!tx) return { status: 'blocked', reason: 'could not rebuild a route that simulates cleanly', plan: fresh.plan, quote: fresh };
  let approveSent = null;
  if (fresh.approve_tx) {
    approveSent = await sendTransaction(chain, { to: fresh.approve_tx.to, data: fresh.approve_tx.data, valueWei: 0n });
    if (approveSent.onchain_status !== 'confirmed') return { status: 'failed', step: 'approve', approve: approveSent, note: 'the exact approve did not confirm; the swap was not sent' };
  }
  const sent = await sendTransaction(chain, { to: tx.to, data: tx.data, valueWei: BigInt(tx.value) });
  if (sent.onchain_status === 'reverted') return { status: 'failed', step: 'swap', swap: sent, ...(approveSent && { approve: approveSent, note: 'the swap reverted after the exact approve was mined; that allowance only covers this amount' }) };
  record({ valueUsd: q.value_in_usd ?? 0, memo: `swap ${sent.hash} on ${chain}` });
  return { status: 'sent', ...sent, ...(approveSent && { approve: approveSent }), plan: fresh.plan, sold: q.sell, bought_min: q.buy.min_out, symbol: q.buy.symbol, approved_by: g.approvedBy ?? 'policy' };
}

/* ---------------- x402 ---------------- */
// Payment networks we can settle on (EIP-3009 USDC); execution must also be enabled for the chain.
const X402_NETWORKS = { base: 'base', 'eip155:8453': 'base', 'base-sepolia': 'base-sepolia', 'eip155:84532': 'base-sepolia' };
const USDC = { base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'base-sepolia': '0x036cbd53842c5426634e7929541ec2318f3dcf7e' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } };
const ERC20_META = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'version', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
];

async function readPaymentRequired(res) {
  const header = res.headers.get('payment-required');
  if (header) return unb64(header); // x402 v2
  return res.json().catch(() => null); // x402 v1: JSON body
}

/** x402_pay: fetch a paywalled URL, pay it in USDC if policy allows, return the content. */
export async function payX402(ctx, { url, maxUsd, approvalId, fetchImpl = fetch }) {
  const first = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (first.status !== 402) return { status: 'free', http_status: first.status, body: (await first.text()).slice(0, 4000) };
  const req = await readPaymentRequired(first);
  if (!req?.accepts?.length) return { status: 'blocked', reason: '402 response had no payment requirements' };
  const version = req.x402Version === 2 ? 2 : 1;
  const option = req.accepts.find((o) => o.scheme === 'exact' && X402_NETWORKS[o.network] && lc(o.asset) === USDC[X402_NETWORKS[o.network]]);
  if (!option) return { status: 'blocked', reason: `no supported payment option (need scheme "exact", USDC on Base or Base Sepolia); offered: ${req.accepts.map((o) => `${o.scheme}/${o.network}`).join(', ')}` };
  const chain = X402_NETWORKS[option.network];
  const account = assertCanExecute(chain);
  const client = publicClient(chain);
  const [name, ver, decimals] = await Promise.all(ERC20_META.map((f) => client.readContract({ address: option.asset, abi: ERC20_META, functionName: f.name })));
  const atomic = BigInt(option.amount ?? option.maxAmountRequired);
  const usd = Number(atomic) / 10 ** Number(decimals);
  const merchant = new URL(url).host;
  if (maxUsd != null && usd > maxUsd) return { status: 'blocked', reason: `price $${usd} is above max_usd $${maxUsd}` };
  // the merchant chooses where the money goes: check that address like any other counterparty
  let flags = [];
  try { flags = Object.entries((await ctx.addressSecurity(option.payTo)) || {}).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k.replace(/_/g, ' ')); } catch { /* reputation service down: limits still apply */ }
  const policy = ctx.evaluate({ valueUsd: usd, merchant, flagged: flags.length > 0 });
  if (policy.decision === 'deny') return { status: 'blocked', reason: 'policy denied', policy, ...(flags.length && { pay_to_flags: flags }) };
  const params = { kind: 'x402', url, payTo: lc(option.payTo), asset: lc(option.asset), amount: atomic.toString(), network: chain };
  const g = await gate({ kind: 'x402', params, summary: `Pay $${usd} USDC to ${merchant} for ${url}`, valueUsd: usd, policy, verdict: 'OK', approvalId });
  if (!g.ok) return g.out;

  // EIP-3009 TransferWithAuthorization, domain read from the token contract itself
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address, to: option.payTo, value: atomic.toString(),
    validAfter: String(now - 30), validBefore: String(now + Math.min(300, Math.max(10, Number(option.maxTimeoutSeconds) || 60))), // never sign a long-lived authorization
    nonce: '0x' + randomBytes(32).toString('hex'),
  };
  const signature = await account.signTypedData({
    domain: { name, version: ver, chainId: CHAINS[chain].id, verifyingContract: option.asset },
    types: { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
    primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: atomic, validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  const payload = { signature, authorization };
  const headers = version === 2
    ? { 'PAYMENT-SIGNATURE': b64({ x402Version: 2, resource: req.resource, accepted: option, payload }) }
    : { 'X-PAYMENT': b64({ x402Version: 1, scheme: 'exact', network: option.network, payload }) };
  const paid = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(30000) });
  const receipt = unb64(paid.headers.get('payment-response') || paid.headers.get('x-payment-response') || '');
  const ok = paid.ok && (receipt ? receipt.success !== false : true);
  if (ok) record({ valueUsd: usd, memo: `x402 ${merchant} ${receipt?.transaction || ''}`.trim() });
  return {
    status: ok ? 'paid' : 'payment_failed', http_status: paid.status, amount_usd: usd, network: chain, pay_to: option.payTo,
    receipt, approved_by: g.approvedBy ?? 'policy', content_type: paid.headers.get('content-type'), body: (await paid.text()).slice(0, 4000),
  };
}
export { NATIVE };
