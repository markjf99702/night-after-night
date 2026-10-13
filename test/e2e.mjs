// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
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

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
const secs = text => text.trim().split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

await page.goto(base);
await page.evaluate(() => document.fonts.ready);

// It writes a show straight away, 90 minutes long to within a minute.
await page.waitForSelector('.set .item');
assert.ok(Math.abs(secs(await page.textContent('.paper-foot .total')) - 90 * 60) <= 60, 'first show lands on 90 minutes');
assert.equal(await sideways(), false, 'the builder scrolls sideways on a phone');

// Pick an hour.
await page.tap('[data-opt="minutes"] [data-v="60"]');
assert.ok(Math.abs(secs(await page.textContent('.paper-foot .total')) - 3600) <= 60, 'an hour is an hour');
// Ten minutes more with the stepper.
await page.tap('[data-step="5"]');
await page.tap('[data-step="5"]');
assert.equal(await page.textContent('#mins'), '1:10');
assert.ok(Math.abs(secs(await page.textContent('.paper-foot .total')) - 4200) <= 60, '1:10 lands on 1:10');

// Only the '90s.
const setYears = () => page.$$eval('.set .meta', ms => ms.map(m => +m.textContent.match(/\b(19|20)\d\d\b/)[0]));
const pressed = group => page.$$eval(`[data-opt="${group}"] [aria-pressed="true"]`, cs => cs.map(c => c.dataset.v));
await page.tap('[data-opt="when"] [data-v="90s"]');
const years = await setYears();
assert.ok(years.length && years.every(y => y >= 1991 && y <= 1999), `only the '90s: ${years}`);
// The 2020s as well: both on, and nothing from between.
await page.tap('[data-opt="when"] [data-v="20s"]');
assert.deepEqual(await pressed('when'), ['90s', '20s']);
const ends = await setYears();
assert.ok(ends.length && ends.every(y => y <= 1999 || y >= 2020), `the '90s and the 2020s: ${ends}`);
await page.tap('[data-opt="when"] [data-v="20s"]');
assert.deepEqual(await pressed('when'), ['90s'], 'tapping it again takes it off');

// Open a song on the setlist, swap in another version, and the total changes to match. The show is random, and a
// song with one version from the '90s has nothing to swap, so it opens songs until one has.
const before = await page.textContent('.paper-foot .total');
let others = [];
for (let i = 0; i < 6 && !others.length; i++) {
  await page.tap(`.set .item >> nth=${i}`);
  await page.waitForSelector('#sheet[open] .others');
  others = await page.$$('#sheet .others button:not([aria-current])');
  if (!others.length) await page.tap('#sheet [data-close]');
}
assert.ok(others.length > 0, 'other versions to swap in');
await others[0].tap();
assert.equal(await page.$('#sheet[open]'), null, 'the sheet closes after a swap');
const lengths = await page.$$eval('.set .meta b', bs => bs.map(b => b.textContent));
const sum = lengths.map(secs).reduce((a, b) => a + b, 0);
assert.equal(secs(await page.textContent('.paper-foot .total')), sum, 'total is the sum of the songs');
assert.ok(before, 'had a total before');

// Keep it, and it's listed; the link opens the same show.
await page.tap('#save');
await page.waitForSelector('#saved li a');
const kept = await page.getAttribute('#saved li a', 'href');
const keptTotal = await page.textContent('.paper-foot .total');
await page.tap('[data-opt="when"] [data-v="any"]');
await page.goto(base + kept);
await page.waitForSelector('.set .item');
assert.equal(await page.textContent('.paper-foot .total'), keptTotal, 'a kept show comes back the same');

// Where: two venues, and every song is from one of them. Tap one to take it off; Anywhere clears them.
await page.goto(base + '#/');
await page.waitForSelector('.set .item');
const addVenue = name => page.$eval('#venue', (s, n) => [...s.options].find(o => o.text.startsWith(n)).value, name).then(v => page.selectOption('#venue', v));
await addVenue('The Gorge Amphitheatre');
await addVenue('Saratoga Performing Arts Center');
assert.deepEqual(await page.$$eval('#where .chip', cs => cs.map(c => [c.firstChild.textContent, c.getAttribute('aria-pressed')])),
  [['Anywhere', 'false'], ['The Gorge Amphitheatre', 'true'], ['Saratoga Performing Arts Center', 'true']]);
