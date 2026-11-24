// Renders the toolbar / store icons from the Drift mark (site/assets/favicon.svg) with Playwright.
// Usage: node scripts/icons.mjs <path-to-playwright-module-dir>   (Playwright is a dev-only tool,
// not a dependency of the extension; pass the folder where it is installed)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const pwDir = process.argv[2];
if (!pwDir) { console.error('usage: node scripts/icons.mjs <dir containing node_modules/playwright>'); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);
const svg = fs.readFileSync(path.join(root, 'site', 'assets', 'favicon.svg'), 'utf8');
const out = path.join(root, 'extension', 'icons');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('icons written to', path.relative(root, out));
