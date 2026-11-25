# Changelog

## Server

### 0.5.0
- ERC-4337 smart accounts (`LEEWAY_ACCOUNT=smart`): the agent acts from a Coinbase Smart Wallet owned by its key; approve + swap is one atomic user operation; optional paymaster; Pimlico public bundler by default on testnets
- Equity guardrails (`equity_policy_check`, enforced in `execute_swap`): market hours, Parity Guard per token, per-trade and per-ticker position caps, 1:1 tokens only

### 0.4.0
- Equity Rails (read-only): `get_equity_quote`, `parity_check`, `market_hours`; verified xStocks and Ondo tokens for TSLA, AAPL, NVDA, SPY

### 0.3.1
- `execute_swap` sells ERC-20 tokens with exact allowances; approve and swap are simulated together and covered by one approval
- Approval webhooks with HMAC-SHA256 signatures (email through Zapier, Make, n8n, Resend)

### 0.3.0
- Agent wallet with policy-gated execution (Base Sepolia by default): `wallet_info`, `send_transaction`, `execute_swap`
- `x402_pay`: USDC payments (x402 v1 and v2, EIP-3009), EIP-712 domain read from the token contract
- Human approvals bound to exact parameters: Telegram buttons, CLI, owner-only HTTP endpoint
- Streamable HTTP transport with separate agent and owner tokens

### 0.2.0
- `swap_quote`: best DEX route with impact, gas, token risk and policy checks
- `simulate_tx`: pre-sign simulation with asset changes, approvals, reverts and fail-closed pricing

### 0.1.0
- MCP server with market, wallet, risk, policy and x402 quote tools

## Leeway Guard (browser extension)

### 0.1.3
- Popup docs link points to leeway.icu

### 0.1.2
- Links to docs, GitHub and Telegram in the popup

### 0.1.1
- Per-browser packages (Chrome, Edge, Firefox); DOM rendering without `innerHTML`
- `eth_sign`, `personal_sign` and Sign-In with Ethereum interception with phishing check
- Firefox fallback channel

### 0.1.0
- Transaction and Permit / Permit2 signature firewall, Scan with Leeway, popup
