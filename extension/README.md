# Leeway Guard

**See what you sign.** A browser extension that checks every transaction and permit signature before your wallet opens, using the same simulation engine as the Leeway MCP server.

Works with any wallet that injects an EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet, Phantom EVM, Rainbow…) on any dApp. Open source, local, no account.

## What it does

| | |
|---|---|
| **Transaction firewall** | When a site calls `eth_sendTransaction`, Leeway simulates it on live chain state (`eth_simulateV1` with transfer tracing) and shows what would leave and enter your wallet, which approvals it grants, whether it reverts, and the gas cost. |
| **Signature firewall** | `eth_signTypedData_v3/v4` requests are decoded. EIP-2612 `Permit`, DAI-style permits and Uniswap Permit2 (`PermitSingle`, `PermitBatch`, `PermitTransferFrom`) are turned into plain facts: token, amount, spender, how long it stays valid. Unlimited amounts, plain-wallet spenders, flagged spenders and long deadlines are called out. Unknown signature types are shown as "Review carefully". |
| **Scan with Leeway** | Select any `0x…` address on a page, right-click → *Scan with Leeway*: token risk score (honeypot, mint, taxes, blacklist, holders, LP lock) or, for a wallet, its phishing/drainer/sanctions reputation. |
| **Popup** | Protection on/off, pause on the current site, counters (checked, warned, rejected) and the last five checks. |

Verdicts: **Looks safe**, **Review carefully**, **Do not sign**, **Will fail** (would revert), **Could not check** (network error or timeout: you decide, nothing is silently passed or blocked). You always make the final call: *Reject* returns the standard EIP-1193 `4001 User rejected` error to the site; *Continue to wallet* hands the request to your wallet unchanged.

Chains: Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Base Sepolia, Sepolia. Requests on other chains go to the wallet unchecked, with a notice.

## Privacy

- Everything runs in your browser. No servers of ours, no analytics, no account, no telemetry.
- To check a request, the extension sends only what is needed to public, keyless services: the transaction or token/spender addresses to PublicNode RPC (simulation), GoPlus Security (token and address risk), DefiLlama and CoinGecko (USD prices).
- Counters and the last five checks are stored in `storage.local` on your device and never leave it.

## Permissions

| Permission | Why |
|---|---|
| Content scripts on all sites | A drainer can live on any domain, so the check has to run wherever a wallet can be asked to sign. The script only reacts to wallet requests. |
| `storage` | On/off switch, paused sites, counters, last five checks. |
| `contextMenus` | The *Scan with Leeway* right-click item. |
| `activeTab` | Lets the popup read the current site's host for *Pause on this site*. |
| Host access to `*.publicnode.com`, `api.gopluslabs.io`, `coins.llama.fi`, `api.coingecko.com` | The only network endpoints the extension talks to. |

## Install from source

**Chrome, Edge, Brave:** open `chrome://extensions` (or `edge://extensions`), enable *Developer mode*, click *Load unpacked*, select this `extension/` folder.

**Firefox (128+):** open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on*, select `extension/manifest.json`.

## Development

```bash
node scripts/sync-core.mjs          # copy server/src/onchain.js → lib/onchain.js (same engine as the MCP server)
node scripts/sync-core.mjs --check  # fail if the copy drifted
node scripts/pack.mjs               # validate the manifest and build dist/leeway-guard-0.1.0.zip
node scripts/icons.mjs <pw-dir>     # re-render icons from site/assets/favicon.svg (needs Playwright)
node test/guard.test.mjs <pw-dir> [chromium-exe]   # end-to-end test with a mock dApp and wallet
```

How it works: `inject.js` runs in the page at `document_start` and patches every wallet provider in place (`window.ethereum`, including wallets injected later, and EIP-6963 announcements). Watched requests travel over a private `MessageChannel` to `content.js`, which asks the background worker to run the check, then shows the verdict in a closed shadow root the page cannot read or restyle. `background.js` runs the shared core (`lib/onchain.js`, generated from the server) plus the signature analyzer (`lib/analyze.js`).

## Store status

| Store | Status |
|---|---|
| Firefox Add-ons (AMO) | submitting first (free) |
| Microsoft Edge Add-ons | submitting first (free) |
| Chrome Web Store | after the first two ($5 developer fee) |

Until then, install from source as above.

## Limits

Leeway Guard shows what a request would do; it cannot guarantee that something is safe. A site that specifically targets this extension could try to interfere with the page-side script; the wallet's own confirmation screen still applies. Not financial advice. MIT licensed.
