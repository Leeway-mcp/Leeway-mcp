// Where approval requests go: Telegram (buttons) and/or a webhook. The webhook is how email,
// Slack or anything else works: point it at Zapier, Make, n8n or your own endpoint (e.g. one that
// sends an email through Resend). Optional HMAC signing so the receiver can verify the sender.
//
//   LEEWAY_APPROVAL_WEBHOOK=https://hooks.example.com/leeway
//   LEEWAY_APPROVAL_WEBHOOK_SECRET=<shared secret>   → X-Leeway-Signature: sha256=<hex of HMAC(body)>
import crypto from 'node:crypto';
import { notifyApproval as notifyTelegram, telegramEnabled } from './telegram.js';

export const webhookEnabled = () => Boolean(process.env.LEEWAY_APPROVAL_WEBHOOK);

export async function notifyWebhook(a) {
  const url = process.env.LEEWAY_APPROVAL_WEBHOOK;
  if (!url) return false;
  const body = JSON.stringify({
    type: 'approval_requested',
    approval: { id: a.id, summary: a.summary, value_usd: a.value_usd ?? null, reasons: a.reasons ?? [], expires_at: a.expires_at },
    approve_hint: `npx leeway-mcp approve ${a.id}  (or deny ${a.id})`,
  });
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'leeway-mcp' };
  const secret = process.env.LEEWAY_APPROVAL_WEBHOOK_SECRET;
  if (secret) headers['X-Leeway-Signature'] = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; } // a slow or broken webhook never blocks the tool
}

/** Sends to every configured channel in parallel; returns the channels that accepted it. */
export async function notifyApproval(a) {
  const [tg, wh] = await Promise.all([telegramEnabled ? notifyTelegram(a) : false, notifyWebhook(a)]);
  const via = [tg && 'telegram', wh && 'webhook'].filter(Boolean);
  return via.length ? via : ['none'];
}
