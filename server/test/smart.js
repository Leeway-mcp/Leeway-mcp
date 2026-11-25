// Smart account (ERC-4337) + equity guardrails. No funds: a throwaway key on Base Sepolia,
// Pimlico's public bundler (rate-limited, no key) and live market data.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-smart-'));
const key = generatePrivateKey();
const eoa = privateKeyToAccount(key).address;
const ENV = {
  ...process.env, LEEWAY_AGENT_KEY: key, LEEWAY_ACCOUNT: 'smart', LEEWAY_EXECUTION_CHAINS: 'base-sepolia',
  LEEWAY_LEDGER: path.join(dir, 'ledger.json'), LEEWAY_APPROVALS: path.join(dir, 'approvals.json'), LEEWAY_TELEGRAM_BOT_TOKEN: '', LEEWAY_APPROVAL_WEBHOOK: '',
  LEEWAY_EQ_MAX_TRADE_USD: '100', LEEWAY_EQ_MAX_POSITION_USD: '500',
};
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✕'} ${name}${extra ? `  · ${extra}` : ''}`); if (!cond) failed++; };

const client = new Client({ name: 'leeway-smart-test', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.js'], env: ENV }));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  try { return r.isError ? { error: text } : JSON.parse(text); } catch { return { error: text }; }
};

const w1 = await call('wallet_info', {});
const w2 = await call('wallet_info', {});
check('smart mode: wallet acts from a Coinbase Smart Wallet, not the key address', w1.account_mode === 'smart' && /^0x[0-9a-fA-F]{40}$/.test(w1.address || '') && w1.address !== eoa && w1.owner_address === eoa, `${w1.address} owned by ${eoa}`);
check('smart account address is deterministic (counterfactual)', w1.address === w2.address);
check('not deployed yet: deploys with the first user operation', w1.balances?.[0]?.smart_account_deployed === false);

const tx = await call('send_transaction', { chain: 'base-sepolia', to: '0x2222222222222222222222222222222222222222', value: '0' });
const reached = /bundler rejected/i.test(tx.error || '') && /AA21|prefund|fund/i.test(tx.error || '');
check('signed user operation reaches the bundler; rejected only for missing gas funds', reached, (tx.error || JSON.stringify(tx)).replace(/^Error: /, '').slice(0, 150));

const small = await call('equity_policy_check', { ticker: 'TSLA', value_usd: 50, chain: 'base-sepolia' });
const names = (small.checks || []).map((c) => c.check).join(',');
const hoursFail = small.checks?.find((c) => c.check === 'market_hours')?.status === 'fail';
check('equity guardrails run all five checks', names === 'market_hours,parity,trade_cap,position_cap,leverage', names);
check('decision follows the checks (deny when the US market is closed)', hoursFail ? small.decision === 'deny' : ['allow', 'needs_approval'].includes(small.decision), `${small.decision} · ${small.checks?.find((c) => c.check === 'market_hours')?.detail}`);

const big = await call('equity_policy_check', { ticker: 'TSLA', value_usd: 900 });
check('position cap: $900 TSLA > $500 cap → deny', big.decision === 'deny' && big.checks.find((c) => c.check === 'position_cap')?.status === 'fail');
const mid = await call('equity_policy_check', { ticker: 'NVDA', value_usd: 250 });
check('trade cap: $250 > $100 asks a human (unless another rule denies)', mid.checks.find((c) => c.check === 'trade_cap')?.status === 'warn' && mid.decision !== 'allow', mid.decision);
const lev = await call('equity_policy_check', { ticker: 'TSLL', value_usd: 10 });
check('unknown / leveraged tickers are denied', lev.decision === 'deny', lev.checks?.[0]?.detail);

await client.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall smart account and equity guardrail checks passed');
process.exit(failed ? 1 : 0);
