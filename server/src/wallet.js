// Agent wallet: a small hot wallet the agent can spend from, only through the policy engine.
// The private key never leaves this module: no tool returns it, and it is never logged.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { CHAINS } from './data.js';

const env = process.env;
const list = (v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []);
export const keyFile = env.LEEWAY_AGENT_KEY_FILE || path.join(os.homedir(), '.leeway-mcp', 'agent-key.json');

// Execution is opt-in per chain. Default: Base Sepolia testnet only. Mainnet needs an explicit list.
export const execution = {
  enabled: (env.LEEWAY_EXECUTION ?? 'on') !== 'off',
  chains: list(env.LEEWAY_EXECUTION_CHAINS ?? 'base-sepolia').filter((c) => CHAINS[c]),
};

let cached;
export function loadAccount() {
  if (cached !== undefined) return cached;
  let pk = env.LEEWAY_AGENT_KEY, source = 'env';
  if (!pk && fs.existsSync(keyFile)) {
    try { pk = JSON.parse(fs.readFileSync(keyFile, 'utf8')).privateKey; source = 'file'; } catch { pk = null; }
  }
  if (pk && !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('agent key must be a 0x-prefixed 32-byte hex string');
  cached = pk ? Object.assign(privateKeyToAccount(pk), { keySource: source }) : null;
  return cached;
}

export function initWallet() {
  if (fs.existsSync(keyFile)) return { created: false, address: loadAccount()?.address, keyFile };
  const pk = generatePrivateKey();
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, JSON.stringify({ privateKey: pk, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  cached = undefined;
  return { created: true, address: privateKeyToAccount(pk).address, keyFile };
}

export function assertCanExecute(chain) {
  const account = loadAccount();
  if (!account) throw new Error('no agent wallet configured. Run `npx leeway-mcp init-wallet` (or set LEEWAY_AGENT_KEY), then fund the address with a small amount');
  if (!execution.enabled) throw new Error('execution is turned off (LEEWAY_EXECUTION=off)');
  if (!execution.chains.includes(chain)) throw new Error(`execution on ${chain} is not enabled. Enabled: ${execution.chains.join(', ') || 'none'}. Set LEEWAY_EXECUTION_CHAINS to opt in`);
  return account;
}

const viemChain = (name) => {
  const c = CHAINS[name];
  return { id: c.id, name, nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } };
};
export const publicClient = (name) => createPublicClient({ chain: viemChain(name), transport: http(CHAINS[name].rpc) });

/** Signs and broadcasts, then waits briefly for the receipt. Callers must have run policy + simulation. */
export async function sendTransaction(name, { to, data = '0x', valueWei = 0n }) {
  const account = assertCanExecute(name);
  const wallet = createWalletClient({ account, chain: viemChain(name), transport: http(CHAINS[name].rpc) });
  const hash = await wallet.sendTransaction({ to, data, value: valueWei });
  let receipt = null;
  try { receipt = await publicClient(name).waitForTransactionReceipt({ hash, timeout: 45_000 }); } catch { /* still pending */ }
  return {
    hash,
    onchain_status: receipt ? (receipt.status === 'success' ? 'confirmed' : 'reverted') : 'pending',
    block: receipt ? Number(receipt.blockNumber) : null,
    gas_used: receipt ? Number(receipt.gasUsed) : null,
    explorer: CHAINS[name].explorer ? `${CHAINS[name].explorer}/tx/${hash}` : null,
  };
}
