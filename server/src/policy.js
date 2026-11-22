// Policy engine: the guardrail between an AI agent and money.
// Enforced server-side, so nothing in a prompt can change these limits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const env = process.env;
const list = (v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []);

export const policy = {
  dailyLimitUsd: Number(env.LEEWAY_DAILY_LIMIT_USD ?? 50),
  perTxLimitUsd: Number(env.LEEWAY_PER_TX_LIMIT_USD ?? 25),
  hardCapUsd: Number(env.LEEWAY_HARD_CAP_USD ?? 500),
  microAllowanceUsd: Number(env.LEEWAY_MICRO_ALLOWANCE_USD ?? 1),
  allowlist: list(env.LEEWAY_ALLOWLIST),
  denylist: list(env.LEEWAY_DENYLIST),
  requireApproval: (env.LEEWAY_REQUIRE_APPROVAL ?? 'true') !== 'false',
};

// Ledger of spends approved today, persisted so limits survive restarts.
const ledgerFile = env.LEEWAY_LEDGER || path.join(os.homedir(), '.leeway-mcp', 'ledger.json');
const today = () => new Date().toISOString().slice(0, 10);

function readLedger() {
  try {
    const l = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    return l.day === today() ? l : { day: today(), spentUsd: 0, entries: [] };
  } catch {
    return { day: today(), spentUsd: 0, entries: [] };
  }
}
function writeLedger(l) {
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  fs.writeFileSync(ledgerFile, JSON.stringify(l, null, 2));
}

/**
 * Evaluate a proposed spend.
 * @returns {{decision: 'allow'|'needs_approval'|'deny', reasons: string[], remainingTodayUsd: number}}
 */
export function evaluate({ valueUsd, recipient = '', merchant = '', flagged = false }) {
  const l = readLedger();
  const remaining = Math.max(0, policy.dailyLimitUsd - l.spentUsd);
  const who = (merchant || recipient).toLowerCase();
  const reasons = [];
  let decision = 'allow';
  const deny = (r) => { decision = 'deny'; reasons.push(r); };
  const ask = (r) => { if (decision !== 'deny') decision = 'needs_approval'; reasons.push(r); };

  if (!(valueUsd >= 0)) deny('value must be a non-negative number');
  if (flagged) deny('counterparty is flagged as malicious');
  if (who && policy.denylist.includes(who)) deny(`${who} is on the denylist`);
  if (valueUsd > policy.hardCapUsd) deny(`exceeds hard cap of $${policy.hardCapUsd}`);
  if (policy.allowlist.length && who && !policy.allowlist.includes(who) && valueUsd > policy.microAllowanceUsd) {
    deny(`${who} is not on the allowlist`);
  }
  if (decision !== 'deny') {
    if (valueUsd <= policy.microAllowanceUsd && l.spentUsd + valueUsd <= policy.dailyLimitUsd) {
      reasons.push(`within micro-payment allowance ($${policy.microAllowanceUsd})`);
    } else {
      if (valueUsd > policy.perTxLimitUsd) ask(`above per-transaction limit of $${policy.perTxLimitUsd}`);
      if (valueUsd > remaining) ask(`above remaining daily budget ($${remaining.toFixed(2)} of $${policy.dailyLimitUsd})`);
      if (decision === 'allow' && policy.requireApproval && valueUsd > policy.microAllowanceUsd) ask('owner requires approval for non-micro spends');
    }
  }
  if (decision === 'allow' && !reasons.length) reasons.push('within all limits');
  return { decision, reasons, remainingTodayUsd: Number(remaining.toFixed(2)) };
}

export function record({ valueUsd, memo }) {
  const l = readLedger();
  l.spentUsd = Number((l.spentUsd + valueUsd).toFixed(6));
  l.entries.push({ at: new Date().toISOString(), valueUsd, memo });
  writeLedger(l);
  return l;
}

export function report() {
  const l = readLedger();
  return { day: l.day, spentUsd: l.spentUsd, remainingUsd: Math.max(0, policy.dailyLimitUsd - l.spentUsd), entries: l.entries, policy };
}
