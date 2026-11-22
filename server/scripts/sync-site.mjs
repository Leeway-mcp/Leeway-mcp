// Copies the isomorphic guard core into the landing page so the browser playground runs the
// exact code the MCP server runs. `node scripts/sync-site.mjs --check` fails if they drifted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'server', 'src', 'onchain.js');
const dst = path.join(root, 'site', 'js', 'onchain.js');
const banner = '// GENERATED from server/src/onchain.js by `npm run sync-site`. Do not edit here.\n';
const want = banner + fs.readFileSync(src, 'utf8');

if (process.argv.includes('--check')) {
  const have = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
  if (have !== want) { console.error('site/js/onchain.js is out of date: run `npm run sync-site`'); process.exit(1); }
  console.log('site/js/onchain.js is in sync');
} else {
  fs.writeFileSync(dst, want);
  console.log(`synced ${path.relative(root, src)} → ${path.relative(root, dst)}`);
}
