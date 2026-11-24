// Signature firewall + "Scan with Leeway". Gasless signatures (EIP-2612 Permit, Uniswap
// Permit2, DAI-style permits) are the cheapest way to drain a wallet: one signature, no
// transaction for the victim to inspect. This module turns the typed data into plain facts.
import { tokenMeta, formatUnits, scoreToken, ADDRESS_RE } from './onchain.js';
import { CHAINS, chainName } from './chains.js';

const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const lc = (s) => String(s ?? '').toLowerCase();
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '?');
const big = (v) => { try { return BigInt(v ?? 0); } catch { return 0n; } };
const DAY = 86_400;

/** One allowance a signature would grant. */
function grants(typed) {
  const { primaryType: pt, domain = {}, message: m = {} } = typed;
  const isPermit2 = lc(domain.verifyingContract) === PERMIT2 || domain.name === 'Permit2';
  if (isPermit2) {
    const out = [];
    const exp = (d) => Number(d?.expiration ?? 0);
    if (pt === 'PermitSingle' && m.details) out.push({ standard: 'Permit2', token: m.details.token, amount: big(m.details.amount), max: 2n ** 159n, spender: m.spender, deadline: Number(m.sigDeadline ?? 0), expiry: exp(m.details) });
    if (pt === 'PermitBatch' && Array.isArray(m.details)) for (const d of m.details) out.push({ standard: 'Permit2', token: d.token, amount: big(d.amount), max: 2n ** 159n, spender: m.spender, deadline: Number(m.sigDeadline ?? 0), expiry: exp(d) });
    if (/PermitTransferFrom|PermitWitnessTransferFrom/.test(pt) && m.permitted) {
      const list = Array.isArray(m.permitted) ? m.permitted : [m.permitted];
      // transfer-from permits move tokens immediately: the spender takes them in one call
      for (const p of list) out.push({ standard: 'Permit2 transfer', token: p.token, amount: big(p.amount), max: 2n ** 159n, spender: m.spender, deadline: Number(m.deadline ?? 0), transfer: true });
    }
    return out;
  }
  if (pt === 'Permit' && m.spender && m.value !== undefined) {
    return [{ standard: 'EIP-2612 Permit', token: domain.verifyingContract, amount: big(m.value), max: 2n ** 255n, spender: m.spender, deadline: Number(m.deadline ?? 0) }];
  }
  if (pt === 'Permit' && m.spender && m.allowed !== undefined) { // DAI-style: allowed = unlimited
    return [{ standard: 'DAI Permit', token: domain.verifyingContract, amount: m.allowed === true || m.allowed === 'true' ? 2n ** 256n - 1n : 0n, max: 1n, spender: m.spender, deadline: Number(m.expiry ?? 0) }];
  }
  return [];
}

async function reputation(ctx, addr) {
  try {
    const r = await ctx.addressSecurity(addr);
    return Object.entries(r || {}).filter(([k, v]) => v === '1' && k !== 'contract_address').map(([k]) => k.replace(/_/g, ' '));
  } catch { return []; }
}

