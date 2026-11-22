<div align="center">

# Leeway MCP

**Give your agents leeway, not a private key.**

An open-source [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude, Cursor and any AI agent safe, policy-guarded access to on-chain value.

`market data` · `wallets` · `risk intelligence` · `guarded swaps` · `tx simulation` · `x402 payments` · `policy engine`

</div>

---

## Why

AI agents are turning into economic actors. They buy data and call paid APIs, and soon they will trade. Handing an LLM a private key is a bad idea, because one prompt injection can drain the wallet.

Leeway puts a **policy engine** between the agent and the money. The agent gets typed tools to read markets, check risk and price payments. Every spend gets an `allow`, `needs_approval` or `deny` decision, enforced on the server side where no prompt can change it.

## Tools

| Tool | What it does |
|---|---|
| `get_price` | USD price, 24h change, market cap and volume (symbols or CoinGecko ids) |
| `trending_tokens` | Most-searched tokens right now |
| `get_gas` | Gas in gwei, plus USD cost of a transfer and a swap, on 7 EVM chains |
| `get_balance` | Native balance of any address, valued in USD |
| `scan_token` | Honeypot, mint, hidden-owner, tax, blacklist, proxy, holder and LP-lock checks, giving a 0–100 risk score |
| `check_address` | Phishing / drainer / sanctions reputation of an address |
| `swap_quote` | Best DEX route (KyberSwap aggregator) with price impact, gas share, a risk scan of the token bought and the policy decision. With `sender`, builds the router calldata and simulates it. Verdict: `OK_TO_SWAP` / `REVIEW` / `NEEDS_APPROVAL` / `DO_NOT_SWAP` |
| `simulate_tx` | Dry-runs any transaction on live state (`eth_simulateV1`): assets out/in with USD values, approvals (flags unlimited and wallet-to-wallet), NFTs leaving, revert reason, gas, counterparty reputation. Verdict: `SAFE_TO_SIGN` / `REVIEW` / `NEEDS_APPROVAL` / `DO_NOT_SIGN` / `WILL_REVERT` |
| `policy_check` | Asks the policy engine whether a spend is allowed |
| `x402_quote` | Reads the price of an HTTP 402 (x402) paywalled resource and runs the policy check |
| `spending_report` | Today's spend, remaining budget, active limits |

Chains: `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `bsc`, `avalanche`.
Data sources: CoinGecko and DefiLlama (prices), PublicNode RPC, GoPlus Security, KyberSwap aggregator. All free, no API keys needed.

The guard core (`server/src/onchain.js`) is isomorphic: the landing-page playground runs a generated copy of the same file (`npm run sync-site`), and `npm test` fails if the two drift apart.

## Quick start

```bash
git clone https://github.com/<you>/leeway-mcp && cd leeway-mcp/server
npm install
npm test          # spawns the server and calls every tool against live data
```

Add it to **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "leeway": {
      "command": "node",
      "args": ["/absolute/path/to/leeway-mcp/server/src/index.js"],
      "env": {
        "LEEWAY_DAILY_LIMIT_USD": "50",
        "LEEWAY_ALLOWLIST": "uniswap,aave",
        "LEEWAY_REQUIRE_APPROVAL": "true"
      }
    }
  }
}
```

**Claude Code:** `claude mcp add leeway -- node /absolute/path/to/leeway-mcp/server/src/index.js`

After `npm publish`, this becomes `npx -y leeway-mcp`.

## Policy configuration

| Env var | Default | Meaning |
|---|---|---|
| `LEEWAY_DAILY_LIMIT_USD` | `50` | Total the agent may spend per UTC day |
| `LEEWAY_PER_TX_LIMIT_USD` | `25` | Above this, a human must approve |
| `LEEWAY_HARD_CAP_USD` | `500` | Above this, always denied |
| `LEEWAY_MICRO_ALLOWANCE_USD` | `1` | Micro-payments (x402) at or under this pass without approval |
| `LEEWAY_ALLOWLIST` | (empty) | Comma-separated merchants/protocols. If set, anything else above the micro allowance is denied |
| `LEEWAY_DENYLIST` | (empty) | Always denied |
| `LEEWAY_REQUIRE_APPROVAL` | `true` | Require approval for every non-micro spend |
| `LEEWAY_LEDGER` | `~/.leeway-mcp/ledger.json` | Where the daily spend ledger is stored |

## Example

> **You:** Is this token safe? `0x…` on Base
>
> **Agent** → `scan_token` → *risk 91/100: owner can mint, 12% sell tax, LP unlocked.* "I would not buy this."

## Publishing (maintainers)

1. Replace `YOUR_GITHUB` in `server/package.json` (`mcpName`, `repository`) and `server/server.json`.
2. `cd server && npm test && npm publish --access public` (package name: `leeway-mcp`).
3. Official MCP Registry: `mcp-publisher login github`, then `mcp-publisher publish` from `server/`.

## Roadmap

- [x] Market, wallet and gas tools on 7 EVM chains
- [x] Risk scanner and address reputation
- [x] Policy engine with a persistent daily ledger
- [x] x402 price quotes
- [x] Guarded swap quotes (DEX aggregator + impact, risk and policy checks)
- [x] Pre-sign transaction simulation (asset changes, approvals, reverts)
- [ ] npm publish · official MCP Registry · Smithery (manifests ready: `server/server.json`, `mcpName`)
- [ ] Policy-bound agent smart wallets (ERC-4337) with execution
- [ ] x402 payment settlement
- [ ] Human approval via Telegram
- [ ] **Equity Rails**: tokenized stock quotes, Parity Guard (blocks buys above the real exchange price), equity guardrails (per-ticker and sector caps, market hours, no leverage)
- [ ] Solana support
- [ ] Hosted gateway

### Why "Leeway"?

*Leeway* is freedom to act inside set limits. That is the whole product: an agent can trade, pay and act on its own, but only within the room its owner gives it. Not a private key with no limits, and not a leash that makes it useless. The same rails work for crypto and, with Equity Rails, for tokenized stocks.

## Repository

```
server/   MCP server (Node ≥ 18, ESM, zero build step)
site/     Landing page (static HTML/CSS/JS + Three.js, deploy anywhere)
PROMPT.md Design brief used to build the landing
```

Run the landing locally: `npx serve site`. Deploy with GitHub Pages by pointing it at `/site`.

## License

MIT. Not financial advice. `$LWAY` is a concept described on the landing page; no token exists.
