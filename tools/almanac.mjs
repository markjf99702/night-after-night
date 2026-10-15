// Makes js/shows.js from a snapshot of the DMB Almanac (dmbalmanac.com), which its team shared with this project
// and said could be used this way: each show's date and place, and its songs in order with segues, credited on every
// page with a link back to the show on the Almanac. Their notes, song lengths, weather, stage times and the rest of
// what the snapshot holds stay out. The snapshot itself isn't in the repo; ask the Almanac for a fresh one to bring
// in new shows, then run this again (and after rebuilding js/data.js, so the song names line up).
//
//   node tools/almanac.mjs path/to/dmb_almanac.sqlite [--report]
//
// Needs Node 22's built-in SQLite. Towns are told apart from venue names with GeoNames (see tools/places.mjs).
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import data from '../js/data.js';
import { songKey, ALIASES, NOT_A_SONG, JAMS, TOWNS } from './titles.mjs';
import { loadTowns, placeSplitter } from './places.mjs';

const root = new URL('..', import.meta.url).pathname;
const file = process.argv[2];
const REPORT = process.argv.includes('--report');
if (!file) { console.error('usage: node tools/almanac.mjs path/to/dmb_almanac.sqlite [--report]'); process.exit(1); }

// The Almanac files each year's shows as tours. These are the band's own tour legs; everything else (Dave & Tim,
// Dave Matthews & Friends, solo sets, sitting in with other bands, radio and TV, the 2020 livestreams, the members'
// side projects, and each year's catch-all of one-off appearances) counts as another appearance. A one-off that
// matches an official release of the band's is a band show too. Worked out from the shows in each, since the
// snapshot has the tours' numbers but not their names.
export const BAND_TOURS = new Set([
  '65', '56', '51', // 1991–1993: Trax and everywhere else, all year
  '48', '46', '126', '45', '44', // 1994: spring, summer, opening slots, fall, New Year's
  '36', '43', '37', '89', '38', '40', // 1995: winter, Europe, spring, European festivals, summer, New Year's
  '35', '28', '68', '67', '29', '30', // 1996: spring, summer, Europe with Alanis Morissette, H.O.R.D.E., fall, New Year's
  '25', // 1997: summer
  '19', '20', '21', '22', // 1998: spring, European festivals, summer, fall
  '17', '13', '14', // 1999 summer; 2000 summer and December
  '2', '12', '58', '69', // 2001 summer; 2002 spring, summer, December
  '72', '80', '81', // 2003 summer; 2004 summer and Vote for Change
  '82', '83', '85', '87', // 2005 Australia, summer, fall; 2006 summer
  '92', '96', '98', // 2007 Europe and summer; 2008 summer
  '103', '106', '107', '110', '8193', '112', // 2009 spring and summer; 2010 Europe, summer, Brazil, fall
  '115', '117', '118', '120', '121', // 2011 Caravan; 2012 summer and winter; 2013 summer and South Africa
  '124', '125', '128', '1129', '2154', // 2014 Australia and summer; 2015 summer and fall; 2016 summer
  '6156', '6159', '6160', '7160', '8161', // 2018 summer and fall; 2019 Europe, summer, Brazil
  '8164', '8169', '8172', '8174', '8178', // 2021; 2022 summer and fall; 2023 summer and fall
  '8179', '8181', '8184', '8185', '8188', '8191', // 2024 Europe, summer, fall; 2025 summer; 2026 summer and fall
]);

// Towns too small or too new for GeoNames, as the app writes them.
const EXTRA_TOWNS = [
  'University Park, PA', 'Sweet Briar, VA', 'Dewey Beach, DE', 'Del Valle, TX', 'Olympic Valley, CA', 'Crystal Bay, NV',
  'Lake Buena Vista, FL', 'Paradise Island, Bahamas', 'Little Stirrup Cay, Bahamas', 'Vicente López, Argentina',
  'Darling Harbour, NSW, Australia', 'Riviera Maya, Mexico',
];

