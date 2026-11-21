<div align="center">

# Mandate MCP

**Give your agents a mandate, not a private key.**

An open-source [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude, Cursor and any AI agent safe, policy-guarded access to on-chain value.

`market data` · `wallets` · `risk intelligence` · `x402 payments` · `policy engine`

</div>

---

## Why

AI agents are turning into economic actors. They buy data and call paid APIs, and soon they will trade. Handing an LLM a private key is a bad idea, because one prompt injection can drain the wallet.

Mandate puts a **policy engine** between the agent and the money. The agent gets typed tools to read markets, check risk and price payments. Every spend gets an `allow`, `needs_approval` or `deny` decision, enforced on the server side where no prompt can change it.

## Tools

| Tool | What it does |
|---|---|
| `get_price` | USD price, 24h change, market cap and volume (symbols or CoinGecko ids) |
| `trending_tokens` | Most-searched tokens right now |
| `get_gas` | Gas in gwei, plus USD cost of a transfer and a swap, on 7 EVM chains |
| `get_balance` | Native balance of any address, valued in USD |
| `scan_token` | Honeypot, mint, hidden-owner, tax, blacklist, proxy, holder and LP-lock checks, giving a 0–100 risk score |
| `check_address` | Phishing / drainer / sanctions reputation of an address |
| `policy_check` | Asks the policy engine whether a spend is allowed |
| `x402_quote` | Reads the price of an HTTP 402 (x402) paywalled resource and runs the policy check |
| `spending_report` | Today's spend, remaining budget, active limits |

Chains: `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `bsc`, `avalanche`.
Data sources: CoinGecko, PublicNode RPC and GoPlus Security. All free, no API keys needed.

## Quick start

```bash
git clone https://github.com/<you>/mandate-mcp && cd mandate-mcp/server
npm install
npm test          # spawns the server and calls every tool against live data
```

Add it to **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mandate": {
      "command": "node",
      "args": ["/absolute/path/to/mandate-mcp/server/src/index.js"],
      "env": {
        "MANDATE_DAILY_LIMIT_USD": "50",
        "MANDATE_ALLOWLIST": "uniswap,aave",
        "MANDATE_REQUIRE_APPROVAL": "true"
      }
    }
  }
}
```

**Claude Code:** `claude mcp add mandate -- node /absolute/path/to/mandate-mcp/server/src/index.js`

After `npm publish`, this becomes `npx -y mandate-mcp`.

## Policy configuration

| Env var | Default | Meaning |
|---|---|---|
| `MANDATE_DAILY_LIMIT_USD` | `50` | Total the agent may spend per UTC day |
| `MANDATE_PER_TX_LIMIT_USD` | `25` | Above this, a human must approve |
| `MANDATE_HARD_CAP_USD` | `500` | Above this, always denied |
| `MANDATE_MICRO_ALLOWANCE_USD` | `1` | Micro-payments (x402) at or under this pass without approval |
| `MANDATE_ALLOWLIST` | (empty) | Comma-separated merchants/protocols. If set, anything else above the micro allowance is denied |
| `MANDATE_DENYLIST` | (empty) | Always denied |
| `MANDATE_REQUIRE_APPROVAL` | `true` | Require approval for every non-micro spend |
| `MANDATE_LEDGER` | `~/.mandate-mcp/ledger.json` | Where the daily spend ledger is stored |

## Example

> **You:** Is this token safe? `0x…` on Base
>
> **Agent** → `scan_token` → *risk 91/100: owner can mint, 12% sell tax, LP unlocked.* "I would not buy this."

## Roadmap

- [x] Market, wallet and gas tools on 7 EVM chains
- [x] Risk scanner and address reputation
- [x] Policy engine with a persistent daily ledger
- [x] x402 price quotes
- [ ] Swap quotes and fork simulation
- [ ] Policy-bound agent smart wallets (ERC-4337) with execution
- [ ] x402 payment settlement
- [ ] Human approval via Telegram
- [ ] **Equity Rails**: tokenized stock quotes, Parity Guard (blocks buys above the real exchange price), equity mandates (per-ticker and sector caps, market hours, no leverage)
- [ ] Solana support
- [ ] Hosted gateway

### Why "Mandate"?

In asset management, a *mandate* is the rulebook a fund manager must follow: what to buy, how much, where. Mandate MCP gives an AI agent exactly that: clear authority within hard limits, for crypto and, with Equity Rails, for tokenized stocks.

## Repository

```
server/   MCP server (Node ≥ 18, ESM, zero build step)
site/     Landing page (static HTML/CSS/JS + Three.js, deploy anywhere)
PROMPT.md Design brief used to build the landing
```

Run the landing locally: `npx serve site`. Deploy with GitHub Pages by pointing it at `/site`.

## License

MIT. Not financial advice. `$MNDT` is a concept described on the landing page; no token exists.
