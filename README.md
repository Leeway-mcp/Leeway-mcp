<div align="center">

# Leeway MCP

**Give your agents leeway, not a private key.**

An open-source [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude, Cursor and any AI agent safe, policy-guarded access to on-chain value.

`market data` · `risk intelligence` · `tx simulation` · `agent wallet` · `x402 payments` · `human approvals` · `policy engine`

</div>

---

## Why

AI agents are turning into economic actors. They buy data and call paid APIs, and soon they will trade. Handing an LLM a private key is a bad idea, because one prompt injection can drain the wallet.

Leeway puts a **policy engine** between the agent and the money. The model never sees a key: it gets typed tools to read markets, check risk, simulate transactions and, from v0.3, spend from a small hot wallet. Every spend is simulated first, then gets an `allow`, `needs_approval` or `deny` decision enforced on the server, where no prompt can change it. When a human must decide, the owner taps Approve in Telegram.

## Tools

**Read-only (11)**

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

**Execution and approvals (6, new in v0.3)**

| Tool | What it does |
|---|---|
| `wallet_info` | Agent wallet address, chains it may execute on, balances. Never returns key material |
| `send_transaction` | Any transfer or contract call from the agent wallet: simulated, policy-checked, approval when needed, then signed |
| `execute_swap` | Best-route swap from the agent wallet with the `swap_quote` checks plus a simulation (native-token sells for now) |
| `x402_pay` | Pays an HTTP 402 resource in USDC (x402 v1 and v2, EIP-3009 signed authorization) and returns the content and receipt |
| `approval_status` | Pending / approved / denied / expired for an approval request |
| `list_approvals` | Recent approval requests |

Chains: `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `bsc`, `avalanche`, plus `base-sepolia` and `sepolia` testnets.
Data sources: CoinGecko and DefiLlama (prices), PublicNode RPC, GoPlus Security, KyberSwap aggregator. All free, no API keys needed.

The guard core (`server/src/onchain.js`) is isomorphic: the landing-page playground runs a generated copy of the same file (`npm run sync-site`), and `npm test` fails if the two drift apart.

## Quick start

```bash
git clone https://github.com/<you>/leeway-mcp && cd leeway-mcp/server
npm install
npm test          # every read tool against live data, then the execution suite (throwaway key, local x402 merchant)
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
| `LEEWAY_EXECUTION_CHAINS` | `base-sepolia` | Chains where the agent may sign. Mainnet is opt-in |
| `LEEWAY_EXECUTION` | `on` | `off` disables every signing tool |
| `LEEWAY_AGENT_KEY` / `LEEWAY_AGENT_KEY_FILE` | `~/.leeway-mcp/agent-key.json` | Agent hot-wallet key, or where it is stored |
| `LEEWAY_APPROVALS` / `LEEWAY_APPROVAL_TTL_MIN` | `~/.leeway-mcp/approvals.json` / `15` | Approval store and lifetime |
| `LEEWAY_TELEGRAM_BOT_TOKEN` / `LEEWAY_TELEGRAM_CHAT_ID` | (empty) | Telegram approvals |
| `LEEWAY_HTTP_TOKEN` / `LEEWAY_ADMIN_TOKEN` / `LEEWAY_HTTP_HOST` | (empty) / (empty) / `127.0.0.1` | HTTP mode: agent token, owner token, bind address |

## Execution and approvals (v0.3)

Every action that moves funds runs the same gate: **simulate on live state → policy → human approval if needed → sign → record in the ledger**.

```bash
npx leeway-mcp init-wallet      # creates the agent hot wallet (~/.leeway-mcp/agent-key.json, mode 600)
npx leeway-mcp approvals        # list approval requests
npx leeway-mcp approve 4E9496   # or: deny 4E9496
```

- **Testnet by default.** The agent can only sign on `base-sepolia` until you opt in: `LEEWAY_EXECUTION_CHAINS=base,base-sepolia`. `LEEWAY_EXECUTION=off` disables signing entirely.
- **A hot wallet, not your wallet.** Fund it with what you are willing to let the agent spend. The key lives only in the server process; no tool returns it.
- **Approvals are bound and single-use.** An approval is tied to a hash of the exact arguments, expires after 15 minutes and works once. The agent has no tool that can approve.
- **Three ways to approve:** Telegram buttons (`LEEWAY_TELEGRAM_BOT_TOKEN` + `LEEWAY_TELEGRAM_CHAT_ID`; only that chat is accepted), the CLI above, or the admin HTTP endpoint.

A typical flow: `x402_pay` for a $5 resource returns `pending_approval` with an `approval_id` → you tap Approve → the agent repeats the call with `approval_id` → `paid`, with the settlement receipt.

### Remote agents (HTTP)

```bash
LEEWAY_HTTP_TOKEN=<agent token, 16+ chars> LEEWAY_ADMIN_TOKEN=<different owner token> npx leeway-mcp http --port 3333
```

Stateless Streamable HTTP at `POST /mcp` (Bearer agent token), `GET /health`, and owner-only `GET /approvals`, `POST /approvals/<id>/approve|deny` (Bearer admin token). Binds to 127.0.0.1 unless you pass `--host`. The server refuses to start without an agent token, or if both tokens are the same.

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
- [x] Agent hot wallet with policy-gated execution (testnet by default)
- [x] x402 payment settlement in USDC (v1 + v2)
- [x] Human approvals via Telegram, CLI and admin HTTP
- [x] Streamable HTTP transport for remote agents
- [ ] ERC-4337 smart accounts with scoped session keys
- [ ] ERC-20 sells with exact allowances · email approvals · audit #1
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
