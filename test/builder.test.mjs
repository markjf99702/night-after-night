// The data and the show builder:  node --test test/builder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import { build, clock, story, dateText } from '../js/model.js';
import { buildShow, encode, decode, leadIns, pool, encoreSize } from '../js/builder.js';
import { bandOn } from '../js/lineup.js';

const M = build(data);
function seeded(seed) {
  let a = seed;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

test('the data holds together', () => {
  assert.ok(M.nights.length > 300 && M.songs.length > 200, 'nights and songs');
  for (const n of M.nights) {
    assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(n.tracks.some(t => t.songs), `${n.date} has a song`);
  }
  for (const s of M.songs) assert.ok(s.versions.length, `${s.name} has a version`);
  const dates = M.nights.map(n => n.date);
  assert.equal(new Set(dates).size, dates.length, 'one entry per night');
});

test('known nights and songs', () => {
  const worcester = M.byDate.get('1998-12-08');
  assert.equal(worcester.place, 'Worcester Centrum Centre');
  assert.equal(worcester.release.label, 'Live Trax Vol. 1');
  assert.equal(worcester.tracks[0].songs[0].name, 'Seek Up');
  assert.ok(worcester.whole);
  // LeRoi Moore's last show, and the lineup either side of it.
  assert.ok(M.byDate.get('2008-06-28'));
  assert.ok(bandOn('2008-06-28').some(p => p.name === 'LeRoi Moore'));
  assert.ok(!bandOn('2008-07-01').some(p => p.name === 'LeRoi Moore'));
  assert.ok(bandOn('2008-07-01').some(p => p.name === 'Jeff Coffin'));
  assert.ok(!bandOn('2019-06-01').some(p => p.name === 'Boyd Tinsley'));
  const two = M.bySlug.get('two-step');
  assert.equal(two.album.album.name, 'Crash');
  assert.ok(two.count > 50 && two.median > two.album.length * 1.5, 'Two Step runs long on stage');
  assert.match(story(two), /^It grew from about \d+ minutes/);
  assert.equal(M.bySlug.get('all-along-the-watchtower').cover[0], 'Bob Dylan');
  assert.equal(dateText('1998-12-08', 'long'), 'Tuesday, December 8, 1998');
  assert.equal(clock(3725), '1:02:05');
});

test('lead-ins stay attached to what they lead into', () => {
  const glue = new Map([...leadIns(M)].map(([a, b]) => [a.name, b.name]));
  assert.equal(glue.get('Pantala Naga Pampa'), 'Rapunzel');
  let rapunzel = 0, other = 0;
  for (const it of pool(M)) {
    const names = it.songs.map(s => s.name);
    const i = names.indexOf('Pantala Naga Pampa');
    if (i < 0) continue;
    assert.ok(i < names.length - 1, 'never left hanging at the end of a piece');
    if (names[i + 1] === 'Rapunzel') rapunzel++; else other++;
  }
  assert.ok(rapunzel > other * 3, 'mostly into Rapunzel');
});

test('a show lands on the time, with no song twice', () => {
  const rand = seeded(11);
  for (const minutes of [30, 45, 60, 90, 120, 165, 200]) {
    for (const picks of ['hits', 'mix', 'deep']) {
      const show = buildShow(M, { minutes, picks }, rand);
      assert.ok(Math.abs(show.total - minutes * 60) <= 60, `${minutes} min ${picks}: ${clock(show.total)}`);
      const songs = show.slots.flatMap(s => s.item.songs);
      assert.equal(new Set(songs).size, songs.length, 'no repeats');
      assert.ok(show.slots.every(s => s.item.secs > 0));
    }
  }
});

test('choices are kept', () => {
  const rand = seeded(5);
  const nineties = buildShow(M, { minutes: 90, from: '1991-01-01', to: '1999-12-31' }, rand);
  assert.ok(nineties.slots.every(s => s.item.night.date <= '1999-12-31'));
  const gorge = M.venues.find(v => v.name === 'The Gorge Amphitheatre');
  const there = buildShow(M, { minutes: 60, venue: gorge.id }, rand);
  assert.ok(there.slots.length && there.slots.every(s => s.item.night.venue === gorge));
  const noCovers = buildShow(M, { minutes: 120, covers: false, picks: 'deep' }, rand);
  assert.ok(noCovers.slots.every(s => s.item.songs.every(x => !x.cover)));
  const long = buildShow(M, { minutes: 60, jams: 'long', picks: 'hits' }, seeded(9));
  const short = buildShow(M, { minutes: 60, jams: 'short', picks: 'hits' }, seeded(9));
  assert.ok(long.slots.length < short.slots.length, 'long jams mean fewer songs in the hour');
  assert.equal(encoreSize(nineties.slots), nineties.slots.length >= 10 ? 2 : 1);
});

test('a share link brings back the same show', () => {
  const show = buildShow(M, { minutes: 75 }, seeded(3));
  const back = decode(M, encode(show));
  assert.equal(back.total, show.total);
  assert.deepEqual(back.slots.map(s => s.item.songs.map(x => x.name)), show.slots.map(s => s.item.songs.map(x => x.name)));
  assert.deepEqual(decode(M, 'nonsense,19981208~not-a-song').slots, []);
});
