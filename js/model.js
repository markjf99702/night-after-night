// Turns js/data.js into songs, nights and versions for the pages and the show builder.
// No page code in here, so the tests can load it in Node.
import { bandOn } from './lineup.js';

export const ERAS = [
  { id: 'leroi', name: 'With LeRoi Moore', from: '1991-01-01', to: '2008-06-28' },
  { id: 'coffin', name: 'With Jeff Coffin and Boyd Tinsley', from: '2008-06-29', to: '2018-02-02' },
  { id: 'strong', name: 'With Buddy Strong', from: '2018-02-03', to: '2099-12-31' },
];

export const eraOf = date => ERAS.find(e => e.from <= date && date <= e.to);

export function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
}

// What a release is called on the shelf, and what to search a streaming service for.
export function releaseLabel(title, year) {
  let m;
  if ((m = title.match(/Live Trax,?\s*(?:Volume|Vol\.?)\s*(\d+)/i))) return { label: `Live Trax Vol. ${m[1]}`, query: `Live Trax Vol. ${m[1]}` };
  if (/DMBLive/i.test(title)) return { label: 'DMBLive', query: '' };
  if ((m = title.match(/^Warehouse (\d{4})\b/i))) return { label: `Warehouse ${m[1]}`, query: '' };
  if ((m = title.match(/^(?:The )?Warehouse (\d+),? Vol(?:ume|\.)? ?(\d+)/i))) return { label: `Warehouse ${m[1]}, Vol. ${m[2]}`, query: '' };
  if (/SiriusXM/i.test(title)) return { label: 'SiriusXM broadcast', query: '' };
  if (/^\d{4}[-‐]\d{1,2}[-‐]\d{1,2}:/.test(title)) return { label: year ? `Official release, ${year}` : 'Official release', query: '' };
  return { label: title, query: title };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function dateText(date, style = 'short') {
  const [y, m, d] = date.split('-').map(Number);
  if (style === 'long') return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
  if (style === 'year') return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

export function clock(secs) {
  secs = Math.round(secs);
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// "1 hr 32 min", for totals people read rather than compare.
export function duration(secs) {
  const mins = Math.round(secs / 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
}

export function yearOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return y + ((m - 1) * 30.44 + d - 1) / 365.25;
}

// The middle length of the versions around each point in time (two years either side): the line through a song's
// dots. It breaks where there are too few versions to say. Each run is a list of [year, seconds].
export function trend(versions) {
  const timed = versions.filter(v => !v.shared && v.secs > 0);
  const runs = [];
  if (timed.length < 6) return runs;
  const ys = timed.map(v => [yearOf(v.date), v.secs]);
  let run = [];
  for (let t = ys[0][0]; t <= ys.at(-1)[0] + 0.01; t += 0.25) {
    const near = ys.filter(([y]) => Math.abs(y - t) <= 2).map(([, s]) => s);
    if (near.length >= 4) run.push([t, median(near)]);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter(r => r.length > 1);
}

// How a song changed, in a sentence: from its first years to its longest stretch, and lately.
export function story(s) {
  const pts = trend(s.versions).flat();
  if (pts.length < 8) return '';
  const mins = secs => Math.round(secs / 60);
  const [t0, early] = pts[0];
  const [tp, peak] = pts.reduce((a, p) => (p[1] > a[1] ? p : a));
  const [tl, late] = pts.at(-1);
  const out = [];
  if (peak >= early * 1.35 && peak - early >= 90 && tp - t0 >= 2) {
    out.push(`It grew from about ${mins(early)} minutes in its first years to about ${mins(peak)} around ${Math.round(tp)}`);
    if (late <= peak * 0.8 && tl - tp >= 2 && tl >= yearOf(s.last.date) - 2.5) out.push(`and lately it runs about ${mins(late)}`);
    return out.join(', ') + '.';
  }
  if (early >= late * 1.35 && early - late >= 90 && tl - t0 >= 3 && tl >= yearOf(s.last.date) - 2.5) return `It has tightened up: about ${mins(early)} minutes in its first years, about ${mins(late)} lately.`;
  return '';
}

export const median = xs => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function build(data) {
  const albums = data.albums.map((a, i) => ({ id: i, name: a.n, year: a.y, date: a.d || `${a.y}-07-01`, songCount: a.t || 0, by: a.by || null }));
  const releases = data.releases.map((r, i) => ({ id: i, title: r.t, year: r.y, mb: r.mb, ...releaseLabel(r.t, r.y) }));
  const venues = data.venues.map((v, i) => ({ id: i, name: v.n, town: v.t, now: v.now || null, nights: [], names: new Set([v.n]) }));
  const taken = new Set();
  const songs = data.songs.map((s, i) => {
    let slug = slugify(s.n);
    while (taken.has(slug)) slug += '-2';
    taken.add(slug);
    return {
      id: i, name: s.n, slug, cover: s.c || null, versions: [],
      albums: (s.a || []).map(([a, length]) => ({ album: albums[a], length })).sort((x, y) => x.album.date.localeCompare(y.album.date)),
    };
  });

  const nights = data.nights.map((n, i) => {
    const venue = venues[n.v] || null;
    const night = {
      id: i, date: n.d, year: +n.d.slice(0, 4), venue, place: n.n || venue?.name || 'Unknown venue', noVenue: !n.n && !venue,
      town: venue?.town || '', release: releases[n.r], whole: !!n.w, tracks: [],
    };
    if (venue) { venue.nights.push(night); venue.names.add(night.place); }
    for (const [what, secs, x = {}] of n.t) {
      if (typeof what === 'string') { night.tracks.push({ other: what, secs, night }); continue; }
      const ids = Array.isArray(what) ? what : [what];
      night.tracks.push({
        songs: ids.map(id => songs[id]), secs, night, release: x.r != null ? releases[x.r] : night.release,
        disc: x.p?.[0], track: x.p?.[1], extra: !!x.x, bits: x.b || [], withs: x.w || [], segue: !!x.s,
      });
    }
    const main = night.tracks.filter(t => t.songs && !t.extra);
    night.total = night.tracks.filter(t => !t.extra).reduce((sum, t) => sum + t.secs, 0);
    night.timed = night.tracks.filter(t => !t.extra).every(t => t.secs > 0); // some downloads list no lengths
    night.songCount = main.reduce((n, t) => n + t.songs.length, 0);
    main.forEach((t, k) => {
      t.index = k;
      t.prev = main[k - 1] || null;
      t.next = main[k + 1] || null;
    });
    for (const t of night.tracks) {
      if (!t.songs) continue;
      t.songs.forEach((s, pos) => {
        s.versions.push({
          song: s, night, track: t, pos, secs: t.secs, shared: t.songs.length > 1, date: night.date,
          opener: night.whole && !t.extra && t.index === 0, closer: night.whole && !t.extra && t.index === main.length - 1,
        });
      });
    }
    return night;
  });

  for (const s of songs) stats(s);
  for (const v of venues) v.nights.sort((a, b) => a.date.localeCompare(b.date));

  // How often each song follows another on whole nights, for putting a built show in a believable order.
  const follows = new Map();
  const openers = new Map(), closers = new Map();
  for (const n of nights) {
    if (!n.whole) continue;
    const main = n.tracks.filter(t => t.songs && !t.extra);
    if (!main.length) continue;
    openers.set(main[0].songs[0], (openers.get(main[0].songs[0]) || 0) + 1);
    const lastSong = main[main.length - 1].songs.at(-1);
    closers.set(lastSong, (closers.get(lastSong) || 0) + 1);
    const flat = main.flatMap(t => t.songs);
    for (let k = 1; k < flat.length; k++) {
      const a = flat[k - 1], b = flat[k];
      if (!follows.has(a)) follows.set(a, new Map());
      follows.get(a).set(b, (follows.get(a).get(b) || 0) + 1);
    }
  }

  const bySlug = new Map(songs.map(s => [s.slug, s]));
  const byDate = new Map(nights.map(n => [n.date, n]));
  const versions = songs.flatMap(s => s.versions);
  const years = [...new Set(nights.map(n => n.year))].sort((a, b) => a - b);
  return { albums, releases, venues, songs, nights, versions, follows, openers, closers, bySlug, byDate, years, built: data.built };
}

// What a song's versions say about it.
function stats(s) {
  s.versions.sort((a, b) => a.date.localeCompare(b.date) || a.track.index - b.track.index);
  const timed = s.versions.filter(v => !v.shared && v.secs > 0);
  const lens = timed.map(v => v.secs);
  s.count = s.versions.length;
  s.nightCount = new Set(s.versions.map(v => v.night)).size;
  s.first = s.versions[0];
  s.last = s.versions.at(-1);
  s.median = median(lens);
  s.longest = timed.reduce((a, v) => (!a || v.secs > a.secs ? v : a), null);
  s.shortest = timed.reduce((a, v) => (!a || v.secs < a.secs ? v : a), null);
  // The album version to measure against: the studio one people know. Remember Two Things was partly recorded
  // live, so a song that's also on a later album is measured against that.
  s.album = s.albums.find(a => a.album.name !== 'Remember Two Things') || s.albums[0] || null;
  s.stretch = s.album?.length && s.median ? s.median / s.album.length : null;
  s.opens = s.versions.filter(v => v.opener).length;
  s.closes = s.versions.filter(v => v.closer).length;
  s.eras = ERAS.map(e => {
    const xs = timed.filter(v => e.from <= v.date && v.date <= e.to).map(v => v.secs);
    return { era: e, count: xs.length, median: median(xs) };
  });
  // What came right after it and right before it: the song it shares a track with ("Pantala Naga Pampa > Rapunzel"),
  // or else the first song of the next track and the last song of the one before.
  const tally = key => {
    const m = new Map();
    for (const v of s.versions) {
      const t = v.track;
      if (t.extra) continue;
      const other = key === 'next' ? t.songs[v.pos + 1] || t.next?.songs[0] : t.songs[v.pos - 1] || t.prev?.songs.at(-1);
      if (!other || other === s) continue;
      m.set(other, (m.get(other) || 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  s.nexts = tally('next');
  s.prevs = tally('prev');
  const bits = new Map();
  for (const v of s.versions) for (const b of v.track.bits) bits.set(b, (bits.get(b) || 0) + 1);
  s.bits = [...bits].sort((a, b) => b[1] - a[1]);
}

// The band on stage that night, and what changed from the five who started it.
export function lineupNote(date) {
  return bandOn(date);
}
