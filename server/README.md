# leeway-mcp

**Give your agents leeway, not a private key.**

MCP server that gives Claude, Cursor and any AI agent safe, policy-guarded access to on-chain value. No API keys needed.

```json
{
  "mcpServers": {
    "leeway": {
      "command": "npx",
      "args": ["-y", "leeway-mcp"],
      "env": { "LEEWAY_DAILY_LIMIT_USD": "50", "LEEWAY_PER_TX_LIMIT_USD": "25" }
    }
  }
}
```

**11 tools:** `get_price`, `trending_tokens`, `get_gas`, `get_balance`, `scan_token`, `check_address`, `swap_quote` (best DEX route with impact, risk and policy checks), `simulate_tx` (dry-run any transaction before signing: assets out/in, approvals, reverts), `policy_check`, `x402_quote`, `spending_report`.

Every tool is read-only: nothing is ever signed or broadcast. Every money-related answer carries a policy decision (`allow` / `needs_approval` / `deny`) enforced in code, not in the prompt.

Full docs, configuration and roadmap: see the main repository.

MIT · Not financial advice.