assert.equal(await page.$eval('#venue', s => s.options[0].textContent), 'Add another venue');
assert.equal(await page.$eval('#venue', s => [...s.options].filter(o => o.disabled).length), 2, 'a chosen venue can’t be added twice');
const at = () => page.$$eval('.set .meta', ms => ms.map(m => m.textContent));
assert.ok((await at()).every(t => /Gorge|Saratoga/.test(t)), 'every song from one of the two');
await page.tap('#where .chip >> text=The Gorge Amphitheatre');
assert.deepEqual(await pressed('venues'), ['Saratoga Performing Arts Center|Saratoga Springs, NY']);
assert.ok((await at()).every(t => /Saratoga/.test(t)), 'then only Saratoga');
await page.tap('#where [data-v=""]');
assert.deepEqual(await pressed('venues'), [''], 'Anywhere again');

// Songs: find one and open it.
await page.tap('.tabs [data-tab="songs"]');
await page.fill('#q', 'two step');
await page.tap('#songs a');
await page.waitForSelector('#chart-box svg');
assert.match(await page.textContent('.song-head h2'), /Two Step/i);
const dots = await page.$$eval('#chart-box .dot', d => d.length);
assert.ok(dots > 40, `Two Step has its versions on the chart (${dots})`);
assert.match(await page.textContent('.headline'), /official live versions/);
assert.equal(await sideways(), false, 'the song page scrolls sideways on a phone');
// Tap a version in the list and the card shows it.
await page.tap('#vsort [data-v="long"]');
await page.tap('#vlist button >> nth=1');
const picked = await page.textContent('#picked .big');
const second = await page.textContent('#vlist button >> nth=1 >> .l');
assert.equal(picked.trim(), second.trim(), 'the card shows the version that was tapped');
// Tapping a dot on the chart picks it too.
const box = await page.$eval('#chart-box .dot', d => { const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(box.x, box.y);
assert.match(await page.evaluate(() => location.hash), /^#\/song\/two-step\/\d{4}-\d{2}-\d{2}$/, 'tapping a dot picks it');
assert.ok((await page.textContent('#picked h3')).trim(), 'the card names the night');

// The whole night.
await page.tap('#picked a[href^="#/night/"]');
await page.waitForSelector('.setlist li');
assert.ok((await page.$$('.setlist li')).length >= 1, 'the night lists its songs');
assert.match(await page.textContent('.band'), /Dave Matthews/);

// Nights: Worcester 1998 is there.
await page.tap('.tabs [data-tab="nights"]');
await page.fill('#nq', 'worcester');
await page.tap('.night-list a >> text=Worcester Centrum Centre');
await page.waitForSelector('.night-head');
assert.match(await page.textContent('.night-head h2'), /Worcester Centrum Centre/i);
assert.match(await page.textContent('.setlist'), /Seek Up/);
assert.equal(await sideways(), false, 'the night page scrolls sideways on a phone');

// Before the album: the songs that were on stage first, each one a way into its song.
await page.tap('.tabs [data-tab="songs"]');
await page.tap('.subnav a[href="#/before"]');
await page.waitForSelector('.album-run .waits a');
assert.match(await page.textContent('.before-page .headline'), /were on stage first/);
assert.equal(await sideways(), false, 'Before the album scrolls sideways on a phone');
await page.tap('.album-run .waits a >> text=Grey Street');
await page.waitForSelector('.song-head h2');
assert.match(await page.textContent('.song-head h2'), /Grey Street/);
assert.match(await page.textContent('.facts'), /before Busted Stuff came out/);

// What leads where: it starts with the openers; tap one to follow it.
await page.tap('.facts a[href^="#/flow/"]');
await page.waitForSelector('.flow-center');
assert.match(await page.textContent('.flow-center strong'), /Grey Street/);
await page.tap('.subnav a[href="#/flow"]');
await page.waitForFunction(() => /Openers/.test(document.querySelector('.flow-center')?.textContent));
const opener = (await page.textContent('.flow-list a.f-name >> nth=0')).trim();
await page.tap('.flow-list a.f-name >> nth=0');
await page.waitForFunction(name => document.querySelector('.flow-center strong')?.textContent.trim() === name, opener);
assert.equal(await page.inputValue('#flow-song'), await page.evaluate(() => location.hash.split('/')[2]), 'the picker follows along');
assert.equal(await sideways(), false, 'What leads where scrolls sideways on a phone');
// Pick a song from the list: Pantala Naga Pampa mostly goes into Rapunzel.
await page.selectOption('#flow-song', 'pantala-naga-pampa');
await page.waitForFunction(() => /Pantala/.test(document.querySelector('.flow-center strong')?.textContent));
const firsts = await page.$$eval('.flow-list', ls => ls.map(l => l.querySelector('.f-name')?.textContent.trim()));
assert.equal(firsts.at(-1), 'Rapunzel', 'Pantala Naga Pampa leads into Rapunzel');
// On a wide screen it's drawn as a map.
await page.setViewportSize({ width: 1100, height: 900 });
await page.waitForSelector('#flow svg.sankey');
assert.ok(await page.$$eval('#flow .s-node', n => n.length) >= 2, 'the map has songs either side');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForSelector('#flow .flow-list');

// Each year has a page, from the chart on the Nights page; step to the year before.
await page.tap('.tabs [data-tab="nights"]');
await page.waitForSelector('#years-box svg');
await page.tap('#years-box a[href="#/year/2008"]');
await page.waitForSelector('.year-head h2');
assert.equal((await page.textContent('.year-head h2')).trim(), '2008');
assert.match(await page.textContent('.changes'), /LeRoi Moore/);
assert.ok((await page.$$('.year-nights .night-list li')).length > 3, 'the year lists its nights');
assert.equal(await sideways(), false, 'a year page scrolls sideways on a phone');
await page.tap('.year-nav a >> text=2007');
await page.waitForFunction(() => document.querySelector('.year-head h2')?.textContent.trim() === '2007');

// Choices saved when "From when?" and "Where?" took one each come back the same.
const gorge = await page.evaluate(() => window.nightAfterNight.M.venues.find(v => v.name === 'The Gorge Amphitheatre').id);
await page.goto(base + '#/');
await page.evaluate(id => localStorage.setItem('night-after-night.options', JSON.stringify({ minutes: 60, when: 'leroi', venue: String(id), picks: 'mix', jams: 'any', covers: true })), gorge);
await page.reload();
await page.waitForSelector('.set .item');
assert.deepEqual(await pressed('when'), ['leroi']);
assert.deepEqual(await page.$$eval('#where [aria-pressed="true"]', cs => cs.map(c => c.firstChild.textContent)), ['The Gorge Amphitheatre']);
assert.ok((await setYears()).every(y => y <= 2008), 'with LeRoi');
await page.tap('#where [data-v=""]');
await page.tap('[data-opt="when"] [data-v="any"]');

// Junk in storage doesn't stop the page: a kept-shows list that isn't one, or choices that aren't on the page.
const stored = key => page.evaluate(k => JSON.parse(localStorage.getItem('night-after-night.' + k)), key);
const junk = async (key, value) => {
  await page.evaluate(([k, v]) => localStorage.setItem('night-after-night.' + k, v), [key, value]);
  await page.reload();
  await page.waitForSelector('.set .item', { timeout: 10000 });
};
await page.goto(base + '#/');
await junk('saved', '"str"');
await junk('saved', JSON.stringify([null, 5, { name: 'A kept show', minutes: 90, code: '19981208~seek-up', at: '2026-10-13' }]));
assert.deepEqual(await page.$$eval('#saved li a', as => as.map(a => a.textContent)), ['A kept show'], 'only the kept show is listed');
await page.tap('#saved .del');
assert.deepEqual(await stored('saved'), [null, 5], 'Remove takes out the show it’s next to');
await junk('saved', '{}');
await page.tap('#save');
await page.waitForSelector('#saved li a');
assert.equal((await stored('saved')).length, 1, 'Keep it starts a new list');
for (const minutes of ['"abc"', '-50', '100000']) {
  await junk('options', `{"minutes":${minutes}}`);
  assert.equal(await page.textContent('#mins'), '1:30', `minutes ${minutes} go back to 90`);
}
await junk('options', '{"minutes":60,"when":["toString"],"from":"x","to":1800,"picks":"nope","jams":5,"covers":"yes"}');
assert.equal(await page.textContent('#mins'), '1:00');
assert.deepEqual([await pressed('when'), await pressed('picks'), await pressed('jams')], [['any'], ['mix'], ['any']], 'the usual choices instead');
assert.equal(await page.isChecked('#covers'), true);
await page.evaluate(() => ['saved', 'options'].forEach(k => localStorage.removeItem('night-after-night.' + k)));

// Back to Nights or Songs comes back to the same spot, and to what was in the Nights search; a new visit starts at the top.
const scrolled = () => page.evaluate(() => Math.round(scrollY));
const backTo = async (spot, what) => {
  await page.goBack();
  await page.waitForFunction(y => Math.abs(scrollY - y) <= 2, spot, { timeout: 5000 }).catch(() => {});
  assert.ok(Math.abs(await scrolled() - spot) <= 2, `Back to ${what} comes back to ${spot}, not ${await scrolled()}`);
};
await page.tap('.tabs [data-tab="nights"]');
await page.waitForSelector('#y2012 .night-list a');
await page.$eval('#y2012 .night-list a', a => a.scrollIntoView({ block: 'center' }));
const nightsSpot = await scrolled();
assert.ok(nightsSpot > 2000, `scrolled well down the Nights (${nightsSpot})`);
await page.tap('#y2012 .night-list a');
await page.waitForSelector('.night-head');
await backTo(nightsSpot, 'Nights');
await page.tap('.tabs [data-tab="songs"]');
await page.waitForSelector('#songs a');
assert.equal(await scrolled(), 0, 'a new visit starts at the top');
await page.fill('#q', '');
await page.$eval('#songs li:nth-child(60) a', a => a.scrollIntoView({ block: 'center' }));
const songsSpot = await scrolled();
assert.ok(songsSpot > 2000, `scrolled well down the Songs (${songsSpot})`);
await page.tap('#songs li:nth-child(60) a');
await page.waitForSelector('.song-head');
await backTo(songsSpot, 'Songs');
await page.tap('.tabs [data-tab="nights"]');
await page.fill('#nq', 'gorge');
await page.tap('.night-list a >> nth=2');
await page.waitForSelector('.night-head');
await page.goBack();
await page.waitForFunction(() => document.getElementById('nq')?.value === 'gorge', null, { timeout: 5000 }).catch(() => {});
assert.equal(await page.inputValue('#nq'), 'gorge', 'the Nights search comes back');
assert.ok((await page.$$eval('.night-list .v', vs => vs.map(v => v.textContent))).every(t => /gorge/i.test(t)), 'and still finds only the Gorge');
await page.fill('#nq', '');

// A song only ever released on a track with another: each lineup's versions are counted, with no length to show.
const sharedOnly = await page.evaluate(() => window.nightAfterNight.M.songs.find(s => !s.median)?.slug);
if (sharedOnly) {
  await page.goto(base + '#/song/' + sharedOnly);
  await page.waitForSelector('.eras .era');
  const eras = await page.$$eval('.eras .era', es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(eras.some(t => /\d version/.test(t)), `${sharedOnly}: its versions are counted (${eras.join(' | ')})`);
  assert.ok(eras.every(t => !/0:00/.test(t)), `${sharedOnly}: no 0:00 lengths (${eras.join(' | ')})`);
}

// Works offline once it has been opened.
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('.set .item');
assert.ok(await page.title(), 'the page did not load offline');
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