export async function analyzeTypedData(ctx, { chainId, from, typed }) {
  const domainChain = typed?.domain?.chainId != null ? chainName(typed.domain.chainId) : null;
  const chain = domainChain || chainName(chainId);
  const warnings = [];
  const warn = (severity, message) => warnings.push({ severity, message });
  const list = grants(typed || {});
  const now = Math.floor(Date.now() / 1000);

  if (!list.length) {
    const d = typed?.domain || {};
    const fields = Object.entries(typed?.message || {}).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}`);
    warn('medium', 'unrecognised signature type: read it carefully, signatures can authorise transfers');
    return { verdict: 'REVIEW', kind: 'signature', chain, method: `${typed?.primaryType ?? 'unknown'} · ${d.name ?? 'unknown app'}${d.verifyingContract ? ` (${short(d.verifyingContract)})` : ''}`, details: fields, grants: [], warnings };
  }
  if (from && typed?.message?.owner && lc(typed.message.owner) !== lc(from)) warn('medium', `the signature is for ${short(typed.message.owner)}, not the connected account`);

  const out = await Promise.all(list.map(async (g) => {
    const [meta, code, flags] = await Promise.all([
      chain && ADDRESS_RE.test(g.token || '') ? tokenMeta(ctx, chain, g.token).catch(() => null) : null,
      chain && ADDRESS_RE.test(g.spender || '') ? ctx.rpc(chain, 'eth_getCode', [g.spender, 'latest']).catch(() => null) : null,
      ADDRESS_RE.test(g.spender || '') ? reputation(ctx, g.spender) : [],
    ]);
    const symbol = meta?.symbol ?? short(g.token);
    const unlimited = g.amount >= g.max;
    const isEoa = code === '0x';
    const amount = unlimited ? 'unlimited' : meta ? formatUnits(g.amount, meta.decimals) : g.amount.toString();
    if (flags.length) warn('high', `spender ${short(g.spender)} is flagged: ${flags.join(', ')}`);
    if (isEoa) warn('high', `${symbol} ${g.transfer ? 'transfer' : 'allowance'} to a plain wallet ${short(g.spender)}, not a contract: a classic drainer pattern`);
    else if (unlimited) warn('medium', `unlimited ${symbol} allowance to contract ${short(g.spender)}`);
    if (g.transfer && !isEoa) warn('medium', `${symbol} can be pulled from your wallet immediately by ${short(g.spender)}`);
    const longest = Math.max(g.deadline || 0, g.expiry || 0);
    if (longest > now + 30 * DAY) warn('medium', `${g.standard} stays valid for ${Math.round((longest - now) / DAY)} days`);
    return { standard: g.standard, symbol, token: g.token, amount, spender: g.spender, spender_is_contract: code == null ? null : !isEoa, valid_until: longest ? new Date(longest * 1000).toISOString().slice(0, 10) : null };
  }));
  const high = warnings.some((w) => w.severity === 'high');
  return { verdict: high ? 'DO_NOT_SIGN' : warnings.length ? 'REVIEW' : 'SAFE_TO_SIGN', kind: 'signature', chain, method: `${list[0].standard} signature`, grants: out, warnings };
}

/* ---------------- message signatures: personal_sign / eth_sign ---------------- */
const SIWE_HEAD = /^(?:(?<scheme>[a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?(?<domain>[^\s/]+) wants you to sign in with your Ethereum account:\n(?<address>0x[a-fA-F0-9]{40})/;

function decodeMessage(msg) {
  const s = String(msg ?? '');
  if (!/^0x([0-9a-fA-F]{2})*$/.test(s)) return { text: s, bytes: null };
  const bytes = new Uint8Array(s.slice(2).match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // mostly printable? control characters other than whitespace mean binary data
    const ctrl = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
    return ctrl === 0 && text.length ? { text, bytes } : { text: null, bytes };
  } catch { return { text: null, bytes }; }
}

/** SIWE (EIP-4361) fields we show and verify. */
function parseSiwe(text) {
  const m = text.match(SIWE_HEAD);
  if (!m) return null;
  const field = (name) => text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim() ?? null;
  return { domain: m.groups.domain, address: m.groups.address, uri: field('URI'), chainId: field('Chain ID'), nonce: field('Nonce'), issuedAt: field('Issued At'), expiresAt: field('Expiration Time') };
}

export function analyzeMessage({ method, message, from, origin }) {
  const warnings = [];
  const warn = (severity, text) => warnings.push({ severity, message: text });
  if (method === 'eth_sign') {
    warn('high', 'blind signature of a raw hash: it can authorise anything, including a transaction that moves your funds');
    return { verdict: 'DO_NOT_SIGN', kind: 'message', method: 'eth_sign · raw hash', details: [`hash: ${String(message ?? '').slice(0, 66)}`], warnings, summary: 'No legitimate dApp needs this today.' };
  }
  const { text, bytes } = decodeMessage(message);
  if (text == null) {
    warn('medium', bytes?.length === 32 ? 'the message is a 32-byte value, possibly a hash of something you cannot see' : 'the message is binary data that cannot be read');
    return { verdict: 'REVIEW', kind: 'message', method: 'personal_sign · binary', details: [`${bytes?.length ?? 0} bytes: ${String(message).slice(0, 66)}${String(message).length > 66 ? '…' : ''}`], warnings };
  }
  const shown = text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
  const siwe = parseSiwe(text);
  if (siwe) {
    const site = String(origin || '').toLowerCase();
    const details = [`domain: ${siwe.domain}`, `account: ${short(siwe.address)}`, siwe.chainId ? `chain id: ${siwe.chainId}` : null, siwe.expiresAt ? `expires: ${siwe.expiresAt}` : null].filter(Boolean);
    if (lc(siwe.domain) !== site) {
      warn('high', `this sign-in is for ${siwe.domain}, but you are on ${origin}: a phishing site may be trying to log in to ${siwe.domain} as you`);
      return { verdict: 'DO_NOT_SIGN', kind: 'message', method: 'Sign-In with Ethereum', message: shown, details, warnings, siwe };
    }
    if (from && lc(siwe.address) !== lc(from)) warn('medium', `the sign-in names ${short(siwe.address)}, not the connected account`);
    return { verdict: warnings.length ? 'REVIEW' : 'SAFE_TO_SIGN', kind: 'message', method: 'Sign-In with Ethereum', message: shown, details, warnings, siwe, summary: 'A sign-in request for this site. No funds move.' };
  }
  return { verdict: 'SAFE_TO_SIGN', kind: 'message', method: 'personal_sign · text', message: shown, warnings, summary: 'A plain text message. Signing it cannot move funds by itself; make sure you agree with what it says.' };
}

/** Right-click "Scan with Leeway": token risk on the first chain with data, else address reputation. */
export async function scanAddress(ctx, text) {
  const address = String(text || '').match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (!address) return { error: 'no 0x address in the selection' };
  const chains = ['ethereum', 'base', 'bsc', 'arbitrum'];
  const hits = await Promise.all(chains.map((c) => ctx.tokenSecurity(c, address).then((s) => (s && s.token_symbol ? { c, s } : null)).catch(() => null)));
  const hit = hits.find(Boolean);
  if (hit) {
    const r = scoreToken(hit.s);
    return { type: 'token', address, chain: hit.c, name: hit.s.token_name, symbol: hit.s.token_symbol, holders: Number(hit.s.holder_count || 0), ...r };
  }
  const flags = await reputation(ctx, address);
  return { type: 'address', address, flagged: flags.length > 0, flags, verdict: flags.length ? 'FLAGGED' : 'No malicious activity reported' };
}
export { CHAINS };
