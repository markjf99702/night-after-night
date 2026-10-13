// Before the album, each year, and what leads where:  node --test test/insights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import { build } from '../js/model.js';
import { beforeAlbum, yearStats, years, flow, gapText, lineupChanges, START, END } from '../js/insights.js';

const M = build(data);
const named = name => M.songs.find(s => s.name === name);
const sum = rows => rows.reduce((a, [, n]) => a + n, 0);

test('a wait in words', () => {
  assert.equal(gapText(1), '1 day');
  assert.equal(gapText(5), '5 days');
  assert.equal(gapText(31), '1 month');
  assert.equal(gapText(400), '1 year 1 month');
  assert.equal(gapText(730, true), '2 yr');
  assert.equal(gapText(6159), '16 years 10 months');
});

test('songs on stage before their album', () => {
  const B = beforeAlbum(M);
  assert.ok(B.rows.length > 40, `${B.rows.length} songs`);
  for (const r of B.rows) {
    assert.ok(!r.song.cover, `${r.song.name} is the band's own`);
    assert.equal(r.album, r.song.albums[0].album, `${r.song.name} against its first album`);
    assert.ok(r.first.date < r.album.date && r.days > 0, `${r.song.name} came first`);
  }
  // The Lillywhite songs were on stage for years before Busted Stuff.
  const busted = B.albums.find(g => g.album.name === 'Busted Stuff');
  for (const name of ['Grey Street', 'Bartender', 'Raven']) assert.ok(busted.rows.some(r => r.song.name === name), name);
  assert.ok(busted.rows.find(r => r.song.name === 'Bartender').days > 365, 'Bartender waited over a year');
  assert.equal(B.longest.song.name, 'Break Free');
  assert.equal(B.longest.album.name, 'Walk Around the Moon');
  // Each album's songs in the order they turned up.
  for (const g of B.albums) {
    const dates = g.rows.map(r => r.first.date);
    assert.deepEqual(dates, [...dates].sort(), g.album.name);
  }
  // Never on an album: the band's own, played more than once.
  assert.ok(B.never.some(s => s.name === 'Anyone Seen the Bridge?'));
  assert.ok(B.never.every(s => !s.cover && !s.albums.length && s.count >= 2));
});

test('what leads where', () => {
  const F = flow(M);
  assert.equal(F.nights, M.nights.filter(n => n.whole).length);
  // Every whole night has one opener and one closer.
  assert.equal(sum(F.after(START)), F.nights);
  assert.equal(sum(F.before(END)), F.nights);
  assert.deepEqual(F.before(START), []);
  assert.deepEqual(F.after(END), []);
  // Every time a song is played something comes before it and something after.
  for (const s of M.songs) assert.equal(sum(F.before(s)), sum(F.after(s)), s.name);
  const top = F.pairs[0];
  assert.deepEqual([top.a.name, top.b.name], ['Pantala Naga Pampa', 'Rapunzel']);
  assert.ok(top.segues > top.count / 2, 'mostly straight through');
  assert.ok(F.pairs.every(p => p.share >= 0.3 && p.count >= 4 && p.segues <= p.count));
  assert.deepEqual(F.runs[0].songs.map(s => s.name), ['So Much to Say', 'Anyone Seen the Bridge?', 'Too Much']);
  const ants = named('Ants Marching');
  assert.ok(F.played(ants) > 50, 'Ants Marching is on most whole nights');
});

test('a song page counts the song sharing its track as what came before or after it', () => {
  const F = flow(M);
  const pnp = named('Pantala Naga Pampa'), rapunzel = named('Rapunzel');
  assert.equal(pnp.nexts[0][0], rapunzel, 'Pantala Naga Pampa is most often followed by Rapunzel');
  assert.equal(rapunzel.prevs[0][0], pnp, 'Rapunzel most often comes after Pantala Naga Pampa');
  // The song page counts every release and What leads where only the whole nights, so it never has fewer.
  for (const s of M.songs) {
    const nexts = new Map(s.nexts), prevs = new Map(s.prevs);
    for (const [o, n] of F.after(s)) if (!o.virtual && o !== s) assert.ok((nexts.get(o) || 0) >= n, `${s.name} then ${o.name}: ${nexts.get(o)} < ${n}`);
    for (const [o, n] of F.before(s)) if (!o.virtual && o !== s) assert.ok((prevs.get(o) || 0) >= n, `${o.name} then ${s.name}: ${prevs.get(o)} < ${n}`);
  }
});

test('a song opened a night only as its first song, and closed one only as its last', () => {
  const F = flow(M);
  const opened = new Map(F.after(START)), closed = new Map(F.before(END));
  for (const s of M.songs) {
    assert.equal(s.opens, opened.get(s) || 0, `${s.name} opened`);
    assert.equal(s.closes, closed.get(s) || 0, `${s.name} closed`);
  }
});

test('a year on the road', () => {
  const Y = yearStats(M, 2008);
  assert.ok(Y.nights.length && Y.nights.every(n => n.year === 2008));
  const band = Y.band.map(p => p.name);
  assert.ok(band.includes('LeRoi Moore') && band.includes('Jeff Coffin'), 'both saxophone players in 2008');
  assert.ok(Y.changes.some(c => /LeRoi/.test(c.text)));
  assert.equal(sum(Y.openers), Y.whole.length);
  assert.equal(sum(Y.closers), Y.whole.length);
  assert.ok(Y.most[0][1] <= Y.nights.length);
  assert.deepEqual(lineupChanges(1991), [], 'the founders didn’t join anything');
});

test('every year from the first to the last', () => {
  const Y = years(M);
  assert.equal(Y[0].year, M.years[0]);
  assert.equal(Y.at(-1).year, M.years.at(-1));
  Y.forEach((y, i) => i && assert.equal(y.year, Y[i - 1].year + 1));
  assert.equal(Y.reduce((a, y) => a + y.full + y.bits, 0), M.nights.length, 'every night counted once');
  for (const y of Y) assert.equal(y.full + y.bits > 0, M.years.includes(y.year), String(y.year));
  for (const y of Y.filter(y => y.length)) assert.ok(y.length > 80 * 60 && y.length < 210 * 60, `${y.year} runs ${y.length}`);
});
