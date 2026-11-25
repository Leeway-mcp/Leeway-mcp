# Leeway Guard · store listing kit

Copy-paste material for Firefox Add-ons (AMO), Microsoft Edge Add-ons and, later, the Chrome Web Store.
Package: `node extension/scripts/pack.mjs` → `dist/leeway-guard-<version>.zip` (manifest at the zip root).

---

## Name
Leeway Guard

## Summary (AMO ≤ 250 chars · Chrome ≤ 132 chars)
See what you sign. Leeway Guard simulates every wallet transaction and signature before it reaches your wallet and warns you about drainers, unlimited approvals and risky tokens.

Short (132): See what you sign: simulates wallet transactions and signatures before you approve, and flags drainers and risky tokens.

## Category
Firefox: Privacy & Security · Edge: Productivity / Security · Chrome: Tools (Security & privacy)

## Description

Leeway Guard is a free, open-source firewall for your crypto wallet.

When a website asks your wallet to send a transaction or sign a message, Leeway Guard checks it first and shows you, in plain words, what will actually happen:

• Assets that leave and enter your wallet, with USD values
• Approvals you are about to grant, and whether they are unlimited
• Permit and Permit2 signatures, the most common way wallets get drained with a single click
• Spenders that are plain wallets instead of contracts, or are known scam addresses
• Transactions that would fail and only burn gas

You get a clear verdict (Safe to sign, Review, Do not sign, Will revert) and choose to continue to your wallet or reject.

Right-click any 0x address on any page (X, Telegram Web, a DEX) and choose "Scan with Leeway" for a 0–100 token risk score or an address reputation check.

Works with MetaMask, Rabby, Coinbase Wallet and any EIP-1193 / EIP-6963 wallet on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain and Avalanche.

Private by design
• No account, no telemetry, no tracking
• Leeway Guard never sees or touches your keys. It reads the request before your wallet does; your wallet still does the signing.
• Checks run in your browser against public data sources (PublicNode RPC for simulation, GoPlus Security for risk, DefiLlama and CoinGecko for prices)

Open source (MIT). Leeway Guard uses the same simulation engine as Leeway MCP, the open-source guardrail server for AI agents.

Leeway Guard reduces risk; it cannot remove it. Always read what you sign.

## Privacy policy URL
https://leeway.icu/privacy.html

## Homepage / support
Homepage: https://leeway.icu/ · Source: https://github.com/Leeway-mcp/Leeway-mcp · Support: https://t.me/leewaymcp · Issues: https://github.com/Leeway-mcp/Leeway-mcp/issues

## Permission justifications (for reviewers)

| Permission | Why it is needed |
|---|---|
| Content scripts on all sites (`<all_urls>`) | Wallet requests can come from any website (any dApp). The script wraps the page's wallet provider (`window.ethereum`, EIP-6963) so it can show the check before the wallet popup. It does not read page content, forms or cookies. |
| `storage` | Saves settings (on/off, sites you paused) and local counters in the browser. Nothing is uploaded. |
| `contextMenus` | Adds "Scan with Leeway" to the right-click menu for a selected address. |
| `activeTab` | When the user opens the popup, reads the current tab's site so "Pause on this site" can work. Only on click; no access to other tabs or history. |
| Host access: `*.publicnode.com` | Public Ethereum RPC used to simulate the transaction (`eth_simulateV1`) and read contract code. |
| Host access: `api.gopluslabs.io` | Token risk and address reputation lookups. |
| Host access: `coins.llama.fi`, `api.coingecko.com` | USD prices for the assets in a transaction. |

Data sent: the transaction or signature request being checked (addresses, calldata, amounts) to the RPC; addresses to GoPlus; token addresses to the price APIs. No browsing history, no identifiers, no analytics.

## Notes for the reviewer
- No remote code: all scripts ship in the package; there is no `eval` and no remotely hosted code.
- No build step: the package is the source in `extension/` of the public repository.
- To test: open any page with a wallet installed (or the test dApp in `extension/test/`), trigger a transaction; the Leeway Guard panel appears before the wallet popup.

## Screenshots to upload (1280×800)
1. Overlay: "DO NOT SIGN · unlimited USDC approval to a plain wallet"
2. Overlay: "SAFE TO SIGN" for a simple transfer, with asset changes
3. Permit2 signature flagged
4. Popup with counters and recent checks
5. "Scan with Leeway" result on an X post

---

## Accounts the owner needs
- Firefox Add-ons: free developer account at addons.mozilla.org (Firefox account). Automated signing in minutes; listed review usually 1–3 days.
- Edge Add-ons: free Microsoft Partner Center registration. Review up to 7 business days.
- Chrome Web Store (later): one-time $5 developer fee. Review usually a few days; broad host access can take longer.
