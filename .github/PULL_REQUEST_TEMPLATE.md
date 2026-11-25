## What and why

<!-- One feature or fix per PR. Link the issue. -->

## Checklist

- [ ] Anything that can move funds goes through `server/src/execute.js` (simulate → policy → approval → sign)
- [ ] Tests added or updated, and they spend no real funds
- [ ] `npm run test:boot` passes; `npm test` run locally (live APIs)
- [ ] If `server/src/onchain.js` changed: both sync scripts were run
- [ ] Docs updated (README, site/docs.html, tool descriptions)

## How I verified it
