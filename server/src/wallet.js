// Agent wallet: a small hot wallet the agent can spend from, only through the policy engine.
// The private key never leaves this module: no tool returns it, and it is never logged.
//
// Two account modes:
//   eoa   (default)            the key signs plain transactions
//   smart (LEEWAY_ACCOUNT=smart) an ERC-4337 Coinbase Smart Wallet owned by the key. Calls go to a
//         bundler as one UserOperation, so multi-step actions (approve + swap) are atomic, and gas
//         can be sponsored by a paymaster. Default bundler: Pimlico's public endpoint (testnets,
//         rate-limited, no key); set LEEWAY_BUNDLER_URL for production.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createBundlerClient, createPaymasterClient, toCoinbaseSmartAccount } from 'viem/account-abstraction';
import { CHAINS } from './data.js';

const env = process.env;
const list = (v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []);
export const keyFile = env.LEEWAY_AGENT_KEY_FILE || path.join(os.homedir(), '.leeway-mcp', 'agent-key.json');
export const accountMode = (env.LEEWAY_ACCOUNT || 'eoa').toLowerCase() === 'smart' ? 'smart' : 'eoa';

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
const explorer = (name, hash) => (CHAINS[name].explorer ? `${CHAINS[name].explorer}/tx/${hash}` : null);

/* ---------------- smart account (ERC-4337) ---------------- */
const bundlerUrl = (name) => (env.LEEWAY_BUNDLER_URL || 'https://public.pimlico.io/v2/{chainId}/rpc').replace('{chainId}', String(CHAINS[name].id));
const smartCache = new Map();
export async function smartAccount(name) {
  if (!smartCache.has(name)) {
    const owner = loadAccount();
    if (!owner) throw new Error('no agent key: run `npx leeway-mcp init-wallet`');
    smartCache.set(name, toCoinbaseSmartAccount({ client: publicClient(name), owners: [owner], version: '1.1' }));
  }
  return smartCache.get(name);
}

/** The address the agent acts from on this chain: the smart account in smart mode, else the EOA. */
export async function agentAddress(name) {
  if (accountMode === 'smart') return (await smartAccount(name)).address;
  return loadAccount()?.address;
}

function bundlerFor(name, account) {
  const url = bundlerUrl(name);
  const pm = env.LEEWAY_PAYMASTER_URL ? createPaymasterClient({ transport: http(env.LEEWAY_PAYMASTER_URL.replace('{chainId}', String(CHAINS[name].id))) }) : undefined;
  return createBundlerClient({
    account, client: publicClient(name), transport: http(url), ...(pm && { paymaster: pm }),
    // Pimlico bundlers price user operations with their own gas oracle
    userOperation: url.includes('pimlico') ? {
      estimateFeesPerGas: async ({ bundlerClient }) => {
        const r = await bundlerClient.request({ method: 'pimlico_getUserOperationGasPrice', params: [] });
        return { maxFeePerGas: BigInt(r.fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(r.fast.maxPriorityFeePerGas) };
      },
    } : undefined,
  });
}

/**
 * Sends one or more calls from the agent. Smart mode: a single atomic UserOperation.
 * EOA mode: one transaction per call, in order, stopping at the first failure.
 * Callers must have run policy + simulation first.
 */
export async function sendCalls(name, calls) {
  assertCanExecute(name);
  if (accountMode === 'smart') {
    const account = await smartAccount(name);
    const bundler = bundlerFor(name, account);
    let userOpHash;
    try {
      userOpHash = await bundler.sendUserOperation({ calls: calls.map((c) => ({ to: c.to, data: c.data || '0x', value: c.valueWei ?? 0n })) });
    } catch (e) {
      const msg = String(e.shortMessage || e.message || e);
      const hint = /AA21|prefund|insufficient|sufficient funds/i.test(msg) ? ` Fund the smart account ${account.address} or set LEEWAY_PAYMASTER_URL for sponsored gas.` : '';
      throw new Error(`bundler rejected the user operation: ${msg.split('\n')[0]}.${hint}`);
    }
    let r = null;
    try { r = await bundler.waitForUserOperationReceipt({ hash: userOpHash, timeout: 60_000 }); } catch { /* still pending */ }
    const hash = r?.receipt?.transactionHash ?? null;
    return [{
      account: 'smart', smart_account: account.address, user_op_hash: userOpHash, hash,
      onchain_status: r ? (r.success ? 'confirmed' : 'reverted') : 'pending', block: r ? Number(r.receipt.blockNumber) : null,
      gas_used: r ? Number(r.actualGasUsed) : null, explorer: hash ? explorer(name, hash) : null, calls: calls.length,
    }];
  }
  const out = [];
  for (const c of calls) {
    const sent = await sendTransaction(name, c);
    out.push(sent);
    if (sent.onchain_status !== 'confirmed') break;
  }
  return out;
}

/** Signs and broadcasts one plain transaction from the EOA, then waits briefly for the receipt. */
export async function sendTransaction(name, { to, data = '0x', valueWei = 0n }) {
  const account = assertCanExecute(name);
  const wallet = createWalletClient({ account, chain: viemChain(name), transport: http(CHAINS[name].rpc) });
  const hash = await wallet.sendTransaction({ to, data, value: valueWei });
  let receipt = null;
  try { receipt = await publicClient(name).waitForTransactionReceipt({ hash, timeout: 45_000 }); } catch { /* still pending */ }
  return {
    account: 'eoa', hash,
    onchain_status: receipt ? (receipt.status === 'success' ? 'confirmed' : 'reverted') : 'pending',
    block: receipt ? Number(receipt.blockNumber) : null,
    gas_used: receipt ? Number(receipt.gasUsed) : null,
    explorer: explorer(name, hash),
  };
}