// Almanac titles for songs js/data.js has under another name.
const ALMANAC_ALIASES = {
  chacha: 'Only Takes a Moment (Cha Cha)',
  carolinainmymind: 'Carolina on My Mind',
};
// Rows that aren't a song being played: a few notes of one inside another, a false start, a song nobody has named.
const DROP = /\b(fake|false start|aborted|unknown song|unknown tim song)\b/i;
const TAG = tag => (/\btease\b/i.test(tag) ? 'T' : /\bpartial\b/i.test(tag) ? 'P' : /\breprise\b/i.test(tag) ? 'R' : '');

const db = new DatabaseSync(file, { readOnly: true });
const shows = db.prepare('select show_id id, tour_id tour, date_iso date, venue_id venue, location, url from shows').all();
const rows = db.prepare('select show_id id, song_title title, coalesce(song_tags, \'\') tag, is_sub_song sub, is_segue segue, coalesce(personnel, \'\') who from setlists order by id').all();

// ---------------------------------------------------------------------------------------------------------------
// Songs: the name js/data.js uses, where it has the song.

const ours = new Map(data.songs.map(s => [songKey(s.n), s.n]));
const typographic = s => s.replace(/'/g, '’').replace(/\s+/g, ' ').trim();
function songOf(title) {
  const key = songKey(title);
  const alias = ALMANAC_ALIASES[key] || ALIASES[key];
  const name = ours.get(key) || (alias && ours.get(songKey(alias)));
  if (name) return { song: name };
  if (NOT_A_SONG.test(title) || JAMS.has(key) || /\bsolo\b|\bjam\b|\bduet\b|\bimprov\b/i.test(title)) return { other: typographic(title) };
  return { song: typographic(title), almanacOnly: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Places

const towns = loadTowns(`${root}.cache/geonames`);
const split = placeSplitter(towns, [...EXTRA_TOWNS, ...Object.values(TOWNS), ...data.venues.map(v => v.t).filter(Boolean)]);
const venueOf = new Map();
const unsure = new Map();
for (const s of shows) {
  if (venueOf.has(s.venue)) continue;
  const line = String(s.location || '').replace(/^.*>/, '').trim();
  const place = split(line);
  if (!place.sure) unsure.set(line, place);
  venueOf.set(s.venue, place);
}

// ---------------------------------------------------------------------------------------------------------------
// Setlists

const byShow = new Map();
for (const r of rows) {
  if (!byShow.has(r.id)) byShow.set(r.id, []);
  byShow.get(r.id).push(r);
}

function setlist(list) {
  const items = [];
  for (const r of list) {
    const title = String(r.title || '').trim();
    if (DROP.test(r.tag) || (!title && !/improv/i.test(r.tag))) {
      if (r.segue && items.length) items.at(-1).segue = true;
      continue;
    }
    const parts = title ? title.split(/\s+\/\s+/) : ['Improv'];
    parts.forEach((part, i) => {
      const what = title ? songOf(part) : { other: 'Improv' };
      items.push({ ...what, sub: !!r.sub || i > 0, tag: TAG(r.tag), segue: i === parts.length - 1 && !!r.segue });
    });
  }
  return items;
}

// Released nights, to check the tours above and to count a released one-off as a band show. Dave & Tim's shows
// (Tim playing on his own for a song or two, or the two of them named together) stay out even when released.
const released = new Map();
for (const n of data.nights) {
  const names = new Set(n.t.filter(t => typeof t[0] !== 'string').flatMap(t => (Array.isArray(t[0]) ? t[0] : [t[0]]).map(i => data.songs[i].n)));
  if (!released.has(n.d)) released.set(n.d, []);
  released.get(n.d).push(names);
}
const daveAndTim = list => list.some(r => /^(tim solo|dave and tim)$/i.test(r.who.replace(/\u00a0/g, ' ').trim()));
const matchesRelease = (date, items, list) => !daveAndTim(list) && (released.get(date) || []).some(names => {
  const here = new Set(items.filter(x => x.song).map(x => x.song));
  if (names.size < 3) return here.size >= 8 && [...names].some(n => here.has(n));
  return [...names].filter(n => here.has(n)).length / names.size >= 0.6;
});

const out = [];
for (const s of shows) {
  const list = byShow.get(s.id) || [];
  const items = setlist(list);
  const band = BAND_TOURS.has(s.tour) || matchesRelease(s.date, items, list);
  out.push({ ...s, items, band });
}
const through = out.filter(s => s.items.length).map(s => s.date).sort().at(-1);
const kept = out.filter(s => s.date <= through).sort((a, b) => a.date.localeCompare(b.date) || (+a.id) - (+b.id));

// ---------------------------------------------------------------------------------------------------------------
// Write it compactly: songs most played first, so the common ones get one-character codes.

const count = new Map(), otherCount = new Map();
for (const s of kept) for (const x of s.items) {
  if (x.song) count.set(x.song, (count.get(x.song) || 0) + 1);
  else otherCount.set(x.other, (otherCount.get(x.other) || 0) + 1);
}
const songs = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b));
const others = [...otherCount.keys()].sort((a, b) => otherCount.get(b) - otherCount.get(a) || a.localeCompare(b));
const songIndex = new Map(songs.map((n, i) => [n, i]));
const otherIndex = new Map(others.map((n, i) => [n, i]));
const venues = [];
const venueIndex = new Map();
for (const s of kept) {
  if (venueIndex.has(s.venue)) continue;
  venueIndex.set(s.venue, venues.length);
  const v = venueOf.get(s.venue);
  venues.push([v.venue, v.town]);
}
// A setlist is its items in order, each a song's number in base 36; "*" before it means it isn't a song (a jam, a
// solo), "." that it's played inside the one before it; T, P or R after it mark a tease, part of a song, or a reprise;
// ">" after it means it ran straight into the next one, "," that it didn't.
const code = x => `${x.sub ? '.' : ''}${x.other != null ? `*${otherIndex.get(x.other).toString(36)}` : songIndex.get(x.song).toString(36)}${x.tag}`;
const encoded = kept.map(s => [s.date, venueIndex.get(s.venue), +s.id, s.band ? 1 : 0,
  s.items.map((x, i) => code(x) + (i < s.items.length - 1 ? (x.segue ? '>' : ',') : '')).join('')]);
const result = { built: new Date().toISOString().slice(0, 10), through, venues, songs, others, shows: encoded };
writeFileSync(`${root}js/shows.js`, `// Made by tools/almanac.mjs from the DMB Almanac (dmbalmanac.com), shared with this project by the Almanac's team.\n// Each show's date and place, and its songs in order with segues; each show links back to its page on the Almanac.\nexport default ${JSON.stringify(result)};\n`);

// ---------------------------------------------------------------------------------------------------------------

const bandShows = kept.filter(s => s.band), withSongs = s => s.items.some(x => x.song);
const size = JSON.stringify(result).length;
console.log(`${kept.length} shows through ${through} (${bandShows.length} band shows, ${bandShows.filter(withSongs).length} with setlists; ${kept.length - bandShows.length} other appearances)`);
console.log(`${songs.length} songs (${songs.filter(n => ours.has(songKey(n))).length} also in js/data.js), ${others.length} other items, ${venues.length} venues, ${unsure.size} places split by guesswork`);
console.log(`js/shows.js ${(size / 1024).toFixed(0)} KB`);
const missedReleases = data.nights.filter(n => !kept.some(s => s.band && s.date === n.d));
if (missedReleases.length) console.log(`released nights with no band show that day: ${missedReleases.map(n => n.d).join(', ')}`);
if (REPORT) {
  console.log('\nPlaces split by guesswork:');
  for (const [line, p] of unsure) console.log(`  ${line}  →  ${p.venue} | ${p.town}`);
  console.log('\nSongs only in the Almanac, most played at band shows:');
  const band = new Map();
  for (const s of bandShows) for (const x of s.items) if (x.song && !ours.has(songKey(x.song)) && !x.tag) band.set(x.song, (band.get(x.song) || 0) + 1);
  console.log([...band].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([n, c]) => `${n} (${c})`).join(', '));
  console.log('\nOther items:', others.map(o => `${o} (${otherCount.get(o)})`).join(', '));
}
