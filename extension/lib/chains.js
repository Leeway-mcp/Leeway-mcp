// Chains Leeway Guard understands (same shape as server/src/data.js) and the browser data layer
// handed to the shared core. Every request goes to a public, keyless endpoint; nothing else.
export const CHAINS = {
  ethereum: { id: 1, rpc: 'https://ethereum-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  base: { id: 8453, rpc: 'https://base-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  arbitrum: { id: 42161, rpc: 'https://arbitrum-one-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  optimism: { id: 10, rpc: 'https://optimism-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum' },
  polygon: { id: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', symbol: 'POL', cg: 'polygon-ecosystem-token' },
  bsc: { id: 56, rpc: 'https://bsc-rpc.publicnode.com', symbol: 'BNB', cg: 'binancecoin' },
  avalanche: { id: 43114, rpc: 'https://avalanche-c-chain-rpc.publicnode.com', symbol: 'AVAX', cg: 'avalanche-2' },
  'base-sepolia': { id: 84532, rpc: 'https://base-sepolia-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum', testnet: true },
  sepolia: { id: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com', symbol: 'ETH', cg: 'ethereum', testnet: true },
};
const BY_ID = Object.fromEntries(Object.entries(CHAINS).map(([name, c]) => [c.id, name]));
export const chainName = (id) => BY_ID[typeof id === 'string' ? Number(BigInt(id)) : Number(id)] ?? null;

export async function getJSON(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
  return r.json();
}
export async function rpc(chain, method, params = []) {
  const c = CHAINS[chain];
  if (!c) throw new Error(`unsupported chain ${chain}`);
  const out = await getJSON(c.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (out.error) throw new Error(`RPC error: ${out.error.message}`);
  return out.result;
}
export async function tokenSecurity(chain, address) {
  const d = await getJSON(`https://api.gopluslabs.io/api/v1/token_security/${CHAINS[chain].id}?contract_addresses=${address}`);
  return d.result?.[address.toLowerCase()] ?? null;
}
export async function addressSecurity(address) {
  return (await getJSON(`https://api.gopluslabs.io/api/v1/address_security/${address}`)).result ?? null;
}

// Humans decide in the overlay, so the policy stub never blocks: verdicts come from the
// simulation and the signature analysis alone.
const evaluate = () => ({ decision: 'allow', reasons: ['you decide'], remainingTodayUsd: null });
export const ctx = { CHAINS, rpc, getJSON, tokenSecurity, addressSecurity, evaluate };
