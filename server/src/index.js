#!/usr/bin/env node
// Leeway MCP · gives AI agents safe, policy-guarded access to on-chain value.
//
//   leeway-mcp                       MCP over stdio (Claude Desktop, Cursor, Claude Code…)
//   leeway-mcp http [--port 3333]    MCP over Streamable HTTP for remote agents
//   leeway-mcp init-wallet           create the agent hot wallet
//   leeway-mcp approvals             list approval requests
//   leeway-mcp approve <id> | deny <id>
import http from 'node:http';
import crypto from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './tools.js';
import { initWallet, loadAccount, execution, keyFile } from './wallet.js';
import { decide, listApprovals } from './approvals.js';
import { startTelegramPolling, telegramEnabled } from './telegram.js';

const VERSION = '0.3.0';
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : argv.includes('--http') ? 'http' : 'stdio';
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const log = (...a) => console.error('[leeway-mcp]', ...a);

switch (cmd) {
  case 'init-wallet': {
    const w = initWallet();
    console.log(w.created ? 'Created a new agent wallet.' : 'An agent wallet already exists.');
    console.log(`  address   ${w.address}`);
    console.log(`  key file  ${w.keyFile}  (keep it private; it never leaves this machine)`);
    console.log(`  executes  ${execution.chains.join(', ') || 'nowhere'}  (LEEWAY_EXECUTION_CHAINS)`);
    console.log('\nFund it with a small amount only. For testing use Base Sepolia ETH and USDC from a faucet.');
    break;
  }
  case 'approvals': {
    const items = listApprovals();
    if (!items.length) console.log('No approval requests.');
    for (const a of items) console.log(`${a.id}  ${a.status.padEnd(9)} $${String(a.value_usd ?? '?').padEnd(8)} ${a.summary}`);
    break;
  }
  case 'approve':
  case 'deny': {
    if (!argv[1]) { console.error(`usage: leeway-mcp ${cmd} <id>`); process.exit(1); }
    try {
      const a = decide(argv[1], cmd, 'cli');
      console.log(`${a.id} ${a.status}: ${a.summary}`);
    } catch (e) { console.error(e.message); process.exit(1); }
    break;
  }
  case 'help':
  case '--help':
    console.log('usage: leeway-mcp [http [--port 3333] [--host 127.0.0.1] | init-wallet | approvals | approve <id> | deny <id>]');
    break;
  case 'http':
    await serveHttp();
    break;
  default: {
    const server = createServer();
    await server.connect(new StdioServerTransport());
    startTelegramPolling();
    banner('stdio');
  }
}

function banner(mode) {
  const a = loadAccount();
  log(`v${VERSION} ready over ${mode} · wallet ${a ? a.address : 'none (read-only)'} · execution ${execution.enabled && a ? execution.chains.join(', ') : 'off'} · approvals ${telegramEnabled ? 'telegram + cli' : 'cli'}`);
}

async function serveHttp() {
  const port = Number(opt('port', process.env.PORT || 3333));
  const host = opt('host', process.env.LEEWAY_HTTP_HOST || '127.0.0.1');
  const agentToken = process.env.LEEWAY_HTTP_TOKEN;
  const adminToken = process.env.LEEWAY_ADMIN_TOKEN;
  if (!agentToken || agentToken.length < 16) { log('refusing to start: set LEEWAY_HTTP_TOKEN (16+ chars) for agent access'); process.exit(1); }
  if (adminToken && adminToken === agentToken) { log('refusing to start: LEEWAY_ADMIN_TOKEN must differ from LEEWAY_HTTP_TOKEN, or the agent could approve its own spends'); process.exit(1); }

  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const body = (req) => new Promise((ok, bad) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) { bad(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : undefined); } catch (e) { bad(e); } });
  });

  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true, name: 'leeway-mcp', version: VERSION });

      // owner-only: approve / deny. Uses a separate token the agent never sees.
      if (url.pathname.startsWith('/approvals')) {
        if (!adminToken || !same(bearer(req), adminToken)) return send(res, 401, { error: 'admin token required' });
        if (req.method === 'GET' && url.pathname === '/approvals') return send(res, 200, listApprovals());
        const m = url.pathname.match(/^\/approvals\/([0-9A-Fa-f]{6})\/(approve|deny)$/);
        if (req.method === 'POST' && m) return send(res, 200, decide(m[1], m[2], 'admin-http'));
        return send(res, 404, { error: 'not found' });
      }

      if (url.pathname === '/mcp') {
        if (!same(bearer(req), agentToken)) return send(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
        if (req.method !== 'POST') return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: stateless server, use POST' }, id: null });
        const payload = await body(req);
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        return transport.handleRequest(req, res, payload);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: e.message });
    }
  });
  await new Promise((ok) => srv.listen(port, host, ok));
  startTelegramPolling();
  banner(`http://${host}:${port}/mcp`);
  if (!adminToken) log('admin endpoint disabled (set LEEWAY_ADMIN_TOKEN to approve over HTTP)');
}
export { keyFile };
