// Telegram approvals: the owner gets a message with Approve / Deny buttons for every action that
// needs a human. Only callbacks from the configured chat are accepted.
// Setup: create a bot with @BotFather, send it any message, then set
//   LEEWAY_TELEGRAM_BOT_TOKEN=<token>  LEEWAY_TELEGRAM_CHAT_ID=<your chat id>
import { decide, setMeta } from './approvals.js';

const token = process.env.LEEWAY_TELEGRAM_BOT_TOKEN;
const chatId = process.env.LEEWAY_TELEGRAM_CHAT_ID;
export const telegramEnabled = Boolean(token && chatId);
const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(35_000),
}).then((r) => r.json());
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function notifyApproval(a) {
  if (!telegramEnabled) return false;
  const text = [
    `<b>Leeway · approval needed</b>  <code>${a.id}</code>`,
    '',
    esc(a.summary),
    `Value: <b>$${a.value_usd ?? '?'}</b>`,
    a.reasons?.length ? `Why: ${esc(a.reasons.join('; '))}` : '',
    `Expires: ${a.expires_at.slice(11, 16)} UTC`,
  ].filter(Boolean).join('\n');
  try {
    const r = await api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ap:${a.id}` }, { text: '✕ Deny', callback_data: `dn:${a.id}` }]] } });
    if (r.ok) setMeta(a.id, { tgMessageId: r.result.message_id });
    return r.ok;
  } catch { return false; }
}

let polling = false;
export function startTelegramPolling() {
  if (!telegramEnabled || polling) return;
  polling = true;
  let offset = 0;
  const tick = async () => {
    try {
      const r = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['callback_query'] });
      for (const u of r.result || []) {
        offset = u.update_id + 1;
        const q = u.callback_query;
        if (!q) continue;
        if (String(q.message?.chat?.id) !== String(chatId)) { await api('answerCallbackQuery', { callback_query_id: q.id, text: 'Not authorised' }); continue; }
        const [op, id] = String(q.data).split(':');
        let note;
        try { const a = decide(id, op === 'ap' ? 'approve' : 'deny', `telegram:${q.from?.username || q.from?.id}`); note = a.status === 'approved' ? '✅ Approved' : '✕ Denied'; }
        catch (e) { note = e.message; }
        await api('answerCallbackQuery', { callback_query_id: q.id, text: note });
        await api('editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: note, callback_data: 'noop' }]] } });
      }
      setTimeout(tick, 200);
    } catch { setTimeout(tick, 5000); }
  };
  tick();
}
