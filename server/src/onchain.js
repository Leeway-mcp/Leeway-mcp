// Mandate guard core: swap quotes, transaction simulation and token risk scoring.
// Isomorphic on purpose: no Node imports, only fetch. The landing-page playground runs a
// byte-for-byte copy of this file (see `npm run sync-site`), so the browser demo and the
// MCP server make the same decisions.
//
// Every function takes a `ctx` with the data layer it needs:
//   { CHAINS, rpc(chain, method, params), getJSON(url, init), tokenSecurity(chain, addr),
//     addressSecurity(addr), evaluate({ valueUsd, recipient, merchant, flagged }) }

export const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const KYBER_SLUG = { ethereum: 'ethereum', base: 'base', arbitrum: 'arbitrum', optimism: 'optimism', polygon: 'polygon', bsc: 'bsc', avalanche: 'avalanche' };
const CG_PLATFORM = { ethereum: 'ethereum', base: 'base', arbitrum: 'arbitrum-one', optimism: 'optimistic-ethereum', polygon: 'polygon-pos', bsc: 'binance-smart-chain', avalanche: 'avalanche' };
const LLAMA_CHAIN = { ethereum: 'ethereum', base: 'base', arbitrum: 'arbitrum', optimism: 'optimism', polygon: 'polygon', bsc: 'bsc', avalanche: 'avax' };
const KYBER_HEADERS = { 'x-client-id': 'mandate-mcp' };

