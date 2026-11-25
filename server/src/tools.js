// Tool registry. createServer() builds a fresh MCP server; stdio uses one, HTTP mode one per request.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as data from './data.js';
import { evaluate, report, policy } from './policy.js';
import { scoreToken, simulateTx, swapQuote, parseUnits } from './onchain.js';
import { loadAccount, execution } from './wallet.js';
import { executeTx, executeSwap, payX402 } from './execute.js';
import { getApproval, listApprovals } from './approvals.js';
import { telegramEnabled } from './telegram.js';
import { equityQuote, parityCheck, marketStatus, TICKER_RE } from './equities.js';

export const ctx = { CHAINS: data.CHAINS, rpc: data.rpc, getJSON: data.getJSON, tokenSecurity: data.tokenSecurity, addressSecurity: data.addressSecurity, evaluate };


const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err?.message ?? err}` }] });
const safe = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } };

const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte hex address');
const Chain = z.enum(data.CHAIN_NAMES).default('ethereum');
const READ = { readOnlyHint: true, openWorldHint: true };

const ALIASES = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', usdc: 'usd-coin', usdt: 'tether', tao: 'bittensor', fet: 'fetch-ai', render: 'render-token', near: 'near', virtual: 'virtual-protocol', avax: 'avalanche-2', pol: 'polygon-ecosystem-token', arb: 'arbitrum', op: 'optimism', link: 'chainlink', doge: 'dogecoin' };

export function createServer() {
  const server = new McpServer({ name: 'leeway-mcp', version: '0.4.0' });
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
    description: 'Best-route swap quote across DEXs (KyberSwap aggregator) with Leeway checks built in: price impact, gas share, a risk scan of the token being bought and the policy decision. Pass `sender` to also build the exact router transaction and simulate it on live chain state. Returns a verdict (OK_TO_SWAP, REVIEW, NEEDS_APPROVAL, DO_NOT_SWAP). Never signs or sends.',
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
    description: 'Asks the Leeway policy engine whether a proposed payment or transaction is allowed. Returns allow, needs_approval or deny with reasons. Agents MUST call this before moving funds and must respect the decision.',
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
  server.registerResource('policy', 'leeway://policy', { title: 'Active spending policy', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(policy, null, 2) }] }));

  registerEquityTools(server);
  registerExecutionTools(server);
  return server;
}

/* ---------------- execution (phase 3): the only tools that can move funds ---------------- */
const WRITE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
const ExecChain = z.enum(data.CHAIN_NAMES).default('base-sepolia');
const ApprovalId = z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('Id of an approval the owner granted for exactly these arguments');
const Decimal = z.string().regex(/^\d+(\.\d+)?$/, 'must be a decimal number');

/* ---------------- Equity Rails (phase 4, read-only) ---------------- */
const Ticker = z.string().regex(TICKER_RE, 'must be a stock ticker, e.g. "TSLA"').describe('US stock or ETF ticker, e.g. TSLA, AAPL, NVDA, SPY');

function registerEquityTools(server) {
  server.registerTool('get_equity_quote', {
    title: 'Stock quote + tokenized versions',
    description: 'Reference exchange price for a US stock or ETF (Yahoo Finance, Nasdaq fallback) with previous close, change and market session, plus the on-chain price and premium of each verified tokenized version (xStocks, Ondo Global Markets) with contract addresses.',
    inputSchema: { ticker: Ticker },
    annotations: READ,
  }, safe(({ ticker }) => equityQuote({ ticker })));

  server.registerTool('parity_check', {
    title: 'Parity Guard',
    description: 'Premium or discount of each tokenized version of a stock against the real exchange price. ABOVE_BAND means an agent must not buy (it would pay more than the share is worth); BELOW_BAND flags a possible depeg or stale price. Run this before buying any tokenized stock.',
    inputSchema: {
      ticker: Ticker,
      band_pct: z.number().positive().max(10).optional().describe('Allowed premium in percent (default LEEWAY_EQ_PARITY_BAND_PCT or 0.5)'),
    },
    annotations: READ,
  }, safe(({ ticker, band_pct }) => parityCheck({ ticker, bandPct: band_pct })));

  server.registerTool('market_hours', {
    title: 'US market hours',
    description: 'Whether the NYSE / Nasdaq regular session is open right now, the current session (pre-market, regular, after-hours, closed), when it closes or next opens (UTC and New York time), and the next holidays and 13:00 ET early closes.',
    inputSchema: { market: z.enum(['XNYS', 'XNAS']).default('XNYS').describe('XNYS (NYSE) or XNAS (Nasdaq): same calendar') },
    annotations: { readOnlyHint: true },
  }, safe(({ market }) => ({ ...marketStatus(), market })));
}

function registerExecutionTools(server) {
  server.registerTool('wallet_info', {
    title: 'Agent wallet',
    description: 'The agent wallet address, where it is allowed to execute, its native balance there, and whether Telegram approvals are configured. Never returns key material.',
    inputSchema: {},
    annotations: READ,
  }, safe(async () => {
    const a = loadAccount();
    if (!a) return { configured: false, next: 'Owner: run `npx leeway-mcp init-wallet`, then fund the printed address with a small amount (start on Base Sepolia).' };
    const balances = await Promise.all(execution.chains.map(async (c) => {
      try { return { chain: c, testnet: Boolean(data.CHAINS[c].testnet), balance: data.formatUnits(BigInt(await data.rpc(c, 'eth_getBalance', [a.address, 'latest']))), symbol: data.CHAINS[c].symbol }; }
      catch (e) { return { chain: c, error: e.message }; }
    }));
    return { configured: true, address: a.address, key_source: a.keySource, execution_enabled: execution.enabled, execution_chains: execution.chains, balances, approvals: telegramEnabled ? 'telegram + cli' : 'cli / admin endpoint (set LEEWAY_TELEGRAM_BOT_TOKEN and LEEWAY_TELEGRAM_CHAT_ID for Telegram)' };
  }));

  server.registerTool('send_transaction', {
    title: 'Send a transaction (policy-gated)',
    description: 'Sends a transaction from the agent wallet. It is simulated first and blocked if it would revert or looks malicious; then the policy engine decides. If a human must approve, this returns status "pending_approval" with an approval_id: wait for the owner, then call again with the SAME arguments plus approval_id. Only runs on chains the owner enabled (default: base-sepolia).',
    inputSchema: {
      chain: ExecChain,
      to: Address.describe('Recipient wallet or contract'),
      value: Decimal.default('0').describe('Native token amount in whole units, e.g. "0.001"'),
      data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/, 'must be 0x-prefixed hex').default('0x').describe('Calldata, "0x" for a plain transfer'),
      approval_id: ApprovalId,
    },
    annotations: WRITE,
  }, safe(({ chain, to, value, data: calldata, approval_id }) => executeTx(ctx, { chain, to, data: calldata, valueWei: parseUnits(value, 18), approvalId: approval_id })));

  server.registerTool('execute_swap', {
    title: 'Execute a swap (policy-gated)',
    description: 'Swaps at the best DEX route from the agent wallet, after the same checks as swap_quote plus a simulation. Selling an ERC-20 whose router allowance is short becomes a two-step plan: approve the EXACT amount (never unlimited), then swap; both steps are simulated together before signing and one approval covers both. Approval flow works like send_transaction.',
    inputSchema: {
      chain: ExecChain,
      sell: z.string().min(1).describe('Token to sell: native symbol (ETH), curated symbol (USDC) or contract address'),
      buy: z.string().min(1).describe('Token to buy: symbol or contract address'),
      amount: Decimal.describe('Amount to sell in whole units'),
      slippage_bps: z.number().int().min(1).max(300).default(50),
      approval_id: ApprovalId,
    },
    annotations: WRITE,
  }, safe(({ chain, sell, buy, amount, slippage_bps, approval_id }) => executeSwap(ctx, { chain, sell, buy, amount, slippageBps: slippage_bps, approvalId: approval_id })));

  server.registerTool('x402_pay', {
    title: 'Pay for an x402 resource',
    description: 'Fetches a URL; if it answers HTTP 402 (x402 v1 or v2), pays it in USDC on Base / Base Sepolia with an EIP-3009 signed authorization, within policy, and returns the paid content and settlement receipt. Small payments inside the micro-allowance go through automatically; larger ones return pending_approval.',
    inputSchema: {
      url: z.string().url(),
      max_usd: z.number().positive().max(1000).optional().describe('Refuse if the price is above this'),
      approval_id: ApprovalId,
    },
    annotations: WRITE,
  }, safe(({ url, max_usd, approval_id }) => payX402(ctx, { url, maxUsd: max_usd, approvalId: approval_id })));

  server.registerTool('approval_status', {
    title: 'Approval status',
    description: 'Status of an approval request: pending, approved, denied or expired. Agents cannot approve; only the owner can (Telegram, CLI or admin endpoint).',
    inputSchema: { approval_id: z.string().regex(/^[0-9A-Fa-f]{6}$/) },
    annotations: { readOnlyHint: true },
  }, safe(({ approval_id }) => getApproval(approval_id) ?? { error: `no approval with id ${approval_id}` }));

  server.registerTool('list_approvals', {
    title: 'Recent approvals',
    description: 'The 20 most recent approval requests and their status.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, safe(() => listApprovals()));
}

function round(v, d = 2) { return v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d; }
