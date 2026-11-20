// Smoke test: spawns the server over stdio as a real MCP client would, then calls every tool.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/index.js'],
  env: { ...process.env, AURUM_LEDGER: path.join(os.tmpdir(), 'aurum-test-ledger.json'), AURUM_ALLOWLIST: 'uniswap' },
});
const client = new Client({ name: 'aurum-smoke', version: '0.0.1' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`, tools.map((t) => t.name).join(', '));

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const calls = [
  ['get_price', { tokens: ['ETH', 'TAO', 'bitcoin'] }],
  ['trending_tokens', {}],
  ['get_gas', { chain: 'base' }],
  ['get_balance', { address: VITALIK, chain: 'ethereum' }],
  ['scan_token', { address: USDC_BASE, chain: 'base' }],
  ['check_address', { address: VITALIK }],
  ['policy_check', { value_usd: 0.02, merchant: 'api.example.com' }],
  ['policy_check', { value_usd: 40, merchant: 'uniswap' }],
  ['policy_check', { value_usd: 900, merchant: 'unknown-dex' }],
  ['get_balance', { address: 'not-an-address' }],
  ['spending_report', {}],
];
let failed = 0;
for (const [name, args] of calls) {
  try {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? '';
    console.log(`\n▸ ${name} ${JSON.stringify(args)} ${r.isError ? '(isError)' : ''}\n${text.slice(0, 600)}`);
  } catch (e) {
    // invalid input is rejected by schema validation: expected for the bad-address case
    console.log(`\n▸ ${name} threw: ${e.message.slice(0, 200)}`);
    if (args.address !== 'not-an-address') failed++;
  }
}
await client.close();
console.log(failed ? `\n${failed} unexpected failure(s)` : '\nall calls completed');
process.exit(failed ? 1 : 0);
