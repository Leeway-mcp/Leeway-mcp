// Copies the isomorphic guard core (server/src/onchain.js) into the extension, so Leeway Guard
// makes exactly the same simulation and risk decisions as the MCP server.
// `node scripts/sync-core.mjs --check` fails if the copy has drifted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'server', 'src', 'onchain.js');
const dst = path.join(root, 'extension', 'lib', 'onchain.js');
const want = '// GENERATED from server/src/onchain.js by extension/scripts/sync-core.mjs. Do not edit here.\n' + fs.readFileSync(src, 'utf8');

if (process.argv.includes('--check')) {
  const have = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
  if (have !== want) { console.error('extension/lib/onchain.js is out of date: run `node extension/scripts/sync-core.mjs`'); process.exit(1); }
  console.log('extension/lib/onchain.js is in sync');
} else {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, want);
  console.log(`synced ${path.relative(root, src)} → ${path.relative(root, dst)}`);
}
