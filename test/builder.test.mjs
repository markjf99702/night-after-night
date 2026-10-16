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

test('each lineup counts every version of a song, shared tracks too', () => {
  for (const s of M.songs) {
    assert.equal(s.eras.reduce((a, e) => a + e.count, 0), s.count, `${s.name}: every version in one lineup`);
    assert.ok(s.eras.every(e => e.count || !e.median), `${s.name}: no length without versions`);
  }
  // Pantala Naga Pampa is nearly always on a track with Rapunzel, so few of its versions have a time of their own.
  assert.ok(M.bySlug.get('pantala-naga-pampa').eras.every(e => e.count > 0), 'Pantala Naga Pampa with every lineup');
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
  const nineties = buildShow(M, { minutes: 90, ranges: [['1991-01-01', '1999-12-31']] }, rand);
  assert.ok(nineties.slots.every(s => s.item.night.date <= '1999-12-31'));
  const gorge = M.venues.find(v => v.name === 'The Gorge Amphitheatre');
  const there = buildShow(M, { minutes: 60, venues: [gorge.id] }, rand);
  assert.ok(there.slots.length && there.slots.every(s => s.item.night.venue === gorge));
  const noCovers = buildShow(M, { minutes: 120, covers: false, picks: 'deep' }, rand);
  assert.ok(noCovers.slots.every(s => s.item.songs.every(x => !x.cover)));
  const long = buildShow(M, { minutes: 60, jams: 'long', picks: 'hits' }, seeded(9));
  const short = buildShow(M, { minutes: 60, jams: 'short', picks: 'hits' }, seeded(9));
  assert.ok(long.slots.length < short.slots.length, 'long jams mean fewer songs in the hour');
  assert.equal(encoreSize(nineties.slots), nineties.slots.length >= 10 ? 2 : 1);
});

test('more than one time and place: a night in any of them', () => {
  const ends = [['1991-01-01', '1999-12-31'], ['2020-01-01', '2029-12-31']];
  const decades = pool(M, { ranges: ends }).map(it => it.night.date.slice(0, 3));
  assert.deepEqual([...new Set(decades)].sort(), ['199', '202'], 'the ’90s and the 2020s, nothing between');
  for (const seed of [1, 2, 3]) {
    const show = buildShow(M, { minutes: 120, ranges: ends }, seeded(seed));
    assert.ok(show.slots.every(s => /^(199|202)/.test(s.item.night.date)));
  }
  const gorge = M.venues.find(v => v.name === 'The Gorge Amphitheatre');
  const spac = M.venues.find(v => v.name === 'Saratoga Performing Arts Center');
  const both = pool(M, { venues: [gorge.id, spac.id] });
  assert.deepEqual(new Set(both.map(it => it.night.venue)), new Set([gorge, spac]));
  const show = buildShow(M, { minutes: 90, venues: [gorge.id, spac.id] }, seeded(4));
  assert.ok(show.slots.length && show.slots.every(s => s.item.night.venue === gorge || s.item.night.venue === spac));
  // Both together: the Gorge in the 2020s only.
  assert.ok(pool(M, { venues: [gorge.id], ranges: [ends[1]] }).every(it => it.night.venue === gorge && it.night.year >= 2020));
  assert.equal(pool(M, { ranges: [] }).length, pool(M).length, 'no choices: everything');
});

test('a share link brings back the same show', () => {
  const show = buildShow(M, { minutes: 75 }, seeded(3));
  const back = decode(M, encode(show));
  assert.equal(back.total, show.total);
  assert.deepEqual(back.slots.map(s => s.item.songs.map(x => x.name)), show.slots.map(s => s.item.songs.map(x => x.name)));
  assert.deepEqual(decode(M, 'nonsense,19981208~not-a-song').slots, []);
});

test('Red Rocks, September 9 and 10, 2005: two whole nights, and links from before still open', () => {
  const songs = n => n.tracks.filter(t => t.songs && !t.extra).flatMap(t => t.songs.map(s => s.name));
  const ninth = M.byDate.get('2005-09-09'), tenth = M.byDate.get('2005-09-10');
  assert.deepEqual([songs(ninth).length, songs(ninth)[0], songs(ninth).at(-1)], [17, 'Everyday', 'Ants Marching']);
  assert.deepEqual([songs(tenth).length, songs(tenth)[0], songs(tenth).at(-1)], [18, 'Seek Up', 'Two Step']);
  for (const n of [ninth, tenth]) {
    assert.ok(n.whole, `${n.date} is a whole night`);
    assert.equal(new Set(songs(n)).size, songs(n).length, `${n.date}: no song twice`);
  }
  assert.ok(M.bySlug.get('blackbird').versions.some(v => v.night.whole), 'Blackbird has a whole night');
  // A link from when both were filed under the 10th: its Everyday is the 9th's, its Seek Up the 10th's.
  const old = decode(M, '20050910~everyday,20050910~seek-up,20050910~ants-marching');
  assert.deepEqual(old.slots.map(s => s.item.night.date), ['2005-09-09', '2005-09-10', '2005-09-09']);
  // A link made now to a song played both nights opens the night it was made from.
  for (const n of [ninth, tenth]) {
    const t = n.tracks.find(x => x.songs?.[0].name === 'American Baby');
    assert.equal(decode(M, encode({ slots: [{ item: { parts: [t] } }] })).slots[0].item.parts[0], t, `${n.date}: American Baby`);
  }
});

test('three songs from June 2018 are on the nights they were played, and links from before still open', () => {
  const on = (date, name) => !!M.byDate.get(date)?.tracks.some(t => t.songs?.some(s => s.name === name));
  for (const [was, date, name] of [['2018-07-06', '2018-06-07', 'Idea of You'], ['2018-09-06', '2018-06-09', 'Do You Remember'], ['2018-12-06', '2018-06-12', 'Louisiana Bayou']]) {
    assert.ok(on(date, name) && !on(was, name), `${name} on ${date}, not ${was}`);
    const slug = M.songs.find(s => s.name === name).slug;
    assert.equal(decode(M, `${was.replaceAll('-', '')}~${slug}`).slots[0]?.item.night.date, date, `a link to ${name} from ${was}`);
  }
  assert.ok(!M.byDate.has('2018-09-06') && !M.byDate.has('2018-12-06'), 'no nights the band didn’t play');
});

test('covers MusicBrainz has no song for say who wrote them', () => {
  const by = [['Back in Black', 'Angus Young'], ['Brick House', 'Lionel Richie'], ['Carolina on My Mind', 'James Taylor'], ['Come Together', 'John Lennon'],
    ['Fool In The Rain', 'Jimmy Page'], ['Honky Tonk Women', 'Keith Richards'], ['Let’s Dance', 'David Bowie'], ['Sexy M.F.', 'Prince'], ['Soulshine', 'Warren Haynes'],
    ['Southern Accents', 'Tom Petty'], ['Stayin’ Alive', 'Robin Gibb'], ['The Way It Is', 'Bruce Hornsby'], ['The Weight', 'Robbie Robertson']];
  for (const [name, writer] of by) {
    const s = M.songs.find(x => x.name === name);
    assert.ok(s?.cover?.includes(writer), `${name}: written by ${writer} (${s?.cover})`);
  }
  // With Covers too off, none of them is in the pool.
  const names = new Set(pool(M, { covers: false }).flatMap(it => it.songs.map(s => s.name)));
  assert.deepEqual(by.filter(([name]) => names.has(name)), []);
});
