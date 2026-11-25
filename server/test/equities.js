// Equity Rails test: NYSE calendar unit checks (fixed dates, no network) and live checks for the
// three tools over stdio (reference quotes, tokenized prices, Parity Guard).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { sessionFor, marketStatus, nyseCalendar } from '../src/equities.js';

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✕'} ${name}${extra ? `  · ${extra}` : ''}`); if (!cond) failed++; };

/* ---------- calendar: fixed dates ---------- */
const at = (iso) => marketStatus(new Date(iso));
check('2026-12-25 Christmas: closed', sessionFor('2026-12-25').closed === 'Christmas Day');
const tg = sessionFor('2026-11-27');
check('2026-11-27 day after Thanksgiving: early close 13:00 ET', tg.early_close && tg.close.toISOString() === '2026-11-27T18:00:00.000Z');
check('Tuesday 2026-11-24 15:00 ET: regular session open', at('2026-11-24T20:00:00Z').open && at('2026-11-24T20:00:00Z').session === 'regular');
check('Saturday 2026-11-28: closed, next open Monday 09:30 ET', !at('2026-11-28T17:00:00Z').open && at('2026-11-28T17:00:00Z').next_open.utc === '2026-11-30T14:30:00.000Z');
check('DST start: 2026-03-06 opens 14:30 UTC (EST), 2026-03-09 opens 13:30 UTC (EDT)', sessionFor('2026-03-06').open.toISOString() === '2026-03-06T14:30:00.000Z' && sessionFor('2026-03-09').open.toISOString() === '2026-03-09T13:30:00.000Z');
check('DST end: 2026-11-02 opens 14:30 UTC', sessionFor('2026-11-02').open.toISOString() === '2026-11-02T14:30:00.000Z');
check('pre-market and after-hours sessions', at('2026-11-24T12:00:00Z').session === 'pre-market' && at('2026-11-24T22:00:00Z').session === 'after-hours');
const c26 = nyseCalendar(2026), c27 = nyseCalendar(2027);
check('2026: Good Friday Apr 3, Independence observed Jul 3, no July early close', c26.holidays['2026-04-03'] && c26.holidays['2026-07-03'] && !c26.early['2026-07-02']);
check('2027: Juneteenth observed Jun 18, Independence observed Jul 5, Christmas observed Dec 24', c27.holidays['2027-06-18'] && c27.holidays['2027-07-05'] && c27.holidays['2027-12-24']);
check('2028: New Year on Saturday is not observed on Fri 2027-12-31', !c27.holidays['2027-12-31'] && sessionFor('2027-12-31').open);
check('holiday counts: 10 per year', Object.keys(c26.holidays).length === 10 && Object.keys(c27.holidays).length === 10);

/* ---------- live tools ---------- */
const client = new Client({ name: 'leeway-eq-test', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.js'], env: { ...process.env, LEEWAY_TELEGRAM_BOT_TOKEN: '' } }));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  try { return r.isError ? { error: text } : JSON.parse(text); } catch { return { error: text }; }
};
const { tools } = await client.listTools();
check('equity tools registered', ['get_equity_quote', 'parity_check', 'market_hours'].every((n) => tools.some((t) => t.name === n)), `${tools.length} tools`);

for (const t of ['TSLA', 'AAPL']) {
  const q = await call('get_equity_quote', { ticker: t });
  check(`${t} reference quote is positive`, q.price > 0, q.error ? q.error.slice(0, 90) : `$${q.price} · ${q.source} · tokenized: ${q.tokenized?.map((x) => `${x.token} ${x.price_usd ?? 'n/a'}`).join(', ')}`);
}
const p = await call('parity_check', { ticker: 'TSLA' });
const priced = (p.tokens || []).filter((x) => typeof x.premium_pct === 'number');
check('parity_check TSLA: numeric premium + verdict for a tokenized version', priced.length > 0 && priced.every((x) => ['WITHIN_BAND', 'ABOVE_BAND', 'BELOW_BAND'].includes(x.verdict)), priced.map((x) => `${x.token} ${x.premium_pct}% ${x.verdict}`).join(' · ') || p.error || JSON.stringify(p).slice(0, 120));
const tight = await call('parity_check', { ticker: 'TSLA', band_pct: 0.0001 });
check('a tiny band flags any gap (ABOVE or BELOW)', (tight.tokens || []).filter((x) => x.premium_pct != null).every((x) => x.verdict !== 'WITHIN_BAND' || Math.abs(x.premium_pct) <= 0.0001));
const none = await call('parity_check', { ticker: 'MSFT' });
check('ticker without a tokenized version is reported clearly', none.verdict === 'NO_TOKENIZED_VERSION');
const bad = await client.callTool({ name: 'get_equity_quote', arguments: { ticker: 'not a ticker!' } }).catch((e) => ({ thrown: e.message }));
check('invalid ticker rejected by schema', Boolean(bad.thrown || bad.isError));
const mh = await call('market_hours', {});
check('market_hours returns a session and next open', typeof mh.open === 'boolean' && mh.session && (mh.open || mh.next_open), `${mh.session} · ${mh.now?.new_york}`);
await client.close();

console.log(failed ? `\n${failed} equity check(s) failed` : '\nall equity checks passed');
process.exit(failed ? 1 : 0);
