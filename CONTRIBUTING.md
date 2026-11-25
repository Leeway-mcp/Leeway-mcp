# Contributing to Leeway

Thanks for helping agents get leeway without getting the keys. Leeway is MIT-licensed and built in the open.

## Ground rules

- **Safety first.** Anything that can move funds goes through one path: `server/src/execute.js` (simulate → policy → approval → sign → ledger). New spending features must use that gate, never sign directly.
- **No invented data.** Token addresses, chain ids and API fields must be verified against a live source; mention how in the PR.
- **Keep it dependency-light.** The server has three runtime dependencies (MCP SDK, zod, viem). Adding one needs a reason.
- **No build step.** Plain ESM in the server, the extension and the site.

## Setup

```bash
git clone https://github.com/Leeway-mcp/Leeway-mcp.git
cd Leeway-mcp/server
npm install
npm run test:boot   # offline: server boots, 21 tools, policy engine
npm test            # full suite against live public APIs (takes a few minutes)
```

Run the site locally: `npx serve site` and open the printed URL.

## Where things live

| Area | Path |
|---|---|
| Tool registry | `server/src/tools.js` (`createServer()`) |
| Policy engine | `server/src/policy.js` |
| Simulation, swaps, risk scoring (isomorphic core) | `server/src/onchain.js` |
| Execution gate, x402 client | `server/src/execute.js` |
| Wallet (EOA + ERC-4337 smart account) | `server/src/wallet.js` |
| Approvals, Telegram, webhooks | `server/src/approvals.js`, `telegram.js`, `notify.js` |
| Equity Rails | `server/src/equities.js` |
| Browser extension | `extension/` |
| Landing, docs, The Agent Sea | `site/` |

`server/src/onchain.js` is copied into `site/js/onchain.js` and `extension/lib/onchain.js`. After editing it, run:

```bash
node server/scripts/sync-site.mjs
node extension/scripts/sync-core.mjs
```

CI fails if the copies drift.

## Pull requests

1. Open an issue first for anything larger than a fix, so we can agree on the approach.
2. Keep PRs focused; one feature or fix per PR.
3. Add or update tests (`server/test/`, `extension/test/`). Tests must not spend real funds: use throwaway keys, testnets or local mock servers.
4. Update the docs you touched: `README.md`, `site/docs.html`, tool descriptions.
5. Describe what you verified and how.

## Good first issues

- More chains in `server/src/data.js` (RPC + verified token list)
- An `approval_audit` tool: open allowances of a wallet, riskiest first
- A second swap aggregator as a price cross-check
- Interception of `wallet_sendCalls` (EIP-5792) in Leeway Guard

## Community

Questions and ideas: [Telegram](https://t.me/leewaymcp) · [X](https://x.com/Leewayicu) · [Issues](https://github.com/Leeway-mcp/Leeway-mcp/issues)

By contributing you agree that your contributions are licensed under the MIT License and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
