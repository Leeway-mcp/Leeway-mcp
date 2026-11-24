// Packs the extension into dist/leeway-guard-<version>.zip (manifest at the zip root), ready for
// addons.mozilla.org, Edge Add-ons and the Chrome Web Store. Node built-ins only.
// Also validates the manifest and that every file it references exists.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const fail = (m) => { console.error('✕', m); process.exit(1); };

// --- validate
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
const refs = [
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}), manifest.action?.default_popup,
  manifest.background?.service_worker, ...(manifest.background?.scripts || []),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const r of new Set(refs)) if (!fs.existsSync(path.join(ext, r))) fail(`manifest references a missing file: ${r}`);
if ((manifest.host_permissions || []).includes('<all_urls>')) fail('host_permissions must not include <all_urls>');
// every ESM import must resolve inside the package
const files = ['background.js', 'popup.js', 'content.js', 'inject.js', ...fs.readdirSync(path.join(ext, 'lib')).map((f) => `lib/${f}`)];
for (const f of files) {
  const src = fs.readFileSync(path.join(ext, f), 'utf8');
  for (const [, spec] of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(path.join(ext, f)), spec))) fail(`${f} imports missing ${spec}`);
  }
}

// --- collect package files (runtime only: no tests, scripts or docs)
const include = ['manifest.json', 'background.js', 'content.js', 'inject.js', 'popup.html', 'popup.css', 'popup.js', 'lib', 'icons', 'LICENSE'];
const entries = [];
const walk = (rel) => {
  const abs = path.join(ext, rel);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isDirectory()) fs.readdirSync(abs).sort().forEach((f) => walk(`${rel}/${f}`));
  else entries.push(rel);
};
include.forEach(walk);

// --- minimal zip writer (deflate, CRC-32)
const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const locals = [], centrals = [];
let offset = 0;
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed timestamp: reproducible builds
for (const rel of entries) {
  const data = fs.readFileSync(path.join(ext, rel));
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(rel.replace(/\\/g, '/'));
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  locals.push(local, name, comp);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + comp.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const out = path.join(ext, 'dist', `leeway-guard-${manifest.version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(`✓ manifest valid · ${entries.length} files · ${path.relative(ext, out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
