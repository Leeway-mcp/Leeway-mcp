# Post 01 · Launch intro (with video `video-ad-v2/final/leeway-promo-16x9.mp4`)

Pillar: introduction / launch. Goal: first contact, who we are, why it matters.

## Main post (short, ≤280)
```
AI agents can now pay, swap and sign.

Nobody checks what they're about to sign.

Meet Leeway: a lighthouse between your agent and the chain.
Every transaction simulated. Limits enforced in code. The big ones wait for your tap in Telegram.

Open source. Free.
```

## First reply (links go here, X ranks link-free main posts higher)
```
Leeway MCP: 21 tools for Claude, Cursor and any agent. Market data, risk, swaps, x402 payments, a policy-gated wallet.
Leeway Guard: the same check in your browser, before MetaMask or Rabby opens.

github.com/Leeway-mcp/Leeway-mcp
leeway.icu
```

## Long version (Premium, single post)
```
AI agents can now pay, swap and sign.
That also means they can be drained.

One bad approval. One poisoned contract. One prompt injection. Gone.

Meet Leeway: open-source guardrails for AI agents that touch money.

How it works:
→ Every transaction is simulated before it's signed
→ Spend limits live in code, not in a prompt the model can talk its way around
→ Anything big is parked and sent to you in Telegram: Approve / Deny
→ The model never sees a private key

Two products, one engine:
· Leeway MCP: 21 tools for Claude, Cursor and any agent
· Leeway Guard: a browser extension that shows what you're really signing before your wallet opens

Give your agents leeway, not a private key.
```

## Thread version (if posting as a thread)
1.
```
AI agents can now pay, swap and sign.

Nobody checks what they're about to sign.

So we built a lighthouse. 🧵
```
2.
```
Leeway sits between your agent and the chain.

Before anything is signed, it's simulated on live chain state: what leaves the wallet, what arrives, which approvals are granted, whether it reverts.
```
3.
```
Then the policy engine decides.

Limits live in code: per-transaction caps, daily budgets, allowlists. A prompt can't talk its way past them.

Anything over your line is parked and sent to you in Telegram. One tap: Approve or Deny.
```
4.
```
And for humans: Leeway Guard.

The same engine as a browser extension. It catches drainer approvals and Permit2 traps before MetaMask or Rabby even opens.

Local. No account. No telemetry.
```
5.
```
Open source, MIT, free.

Give your agents leeway, not a private key.

github.com/Leeway-mcp/Leeway-mcp
```

## Claim → source
| Claim | Source |
|---|---|
| simulate before signing | README "How it works", server/src/onchain.js |
| limits in code | server/src/policy.js |
| Telegram Approve / Deny | README step 4, server/src/telegram.js |
| model never sees a key | README intro, wallet_info never returns key |
| 21 tools, Claude / Cursor | README products table |
| Guard before MetaMask / Rabby, Permit2, local, no telemetry | store/listing.md, site/privacy.html |
| MIT | LICENSE |
