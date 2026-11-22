#!/usr/bin/env node
// Mandate MCP · gives AI agents safe, policy-guarded access to on-chain value.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as data from './data.js';
import { evaluate, report, policy } from './policy.js';
import { scoreToken, simulateTx, swapQuote, parseUnits } from './onchain.js';

const server = new McpServer({ name: 'mandate-mcp', version: '0.2.0' });
const ctx = { CHAINS: data.CHAINS, rpc: data.rpc, getJSON: data.getJSON, tokenSecurity: data.tokenSecurity, addressSecurity: data.addressSecurity, evaluate };

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err?.message ?? err}` }] });
const safe = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } };

const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte hex address');
const Chain = z.enum(data.CHAIN_NAMES).default('ethereum');
const READ = { readOnlyHint: true, openWorldHint: true };

const ALIASES = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', usdc: 'usd-coin', usdt: 'tether', tao: 'bittensor', fet: 'fetch-ai', render: 'render-token', near: 'near', virtual: 'virtual-protocol', avax: 'avalanche-2', pol: 'polygon-ecosystem-token', arb: 'arbitrum', op: 'optimism', link: 'chainlink', doge: 'dogecoin' };

/* ---------------- market ---------------- */
server.registerTool('get_price', {
  title: 'Get token prices',
  description: 'Spot price in USD, 24h change, market cap and volume for one or more tokens. Accepts symbols (BTC, ETH, TAO) or CoinGecko ids.',
  inputSchema: { tokens: z.array(z.string().min(1)).min(1).max(25).describe('Symbols or CoinGecko ids, e.g. ["ETH", "bittensor"]') },
  annotations: READ,
}, safe(async ({ tokens }) => {
  const ids = await Promise.all(tokens.map(async (t) => {
    const k = t.toLowerCase();
    if (ALIASES[k]) return ALIASES[k];
    if (/^[a-z0-9-]+$/.test(k) && k.length > 5) return k;
    const hit = await data.searchCoin(t);
    return hit?.id ?? k;
  }));
  const d = await data.prices(ids);
  return tokens.map((t, i) => {
    const p = d[ids[i]];
    return p ? { token: t, id: ids[i], price_usd: p.usd, change_24h_pct: round(p.usd_24h_change), market_cap_usd: p.usd_market_cap, volume_24h_usd: p.usd_24h_vol } : { token: t, error: 'not found' };
  });
}));

server.registerTool('trending_tokens', {
  title: 'Trending tokens',
  description: 'The most searched tokens right now, with price and 24h change.',
  inputSchema: {},
  annotations: READ,
}, safe(() => data.trending()));

server.registerTool('get_gas', {
  title: 'Gas price',
  description: 'Current gas price on an EVM chain in gwei, plus the estimated USD cost of a simple transfer and a typical swap.',
  inputSchema: { chain: Chain },
  annotations: READ,
}, safe(async ({ chain }) => {
  const c = data.CHAINS[chain];
  const [gasHex, px] = await Promise.all([data.rpc(chain, 'eth_gasPrice'), data.prices([c.cg])]);
  const wei = data.hexToBig(gasHex);
  const native = px[c.cg]?.usd ?? 0;
  const cost = (units) => round(Number(wei * BigInt(units)) / 1e18 * native, 4);
  return { chain, gas_gwei: round(Number(wei) / 1e9, 4), native_usd: native, transfer_usd: cost(21000), swap_usd: cost(150000) };
}));

/* ---------------- wallets ---------------- */
server.registerTool('get_balance', {
  title: 'Wallet balance',
  description: 'Native balance of an address on an EVM chain, valued in USD.',
  inputSchema: { address: Address, chain: Chain },
  annotations: READ,
}, safe(async ({ address, chain }) => {
  const c = data.CHAINS[chain];
  const [balHex, px] = await Promise.all([data.rpc(chain, 'eth_getBalance', [address, 'latest']), data.prices([c.cg])]);
  const amount = data.formatUnits(data.hexToBig(balHex));
  const usd = px[c.cg]?.usd ?? 0;
  return { address, chain, symbol: c.symbol, balance: amount, value_usd: round(Number(amount) * usd, 2) };
}));

/* ---------------- risk ---------------- */
server.registerTool('scan_token', {
  title: 'Scan token for risk',
  description: 'Security scan of a token contract: honeypot, mint authority, hidden owner, taxes, blacklist, proxy, holder concentration and LP lock. Returns a 0-100 risk score (higher = riskier) and a plain-English verdict. Run this before any agent buys an unfamiliar token.',
  inputSchema: { address: Address, chain: Chain },
  annotations: READ,
}, safe(async ({ address, chain }) => {
  const s = await data.tokenSecurity(chain, address);
  if (!s) return { address, chain, verdict: 'unknown', note: 'No security data. Treat it as high risk.' };
  return {
    token: { name: s.token_name, symbol: s.token_symbol, address, chain, holders: Number(s.holder_count || 0), total_supply: s.total_supply },
    ...scoreToken(s),
    source: 'GoPlus Security',
  };
}));

/* ---------------- trading & pre-flight ---------------- */
server.registerTool('swap_quote', {
  title: 'Guarded swap quote',
  description: 'Best-route swap quote across DEXs (KyberSwap aggregator) with Mandate checks built in: price impact, gas share, a risk scan of the token being bought and the policy decision. Pass `sender` to also build the exact router transaction and simulate it on live chain state. Returns a verdict (OK_TO_SWAP, REVIEW, NEEDS_APPROVAL, DO_NOT_SWAP). Never signs or sends.',
  inputSchema: {
    chain: Chain,
    sell: z.string().min(1).describe('Token to sell: symbol (ETH, USDC, WETH…) or contract address'),
    buy: z.string().min(1).describe('Token to buy: symbol or contract address'),
    amount: z.string().regex(/^\d+(\.\d+)?$/, 'must be a decimal number, e.g. "0.5"').describe('Amount of `sell` in whole units, e.g. "0.25"'),
    slippage_bps: z.number().int().min(1).max(500).default(50).describe('Max slippage in basis points (50 = 0.5%)'),
    sender: Address.optional().describe('Wallet that would swap. Enables calldata build + simulation.'),
    fund_sender: z.boolean().default(false).describe('Simulate as if the sender held enough native token (what-if mode, native sells only)'),
  },
  annotations: READ,
}, safe(({ chain, sell, buy, amount, slippage_bps, sender, fund_sender }) => swapQuote(ctx, { chain, sell, buy, amount, slippageBps: slippage_bps, sender, fundSender: fund_sender })));

server.registerTool('simulate_tx', {
  title: 'Simulate a transaction before signing',
  description: 'Dry-runs any EVM transaction against live chain state and reports exactly what it would do: assets leaving and entering the sender wallet with USD values, approvals granted (flags unlimited and wallet-to-wallet approvals), NFTs leaving, revert reason, gas cost, counterparty reputation and the policy decision. Returns SAFE_TO_SIGN, REVIEW, NEEDS_APPROVAL, DO_NOT_SIGN or WILL_REVERT. Agents should call this before signing anything they did not construct themselves.',
  inputSchema: {
    chain: Chain,
    from: Address.describe('Sender (the agent wallet)'),
    to: Address.describe('Destination contract or wallet'),
    data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/, 'must be 0x-prefixed hex calldata').default('0x').describe('Calldata, "0x" for a plain transfer'),
    value: z.string().regex(/^\d+(\.\d+)?$/, 'must be a decimal number').default('0').describe('Native token value in whole units, e.g. "0.01" ETH'),
    fund_sender: z.boolean().default(false).describe('Give the sender hypothetical native balance for the simulation (what-if mode)'),
  },
  annotations: READ,
}, safe(({ chain, from, to, data: calldata, value, fund_sender }) => simulateTx(ctx, { chain, from, to, data: calldata, valueWei: parseUnits(value, 18), fundSender: fund_sender })));

server.registerTool('check_address', {
  title: 'Check address reputation',
  description: 'Checks whether an address is linked to phishing, drainers, sanctions, mixers or other malicious activity. Run this before sending funds anywhere.',
  inputSchema: { address: Address },
  annotations: READ,
}, safe(async ({ address }) => {
  const r = await data.addressSecurity(address);
  if (!r) return { address, flagged: false, note: 'no data' };
  const bad = Object.entries(r).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k.replace(/_/g, ' '));
  return { address, flagged: bad.length > 0, flags: bad, source: 'GoPlus Security' };
}));

/* ---------------- payments & policy ---------------- */
server.registerTool('policy_check', {
  title: 'Check a spend against policy',
  description: 'Asks the Mandate policy engine whether a proposed payment or transaction is allowed. Returns allow, needs_approval or deny with reasons. Agents MUST call this before moving funds and must respect the decision.',
  inputSchema: {
    value_usd: z.number().nonnegative().describe('USD value of the proposed spend'),
    recipient: Address.optional().describe('Recipient address, if any. Its reputation is checked automatically.'),
    merchant: z.string().optional().describe('Merchant / domain / protocol name, e.g. "uniswap" or "api.example.com"'),
  },
  annotations: READ,
}, safe(async ({ value_usd, recipient, merchant }) => {
  let flagged = false, flags = [];
  if (recipient) {
    try {
      const r = await data.addressSecurity(recipient);
      flags = Object.entries(r || {}).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k);
      flagged = flags.length > 0;
    } catch { /* reputation service down: fall through to limits */ }
  }
  return { ...evaluate({ valueUsd: value_usd, recipient, merchant, flagged }), recipient_flags: flags };
}));

server.registerTool('x402_quote', {
  title: 'Quote an x402 paywalled resource',
  description: 'Requests a URL and, if it answers HTTP 402 Payment Required (x402 protocol), returns the price, asset, network and pay-to address, plus the policy decision for paying it. Does not pay.',
  inputSchema: { url: z.string().url() },
  annotations: READ,
}, safe(async ({ url }) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (res.status !== 402) return { url, status: res.status, paywalled: false };
  const body = await res.json().catch(() => ({}));
  const opts = (body.accepts || []).map((a) => {
    // USDC-style assets use 6 decimals; amounts arrive in atomic units
    const amount = Number(a.maxAmountRequired ?? a.amount ?? 0) / 1e6;
    return { scheme: a.scheme, network: a.network, asset: a.asset, pay_to: a.payTo, amount_usd: amount, description: a.description };
  });
  const cheapest = opts.sort((a, b) => a.amount_usd - b.amount_usd)[0];
  const merchant = new URL(url).host;
  return { url, status: 402, paywalled: true, x402_version: body.x402Version, options: opts, policy: cheapest ? evaluate({ valueUsd: cheapest.amount_usd, merchant }) : null };
}));

server.registerTool('spending_report', {
  title: 'Agent spending report',
  description: 'What the agent has spent today, the remaining budget and the active policy limits.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, safe(() => report()));

/* ---------------- resources ---------------- */
server.registerResource('policy', 'mandate://policy', { title: 'Active spending policy', mimeType: 'application/json' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(policy, null, 2) }] }));

function round(v, d = 2) { return v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d; }

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mandate-mcp] ready · tools: get_price, trending_tokens, get_gas, get_balance, scan_token, check_address, swap_quote, simulate_tx, policy_check, x402_quote, spending_report');
