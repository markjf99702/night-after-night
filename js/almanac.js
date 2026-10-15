// Every show the band has played, from the DMB Almanac (js/shows.js, made by tools/almanac.mjs): each one's date,
// place and songs in order, joined to the songs and released nights from js/data.js. No page code, like model.js.
import { slugify } from './model.js';

export const ALMANAC = 'https://dmbalmanac.com/';
export const showUrl = id => `https://dmbalmanac.com/TourShowSet.aspx?id=${id}`;

// "1>.2>*0,3T,4" → the items in order: a song, or something else (a jam, a solo); played inside the one before it
// (sub); a tease, part of a song or a reprise (T, P, R); and whether it ran straight into the next one.
export function readSetlist(code, songs, others) {
  const out = [];
  if (!code) return out;
  for (const [, sub, star, id, tag, sep] of code.matchAll(/(\.?)(\*?)([0-9a-z]+)([TPR]?)([>,]?)/g)) {
    const n = parseInt(id, 36);
    out.push({ song: star ? null : songs[n], other: star ? others[n] : null, sub: !!sub, tag, segue: sep === '>' });
  }
  return out;
}

// What counts as playing a song that night: anything but a tease, or a bit of it inside another song.
const played = x => x.song && x.tag !== 'T' && !(x.sub && x.tag === 'P');

// The songs in the order they were played, for what leads where: no jams, teases, reprises, or bits of a song played
// inside another. A step counts as a segue when everything from one song to the next ran straight on.
export function sequence(items) {
  const kept = [];
  items.forEach((x, i) => { if (played(x) && x.tag !== 'R') kept.push(i); });
  return kept.map((i, k) => {
    const j = kept[k + 1];
    let segue = j != null;
    for (let t = i; segue && t < j; t++) if (!items[t].segue) segue = false;
    return { song: items[i].song, segue };
  });
}

export function attachShows(M, S) {
  // Songs: js/data.js's where it has them, by name; the Almanac's own for the rest, with no released versions.
  const byName = new Map(M.songs.map(s => [s.name, s]));
  const taken = new Set(M.songs.map(s => s.slug));
  const extra = [];
  const songs = S.songs.map(name => {
    let s = byName.get(name);
    if (!s) {
      let slug = slugify(name);
      while (taken.has(slug)) slug += '-2';
      taken.add(slug);
      s = { id: `a${extra.length}`, name, slug, cover: null, versions: [], albums: [], almanacOnly: true, count: 0 };
      extra.push(s);
      M.bySlug.set(slug, s);
    }
    Object.assign(s, { plays: [], otherShows: [], inPassing: [], playYears: new Map(), showOpens: 0, showCloses: 0 });
    return s;
  });
  const venues = S.venues.map(([name, town], id) => ({ id, name, town, shows: [] }));
  const shows = S.shows.map(([date, v, id, band, code], i) => {
    const items = readSetlist(code, songs, S.others);
    return {
      i, id, date, year: +date.slice(0, 4), venue: venues[v], place: venues[v].name, town: venues[v].town,
      band: !!band, url: showUrl(id), items, played: [...new Set(items.filter(played).map(x => x.song))],
      sequence: sequence(items), night: null,
    };
  });

  for (const show of shows) show.venue.shows.push(show);

  // The band's shows with a setlist, in order: what the song counts and gaps are counted over.
  const bandShows = shows.filter(s => s.band);
  const setShows = bandShows.filter(s => s.played.length);
  setShows.forEach((show, k) => {
    show.k = k;
    for (const s of show.played) {
      s.plays.push(show);
      s.playYears.set(show.year, (s.playYears.get(show.year) || 0) + 1);
    }
    if (show.sequence.length) {
      show.sequence[0].song.showOpens++;
      show.sequence.at(-1).song.showCloses++;
    }
  });
  for (const show of shows) {
    for (const s of show.played) {
      if (!show.band) s.otherShows.push(show);
      s.firstAny ||= show; // the first time it was played anywhere, the band's show or not (the list runs by date)
    }
    // Heard but not played: a tease, or a bit of it inside another song.
    for (const x of show.items) if (x.song && !show.played.includes(x.song) && x.song.inPassing.at(-1) !== show) x.song.inPassing.push(show);
  }
  for (const s of new Set(songs)) {
    s.otherPlays = s.otherShows.length;
    s.playCount = s.plays.length;
    if (!s.playCount) continue;
    s.firstPlay = s.plays[0];
    s.lastPlay = s.plays.at(-1);
    // The longest it went without being played: the band's shows in between, and the two either side.
    let gap = null;
    for (let k = 1; k < s.plays.length; k++) {
      const n = s.plays[k].k - s.plays[k - 1].k - 1;
      if (n > 0 && (!gap || n > gap.shows)) gap = { shows: n, from: s.plays[k - 1], to: s.plays[k] };
    }
    s.gap = gap;
    s.since = setShows.length - 1 - s.lastPlay.k; // shows since the last time
  }

  // Each released night and the show it came from: the same day, the band's show if there were two, the one
  // sharing the most songs if the band played twice.
  const byDate = new Map();
  for (const show of shows) {
    if (!byDate.has(show.date)) byDate.set(show.date, []);
    byDate.get(show.date).push(show);
  }
  for (const n of M.nights) {
    const here = byDate.get(n.date);
    if (!here) continue;
    const names = new Set(n.tracks.filter(t => t.songs).flatMap(t => t.songs));
    const score = sh => sh.played.filter(s => names.has(s)).length + (sh.band ? 0.5 : 0);
    const best = here.reduce((a, b) => (score(b) > score(a) ? b : a));
    n.show = best;
    best.night ||= n;
  }

  // Each year: the band's shows, and how many have a setlist.
  const years = new Map();
  for (const show of bandShows) {
    const y = years.get(show.year) || { year: show.year, shows: 0, sets: 0 };
    y.shows++;
    if (show.played.length) y.sets++;
    years.set(show.year, y);
  }

  Object.assign(M, {
    shows, bandShows, setShows, showsByDate: byDate, showYears: years, through: S.through,
    extraSongs: extra, allSongs: [...M.songs, ...extra],
  });
  return M;
}

// "Played at 1,234 shows": a song's play count against the shows with a setlist that year, for the chart.
export function rotation(M, s) {
  const out = [];
  const first = Math.min(...M.showYears.keys()), last = Math.max(...M.showYears.keys());
  for (let y = first; y <= last; y++) {
    const year = M.showYears.get(y);
    out.push({ year: y, plays: s.playYears?.get(y) || 0, sets: year?.sets || 0 });
  }
  return out;
}
