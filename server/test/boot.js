// Offline boot test for CI: starts the server over stdio, lists the tools and calls the ones that
// need no network (policy engine, market calendar, spending report). Live-data suites are in npm test.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-boot-'));
const client = new Client({ name: 'leeway-boot', version: '0.0.1' });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: ['src/index.js'],
  env: { ...process.env, LEEWAY_LEDGER: path.join(dir, 'l.json'), LEEWAY_APPROVALS: path.join(dir, 'a.json'), LEEWAY_AGENT_KEY: '', LEEWAY_AGENT_KEY_FILE: path.join(dir, 'none.json') },
}));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✕'} ${name}${extra ? `  · ${extra}` : ''}`); if (!ok) failed++; };
const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

const { tools } = await client.listTools();
check('21 tools registered', tools.length === 21, String(tools.length));
check('every tool has a description and input schema', tools.every((t) => t.description?.length > 20 && t.inputSchema));
const micro = await call('policy_check', { value_usd: 0.5, merchant: 'api.example.com' });
check('policy: micro-payment allowed', micro.decision === 'allow');
const big = await call('policy_check', { value_usd: 900 });
check('policy: above hard cap denied', big.decision === 'deny');
const mid = await call('policy_check', { value_usd: 40 });
check('policy: above per-tx limit needs approval', mid.decision === 'needs_approval');
const hours = await call('market_hours', {});
check('market calendar answers offline', typeof hours.open === 'boolean' && hours.session);
const rep = await call('spending_report', {});
check('spending report', rep.spentUsd === 0);
const w = await call('wallet_info', {});
check('no wallet configured: read-only mode', w.configured === false);
await client.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nboot checks passed');
process.exit(failed ? 1 : 0);
