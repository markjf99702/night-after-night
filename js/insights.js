// What the whole record says when you step back from one song or one night: songs that were on stage before they
// were on an album, each year on the road, and which songs lead into which. No page code, like model.js.
import { median } from './model.js';
import { LINEUP, bandOn } from './lineup.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// "2 years 3 months", "8 months": a wait in words.
export function gapText(days, short = false) {
  const months = Math.round(days / 30.44);
  if (months < 1) return short ? `${days} d` : `${days} day${days === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12), m = months % 12;
  if (short) return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(' ');
  const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return [y && part(y, 'year'), m && part(m, 'month')].filter(Boolean).join(' ');
}

// Songs the band was playing before the album they're on came out: the earliest official live recording against
// the album's release date. Also the songs that have never been on one of the band's studio albums.
export function beforeAlbum(M) {
  const rows = [];
  for (const s of M.songs) {
    if (s.cover || !s.albums.length) continue;
    const album = s.albums[0].album;
    if (s.first.date >= album.date) continue;
    rows.push({ song: s, album, first: s.first, days: daysBetween(s.first.date, album.date) });
  }
  const albums = M.albums.map(album => ({
    album,
    rows: rows.filter(r => r.album === album).sort((a, b) => a.first.date.localeCompare(b.first.date)),
    played: M.songs.filter(s => s.albums[0]?.album === album).length,
  })).filter(g => g.rows.length);
  const never = M.songs.filter(s => !s.cover && !s.albums.length && s.count >= 2)
    .sort((a, b) => a.first.date.localeCompare(b.first.date));
  const longest = rows.reduce((a, r) => (!a || r.days > a.days ? r : a), null);
  return { rows, albums, never, longest };
}

const mainSongs = night => night.tracks.filter(t => t.songs && !t.extra).flatMap(t => t.songs);
const tally = list => {
  const m = new Map();
  for (const x of list) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name));
};

// Who joined and who left in a year, in words.
export function lineupChanges(year) {
  const out = [];
  for (const p of LINEUP) {
    if (p.from.startsWith(String(year)) && p.from > '1991-12-31') out.push({ date: p.from, text: p.joined || `${p.name} joined on ${p.role}.` });
    if (p.to?.startsWith(String(year))) out.push({ date: p.to, text: p.left || `${p.name} left in ${MONTHS[+p.to.slice(5, 7) - 1]}.` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// One year on the road, from the nights released from it.
export function yearStats(M, year) {
  const nights = M.nights.filter(n => n.year === year);
  const whole = nights.filter(n => n.whole);
  const versions = M.versions.filter(v => v.night.year === year);
  const nightsBySong = new Map();
  for (const v of versions) {
    if (!nightsBySong.has(v.song)) nightsBySong.set(v.song, new Set());
    nightsBySong.get(v.song).add(v.night);
  }
  return {
    year, nights, whole,
    full: nights.filter(n => n.songCount >= 5),
    length: median(whole.filter(n => n.timed).map(n => n.total)),
    songs: whole.length ? median(whole.map(n => n.songCount)) : 0,
    most: [...nightsBySong].map(([s, set]) => [s, set.size]).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)),
    openers: tally(whole.map(n => mainSongs(n)[0])),
    closers: tally(whole.map(n => mainSongs(n).at(-1))),
    firsts: M.songs.filter(s => s.first.night.year === year).sort((a, b) => a.first.date.localeCompare(b.first.date)),
    longest: versions.filter(v => !v.shared && v.secs > 0).sort((a, b) => b.secs - a.secs).slice(0, 5),
    albums: M.albums.filter(a => a.year === year),
    // Everyone on stage on any of the year's nights, so 2008 has LeRoi Moore and Jeff Coffin both.
    band: LINEUP.filter(p => (nights.length ? nights.map(n => n.date) : [`${year}-07-01`]).some(d => bandOn(d).includes(p))),
    changes: lineupChanges(year),
  };
}

// Every year from the first release to the last, for the chart on the Nights page.
export function years(M) {
  const first = M.years[0], last = M.years.at(-1);
  const out = [];
  for (let y = first; y <= last; y++) {
    const nights = M.nights.filter(n => n.year === y);
    const whole = nights.filter(n => n.whole);
    out.push({
      year: y,
      full: nights.filter(n => n.songCount >= 5).length,
      bits: nights.filter(n => n.songCount < 5).length,
      length: median(whole.filter(n => n.timed).map(n => n.total)),
    });
  }
  return out;
}

// The start and the end of a night, so they can sit in the map like songs.
export const START = { id: 'start', slug: 'start', name: 'The start of the night', virtual: true };
export const END = { id: 'end', slug: 'end', name: 'The end of the night', virtual: true };

// Which song follows which, on the nights released whole. A step counts as a segue when the two songs share a
// track or the release marks one running into the next ("Two Step >").
export function flow(M) {
  const next = new Map(), prev = new Map(), segue = new Map(), runs = new Map(), on = new Map();
  const add = (map, a, b, n = 1) => {
    if (!map.has(a)) map.set(a, new Map());
    map.get(a).set(b, (map.get(a).get(b) || 0) + n);
  };
  let nights = 0;
  for (const n of M.nights) {
    if (!n.whole) continue;
    const main = n.tracks.filter(t => t.songs && !t.extra);
    if (!main.length) continue;
    nights++;
    const seq = [START];
    const joined = [false];
    main.forEach((t, k) => t.songs.forEach((s, i) => {
      seq.push(s);
      joined.push(i > 0 || (i === 0 && k > 0 && main[k - 1].segue));
    }));
    seq.push(END);
    joined.push(false);
    for (const s of new Set(seq)) on.set(s, (on.get(s) || 0) + 1); // a song played twice that night counts once
    for (let k = 1; k < seq.length; k++) {
      add(next, seq[k - 1], seq[k]);
      add(prev, seq[k], seq[k - 1]);
      if (joined[k]) add(segue, seq[k - 1], seq[k]);
    }
    for (let k = 1; k + 2 < seq.length - 1; k++) {
      const key = [seq[k], seq[k + 1], seq[k + 2]];
      const id = key.map(s => s.id).join('>');
      if (!runs.has(id)) runs.set(id, { songs: key, count: 0 });
      runs.get(id).count++;
    }
  }
  const out = (map, a) => [...(map.get(a) || [])].sort((x, y) => y[1] - x[1] || x[0].name.localeCompare(y[0].name));
  const total = (map, a) => [...(map.get(a) || new Map()).values()].reduce((s, n) => s + n, 0);
  // Pairs: how often B follows A, out of every time A was played (and didn't end the night). Lead-ins come first.
  const pairs = [];
  for (const [a, bs] of next) {
    if (a.virtual) continue;
    const t = total(next, a);
    for (const [b, c] of bs) {
      if (b.virtual || c < 4) continue;
      pairs.push({ a, b, count: c, of: t, share: c / t, segues: segue.get(a)?.get(b) || 0 });
    }
  }
  pairs.sort((x, y) => y.share - x.share || y.count - x.count);
  return {
    nights,
    after: a => out(next, a), before: a => out(prev, a),
    played: a => total(next, a), nightsWith: a => on.get(a) || 0, segues: (a, b) => segue.get(a)?.get(b) || 0,
    pairs: pairs.filter(p => p.share >= 0.3),
    runs: [...runs.values()].filter(r => r.count >= 3).sort((x, y) => y.count - x.count),
  };
}
