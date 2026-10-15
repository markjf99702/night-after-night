// Before the album, each year, and what leads where, on every show in the DMB Almanac:  node --test test/insights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import shows from '../js/shows.js';
import { build } from '../js/model.js';
import { attachShows } from '../js/almanac.js';
import { beforeAlbum, yearStats, years, allYears, flow, gapText, lineupChanges, firstHeard, START, END } from '../js/insights.js';

const M = attachShows(build(data), shows);
const named = name => M.allSongs.find(s => s.name === name);
const sum = rows => rows.reduce((a, [, n]) => a + n, 0);

test('a wait in words', () => {
  assert.equal(gapText(1), '1 day');
  assert.equal(gapText(5), '5 days');
  assert.equal(gapText(31), '1 month');
  assert.equal(gapText(400), '1 year 1 month');
  assert.equal(gapText(730, true), '2 yr');
  assert.equal(gapText(6159), '16 years 10 months');
});

test('songs on stage before their album, from the first time each was played', () => {
  const B = beforeAlbum(M);
  assert.ok(B.rows.length > 80, `${B.rows.length} songs`);
  for (const r of B.rows) {
    assert.ok(!r.song.cover, `${r.song.name} is the band's own`);
    assert.equal(r.album, r.song.albums[0].album, `${r.song.name} against its first album`);
    assert.ok(r.first.date < r.album.date && r.days > 0, `${r.song.name} came first`);
    assert.ok(r.first.date <= r.song.first.date, `${r.song.name} was played no later than its first release`);
  }
  // The Lillywhite songs were on stage for years before Busted Stuff.
  const busted = B.albums.find(g => g.album.name === 'Busted Stuff');
  for (const name of ['Grey Street', 'Bartender', 'Raven']) assert.ok(busted.rows.some(r => r.song.name === name), name);
  assert.ok(busted.rows.find(r => r.song.name === 'Bartender').days > 3 * 365, 'Bartender waited over three years');
  assert.equal(B.longest.song.name, 'Break Free');
  assert.equal(B.longest.album.name, 'Walk Around the Moon');
  for (const g of B.albums) {
    const dates = g.rows.map(r => r.first.date);
    assert.deepEqual(dates, [...dates].sort(), g.album.name);
  }
  assert.ok(B.never.some(s => s.name === 'Anyone Seen the Bridge?'));
  assert.ok(B.never.every(s => !s.cover && !s.albums.length && s.count >= 2));
  // The first time anywhere, the band's show or not.
  const bartender = named('Bartender');
  assert.ok(firstHeard(bartender).date < bartender.firstPlay.date && !firstHeard(bartender).band, 'Bartender came first with Tim Reynolds');
});

test('what leads where, at every show with a setlist', () => {
  const F = flow(M);
  assert.equal(F.nights, M.setShows.filter(s => s.sequence.length).length);
  assert.ok(F.nights > 2000);
  // Every show has one opener and one closer, and every time a song is played something comes before it and after.
  assert.equal(sum(F.after(START)), F.nights);
  assert.equal(sum(F.before(END)), F.nights);
  assert.deepEqual(F.before(START), []);
  assert.deepEqual(F.after(END), []);
  for (const s of M.allSongs) assert.equal(sum(F.before(s)), sum(F.after(s)), s.name);
  // Pantala Naga Pampa goes into Rapunzel, nearly always straight through.
  const pnp = named('Pantala Naga Pampa'), rapunzel = named('Rapunzel');
  const pair = F.pairs.find(p => p.a === pnp);
  assert.equal(pair.b, rapunzel);
  assert.ok(pair.share > 0.9 && pair.segues > pair.count * 0.9, `${pair.count} of ${pair.of}, ${pair.segues} straight through`);
  assert.ok(F.pairs.every(p => p.share >= 0.3 && p.count >= 10 && p.segues <= p.count && p.a !== p.b));
  assert.deepEqual(F.runs[0].songs.map(s => s.name), ['So Much to Say', 'Anyone Seen the Bridge?', 'Too Much']);
  // Openers and closers agree with each song's own count.
  const opened = new Map(F.after(START)), closed = new Map(F.before(END));
  for (const s of M.allSongs) {
    assert.equal(s.showOpens || 0, opened.get(s) || 0, `${s.name} opened`);
    assert.equal(s.showCloses || 0, closed.get(s) || 0, `${s.name} closed`);
    assert.ok(F.nightsWith(s) <= F.played(s), s.name);
  }
  assert.equal(F.after(START)[0][0].name, 'Seek Up');
  assert.equal(F.before(END)[0][0].name, 'All Along the Watchtower');
});

test('a year on the road', () => {
  const Y = yearStats(M, 2008);
  assert.equal(Y.shows.length, 52);
  assert.ok(Y.shows.every(s => s.year === 2008 && s.band));
  assert.ok(Y.nights.length && Y.nights.every(n => n.year === 2008));
  const band = Y.band.map(p => p.name);
  assert.ok(band.includes('LeRoi Moore') && band.includes('Jeff Coffin'), 'both saxophone players in 2008');
  assert.ok(Y.changes.some(c => /LeRoi/.test(c.text)));
  assert.equal(sum(Y.openers), Y.sets.length);
  assert.equal(sum(Y.closers), Y.sets.length);
  assert.equal(Y.most[0][0].name, 'Corn Bread');
  assert.ok(Y.most[0][1] <= Y.sets.length);
  // Water Into Wine came back after 701 shows away.
  const back = Y.returns.find(r => r.song.name === 'Water Into Wine');
  assert.ok(back && back.gap > 600 && back.after.year === 1996, 'Water Into Wine’s return');
  assert.ok(Y.debuts.every(s => s.firstPlay.year === 2008));
  assert.deepEqual(lineupChanges(1991), [], 'the founders didn’t join anything');
  // A year the band didn't tour still has a page, for everything else.
  assert.equal(yearStats(M, 2017).shows.length, 0);
  assert.ok(allYears(M).includes(2017));
});

test('every year from the first show to the last', () => {
  const Y = years(M);
  assert.equal(Y[0].year, 1991);
  assert.equal(Y.at(-1).year, +M.through.slice(0, 4));
  Y.forEach((y, i) => i && assert.equal(y.year, Y[i - 1].year + 1));
  assert.equal(Y.reduce((a, y) => a + y.shows, 0), M.bandShows.length, 'every band show counted once');
  assert.equal(Y.find(y => y.year === 2020).shows, 0, 'no band shows in 2020');
  for (const y of Y.filter(y => y.length)) assert.ok(y.length > 80 * 60 && y.length < 210 * 60, `${y.year} runs ${y.length}`);
});
