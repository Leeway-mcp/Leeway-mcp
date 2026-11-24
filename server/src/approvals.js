// Human-in-the-loop approvals. When the policy says "needs_approval", the action is parked here
// and the owner decides from Telegram, the CLI or the admin HTTP endpoint. The agent itself has
// no tool that can approve anything.
//
// An approval is bound to a hash of the exact action parameters and can be used once, so an
// approved $5 payment cannot be swapped for a $500 one, or replayed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
const file = env.LEEWAY_APPROVALS || path.join(os.homedir(), '.leeway-mcp', 'approvals.json');
const TTL_MIN = Number(env.LEEWAY_APPROVAL_TTL_MIN ?? 15);

const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: [] }; } };
const write = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); };
const stable = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(typeof v === 'bigint' ? v.toString() : v));
export const hashParams = (params) => crypto.createHash('sha256').update(stable(params)).digest('hex');

const refresh = (a) => { if (a.status === 'pending' && Date.now() > Date.parse(a.expiresAt)) a.status = 'expired'; return a; };
const pub = (a) => ({ id: a.id, status: a.status, kind: a.kind, summary: a.summary, value_usd: a.valueUsd, reasons: a.reasons, created_at: a.createdAt, expires_at: a.expiresAt, decided_by: a.decidedBy ?? null });

export function createApproval({ kind, params, summary, valueUsd, reasons }) {
  const db = read();
  const id = crypto.randomBytes(3).toString('hex').toUpperCase();
  const now = Date.now();
  const a = { id, kind, summary, valueUsd, reasons, paramsHash: hashParams(params), status: 'pending', used: false, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MIN * 60_000).toISOString() };
  db.items = [...db.items.map(refresh).filter((x) => now - Date.parse(x.createdAt) < 7 * 864e5), a];
  write(db);
  return pub(a);
}

export function getApproval(id) {
  const a = read().items.find((x) => x.id === String(id).toUpperCase());
  return a ? pub(refresh(a)) : null;
}

export function listApprovals() {
  return read().items.map(refresh).slice(-20).reverse().map(pub);
}

export function decide(id, decision, by = 'owner') {
  const db = read();
  const a = db.items.find((x) => x.id === String(id).toUpperCase());
  if (!a) throw new Error(`no approval with id ${id}`);
  refresh(a);
  if (a.status !== 'pending') throw new Error(`approval ${a.id} is already ${a.status}`);
  a.status = decision === 'approve' ? 'approved' : 'denied';
  a.decidedBy = by;
  a.decidedAt = new Date().toISOString();
  write(db);
  return pub(a);
}

/** Uses an approval for exactly these params. Returns null if it may proceed, or the reason it may not. */
export function consume(id, params) {
  const db = read();
  const a = db.items.find((x) => x.id === String(id).toUpperCase());
  if (!a) return `no approval with id ${id}`;
  refresh(a);
  if (a.status !== 'approved') return `approval ${a.id} is ${a.status}`;
  if (a.used) return `approval ${a.id} was already used`;
  if (a.paramsHash !== hashParams(params)) return `approval ${a.id} was granted for different parameters`;
  a.used = true;
  write(db);
  return null;
}

export function setMeta(id, meta) {
  const db = read();
  const a = db.items.find((x) => x.id === id);
  if (a) { Object.assign(a, meta); write(db); }
}
