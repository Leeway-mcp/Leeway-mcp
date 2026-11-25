# Security policy

Leeway sits between AI agents and money, so we treat security reports as the highest priority.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: **Security → Report a vulnerability** on [Leeway-mcp/Leeway-mcp](https://github.com/Leeway-mcp/Leeway-mcp/security/advisories/new). If that is not possible, message the team on [Telegram](https://t.me/leewaymcp) and ask for a private channel; do not post details in the public chat.

Include what you can: affected component and version, steps to reproduce, impact, and a suggested fix if you have one.

We aim to acknowledge reports within 72 hours and to agree on a disclosure timeline with you. We credit reporters who want to be credited.

## In scope

- Bypassing the policy engine, limits or approvals (e.g. making the agent sign above its limits, reusing or forging an approval)
- Leaking the agent key through any tool, log or error
- Simulation results that hide a harmful effect (a transaction that drains funds but is reported as safe)
- Leeway Guard: a site that bypasses the overlay, or makes a dangerous request look safe
- Authentication issues in HTTP mode (agent token reaching owner endpoints)

## Out of scope

- Losses from limits you configured yourself, or from mainnet chains you enabled
- Third-party services (RPC providers, GoPlus, price APIs, bundlers) returning wrong data, unless Leeway fails to fail closed
- Social engineering of the owner

## Supported versions

Only the latest release of the server and the extension receives security fixes during the 0.x phase.

Leeway reduces risk; it cannot remove it. Keep the agent wallet funded only with what you are willing to let it spend.
