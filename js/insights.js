// What the whole record says when you step back from one song or one night: songs that were on stage before they
// were on an album, each year on the road, and which songs lead into which. Built on every show in the DMB Almanac
// (js/almanac.js) and the released nights (js/model.js). No page code, like model.js.
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

// The first time a song was heard live: its first show in the Almanac, the band's or one of Dave's other
// appearances, or its earliest released version if that's somehow earlier.
export function firstHeard(s) {
  const show = s.firstAny, rel = s.first;
  if (show && (!rel || show.date <= rel.date)) return { date: show.date, place: show.place, town: show.town, band: show.band };
  if (rel) return { date: rel.date, place: rel.night.place, town: rel.night.town, band: true };
  return null;
}

// Songs that were on stage before the album they're on came out: the first time each was played live against the
// album's release date. Also the band's own songs that have never been on one of its studio albums.
export function beforeAlbum(M) {
  const rows = [];
  for (const s of M.songs) {
    if (s.cover || !s.albums.length) continue;
    const album = s.albums[0].album;
    const first = firstHeard(s);
    if (!first || first.date >= album.date) continue;
    rows.push({ song: s, album, first, days: daysBetween(first.date, album.date) });
  }
  const albums = M.albums.map(album => ({
    album,
    rows: rows.filter(r => r.album === album).sort((a, b) => a.first.date.localeCompare(b.first.date)),
    played: M.songs.filter(s => s.albums[0]?.album === album).length,
  })).filter(g => g.rows.length);
  const never = M.songs.filter(s => !s.cover && !s.albums.length && s.count >= 2)
    .sort((a, b) => firstHeard(a).date.localeCompare(firstHeard(b).date));
  const longest = rows.reduce((a, r) => (!a || r.days > a.days ? r : a), null);
  return { rows, albums, never, longest };
}

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

// One year on the road: every show the band played (from the Almanac), and the nights released from it.
export function yearStats(M, year) {
  const nights = M.nights.filter(n => n.year === year);
  const whole = nights.filter(n => n.whole);
  const versions = M.versions.filter(v => v.night.year === year);
  const shows = M.bandShows.filter(s => s.year === year);
  const sets = shows.filter(s => s.played.length);
  const plays = new Map();
  for (const sh of sets) for (const s of sh.played) plays.set(s, (plays.get(s) || 0) + 1);
  // Back after the longest time away: the year's plays that came after the most shows without the song.
  const returns = [];
  for (const s of plays.keys()) {
    s.plays.forEach((sh, k) => {
      if (!k || sh.year !== year) return;
      const gap = sh.k - s.plays[k - 1].k - 1;
      if (gap >= 40) returns.push({ song: s, show: sh, gap, after: s.plays[k - 1] });
    });
  }
  returns.sort((a, b) => b.gap - a.gap);
  return {
    year, nights, whole, shows, sets,
    full: nights.filter(n => n.songCount >= 5),
    length: median(whole.filter(n => n.timed).map(n => n.total)),
    songs: median(sets.map(s => s.sequence.length)),
    most: [...plays].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)),
    openers: tally(sets.map(s => s.sequence[0]?.song)),
    closers: tally(sets.map(s => s.sequence.at(-1)?.song)),
    debuts: M.allSongs.filter(s => s.firstPlay?.year === year).sort((a, b) => a.firstPlay.date.localeCompare(b.firstPlay.date) || a.name.localeCompare(b.name)),
    returns: returns.slice(0, 8),
    longest: versions.filter(v => !v.shared && v.secs > 0).sort((a, b) => b.secs - a.secs).slice(0, 5),
    albums: M.albums.filter(a => a.year === year),
    // Everyone on stage at any of the year's shows, so 2008 has LeRoi Moore and Jeff Coffin both.
    band: LINEUP.filter(p => (shows.length ? shows.map(n => n.date) : nights.length ? nights.map(n => n.date) : [`${year}-07-01`]).some(d => bandOn(d).includes(p))),
    changes: lineupChanges(year),
  };
}

// The years with something to show: a show in the Almanac, or a night released from it.
export const allYears = M => [...new Set([...M.years, ...M.shows.map(s => s.year)])].sort((a, b) => a - b);

// Every year from the first show to the last, for the chart on the Nights page.
export function years(M) {
  const ys = allYears(M);
  const out = [];
  for (let y = ys[0]; y <= ys.at(-1); y++) {
    const nights = M.nights.filter(n => n.year === y);
    const whole = nights.filter(n => n.whole);
    out.push({
      year: y,
      shows: M.showYears.get(y)?.shows || 0,
      others: M.shows.filter(s => s.year === y && !s.band).length,
      released: nights.filter(n => n.show?.band !== false).length,
      length: median(whole.filter(n => n.timed).map(n => n.total)),
    });
  }
  return out;
}

// The start and the end of a night, so they can sit in the map like songs.
export const START = { id: 'start', slug: 'start', name: 'The start of the night', virtual: true };
export const END = { id: 'end', slug: 'end', name: 'The end of the night', virtual: true };

// Which song follows which at the band's shows with a setlist. A step counts as a segue when the Almanac has the
// one song running straight into the next.
export function flow(M) {
  const next = new Map(), prev = new Map(), segue = new Map(), runs = new Map(), on = new Map();
  const add = (map, a, b, n = 1) => {
    if (!map.has(a)) map.set(a, new Map());
    map.get(a).set(b, (map.get(a).get(b) || 0) + n);
  };
  let nights = 0;
  for (const show of M.setShows) {
    if (!show.sequence.length) continue;
    nights++;
    const seq = [START, ...show.sequence.map(x => x.song), END];
    const joined = [false, false, ...show.sequence.slice(0, -1).map(x => x.segue), false];
    for (const s of new Set(seq)) on.set(s, (on.get(s) || 0) + 1); // a song played twice that night counts once
    for (let k = 1; k < seq.length; k++) {
      add(next, seq[k - 1], seq[k]);
      add(prev, seq[k], seq[k - 1]);
      if (joined[k]) add(segue, seq[k - 1], seq[k]);
    }
    for (let k = 1; k + 2 < seq.length - 1; k++) {
      const key = [seq[k], seq[k + 1], seq[k + 2]];
      if (new Set(key).size < 3) continue;
      const id = key.map(s => s.slug).join('>');
      if (!runs.has(id)) runs.set(id, { songs: key, count: 0 });
      runs.get(id).count++;
    }
  }
  const out = (map, a) => [...(map.get(a) || [])].sort((x, y) => y[1] - x[1] || x[0].name.localeCompare(y[0].name));
  const total = (map, a) => [...(map.get(a) || new Map()).values()].reduce((s, n) => s + n, 0);
  // Pairs: how often B follows A, out of every time A was played (and didn't end the night).
  const pairs = [];
  for (const [a, bs] of next) {
    if (a.virtual) continue;
    const t = total(next, a);
    for (const [b, c] of bs) {
      if (b.virtual || b === a || c < 10) continue;
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
