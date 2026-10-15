// Every show from the DMB Almanac: reading setlists, telling a venue from its town, and joining shows to the songs
// and released nights:  node --test test/almanac.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import shows from '../js/shows.js';
import { build } from '../js/model.js';
import { attachShows, readSetlist, sequence, rotation } from '../js/almanac.js';
import { placeSplitter, placeKey } from '../tools/places.mjs';

test('a setlist in its short form', () => {
  const songs = ['Seek Up', 'Linus and Lucy', 'Pantala Naga Pampa', 'Rapunzel'].map(name => ({ name }));
  const items = readSetlist('0>.1T>.*0>.2>3,0R', songs, ['Heartbeat Intro']);
  assert.deepEqual(items.map(x => x.song?.name || x.other), ['Seek Up', 'Linus and Lucy', 'Heartbeat Intro', 'Pantala Naga Pampa', 'Rapunzel', 'Seek Up']);
  assert.deepEqual(items.map(x => x.tag), ['', 'T', '', '', '', 'R']);
  assert.deepEqual(items.map(x => x.sub), [false, true, true, true, false, false]);
  assert.deepEqual(items.map(x => x.segue), [true, true, true, true, false, false]);
  // In order for what leads where: no tease, no jam, no reprise, and the segue runs through the jam.
  assert.deepEqual(sequence(items).map(x => [x.song.name, x.segue]), [['Seek Up', true], ['Pantala Naga Pampa', true], ['Rapunzel', false]]);
  assert.deepEqual(readSetlist('', songs, []), []);
});

test('the venue and the town', () => {
  const towns = new Set(['US-WA|george', 'US-CA|mountain view', 'US-NY|saratoga springs', 'US-NY|new york', 'DE|munich', 'CA|vancouver']);
  const split = placeSplitter(towns, ['Darien Center, NY']);
  assert.deepEqual(split('The Gorge Amphitheatre George, WA'), { venue: 'The Gorge Amphitheatre', town: 'George, WA', sure: true });
  assert.equal(split('Shoreline Amphitheatre at Mountain View Mountain View, CA').venue, 'Shoreline Amphitheatre at Mountain View');
  assert.equal(split('Saratoga Performing Arts Center (Saratoga Spa State Park) Saratoga Springs, NY').town, 'Saratoga Springs, NY');
  assert.equal(split('Madison Square Garden New York, NY').venue, 'Madison Square Garden');
  assert.equal(split('Darien Lake Performing Arts Center Darien Center, NY').town, 'Darien Center, NY', 'a town GeoNames is too small for');
  assert.deepEqual(split('Kulturhalle Zenith Munich, DEU'), { venue: 'Kulturhalle Zenith', town: 'Munich, Germany', sure: true });
  assert.equal(split('Rogers Arena Vancouver, BC, CAN').town, 'Vancouver, BC, Canada');
  assert.equal(split('Sovereign of the Seas [Atlantic Ocean], BHS').venue, 'Sovereign of the Seas');
  assert.equal(split('[Unknown] [Unknown]').venue, '');
  assert.equal(split('[Unknown Studio] Munich, DEU').venue, '');
  assert.equal(placeKey('St. Louis'), placeKey('Saint Louis'));
  assert.equal(placeKey('Cancún'), placeKey('Cancun'));
});

const M = attachShows(build(data), shows);

test('every show, the band’s and Dave’s other appearances', () => {
  assert.ok(M.shows.length > 3500 && M.bandShows.length > 2300 && M.setShows.length > 2100);
  const dates = M.shows.map(s => s.date);
  assert.deepEqual(dates, [...dates].sort(), 'in date order');
  assert.ok(M.shows.every(s => s.date <= M.through));
  assert.ok(M.shows.every(s => /^https:\/\/dmbalmanac\.com\/TourShowSet\.aspx\?id=\d+$/.test(s.url)), 'each links back to the Almanac');
  // The band's first show, and a 1998 night that came out on Live Trax.
  assert.equal(M.bandShows[0].date, '1991-03-14');
  const worcester = M.byDate.get('1998-12-08');
  assert.ok(worcester.show?.band && /Worcester/.test(worcester.show.place), 'Live Trax Vol. 1 is the Almanac’s Worcester show');
  assert.equal(worcester.show.sequence[0].song.name, 'Seek Up');
  assert.ok(M.nights.filter(n => n.show).length > 320, 'nearly every released night has its show');
  // Dave & Tim's Luther College show was released, and it isn't counted as a band show.
  assert.equal(M.byDate.get('1996-02-06').show.band, false);
});

test('a song through every show', () => {
  const two = M.bySlug.get('two-step');
  assert.ok(two.playCount > 800 && two.playCount < 1000, `Two Step: ${two.playCount}`);
  assert.equal(two.firstPlay.date, '1992-04-05');
  assert.ok(two.plays.every((s, k) => s.band && (!k || two.plays[k - 1].k < s.k)), 'band shows, in order');
  for (const s of M.allSongs.filter(s => s.gap)) {
    assert.equal(s.plays[s.plays.indexOf(s.gap.to) - 1], s.gap.from, `${s.name}: the gap is between two plays in a row`);
    assert.equal(s.gap.to.k - s.gap.from.k - 1, s.gap.shows, s.name);
  }
  // The Maker went more than four years without being played.
  const maker = M.allSongs.find(s => s.name === 'The Maker');
  assert.ok(maker.gap.shows > 400 && maker.gap.from.year === 1994 && maker.gap.to.year === 1998);
  // A song only the Almanac has, with a page of its own.
  const bismarck = M.bySlug.get('bismarck');
  assert.ok(bismarck.almanacOnly && bismarck.playCount > 20 && !bismarck.versions.length);
  // Its share of each year's shows.
  const rows = rotation(M, two);
  assert.equal(rows.reduce((a, r) => a + r.plays, 0), two.playCount);
  assert.ok(rows.every(r => r.plays <= r.sets));
});

test('outside the band’s tours, and heard only in passing', () => {
  // Each show a song was played at counts once, with the band's shows or outside them.
  const at = new Map();
  for (const sh of M.shows) for (const s of sh.played) at.set(s, (at.get(s) || 0) + 1);
  for (const s of M.allSongs) {
    assert.equal(s.playCount + s.otherPlays, at.get(s) || 0, s.name);
    assert.ok(s.otherShows.every(sh => !sh.band) && s.inPassing.every(sh => !sh.played.includes(s)), s.name);
  }
  // Boyd Tinsley's own band played Devil Woman; the band never has.
  const devil = M.bySlug.get('devil-woman');
  assert.ok(devil.almanacOnly && !devil.playCount && devil.otherPlays > 20);
  // Only ever a few bars inside another song.
  const drug = M.bySlug.get('i-want-a-new-drug');
  assert.ok(!drug.playCount && !drug.otherPlays && drug.inPassing.length >= 10);
  // Crush was first played at a one-off in Roanoke the Almanac files outside the tours, two weeks before the tour.
  const crush = M.bySlug.get('crush');
  assert.equal(crush.firstAny.date, '1998-04-18');
  assert.equal(crush.firstPlay.date, '1998-05-02');
});
