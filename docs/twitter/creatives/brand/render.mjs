// Renders the Leeway brand set from brand.html with headless Chrome.
//   node render.mjs <playwright-dir>
// Outputs next to this file: x-header-1500x500.png (+ @2x), x-avatar-400.png, leeway-mark-1024.png,
// leeway-logo-dark.png (light wordmark, for dark backgrounds), leeway-logo-light.png (dark wordmark).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.argv[2] || here, 'package.json'));
const { chromium } = require('playwright');
const url = (v) => `${pathToFileURL(path.join(here, 'brand.html')).href}?v=${v}`;
const jobs = [
  ['header', 'x-header-1500x500.png', 1500, 500, 1, false],
  ['header', 'x-header-3000x1000@2x.png', 1500, 500, 2, false],
  ['avatar', 'x-avatar-400.png', 400, 400, 1, false],
  ['avatar', 'x-avatar-800@2x.png', 400, 400, 2, false],
  ['mark', 'leeway-mark-1024.png', 1024, 1024, 1, true],
  ['lockup-dark', 'leeway-logo-dark.png', 2000, 560, 1, true],
  ['lockup-light', 'leeway-logo-light.png', 2000, 560, 1, true],
];
const b = await chromium.launch({ channel: 'chrome' });
for (const [v, file, w, h, s, transparent] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s });
  await p.goto(url(v));
  await p.waitForFunction('window.__ready === true', null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(here, file), omitBackground: transparent });
  console.log('saved', file);
  await p.close();
}
await b.close();
