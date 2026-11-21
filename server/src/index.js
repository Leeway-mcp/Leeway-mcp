#!/usr/bin/env node
// Mandate MCP · gives AI agents safe, policy-guarded access to on-chain value.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as data from './data.js';
import { evaluate, report, policy } from './policy.js';

const server = new McpServer({ name: 'mandate-mcp', version: '0.1.0' });

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
  const flags = [];
  let score = 0;
  const hit = (cond, pts, msg) => { if (cond) { score += pts; flags.push(msg); } };
  const yes = (v) => v === '1';
  hit(yes(s.is_honeypot), 60, 'honeypot: tokens cannot be sold');
  hit(yes(s.cannot_sell_all), 25, 'cannot sell entire balance');
  hit(yes(s.is_mintable), 15, 'owner can mint new supply');
  hit(yes(s.hidden_owner), 15, 'hidden owner');
  hit(yes(s.owner_change_balance), 25, 'owner can modify balances');
  hit(yes(s.selfdestruct), 15, 'contract can self-destruct');
  hit(yes(s.is_blacklisted), 10, 'has blacklist function');
  hit(yes(s.transfer_pausable), 10, 'transfers can be paused');
  hit(yes(s.is_proxy), 8, 'upgradeable proxy');
  hit(s.is_open_source === '0', 20, 'contract source not verified');
  const buyTax = Number(s.buy_tax || 0) * 100, sellTax = Number(s.sell_tax || 0) * 100;
  hit(sellTax > 10 || buyTax > 10, 15, `high tax (buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%)`);
  const top10 = (s.holders || []).slice(0, 10).reduce((a, h) => a + Number(h.percent || 0), 0) * 100;
  hit(top10 > 60, 12, `top 10 holders own ${top10.toFixed(1)}%`);
  const lpLocked = (s.lp_holders || []).reduce((a, h) => a + (h.is_locked ? Number(h.percent || 0) : 0), 0) * 100;
  hit((s.lp_holders || []).length && lpLocked < 50, 10, `only ${lpLocked.toFixed(0)}% of LP locked`);
  score = Math.min(100, score);
  const verdict = score >= 60 ? 'DANGEROUS: do not buy' : score >= 30 ? 'CAUTION: elevated risk' : 'No major red flags found';
  return {
    token: { name: s.token_name, symbol: s.token_symbol, address, chain, holders: Number(s.holder_count || 0), total_supply: s.total_supply },
    risk_score: score, verdict, flags,
    taxes: { buy_pct: round(buyTax, 2), sell_pct: round(sellTax, 2) },
    top10_holders_pct: round(top10, 2), lp_locked_pct: round(lpLocked, 1),
    source: 'GoPlus Security',
  };
}));

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
console.error('[mandate-mcp] ready · tools: get_price, trending_tokens, get_gas, get_balance, scan_token, check_address, policy_check, x402_quote, spending_report');
