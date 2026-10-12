// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random is seeded, so the same pictures come out every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const SEED = 21; // change it until the pictures look good
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

async function open(viewport, deviceScaleFactor, hash = '', scheme = 'dark') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: viewport.width < 600, colorScheme: scheme, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(seed => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }, SEED);
  await page.goto(base + hash);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600); // let the setlist finish writing itself
  return page;
}

// A 256-colour PNG keeps the files small.
async function save(page, path, clip) {
  const png = await page.screenshot({ clip });
  const img = UPNG.decode(png);
  const small = UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256);
  await writeFile(join(root, path), Buffer.from(small));
}

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2);
  const top = await page.$eval('.f-time', el => el.getBoundingClientRect().top + scrollY - 70);
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-build.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/song/two-step');
  const top = await page.$eval('.headline', el => el.getBoundingClientRect().top + scrollY - 70);
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-song.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/night/1998-12-08');
  const top = await page.$eval('.night-head', el => el.getBoundingClientRect().top + scrollY - 70);
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-night.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/before');
  const top = await page.$$eval('.album-run h3', hs => {
    const h = hs.find(h => /Busted Stuff/.test(h.textContent));
    return h.getBoundingClientRect().top + scrollY - 100;
  });
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-before.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/flow/ants-marching');
  const top = await page.$eval('#flow', el => el.getBoundingClientRect().top + scrollY - 70);
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-flow.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, '#/year/2008');
  const top = await page.$eval('.year-page', el => el.getBoundingClientRect().top + scrollY - 70);
  await page.evaluate(y => scrollTo(0, y), top);
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-year.png');
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, a setlist the app wrote on the right.
{
  const app = await open({ width: 1100, height: 1400 }, 2, '#/', 'light');
  await app.evaluate(() => {
    const { opts, writeShow } = window.nightAfterNight;
    Object.assign(opts, { minutes: 60, picks: 'hits', when: 'any', venue: '', jams: 'any', covers: true });
    writeShow(false);
  });
  await app.waitForTimeout(300);
  await app.evaluate(() => { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; });
  const paper = await (await app.$('.paper-wrap')).screenshot({ omitBackground: true });
  await app.context().close();

  const font = async f => `data:font/woff2;base64,${(await readFile(join(root, 'fonts', f))).toString('base64')}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Archivo; src: url(${await font('archivo.woff2')}); font-weight: 100 900; font-stretch: 62% 125%; }
    html, body { margin: 0; }
    body { width: 1200px; height: 630px; overflow: hidden; position: relative; font-family: Archivo, sans-serif;
      background: #0f0d0b radial-gradient(ellipse 900px 520px at 260px -80px, rgba(244, 181, 69, .22), transparent 70%); color: #f1ebe0; }
    .words { position: absolute; left: 72px; top: 64px; width: 470px; }
    h1 { margin: 0; font-weight: 800; font-stretch: 72%; font-size: 118px; line-height: .86; text-transform: uppercase; letter-spacing: -.01em; }
    p { margin: 30px 0 0; font-size: 28px; line-height: 1.34; color: #d9cfbe; }
    .site { position: absolute; left: 72px; bottom: 50px; font-size: 21px; color: #a99e8d; }
    .paper { position: absolute; right: 24px; top: 26px; width: 590px; transform: rotate(3deg); transform-origin: top center; }
  </style></head><body>
    <div class="words"><h1>Night<br>After<br>Night</h1><p>Every official Dave Matthews Band live version, and a show built from them to fit your drive.</p></div>
    <div class="site">junkdrawer.works/night-after-night</div>
    <img class="paper" src="data:image/png;base64,${paper.toString('base64')}">
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await save(page, 'og.png');
  await page.close();
}

await browser.close();
server.close();
console.log('screenshots written');