// Curated, well-known tokens: [address, decimals]. Anything else must be passed by address
// and is risk-scanned before the agent is allowed to buy it.
export const TOKENS = {
  ethereum: { USDC: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6], USDT: ['0xdAC17F958D2ee523a2206206994597C13D831ec7', 6], DAI: ['0x6B175474E89094C44Da98b954EedeAC495271d0F', 18], WETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18], WBTC: ['0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 8], LINK: ['0x514910771AF9Ca656af840dff83E8264EcF986CA', 18], UNI: ['0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18] },
  base: { USDC: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6], WETH: ['0x4200000000000000000000000000000000000006', 18], CBBTC: ['0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', 8], DAI: ['0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 18], AERO: ['0x940181a94A35A4569E4529A3CDfB74e38FD98631', 18] },
  arbitrum: { USDC: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 6], USDT: ['0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 6], WETH: ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 18], ARB: ['0x912CE59144191C1204E64559FE8253a0e49E6548', 18], WBTC: ['0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', 8] },
  optimism: { USDC: ['0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 6], USDT: ['0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', 6], WETH: ['0x4200000000000000000000000000000000000006', 18], OP: ['0x4200000000000000000000000000000000000042', 18] },
  polygon: { USDC: ['0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 6], USDT: ['0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 6], WETH: ['0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', 18], WPOL: ['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 18] },
  bsc: { USDT: ['0x55d398326f99059fF775485246999027B3197955', 18], USDC: ['0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 18], WBNB: ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18] },
  avalanche: { USDC: ['0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', 6], USDT: ['0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', 6], WAVAX: ['0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', 18] },
};

// Function selectors an agent is likely to be asked to sign.
const SELECTORS = {
  '0xa9059cbb': 'transfer(address,uint256)', '0x095ea7b3': 'approve(address,uint256)', '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x39509351': 'increaseAllowance(address,uint256)', '0xa22cb465': 'setApprovalForAll(address,bool)', '0xd505accf': 'permit(...)',
  '0xd0e30db0': 'deposit()', '0x2e1a7d4d': 'withdraw(uint256)', '0xac9650d8': 'multicall(bytes[])', '0x5ae401dc': 'multicall(uint256,bytes[])',
  '0x3593564c': 'execute(bytes,bytes[],uint256) · Uniswap Universal Router', '0xe21fd0e9': 'swap(...) · KyberSwap router',
  '0x12aa3caf': 'swap(...) · 1inch router', '0x42842e0e': 'safeTransferFrom(address,address,uint256)', '0x617ba037': 'supply(...) · Aave v3',
};

const T_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const T_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const T_APPROVAL_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';
const UNLIMITED = 2n ** 255n;

/* ---------------- units ---------------- */
export function parseUnits(amount, decimals) {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`amount "${amount}" must be a positive decimal number, e.g. "0.5"`);
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) throw new Error(`amount has more than ${decimals} decimals`);
  return BigInt(i + f.padEnd(decimals, '0'));
}
export function formatUnits(v, decimals = 18, maxFrac = 6) {
  const neg = v < 0n; if (neg) v = -v;
  const s = v.toString().padStart(decimals + 1, '0');
  const i = s.slice(0, s.length - decimals), f = s.slice(s.length - decimals).slice(0, maxFrac).replace(/0+$/, '');
  return (neg ? '-' : '') + (f ? `${i}.${f}` : i);
}
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const lc = (a) => String(a).toLowerCase();
const topicAddr = (t) => '0x' + t.slice(26).toLowerCase();

/* ---------------- tokens ---------------- */
function decodeString(hex) {
  if (!hex || hex === '0x') return null;
  const h = hex.slice(2);
  try {
    if (h.length >= 192) { // dynamic ABI string
      const len = parseInt(h.slice(64, 128), 16);
      return decodeHexUtf8(h.slice(128, 128 + len * 2));
    }
    return decodeHexUtf8(h.replace(/(00)+$/, '')); // bytes32 (old tokens like MKR)
  } catch { return null; }
}
function decodeHexUtf8(h) {
  const bytes = new Uint8Array(h.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  return new TextDecoder().decode(bytes).replace(/\0/g, '').trim() || null;
}

export async function tokenMeta(ctx, chain, address) {
  if (lc(address) === NATIVE) return { address: NATIVE, symbol: ctx.CHAINS[chain].symbol, decimals: 18, native: true, curated: true };
  const curated = Object.entries(TOKENS[chain] || {}).find(([, [a]]) => lc(a) === lc(address));
  if (curated) return { address: curated[1][0], symbol: curated[0], decimals: curated[1][1], curated: true };
  const call = (data) => ctx.rpc(chain, 'eth_call', [{ to: address, data }, 'latest']).catch(() => null);
  const [sym, dec] = await Promise.all([call('0x95d89b41'), call('0x313ce567')]);
  if (!dec || dec === '0x') throw new Error(`${address} on ${chain} is not an ERC-20 token (no decimals())`);
  return { address, symbol: decodeString(sym) || '???', decimals: Number(BigInt(dec)), curated: false };
}

export async function resolveToken(ctx, chain, input) {
  const s = String(input || '').trim();
  if (ADDRESS_RE.test(s)) return tokenMeta(ctx, chain, s);
  const sym = s.toUpperCase();
  const c = ctx.CHAINS[chain];
  if (sym === c.symbol || (chain === 'polygon' && sym === 'MATIC')) return tokenMeta(ctx, chain, NATIVE);
  const hit = TOKENS[chain]?.[sym];
  if (hit) return { address: hit[0], symbol: sym, decimals: hit[1], curated: true };
  const known = [c.symbol, ...Object.keys(TOKENS[chain] || {})].join(', ');
  throw new Error(`unknown token "${s}" on ${chain}. Use a contract address, or one of: ${known}`);
}

// USD prices: DefiLlama first (keyless, generous limits), CoinGecko as fallback, 60 s cache.
const priceCache = new Map();
async function usdPrices(ctx, chain, addresses) {
  const c = ctx.CHAINS[chain];
  const now = Date.now();
  const out = {}, missing = [];
  for (const a of new Set(addresses.map(lc))) {
    const hit = priceCache.get(`${chain}:${a}`);
    if (hit && now - hit.at < 60_000) out[a] = hit.usd; else missing.push(a);
  }
  if (missing.length) {
    const key = (a) => (a === NATIVE ? `coingecko:${c.cg}` : `${LLAMA_CHAIN[chain]}:${a}`);
    try {
      const d = await ctx.getJSON(`https://coins.llama.fi/prices/current/${missing.map(key).join(',')}`);
      for (const a of missing) { const p = d.coins?.[key(a)]?.price; if (p != null) out[a] = p; }
    } catch { /* fall through to CoinGecko */ }
    const left = missing.filter((a) => out[a] == null);
    const erc = left.filter((a) => a !== NATIVE);
    await Promise.all([
      left.includes(NATIVE) && ctx.getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${c.cg}&vs_currencies=usd`)
        .then((d) => { if (d[c.cg]?.usd != null) out[NATIVE] = d[c.cg].usd; }).catch(() => {}),
      erc.length && ctx.getJSON(`https://api.coingecko.com/api/v3/simple/token_price/${CG_PLATFORM[chain]}?contract_addresses=${erc.join(',')}&vs_currencies=usd`)
        .then((d) => { for (const [k, v] of Object.entries(d)) if (v.usd != null) out[lc(k)] = v.usd; }).catch(() => {}),
    ]);
    for (const a of missing) if (out[a] != null) priceCache.set(`${chain}:${a}`, { usd: out[a], at: now });
  }
  return out;
}

/* ---------------- risk scoring (shared by scan_token and swap_quote) ---------------- */
export function scoreToken(s) {
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
  return { risk_score: score, verdict, flags, taxes: { buy_pct: round(buyTax), sell_pct: round(sellTax) }, top10_holders_pct: round(top10), lp_locked_pct: round(lpLocked, 1) };
}

async function flaggedAddresses(ctx, addrs) {
  const out = {};
  await Promise.all([...new Set(addrs.map(lc))].slice(0, 5).map(async (a) => {
    try {
      const r = await ctx.addressSecurity(a);
      const bad = Object.entries(r || {}).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k.replace(/_/g, ' '));
      if (bad.length) out[a] = bad;
    } catch { /* reputation service unavailable: other checks still apply */ }
  }));
  return out;
}

/* ---------------- simulate_tx ---------------- */
/**
 * Dry-runs a transaction against live chain state (eth_simulateV1 with transfer tracing) and
 * reports what would actually happen to the sender: assets out/in, approvals granted, revert
 * reason, gas, counterparty reputation and the policy decision. Never signs or broadcasts.
 */
export async function simulateTx(ctx, { chain, from, to, data = '0x', valueWei = 0n, fundSender = false, merchant = '' }) {
  const c = ctx.CHAINS[chain];
  if (!c) throw new Error(`unsupported chain "${chain}"`);
  from = lc(from); to = lc(to);
  data = data && data !== '' ? data : '0x';
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new Error('data must be 0x-prefixed hex');
  const call = { from, to, data, value: '0x' + valueWei.toString(16) };
  const overrides = fundSender ? { [from]: { balance: '0x' + (valueWei + 10n ** 20n).toString(16) } } : undefined;

  const [sim, code, gasPriceHex] = await Promise.all([
    ctx.rpc(chain, 'eth_simulateV1', [{ blockStateCalls: [{ ...(overrides && { stateOverrides: overrides }), calls: [call] }], traceTransfers: true, validation: false }, 'latest'])
      .then((r) => ({ ok: true, block: r[0], res: r[0].calls[0] }))
      .catch((e) => ({ ok: false, err: e })),
    ctx.rpc(chain, 'eth_getCode', [to, 'latest']).catch(() => null),
    ctx.rpc(chain, 'eth_gasPrice').catch(() => '0x0'),
  ]);

  let status, revert = null, gasUsed = 0n, logs = [], method = 'eth_simulateV1', block = null;
  if (sim.ok) {
    status = sim.res.status === '0x1' ? 'success' : 'reverted';
    revert = sim.res.error ? cleanRevert(sim.res.error.message) : null;
    gasUsed = BigInt(sim.res.gasUsed || 0);
    logs = sim.res.logs || [];
    block = sim.block?.number ? Number(BigInt(sim.block.number)) : null;
  } else { // older nodes: plain eth_call + estimateGas, no asset tracing
    method = 'eth_call';
    const args = overrides ? [call, 'latest', overrides] : [call, 'latest'];
    try {
      await ctx.rpc(chain, 'eth_call', args);
      status = 'success';
      gasUsed = BigInt(await ctx.rpc(chain, 'eth_estimateGas', args).catch(() => '0x0'));
    } catch (e) { status = 'reverted'; revert = cleanRevert(e.message); }
  }

  // what happens to the sender
  const delta = new Map(); // token -> bigint
  const approvals = [], nfts = [], recipients = new Set();
  for (const l of logs) {
    const t0 = l.topics?.[0];
    const token = lc(l.address);
    if (t0 === T_TRANSFER && l.topics.length === 3) {
      const a = topicAddr(l.topics[1]), b = topicAddr(l.topics[2]), amt = BigInt(l.data === '0x' ? 0 : l.data);
      if (a === from) { delta.set(token, (delta.get(token) ?? 0n) - amt); recipients.add(b); }
      if (b === from) delta.set(token, (delta.get(token) ?? 0n) + amt);
    } else if (t0 === T_TRANSFER && l.topics.length === 4 && topicAddr(l.topics[1]) === from) {
      nfts.push({ collection: token, token_id: BigInt(l.topics[3]).toString(), to: topicAddr(l.topics[2]) });
    } else if (t0 === T_APPROVAL && l.topics.length === 3 && topicAddr(l.topics[1]) === from) {
      approvals.push({ token, spender: topicAddr(l.topics[2]), raw: BigInt(l.data === '0x' ? 0 : l.data) });
    } else if (t0 === T_APPROVAL_ALL && topicAddr(l.topics[1]) === from && BigInt(l.data) === 1n) {
      approvals.push({ token, spender: topicAddr(l.topics[2]), all: true });
    }
  }
  const tokens = [...new Set([...delta.keys(), ...approvals.filter((a) => !a.all).map((a) => a.token)])];
  const [metas, px, spenderCode, flagged] = await Promise.all([
    Promise.all(tokens.map((t) => tokenMeta(ctx, chain, t).catch(() => ({ address: t, symbol: '???', decimals: 18 })))),
    usdPrices(ctx, chain, [...new Set([...delta.keys(), NATIVE])]),
    Promise.all(approvals.map((a) => ctx.rpc(chain, 'eth_getCode', [a.spender, 'latest']).catch(() => null))),
    flaggedAddresses(ctx, [to, ...approvals.map((a) => a.spender), ...recipients]),
  ]);
  const meta = Object.fromEntries(metas.map((m) => [lc(m.address), m]));

  const warnings = [];
  const warn = (severity, message) => warnings.push({ severity, message });
  const changes = [...delta.entries()].filter(([, v]) => v !== 0n).map(([t, v]) => {
    const m = meta[t] ?? { symbol: '???', decimals: 18 };
    const amount = formatUnits(v < 0n ? -v : v, m.decimals);
    const usd = px[t] != null ? round(Number(amount) * px[t]) : null;
    if (v < 0n && usd == null) warn('medium', `could not price outgoing ${m.symbol}; policy value may be understated`);
    return { direction: v < 0n ? 'out' : 'in', symbol: m.symbol, token: t === NATIVE ? 'native' : t, amount, value_usd: usd };
  });
  const outUsd = changes.filter((x) => x.direction === 'out').reduce((a, x) => a + (x.value_usd ?? 0), 0);
  const inUsd = changes.filter((x) => x.direction === 'in').reduce((a, x) => a + (x.value_usd ?? 0), 0);

  const approvalsOut = approvals.map((a, i) => {
    const isEoa = !spenderCode[i] || spenderCode[i] === '0x';
    if (a.all) {
      warn('high', `setApprovalForAll gives ${short(a.spender)} control of every NFT in collection ${short(a.token)}`);
      return { type: 'all_nfts', collection: a.token, operator: a.spender };
    }
    const m = meta[a.token] ?? { symbol: '???', decimals: 18 };
    const unlimited = a.raw >= UNLIMITED;
    if (unlimited) warn(isEoa ? 'high' : 'medium', `unlimited ${m.symbol} approval to ${isEoa ? 'a wallet (not a contract)' : 'contract'} ${short(a.spender)}`);
    else if (isEoa && a.raw > 0n) warn('high', `${m.symbol} approval to a wallet (not a contract) ${short(a.spender)}: a classic drainer pattern`);
    return { type: 'erc20', symbol: m.symbol, token: a.token, spender: a.spender, amount: unlimited ? 'unlimited' : formatUnits(a.raw, m.decimals), spender_is_contract: !isEoa };
  });
  for (const n of nfts) warn('medium', `NFT #${n.token_id} from ${short(n.collection)} leaves the wallet`);
  for (const [a, f] of Object.entries(flagged)) warn('high', `${short(a)} is flagged: ${f.join(', ')}`);
  if (data !== '0x' && (!code || code === '0x')) warn('medium', `calling function data on ${short(to)}, which has no contract code`);
  if (status === 'reverted') warn('high', `transaction would revert${revert ? `: ${revert}` : ''}; it would only burn gas`);
  if (method !== 'eth_simulateV1') warn('medium', 'node does not support eth_simulateV1: asset changes were not traced');

  const gasUsd = round(Number(gasUsed * BigInt(gasPriceHex || 0)) / 1e18 * (px[NATIVE] ?? 0), 4);
  let policy = ctx.evaluate({ valueUsd: round(outUsd) ?? 0, recipient: merchant ? '' : to, merchant, flagged: Object.keys(flagged).length > 0 });
  // fail closed: value that cannot be priced is never waved through as a micro-payment
  if (changes.some((x) => x.direction === 'out' && x.value_usd == null) && policy.decision === 'allow') {
    policy = { ...policy, decision: 'needs_approval', reasons: [...policy.reasons, 'outgoing value could not be priced'] };
  }

  const high = warnings.some((w) => w.severity === 'high');
  const verdict = status === 'reverted' ? 'WILL_REVERT'
    : high || policy.decision === 'deny' ? 'DO_NOT_SIGN'
    : policy.decision === 'needs_approval' ? 'NEEDS_APPROVAL'
    : warnings.length ? 'REVIEW' : 'SAFE_TO_SIGN';

  const selector = data.slice(0, 10);
  return {
    verdict, status, ...(revert && { revert_reason: revert }),
    chain, block, from, to, method: data === '0x' ? 'native transfer' : SELECTORS[selector] ?? `unknown (${selector})`,
    asset_changes: changes, approvals: approvalsOut, ...(nfts.length && { nfts_out: nfts }),
    value_out_usd: round(outUsd), value_in_usd: round(inUsd),
    gas: { used: Number(gasUsed), cost_usd: gasUsd },
    warnings, policy,
    simulated_with: fundSender ? `${method}, sender balance overridden (hypothetical funds)` : `${method} on live state`,
    note: 'Simulation only. Nothing was signed or broadcast.',
  };
}
function cleanRevert(msg = '') {
  const m = String(msg).replace(/^RPC error:\s*/, '').replace(/^execution reverted:?\s*/i, '').trim();
  return m || 'reverted without a reason';
}
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/* ---------------- swap_quote ---------------- */
/**
 * Best-route swap quote from the KyberSwap aggregator, wrapped in Mandate's checks: price
 * impact, gas share, risk scan of the token being bought and the policy decision. With a
 * `sender` it also builds the exact router calldata and simulates it.
 */
export async function swapQuote(ctx, { chain, sell, buy, amount, slippageBps = 50, sender, fundSender = false }) {
  const slug = KYBER_SLUG[chain];
  if (!slug) throw new Error(`swaps are not supported on "${chain}"`);
  const [tin, tout] = await Promise.all([resolveToken(ctx, chain, sell), resolveToken(ctx, chain, buy)]);
  if (lc(tin.address) === lc(tout.address)) throw new Error('sell and buy tokens are the same');
  const amountIn = parseUnits(amount, tin.decimals);
  if (amountIn === 0n) throw new Error('amount must be greater than zero');

  const base = `https://aggregator-api.kyberswap.com/${slug}/api/v1`;
  const [q, riskRaw] = await Promise.all([
    ctx.getJSON(`${base}/routes?tokenIn=${tin.address}&tokenOut=${tout.address}&amountIn=${amountIn}&gasInclude=true`, { headers: KYBER_HEADERS }),
    tout.curated ? null : ctx.tokenSecurity(chain, tout.address).catch(() => undefined),
  ]);
  const r = q?.data?.routeSummary;
  if (q?.code !== 0 || !r) throw new Error(`no swap route found (${q?.message ?? 'aggregator error'})`);

  const out = BigInt(r.amountOut);
  const minOut = (out * BigInt(10000 - slippageBps)) / 10000n;
  const inUsd = Number(r.amountInUsd), outUsd = Number(r.amountOutUsd), gasUsd = Number(r.gasUsd);
  const impact = inUsd > 0 && outUsd > 0 ? (1 - outUsd / inUsd) * 100 : null;
  const exchanges = [...new Set(r.route.flat().map((s) => s.exchange))];
  const outAmount = formatUnits(out, tout.decimals);

  const checks = [];
  const check = (name, status, detail) => checks.push({ check: name, status, detail });
  if (impact == null) check('price_impact', 'warn', 'could not price one side of the trade');
  else check('price_impact', impact < 1 ? 'pass' : impact < 5 ? 'warn' : 'fail', `${round(impact, 3)}% (${impact < 1 ? 'healthy' : impact < 5 ? 'thin liquidity' : 'too costly'})`);
  const gasShare = inUsd > 0 ? (gasUsd / inUsd) * 100 : 0;
  check('gas_share', gasShare < 5 ? 'pass' : 'warn', `gas is ${round(gasShare, 2)}% of trade size ($${round(gasUsd, 4)})`);
  let risk = null;
  if (tout.curated) check('token_risk', 'pass', `${tout.symbol} is a curated asset`);
  else if (!riskRaw) check('token_risk', 'fail', 'no security data for the token being bought: treat as high risk');
  else {
    risk = scoreToken(riskRaw);
    check('token_risk', risk.risk_score < 30 ? 'pass' : risk.risk_score < 60 ? 'warn' : 'fail', `risk ${risk.risk_score}/100${risk.flags.length ? ': ' + risk.flags.slice(0, 3).join(', ') : ''}`);
  }
  const policy = ctx.evaluate({ valueUsd: round(inUsd) ?? 0, merchant: 'kyberswap' });
  check('policy', policy.decision === 'allow' ? 'pass' : policy.decision === 'deny' ? 'fail' : 'warn', `${policy.decision}: ${policy.reasons.join('; ')}`);

  let simulation;
  if (sender) {
    const b = await ctx.getJSON(`${base}/route/build`, {
      method: 'POST', headers: { ...KYBER_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeSummary: r, sender, recipient: sender, slippageTolerance: slippageBps }),
    }).catch((e) => ({ code: -1, message: e.message }));
    if (b?.code !== 0 || !b.data?.data) simulation = { verdict: 'NOT_RUN', note: `could not build calldata: ${b?.message ?? 'unknown error'}` };
    else {
      simulation = await simulateTx(ctx, { chain, from: sender, to: b.data.routerAddress, data: b.data.data, valueWei: BigInt(b.data.transactionValue || 0), fundSender: fundSender && tin.address === NATIVE, merchant: 'kyberswap' });
      if (simulation.status === 'reverted' && tin.address !== NATIVE) simulation.hint = `selling an ERC-20 needs a balance and an allowance for the router ${b.data.routerAddress}`;
      check('simulation', simulation.status === 'success' ? 'pass' : 'fail', simulation.status === 'success' ? `succeeds on block ${simulation.block}, receives ${simulation.asset_changes.find((x) => x.direction === 'in')?.amount ?? '?'} ${tout.symbol}` : `reverts: ${simulation.revert_reason}`);
    }
  }

  const verdict = checks.some((c) => c.status === 'fail') ? 'DO_NOT_SWAP' : policy.decision === 'needs_approval' ? 'NEEDS_APPROVAL' : checks.some((c) => c.status === 'warn') ? 'REVIEW' : 'OK_TO_SWAP';
  return {
    verdict, chain,
    sell: { symbol: tin.symbol, token: tin.native ? 'native' : tin.address, amount: String(amount) },
    buy: { symbol: tout.symbol, token: tout.native ? 'native' : tout.address, amount_out: outAmount, min_out: formatUnits(minOut, tout.decimals), slippage_bps: slippageBps },
    rate: `1 ${tin.symbol} = ${round(Number(outAmount) / Number(amount), 6)} ${tout.symbol}`,
    value_in_usd: round(inUsd), value_out_usd: round(outUsd), price_impact_pct: round(impact, 3), gas_usd: round(gasUsd, 4),
    route: { aggregator: 'KyberSwap', exchanges, paths: r.route.length, max_hops: Math.max(...r.route.map((p) => p.length)) },
    checks, policy, ...(risk && { token_risk: risk }), ...(simulation && { simulation }),
    note: 'Quote only. Nothing was signed or sent.',
  };
}
