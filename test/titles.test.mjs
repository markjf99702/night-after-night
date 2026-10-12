// Reading track titles and dates the way DMB's releases write them:  node --test test/titles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { songKey, splitTitle, dateIn, distance, NOT_A_SONG, venueKey } from '../tools/titles.mjs';

const songs = title => splitTitle(title).map(p => (p.partial ? `(${p.text})` : p.text));

test('the same song however a release spells it', () => {
  assert.equal(songKey('Corn Bread'), songKey('Cornbread'));
  assert.equal(songKey('Rhyme and Reason'), songKey('Rhyme & Reason'));
  assert.equal(songKey('Don’t Drink the Water'), songKey("Don't Drink the Water"));
  assert.equal(songKey('The Last Stop'), songKey('Last Stop'));
  assert.equal(songKey('Everyday (#36)'), songKey('Everyday'));
  assert.notEqual(songKey('#41'), songKey('#40'));
  assert.equal(venueKey('Meadows Music Theater'), venueKey('Meadows Music Theatre'));
});

test('medleys, segues and notes in brackets', () => {
  assert.deepEqual(songs('Pantala Naga Pampa > Rapunzel'), ['Pantala Naga Pampa', 'Rapunzel']);
  assert.deepEqual(songs('Pantala Naga Pampa... Rapunzel'), ['Pantala Naga Pampa', 'Rapunzel']);
  assert.deepEqual(songs('So Much to Say >> Anyone Seen the Bridge?'), ['So Much to Say', 'Anyone Seen the Bridge?']);
  assert.deepEqual(songs('Two Step »'), ['Two Step']);
  assert.deepEqual(songs('Two Step - Live'), ['Two Step']);
  assert.deepEqual(songs('Prelude To Grace_Ants Marching'), ['Prelude To Grace', 'Ants Marching']);
  assert.deepEqual(songs('Back in Black/Stayin’ Alive'), ['Back in Black', 'Stayin’ Alive']);
  assert.deepEqual(songs('Captain (Partial)... Too Much'), ['(Captain)', 'Too Much']);
  assert.deepEqual(songs('The Stone (9.2.00 – Charlotte, NC – Blockbuster Pavilion)'), ['The Stone']);
  assert.deepEqual(songs('Alligator Pie (live at the Beacon Theatre, New York, NY – June 2009)'), ['Alligator Pie']);
  assert.deepEqual(songs('#34 08.31.13 (The Gorge Amphitheatre | George, WA)'), ['#34']);
  assert.deepEqual(songs('Ants Marching » Thank You (Falettinme Be Mice Elf Agin)'), ['Ants Marching', 'Thank You']);
});

test('tracks that are not songs', () => {
  for (const t of ['Intro', 'Introduction', 'Intro To...', 'Encore Break', 'Bass Solo', 'Soundcheck Jam', 'Olé (Encore Jam)', 'Dialogue', 'Carter & Future Man Drum Duet']) {
    assert.ok(NOT_A_SONG.test(t), t);
  }
  for (const t of ['Two Step', 'Thank You (Falettinme Be Mice Elf Agin)', '#40', 'Anyone Seen the Bridge?']) assert.ok(!NOT_A_SONG.test(t), t);
});

test('dates, month first as DMB writes them', () => {
  assert.equal(dateIn('1998-12-08: DMB Live Trax, Volume 1').date, '1998-12-08');
  assert.equal(dateIn('2025-6-28: DMB Live Trax, Vol. 72').date, '2025-06-28');
  assert.equal(dateIn('2004‐09‐05: The Gorge').date, '2004-09-05'); // with Unicode hyphens
  assert.equal(dateIn('Live at Red Rocks 8.15.95').date, '1995-08-15');
  assert.equal(dateIn('The Stone (9.2.00 – Charlotte, NC)').date, '2000-09-02');
  assert.equal(dateIn('Warehouse 2021: 9.7.2019 Golden 1 Credit Union Center').date, '2019-09-07');
  assert.equal(dateIn('Warehouse 2022 - 2021.08.25 Bank of New Hampshire Pavilion').date, '2021-08-25');
  assert.equal(dateIn('April 25, 2009 – Vanderbilt Stadium').date, '2009-04-25');
  assert.equal(dateIn('September 6, 2002 – Part 1').date, '2002-09-06');
  assert.equal(dateIn('Live Trax Vol. 12'), null);
  assert.equal(dateIn('Warehouse 10, Volume 3'), null);
  assert.equal(dateIn('Live, 1994-27-09, McIntire Amphitheatre'), null); // no 27th month
});

test('typo distance', () => {
  assert.equal(distance('satelite', 'satellite'), 1);
  assert.equal(distance('proundestmonkey', 'proudestmonkey'), 1);
  assert.equal(distance('twostep', 'twostep'), 0);
});
