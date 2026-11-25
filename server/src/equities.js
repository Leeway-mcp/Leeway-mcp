// Equity Rails (phase 4, read-only): reference stock quotes, tokenized-stock prices, Parity Guard
// and the NYSE trading calendar. No keys: Yahoo Finance chart API with a Nasdaq API fallback for the
// reference price, DefiLlama (by contract) with a CoinGecko fallback for tokenized versions.
import { getJSON } from './data.js';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' };
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
export const TICKER_RE = /^[A-Za-z][A-Za-z.]{0,6}$/;

/* ---------------- verified tokenized stocks ----------------
   Every address below came from the CoinGecko coin API ("platforms") and its symbol() was read
   on-chain on Ethereum (and Arbitrum for xStocks) on 2026-11-24. Do not add entries by hand
   without the same check. Both issuers target 1 token ≈ 1 underlying share; small persistent
   gaps can come from dividend handling, fees or after-hours trading. */
export const TOKENIZED = {
  TSLA: [
    { token: 'TSLAx', issuer: 'Backed · xStocks', cg: 'tesla-xstock', chains: { ethereum: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', arbitrum: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', bsc: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0' } },
    { token: 'TSLAon', issuer: 'Ondo Global Markets', cg: 'tesla-ondo-tokenized-stock', chains: { ethereum: '0xf6b1117ec07684d3958cad8beb1b302bfd21103f', bsc: '0x2494b603319d4d9f9715c9f4496d9e0364b59d93' } },
  ],
  AAPL: [
    { token: 'AAPLx', issuer: 'Backed · xStocks', cg: 'apple-xstock', chains: { ethereum: '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a', arbitrum: '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a', bsc: '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a' } },
    { token: 'AAPLon', issuer: 'Ondo Global Markets', cg: 'apple-ondo-tokenized-stock', chains: { ethereum: '0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c', bsc: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4' } },
  ],
  NVDA: [
    { token: 'NVDAx', issuer: 'Backed · xStocks', cg: 'nvidia-xstock', chains: { ethereum: '0xc845b2894dbddd03858fd2d643b4ef725fe0849d', arbitrum: '0xc845b2894dbddd03858fd2d643b4ef725fe0849d', bsc: '0xc845b2894dbddd03858fd2d643b4ef725fe0849d' } },
    { token: 'NVDAon', issuer: 'Ondo Global Markets', cg: 'nvidia-ondo-tokenized-stock', chains: { ethereum: '0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee', bsc: '0xa9ee28c80f960b889dfbd1902055218cba016f75' } },
  ],
  SPY: [
    { token: 'SPYx', issuer: 'Backed · xStocks', cg: 'sp500-xstock', chains: { ethereum: '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48', arbitrum: '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48', bsc: '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48' } },
    { token: 'SPYon', issuer: 'Ondo Global Markets', cg: 'spdr-s-p-500-etf-ondo-tokenized-etf', chains: { ethereum: '0xfedc5f4a6c38211c1338aa411018dfaf26612c08', bsc: '0x6a708ead771238919d85930b5a0f10454e1c331a' } },
  ],
};

/* ---------------- NYSE calendar (XNYS) ----------------
   Computed from the NYSE holiday rules (nyse.com blocks automated access, so dates are derived,
   then pinned by unit tests): New Year's Day, MLK Day (3rd Mon Jan), Washington's Birthday (3rd
   Mon Feb), Good Friday, Memorial Day (last Mon May), Juneteenth, Independence Day, Labor Day
   (1st Mon Sep), Thanksgiving (4th Thu Nov), Christmas. Saturday holidays move to Friday, Sunday
   ones to Monday, except New Year's Day on a Saturday, which is not observed. Early closes at
   13:00 ET: July 3 when July 4 falls Tue–Fri, the day after Thanksgiving, December 24 when it falls
   Mon–Thu. */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
const addDays = (s, n) => { const t = new Date(`${s}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const nth = (y, m, wd, n) => { let d = 1 + ((wd - dow(y, m, 1) + 7) % 7) + (n - 1) * 7; return ymd(y, m, d); };
const last = (y, m, wd) => { const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); let d = days - ((dow(y, m, days) - wd + 7) % 7); return ymd(y, m, d); };
function easter(y) { // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}
const observed = (y, m, d, { skipSaturday = false } = {}) => {
  const w = dow(y, m, d), s = ymd(y, m, d);
  if (w === 6) return skipSaturday ? null : addDays(s, -1);
  if (w === 0) return addDays(s, 1);
  return s;
};

const cache = new Map();
export function nyseCalendar(year) {
  if (cache.has(year)) return cache.get(year);
  const holidays = {};
  const put = (date, name) => { if (date) holidays[date] = name; };
  put(observed(year, 1, 1, { skipSaturday: true }), "New Year's Day");
  put(nth(year, 1, 1, 3), 'Martin Luther King Jr. Day');
  put(nth(year, 2, 1, 3), "Washington's Birthday");
  put(addDays(easter(year), -2), 'Good Friday');
  put(last(year, 5, 1), 'Memorial Day');
  put(observed(year, 6, 19), 'Juneteenth National Independence Day');
  put(observed(year, 7, 4), 'Independence Day');
  put(nth(year, 9, 1, 1), 'Labor Day');
  const thanksgiving = nth(year, 11, 4, 4);
  put(thanksgiving, 'Thanksgiving Day');
  put(observed(year, 12, 25), 'Christmas Day');
  const early = {};
  const j4 = dow(year, 7, 4);
  if (j4 >= 2 && j4 <= 5) early[ymd(year, 7, 3)] = 'Day before Independence Day';
  early[addDays(thanksgiving, 1)] = 'Day after Thanksgiving';
  const x24 = dow(year, 12, 24);
  if (x24 >= 1 && x24 <= 4) early[ymd(year, 12, 24)] = 'Christmas Eve';
  const cal = { holidays, early };
  cache.set(year, cal);
  return cal;
}

const NY = 'America/New_York';
const nyParts = (date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: NY, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
};
/** UTC instant for a New York wall-clock time (handles EST/EDT). */
export function nyTime(dateStr, hh, mm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = nyParts(new Date(guess));
    const [py, pm, pd] = p.date.split('-').map(Number);
    const diff = Date.UTC(py, pm - 1, pd, p.hour, p.minute) - Date.UTC(y, m - 1, d, hh, mm);
    guess -= diff;
  }
  return new Date(guess);
}
const fmtNy = (date) => new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(date);

/** The regular session for a New York calendar date, or null when the market is closed all day. */
export function sessionFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = dow(y, m, d);
  const cal = nyseCalendar(y);
  if (w === 0 || w === 6) return { date: dateStr, open: null, close: null, closed: 'weekend' };
  if (cal.holidays[dateStr]) return { date: dateStr, open: null, close: null, closed: cal.holidays[dateStr] };
  const early = cal.early[dateStr];
  return { date: dateStr, open: nyTime(dateStr, 9, 30), close: nyTime(dateStr, early ? 13 : 16, 0), early_close: early || null };
}

export function marketStatus(now = new Date()) {
  const today = nyParts(now).date;
  const s = sessionFor(today);
  const open = Boolean(s.open && now >= s.open && now < s.close);
  let session = 'closed';
  if (open) session = 'regular';
  else if (s.open && now >= nyTime(today, 4, 0) && now < s.open) session = 'pre-market';
  else if (s.open && now >= s.close && now < nyTime(today, 20, 0)) session = 'after-hours';
  let nextOpen = null;
  for (let i = 0; i < 14 && !nextOpen; i++) {
    const day = sessionFor(addDays(today, i));
    if (day.open && day.open > now) nextOpen = day;
  }
  const year = Number(today.slice(0, 4));
  const upcoming = [year, year + 1].flatMap((y) => {
    const c = nyseCalendar(y);
    return [...Object.entries(c.holidays).map(([date, name]) => ({ date, name, type: 'closed' })), ...Object.entries(c.early).map(([date, name]) => ({ date, name, type: 'early close 13:00 ET' }))];
  }).filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const iso = (d) => (d ? d.toISOString() : null);
  return {
    market: 'XNYS', open, session,
    now: { utc: now.toISOString(), new_york: fmtNy(now) },
    today: s.open ? { date: today, open_utc: iso(s.open), close_utc: iso(s.close), early_close: s.early_close } : { date: today, closed: s.closed },
    ...(open && { closes: { utc: iso(s.close), new_york: fmtNy(s.close), in_minutes: Math.round((s.close - now) / 60000) } }),
    next_open: nextOpen ? { utc: iso(nextOpen.open), new_york: fmtNy(nextOpen.open), in_minutes: Math.round((nextOpen.open - now) / 60000) } : null,
    upcoming,
    calendar: 'NYSE rules (holidays, observed days, 13:00 ET early closes)',
  };
}

/* ---------------- reference quotes ---------------- */
async function yahoo(ticker) {
  const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`, { headers: BROWSER });
  const m = d.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error(d.chart?.error?.description || 'no Yahoo data');
  const prev = m.chartPreviousClose ?? m.previousClose ?? null;
  return {
    ticker: m.symbol, name: m.longName || m.shortName, exchange: m.fullExchangeName || m.exchangeName, currency: m.currency,
    price: m.regularMarketPrice, previous_close: prev, change_pct: prev ? round((m.regularMarketPrice / prev - 1) * 100, 3) : null,
    as_of: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, source: 'Yahoo Finance',
  };
}
async function nasdaq(ticker) {
  const num = (s) => (s == null ? null : Number(String(s).replace(/[$,%+]/g, '')));
  for (const cls of ['stocks', 'etf']) {
    const d = await getJSON(`https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=${cls}`, { headers: BROWSER }).catch(() => null);
    const p = d?.data?.primaryData;
    if (p?.lastSalePrice) {
      const price = num(p.lastSalePrice), chg = num(p.netChange);
      return { ticker: d.data.symbol, name: d.data.companyName, exchange: d.data.exchange, currency: 'USD', price, previous_close: chg != null ? round(price - chg, 4) : null, change_pct: num(p.percentageChange), as_of: p.lastTradeTimestamp, source: 'Nasdaq' };
    }
  }
  throw new Error('no Nasdaq data');
}
export async function referenceQuote(ticker) {
  const t = ticker.toUpperCase();
  try { return await yahoo(t); } catch (e1) {
    try { return await nasdaq(t); } catch (e2) { throw new Error(`no reference price for ${t} (Yahoo: ${e1.message}; Nasdaq: ${e2.message})`); }
  }
}

async function tokenPrices(list) {
  const keys = list.map((x) => `ethereum:${x.chains.ethereum}`);
  const out = {};
  try {
    const d = await getJSON(`https://coins.llama.fi/prices/current/${keys.join(',')}`);
    list.forEach((x, i) => { const c = d.coins?.[keys[i]]; if (c?.price) out[x.token] = { price: c.price, age_s: Math.max(0, Math.round(Date.now() / 1000 - c.timestamp)), confidence: c.confidence ?? null, source: 'DefiLlama' }; });
  } catch { /* fall back below */ }
  const missing = list.filter((x) => !out[x.token]);
  if (missing.length) {
    try {
      const d = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${missing.map((x) => x.cg).join(',')}&vs_currencies=usd&include_last_updated_at=true`);
      for (const x of missing) { const c = d[x.cg]; if (c?.usd) out[x.token] = { price: c.usd, age_s: c.last_updated_at ? Math.max(0, Math.round(Date.now() / 1000 - c.last_updated_at)) : null, confidence: null, source: 'CoinGecko' }; }
    } catch { /* leave missing */ }
  }
  return out;
}

export async function equityQuote({ ticker }) {
  const t = ticker.toUpperCase();
  const tokens = TOKENIZED[t] || [];
  const [ref, px] = await Promise.all([referenceQuote(t), tokens.length ? tokenPrices(tokens) : {}]);
  const status = marketStatus();
  return {
    ...ref, market_open: status.open, session: status.session,
    tokenized: tokens.length ? tokens.map((x) => ({ token: x.token, issuer: x.issuer, price_usd: px[x.token]?.price ?? null, premium_pct: px[x.token] ? round((px[x.token].price / ref.price - 1) * 100, 3) : null, price_age_s: px[x.token]?.age_s ?? null, source: px[x.token]?.source ?? null, contracts: x.chains })) : [],
    ...(tokens.length ? {} : { note: `no verified tokenized version of ${t} in the registry yet` }),
  };
}

/** Parity Guard: may an agent buy the tokenized version at this price? */
export async function parityCheck({ ticker, bandPct }) {
  const t = ticker.toUpperCase();
  const band = Number(bandPct ?? process.env.LEEWAY_EQ_PARITY_BAND_PCT ?? 0.5);
  const tokens = TOKENIZED[t];
  if (!tokens) return { ticker: t, verdict: 'NO_TOKENIZED_VERSION', note: `no verified tokenized version of ${t}; supported: ${Object.keys(TOKENIZED).join(', ')}` };
  const status = marketStatus();
  let ref = null, refErr = null;
  try { ref = await referenceQuote(t); } catch (e) { refErr = e.message; }
  const px = await tokenPrices(tokens);
  const results = tokens.map((x) => {
    const p = px[x.token];
    if (!ref) return { token: x.token, issuer: x.issuer, verdict: 'NO_REFERENCE' };
    if (!p) return { token: x.token, issuer: x.issuer, verdict: 'NO_PRICE' };
    const premium = (p.price / ref.price - 1) * 100;
    const verdict = premium > band ? 'ABOVE_BAND' : premium < -band ? 'BELOW_BAND' : 'WITHIN_BAND';
    const stale = p.age_s != null && p.age_s > 3600;
    return {
      token: x.token, issuer: x.issuer, price_usd: round(p.price, 4), premium_pct: round(premium, 3), verdict,
      action: verdict === 'ABOVE_BAND' ? 'block buys: paying more than the real share' : verdict === 'BELOW_BAND' ? 'flag: discount may mean a depeg, redemption issue or stale price' : 'ok to buy at this price',
      ...(stale && { stale: true, price_age_s: p.age_s }), source: p.source,
    };
  });
  return {
    ticker: t, band_pct: band, market_open: status.open, session: status.session,
    reference: ref ? { price: ref.price, kind: status.open ? 'live' : 'last close', source: ref.source, as_of: ref.as_of } : { error: refErr },
    tokens: results,
    ...(!status.open && { note: 'US market closed: the reference is the last regular-session price, while tokens trade 24/7, so gaps can reflect after-hours news. The band is not widened.' }),
  };
}
