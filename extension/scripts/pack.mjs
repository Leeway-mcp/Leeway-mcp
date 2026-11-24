// Packs Leeway Guard for each store from one source tree (manifest at the zip root):
//   dist/leeway-guard-<v>-chrome.zip   Chrome Web Store  (service worker only, no Firefox keys)
//   dist/leeway-guard-<v>-edge.zip     Edge Add-ons      (same as Chrome)
//   dist/leeway-guard-<v>-firefox.zip  Firefox Add-ons   (background scripts, gecko settings)
// Validates the manifest, referenced files, imports and the no-remote-code rules first.
// Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const fail = (m) => { console.error('✕', m); process.exit(1); };

/* ---------- validate ---------- */
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('version must be x.y.z');
const refs = [
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}), manifest.action?.default_popup,
  manifest.background?.service_worker, ...(manifest.background?.scripts || []),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const r of new Set(refs)) if (!fs.existsSync(path.join(ext, r))) fail(`manifest references a missing file: ${r}`);
if ((manifest.host_permissions || []).some((h) => h === '<all_urls>' || h === '*://*/*')) fail('host_permissions must not grant access to every site');
const runtimeJs = ['background.js', 'popup.js', 'content.js', 'inject.js', ...fs.readdirSync(path.join(ext, 'lib')).map((f) => `lib/${f}`)];
for (const f of runtimeJs) {
  const src = fs.readFileSync(path.join(ext, f), 'utf8');
  for (const [, spec] of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    if (/^(https?:)?\/\//.test(spec)) fail(`${f} imports remote code: ${spec}`);
    if (spec.startsWith('.') && !fs.existsSync(path.resolve(path.dirname(path.join(ext, f)), spec))) fail(`${f} imports missing ${spec}`);
  }
  if (/\beval\s*\(|new\s+Function\s*\(|importScripts\s*\(/.test(src)) fail(`${f} uses eval / new Function / importScripts`);
  if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/.test(src)) fail(`${f} writes raw HTML; build DOM nodes instead`);
}
const popupHtml = fs.readFileSync(path.join(ext, 'popup.html'), 'utf8');
if (/<script[^>]+src=["']https?:/i.test(popupHtml) || /<link[^>]+href=["']https?:[^>]+stylesheet/i.test(popupHtml)) fail('popup.html loads remote resources');

/* ---------- per-browser manifests ---------- */
const clone = () => JSON.parse(JSON.stringify(manifest));
const chromeManifest = () => {
  const m = clone();
  m.background = { service_worker: manifest.background.service_worker, type: manifest.background.type };
  delete m.browser_specific_settings;
  return m;
};
const firefoxManifest = () => {
  const m = clone();
  m.background = { scripts: manifest.background.scripts, type: manifest.background.type };
  return m;
};
const targets = [['chrome', chromeManifest()], ['edge', chromeManifest()], ['firefox', firefoxManifest()]];

/* ---------- runtime files only: no tests, scripts or docs ---------- */
const include = ['background.js', 'content.js', 'inject.js', 'popup.html', 'popup.css', 'popup.js', 'lib', 'icons', 'LICENSE'];
const files = [];
const walk = (rel) => {
  const abs = path.join(ext, rel);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isDirectory()) fs.readdirSync(abs).sort().forEach((f) => walk(`${rel}/${f}`));
  else files.push(rel);
};
include.forEach(walk);

/* ---------- minimal zip writer (deflate, CRC-32, fixed timestamps for reproducible builds) ---------- */
const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [rel, data] of entries) {
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
  return Buffer.concat([...locals, cd, end]);
}

const dist = path.join(ext, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(dist)) if (/^leeway-guard-.*\.zip$/.test(f)) fs.rmSync(path.join(dist, f)); // old builds only
const runtime = files.map((rel) => [rel, fs.readFileSync(path.join(ext, rel))]);
console.log(`✓ manifest valid · v${manifest.version} · ${files.length + 1} files · no remote code, no raw HTML writes`);
for (const [name, m] of targets) {
  const out = path.join(dist, `leeway-guard-${manifest.version}-${name}.zip`);
  fs.writeFileSync(out, zip([['manifest.json', Buffer.from(JSON.stringify(m, null, 2) + '\n')], ...runtime]));
  console.log(`  ${name.padEnd(8)} ${path.relative(ext, out)}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}
