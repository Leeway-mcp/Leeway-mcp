// Data sources: free public APIs only, no keys needed.
export const CHAINS = {
  ethereum: { id: 1, rpc: 'https://ethereum-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  base: { id: 8453, rpc: 'https://base-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  arbitrum: { id: 42161, rpc: 'https://arbitrum-one-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  optimism: { id: 10, rpc: 'https://optimism-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  polygon: { id: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', symbol: 'POL', cg: 'polygon-ecosystem-token' },
  bsc: { id: 56, rpc: 'https://bsc-rpc.publicnode.com', symbol: 'BNB', cg: 'binancecoin' },
  avalanche: { id: 43114, rpc: 'https://avalanche-c-chain-rpc.publicnode.com', symbol: 'AVAX', cg: 'avalanche-2' },
};
export const CHAIN_NAMES = Object.keys(CHAINS);

const UA = { 'User-Agent': 'mandate-mcp/0.1', Accept: 'application/json' };
const TIMEOUT = 12_000;

export async function getJSON(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

export async function rpc(chain, method, params = []) {
  const c = CHAINS[chain];
  if (!c) throw new Error(`Unsupported chain "${chain}". Use one of: ${CHAIN_NAMES.join(', ')}`);
  const out = await getJSON(c.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (out.error) throw new Error(`RPC error: ${out.error.message}`);
  return out.result;
}

/* ---------- market ---------- */
// CoinGecko first; when it rate-limits (free tier), fall back to DefiLlama so tools keep working.
export async function prices(ids) {
  const q = encodeURIComponent(ids.join(','));
  try {
    return await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${q}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
  } catch (e) {
    const keys = ids.map((id) => `coingecko:${id}`).join(',');
    const [p, pct] = await Promise.all([
      getJSON(`https://coins.llama.fi/prices/current/${keys}`),
      getJSON(`https://coins.llama.fi/percentage/${keys}`).catch(() => ({ coins: {} })),
    ]).catch(() => { throw e; });
    const out = {};
    for (const id of ids) {
      const c = p.coins?.[`coingecko:${id}`];
      if (c) out[id] = { usd: c.price, usd_24h_change: pct.coins?.[`coingecko:${id}`] ?? null, usd_market_cap: null, usd_24h_vol: null };
    }
    return out;
  }
}
export async function searchCoin(query) {
  const d = await getJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
  return d.coins?.[0] ?? null;
}
export async function trending() {
  const d = await getJSON('https://api.coingecko.com/api/v3/search/trending');
  return (d.coins || []).map(({ item }) => ({
    name: item.name, symbol: item.symbol, id: item.id, market_cap_rank: item.market_cap_rank,
    price_usd: item.data?.price ?? null, change_24h_pct: item.data?.price_change_percentage_24h?.usd ?? null,
  }));
}

/* ---------- chain ---------- */
export const hexToBig = (h) => BigInt(h);
export function formatUnits(v, decimals = 18) {
  const s = v.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals), frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac.slice(0, 8)}` : int;
}

/* ---------- risk (GoPlus Security, free public endpoint) ---------- */
export async function tokenSecurity(chain, address) {
  const c = CHAINS[chain];
  if (!c) throw new Error(`Unsupported chain "${chain}"`);
  const d = await getJSON(`https://api.gopluslabs.io/api/v1/token_security/${c.id}?contract_addresses=${address}`);
  return d.result?.[address.toLowerCase()] ?? null;
}
export async function addressSecurity(address) {
  const d = await getJSON(`https://api.gopluslabs.io/api/v1/address_security/${address}`);
  return d.result ?? null;
}
