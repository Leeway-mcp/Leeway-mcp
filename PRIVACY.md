# Privacy

Applies to the Leeway Guard browser extension and the Leeway MCP server. Last updated 27 November 2026.
Web version: https://leeway.icu/privacy.html

## In short
- We collect nothing. No accounts, no analytics, no telemetry, no servers of our own.
- Both products run on your device. To do their job they query a few public APIs directly from your device, listed below.
- Neither product can read, store or use your private keys, seed phrase or wallet password.

## 1. Leeway Guard (browser extension)

### What it does
Leeway Guard reads transaction and signature requests that a website sends to your wallet (for example `eth_sendTransaction` or a Permit signature), simulates them and shows you what would happen before your wallet opens. It also lets you right-click an address on a page to check it.

### What we collect
Nothing. The extension has no account, no sign-in, no analytics or crash reporting, and no backend operated by us. We never receive your browsing history, your wallet address or your transactions.

### What leaves your browser, and why
To analyse a request, the extension sends the minimum data needed directly from your browser to these public services. Each provider handles requests under its own privacy policy.

| Service | What is sent | Why |
|---|---|---|
| PublicNode RPC (`*.publicnode.com`) | The transaction you are about to sign (from, to, value, calldata) and the chain | Simulate it on current chain state to show asset changes, approvals and reverts |
| GoPlus Security (`api.gopluslabs.io`) | Token and counterparty addresses involved in the request, or the address you chose to scan | Risk score and phishing / drainer / sanctions reputation |
| DefiLlama · CoinGecko (`coins.llama.fi` · `api.coingecko.com`) | Token contract addresses and the chain | USD prices for the amounts shown |

Because requests go directly from your browser, these services can see your IP address, as with any website you visit. Nothing is sent when you are just browsing: only when a site asks your wallet to sign something, or when you use Scan with Leeway.

### What is stored on your device
Your settings (on/off, paused sites, enabled chains) and local counters of checks, warnings and blocks, kept in the browser's extension storage. You can clear them from the extension popup or by removing the extension.

### Permissions and why they are needed
| Permission | Why |
|---|---|
| `storage` | Save your settings and local counters |
| `contextMenus` | The Scan with Leeway right-click item |
| `activeTab` | Lets the popup read the current tab's site when you click it, for Pause on this site. No access to other tabs or history. |
| Content scripts on all sites | Any website can ask your wallet to sign, so the extension must be present on every page to inspect those requests before they reach the wallet. It does not read page content otherwise. |
| Host access to the API domains above | Run the simulation, risk and price lookups |

## 2. Leeway MCP server
The MCP server runs on your own machine (or a server you control) next to your AI agent. We operate no backend for it.
- **Same public APIs.** It queries the services listed above, plus the KyberSwap aggregator for swap quotes, directly from where it runs.
- **Local files.** The spending ledger, approval requests and, if you create one, the agent hot-wallet key are stored only on that machine (by default in `~/.leeway-mcp/`). No tool returns the key, and it is never sent anywhere; only signed transactions and x402 payment authorizations leave the machine, and only after policy and, where required, your approval.
- **Telegram (optional).** If you configure a bot token and chat id, approval requests (a short summary, the amount and the reason) are sent to your Telegram chat through the Telegram Bot API. Nothing is sent to Telegram otherwise.
- **x402 merchants.** When your agent pays for a resource, the merchant receives the signed payment authorization, as the protocol requires.

## 3. Open source
Both products are open source under the MIT license, so every statement on this page can be checked in the code.

## 4. Changes and contact
If this policy changes, we will update this page and the date above. Questions: support@leeway.icu, [Telegram](https://t.me/leewaymcp), [X](https://x.com/Leewayicu) or an [issue on GitHub](https://github.com/Leeway-mcp/Leeway-mcp/issues).
