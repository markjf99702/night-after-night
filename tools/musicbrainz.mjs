// Rebuilds js/data.js from MusicBrainz:  node tools/musicbrainz.mjs  (add --report to list every song and venue)
//
// Every official Dave Matthews Band release with its tracks, and every DMB recording with when and where it was
// recorded and which song (or songs) it is. MusicBrainz's data is public domain (CC0). Responses are kept in
// .cache/musicbrainz, so a rerun only fetches what's missing; delete that folder to fetch everything again.
// MusicBrainz asks for no more than one request a second, so a fresh run takes about four minutes.
// Behind a proxy, Node 22 needs NODE_USE_ENV_PROXY=1 to use it.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { songKey, venueKey, dateIn, splitTitle, NOT_A_SONG, JAMS, ALIASES, TOWNS, VENUE_ALIASES, VENUE_FIXES, VENUE_TOWNS, DATE_FIXES, distance } from './titles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(root, '.cache/musicbrainz');
const API = 'https://musicbrainz.org/ws/2/';
const UA = 'NightAfterNight/1.0 ( https://junkdrawer.works/night-after-night/ )';
const BAND = '07e748f1-075e-428d-85dc-ce3be434e906'; // Dave Matthews Band
const DAVE = '2fa95b32-3c11-42d7-b495-12fc6be0a024'; // Dave Matthews, for the songs from Some Devil
const report = process.argv.includes('--report');

// ---------------------------------------------------------------------------------------------------------------
// Fetching

let last = 0;
async function get(path) {
  const file = join(CACHE, createHash('sha1').update(path).digest('hex').slice(0, 20) + '.json');
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(API + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      .catch(e => ({ ok: false, status: e.message }));
    if (res.ok) {
      const json = await res.json();
      await mkdir(CACHE, { recursive: true });
      await writeFile(file, JSON.stringify(json));
      return json;
    }
    if (attempt >= 6) throw new Error(`${path}: ${res.status}`);
    await new Promise(r => setTimeout(r, attempt * 3000));
  }
}

async function browse(entity, query, limit) {
  const all = [];
  for (let offset = 0; ; offset += limit) {
    const page = await get(`${entity}?${query}&fmt=json&limit=${limit}&offset=${offset}`);
    all.push(...page[`${entity}s`]);
    const count = page[`${entity}-count`];
    process.stdout.write(`\r${entity}s: ${all.length} of ${count}   `);
    if (offset + limit >= count) break;
  }
  process.stdout.write('\n');
  return all;
}

const releases = await browse('release', `artist=${BAND}&status=official&inc=recordings+release-groups+media+artist-credits`, 25);
const recordings = await browse('recording', `artist=${BAND}&inc=place-rels+work-rels+area-rels`, 100);
// Dave's one solo studio album: the earliest release of Some Devil.
const daveAlbums = (await browse('release', `artist=${DAVE}&status=official&type=album&inc=release-groups+media`, 25))
  .filter(r => r['release-group'].title === 'Some Devil' && !(r['release-group']['secondary-types'] || []).length && r.date)
  .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 1);
const bandRels = await get(`artist/${BAND}?inc=artist-rels&fmt=json`);
const members = new Set([BAND, DAVE, ...(bandRels.relations || []).filter(r => /member|supporting/.test(r.type)).map(r => r.artist.id)]);

const recById = new Map(recordings.map(r => [r.id, r]));
const rgOf = r => r['release-group'];
const isLiveGroup = rg => (rg['secondary-types'] || []).includes('Live') || rg['primary-type'] === 'Broadcast';
const isCompilation = rg => (rg['secondary-types'] || []).includes('Compilation');
const VIDEO = /DVD|Blu-ray|VHS|Laser|Video|UMD/i;
const BONUS = /bonus|encore trax|extended|sampler|extras?\b/i;
const audioMedia = r => (r.media || []).filter(m => !VIDEO.test(m.format || ''));
const trackSeconds = t => Math.round((t.length || t.recording?.length || 0) / 1000);
const isLiveRecording = rec => /^live/i.test(rec?.disambiguation || '')
  || (rec?.relations || []).some(r => r.type === 'performance' && (r.attributes || []).includes('live'));

// ---------------------------------------------------------------------------------------------------------------
// Songs. One per song key; a title with no song attached in MusicBrainz is matched to a known song through the
// alias list, then by spelling (one or two letters off), before it's allowed to stand as a song of its own.

const songs = new Map(); // key → song
const workTitles = new Map(); // key → work title, for every work any recording is attached to
for (const rec of recordings) {
  for (const r of rec.relations || []) {
    if (r.type === 'performance' && r['target-type'] === 'work') {
      const k = songKey(r.work.title);
      if (k && !workTitles.has(k)) workTitles.set(k, r.work.title);
    }
  }
}
function resolve(title) {
  const k = songKey(title);
  if (!k) return null;
  if (ALIASES[k]) return ALIASES[k];
  if (workTitles.has(k)) return workTitles.get(k);
  if (k.length >= 7) {
    let best = null, bestD = 9;
    for (const [wk, wt] of workTitles) {
      if (Math.abs(wk.length - k.length) > 2) continue;
      const d = distance(k, wk);
      if (d < bestD) { best = wt; bestD = d; }
    }
    if (best && bestD <= (k.length >= 10 ? 2 : 1)) return best;
  }
  return title;
}
function song(title) {
  const key = songKey(title);
  if (!key) return null;
  if (!songs.has(key)) songs.set(key, { key, names: new Map(), albums: [], cover: 0, original: 0, works: new Set() });
  const s = songs.get(key);
  s.names.set(title, (s.names.get(title) || 0) + 1);
  return s;
}

// The songs a track is, in the title's order, and the rest of what MusicBrainz says is in it: a few bars of
// something else in the middle ("with a bit of Linus and Lucy") or a whole song the title leaves out.
function songsOf(rec, trackTitle) {
  const parts = splitTitle(trackTitle);
  const keys = parts.map(p => songKey(resolve(p.text) || p.text));
  const where = k => keys.findIndex(p => p === k || (p.length > 3 && k.length > 3 && (p.includes(k) || k.includes(p))));
  const named = [], others = [], seen = new Set();
  for (const r of (rec?.relations || []).filter(r => r.type === 'performance' && r['target-type'] === 'work')) {
    const k = songKey(r.work.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (JAMS.has(k)) continue;
    const attrs = r.attributes || [];
    const at = where(k);
    const entry = { title: r.work.title, work: r.work.id, cover: attrs.includes('cover'), at };
    // A song the title names is the track, even where MusicBrainz calls it a partial performance (#40 is never
    // played whole); a song the title doesn't name is a bit of something else, or a whole song tucked inside.
    if (at >= 0 && !parts[at].partial) named.push(entry);
    else others.push({ ...entry, partial: attrs.includes('partial') || (at >= 0 && parts[at].partial) });
  }
  for (const [i, p] of parts.entries()) {
    if (named.some(x => x.at === i) || others.some(x => x.at === i)) continue;
    const title = resolve(p.text);
    const known = workTitles.has(songKey(title)) || ALIASES[songKey(p.text)];
    if (JAMS.has(songKey(title)) || (!known && (NOT_A_SONG.test(p.raw) || NOT_A_SONG.test(p.text)))) continue;
    if (p.partial) others.push({ title, partial: true, at: i });
    else named.push({ title, work: null, cover: false, at: i });
  }
  named.sort((a, b) => a.at - b.at);
  // "All Along the Watchtower (intro) > All Along the Watchtower" is one song.
  for (let i = named.length - 1; i > 0; i--) if (songKey(named[i].title) === songKey(named[i - 1].title)) named.splice(i, 1);
  return { named, bits: others.filter(x => x.partial).map(x => x.title), withs: others.filter(x => !x.partial).map(x => x.title) };
}

// ---------------------------------------------------------------------------------------------------------------
// Studio albums: DMB's eleven, plus Dave's Some Devil for the songs the band took from it.

const studio = new Map();
for (const r of releases) {
  const rg = rgOf(r);
  if (rg['primary-type'] !== 'Album' || (rg['secondary-types'] || []).length) continue;
  if (!studio.has(rg.id)) studio.set(rg.id, []);
  studio.get(rg.id).push(r);
}
const trackCount = r => audioMedia(r).reduce((n, m) => n + (m.tracks?.length || 0), 0);
const albums = [];
for (const [id, rs] of studio) {
  const rg = rgOf(rs[0]);
  const pick = rs.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date) || trackCount(a) - trackCount(b))[0] || rs[0];
  albums.push({ id, name: rg.title, year: +(rg['first-release-date'] || '').slice(0, 4), release: pick });
}
for (const r of daveAlbums) {
  const rg = rgOf(r);
  if (albums.some(a => a.id === rg.id)) continue;
  const full = await get(`release/${r.id}?inc=recordings+recording-level-rels+work-rels&fmt=json`);
  for (const m of full.media || []) for (const t of m.tracks || []) if (!recById.has(t.recording.id)) recById.set(t.recording.id, t.recording);
  albums.push({ id: rg.id, name: rg.title, year: +(rg['first-release-date'] || '').slice(0, 4), by: 'Dave Matthews', release: full });
}
albums.sort((a, b) => a.year - b.year);
for (const album of albums) {
  for (const m of audioMedia(album.release)) {
    for (const t of m.tracks || []) {
      const { named } = songsOf(recById.get(t.recording.id) || t.recording, t.title);
      if (named.length !== 1) continue;
      const s = song(named[0].title);
      s.names.set(t.title.replace(/\s*\((?:[^)]*\b(?:version|edit|remaster)\b[^)]*)\)\s*/i, '').trim(), 1000); // the album's spelling wins
      if (!s.albums.some(a => a.album === album)) s.albums.push({ album, length: trackSeconds(t) });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// When and where each live recording was made. In order of trust: a date printed in the track's own title
// (DMB's releases write them month first: "The Stone (9.2.00 – Charlotte, NC …)"), the recording's "recorded at"
// relationship, its "live, 1998-12-08: …" note, the disc's title, then the release's title for one-night releases.

const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const town = t => TOWNS[t] || t;
function townOf(place) {
  const a = (place.address || '').match(/,\s*([^,]+?),\s*([A-Z]{2})\s*(?:\d{5}(?:-\d{4})?)?\s*$/);
  if (a && STATES.has(a[2])) return town(`${a[1]}, ${a[2]}`);
  return town(place.area?.name || '');
}

// "DMB Live Trax, Volume 1: Worcester Centrum Centre, Worcester, MA, USA" → venue and town.
export function placeFromText(text) {
  if (!text) return null;
  let s = text.replace(/^[\s:–—|-]+/, '').replace(/^at\s+(?:the\s+)?/i, '')
    .replace(/^(?:DMB\s+)?Live Trax,?\s*(?:Volume|Vol\.?)\s*\d+:?\s*/i, '')
    .replace(/^DMBLive:?\s*/i, '')
    .trim();
  const inner = s.match(/\(([^)]*,[^)]*)\)\s*$/); // "Soulshine (Madison Square Garden, New York, NY)"
  s = inner ? inner[1] : s.replace(/\s*\([^)]*\)\s*$/, '');
  const parts = s.replace(/[()]/g, ' ').split(/\s*(?:\||–|—|,|\s-\s)\s*/).map(p => p.trim()).filter(p => p && !/^(USA|United States)$/i.test(p));
  if (!parts.length) return null;
  return { name: parts[0], town: town(parts.slice(1).join(', ')) };
}

function relInfo(rec) {
  for (const r of rec?.relations || []) {
    if (r.type === 'recorded at' && r['target-type'] === 'place' && r.begin?.length === 10) {
      const p = r.place;
      return { date: r.begin, place: { id: p.id, name: r['target-credit'] || p.name, current: p.name, town: townOf(p), studio: p.type === 'Studio' } };
    }
  }
  // "live, 1998-12-08: Worcester Centrum Centre, …" or "Live, 1995-08-17, Palmer Auditorium, Davenport, IA"
  const m = (rec?.disambiguation || '').match(/^live,?\s*(\d{4}[-‐]\d{2}[-‐]\d{2})(?:\s*[:,]\s*(.+))?/i);
  const d = m && dateIn(m[1]);
  if (d) return { date: d.date, text: m[2] };
  for (const r of rec?.relations || []) if (r.type === 'performance' && r.begin?.length === 10) return { date: r.begin };
  return null;
}

const recInfo = new Map(); // recording id → { date, place?, text?, fromTitle? }
const how = { title: 0, rel: 0, disc: 0, release: 0 };
for (const r of releases) {
  for (const m of audioMedia(r)) for (const t of m.tracks || []) {
    if (recInfo.has(t.recording.id)) continue;
    const rec = recById.get(t.recording.id) || t.recording;
    const rel = relInfo(rec);
    const fixed = rel && DATE_FIXES[`${rel.date}|${venueKey(rel.place?.name || placeFromText(rel.text)?.name || '')}`];
    if (fixed) { rel.date = fixed; if (rel.text) rel.text = rel.text.replace(/Charleston, SC/, 'Charlottesville, VA'); }
    const inTitle = dateIn(t.title);
    if (inTitle) { recInfo.set(t.recording.id, { ...rel, date: inTitle.date }); how.title++; }
    else if (rel?.date) { recInfo.set(t.recording.id, rel); how.rel++; }
  }
}
for (const r of releases) {
  const rg = rgOf(r);
  const titleDate = isLiveGroup(rg) && !isCompilation(rg) ? (dateIn(rg.title) || dateIn(r.title)) : null;
  for (const m of audioMedia(r)) {
    const discDate = dateIn(m.title);
    const tracks = m.tracks || [];
    const known = tracks.map(t => recInfo.get(t.recording.id)?.date).filter(Boolean);
    for (const t of tracks) {
      if (recInfo.has(t.recording.id)) continue;
      if (discDate) { recInfo.set(t.recording.id, { date: discDate.date, text: rgOf(r).title }); how.disc++; continue; }
      if (!titleDate || BONUS.test(m.title || '')) continue;
      // A disc whose other tracks were recorded on other nights is a bonus disc even if it doesn't say so.
      if (known.length && !known.includes(titleDate.date)) continue;
      recInfo.set(t.recording.id, { date: titleDate.date, text: titleDate.rest, fromTitle: true });
      how.release++;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Venues: MusicBrainz's places (which know a venue through all its names), and venues only named in titles.

const venues = [];
const stateOf = t => (t || '').match(/,\s*([A-Z]{2})$/)?.[1];
function sameTown(a, b) {
  if (!a || !b) return true;
  const ka = songKey(a.split(',')[0]), kb = songKey(b.split(',')[0]);
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}
// The same venue: the same name in a town that fits, or, for a name of three words or more ("Alpine Valley Music
// Theatre" in East Troy or Elkhorn), the same state. "Greek Theatre" in Berkeley and Los Angeles stay apart.
function findVenue(name, where) {
  const nk = venueKey(name);
  return venues.find(v => [...v.names.keys(), v.current].some(n => venueKey(n) === nk)
    && [...v.towns.keys()].concat(v.towns.size ? [] : ['']).some(t => sameTown(t, where)
      || (name.split(/\s+/).length >= 3 && stateOf(t) && stateOf(t) === stateOf(where))));
}
function venueFrom(info, release) {
  let v, name, where;
  const fix = () => {
    const fixed = VENUE_FIXES[venueKey(name)];
    if (fixed) { name = fixed; where = (where || '').replace(new RegExp(`^${fixed},\\s*`), ''); }
    if (!where) {
      const p = placeFromText(dateIn(rgOf(release).title)?.rest);
      where = p && venueKey(p.name) === venueKey(name) ? p.town : VENUE_TOWNS[venueKey(name)] || '';
    }
  };
  const aliasOf = n => VENUE_ALIASES[`${venueKey(n)}|${venueKey((where || '').split(',')[0])}`] || VENUE_ALIASES[venueKey(n)];
  const byName = n => venues.find(x => venueKey(x.current) === venueKey(n) || [...x.names.keys()].some(k => venueKey(k) === venueKey(n)));
  if (info.place && !info.place.studio) {
    name = info.place.name; where = info.place.town;
    fix();
    const alias = aliasOf(name) || aliasOf(info.place.current);
    v = venues.find(x => x.ids.has(info.place.id)) || findVenue(name, where) || findVenue(info.place.current, where)
      || (alias && (findVenue(alias, where) || byName(alias)));
    if (!v) { v = { ids: new Set(), current: info.place.current, names: new Map(), towns: new Map() }; venues.push(v); }
    v.ids.add(info.place.id);
  } else {
    const p = placeFromText(info.text) || placeFromText(dateIn(rgOf(release).title)?.rest);
    if (!p) return null;
    name = p.name; where = p.town;
    fix();
    const alias = aliasOf(name);
    v = findVenue(alias || name, where) || (alias && byName(alias));
    if (!v) { v = { ids: new Set(), current: alias || name, names: new Map(), towns: new Map() }; venues.push(v); }
  }
  v.names.set(name, (v.names.get(name) || 0) + 1);
  if (where) v.towns.set(where, (v.towns.get(where) || 0) + (stateOf(where) ? 1 : 0.5));
  return { venue: v, name };
}

// ---------------------------------------------------------------------------------------------------------------
// Nights. Every dated live track on every release, grouped by date; each night takes its order from the
// release (edition) that has the most of it, and the rest are kept as extras from that night.

const nightRows = new Map();
for (const r of releases) {
  for (const [mi, m] of audioMedia(r).entries()) {
    for (const t of m.tracks || []) {
      const info = recInfo.get(t.recording.id);
      if (!info?.date || info.place?.studio) continue;
      if (!isLiveGroup(rgOf(r)) && !isLiveRecording(recById.get(t.recording.id) || t.recording)) continue;
      if (!nightRows.has(info.date)) nightRows.set(info.date, []);
      nightRows.get(info.date).push({ release: r, disc: m.position || mi + 1, track: t.position, t, info });
    }
  }
}

// Places first, so a venue named only in a title can find the place MusicBrainz knows it as.
for (const rows of nightRows.values()) for (const row of rows) if (row.info.place) venueFrom(row.info, row.release);

const releaseList = [];
const releaseIndex = new Map();
function releaseRef(r) {
  const rg = rgOf(r);
  if (!releaseIndex.has(rg.id)) {
    releaseIndex.set(rg.id, releaseList.length);
    releaseList.push({ id: rg.id, title: rg.title, year: +(rg['first-release-date'] || r.date || '').slice(0, 4) || null });
  }
  return releaseIndex.get(rg.id);
}

const nights = [];
for (const [date, rows] of [...nightRows].sort(([a], [b]) => a.localeCompare(b))) {
  const byRelease = new Map();
  for (const row of rows) {
    if (!byRelease.has(row.release.id)) byRelease.set(row.release.id, []);
    byRelease.get(row.release.id).push(row);
  }
  const editions = [...byRelease.values()].sort((a, b) => b.length - a.length
    || (a[0].release.date || '9999').localeCompare(b[0].release.date || '9999'));
  const main = editions[0].sort((a, b) => a.disc - b.disc || a.track - b.track);
  const withPlace = main.find(x => x.info.place) || rows.find(x => x.info.place);
  const at = venueFrom((withPlace || main[0]).info, (withPlace || main[0]).release);
  const tracks = [];
  const have = new Set();
  const add = (row, extra) => {
    const rec = recById.get(row.t.recording.id) || row.t.recording;
    const title = row.t.title.trim();
    const { named, bits, withs } = songsOf(rec, title);
    if (!named.length) { if (!extra) tracks.push({ other: title, secs: trackSeconds(row.t) }); return; }
    const keys = named.map(n => songKey(n.title));
    if (extra && keys.some(k => have.has(k))) return; // the same song from another edition of this night
    keys.forEach(k => have.add(k));
    const list = named.map(x => {
      const s = song(x.title);
      if (x.work) s.works.add(x.work);
      if (x.cover) s.cover++; else s.original++;
      return s;
    });
    tracks.push({
      songs: list, secs: trackSeconds(row.t), bits, withs, extra,
      release: releaseRef(row.release), disc: row.disc, track: row.track, segue: /(?:>>|>|»|->|→)\s*$/.test(title),
    });
  };
  for (const row of main) add(row, false);
  for (const ed of editions.slice(1)) for (const row of ed) add(row, true);
  if (!tracks.some(t => t.songs)) continue;
  const rg = rgOf(main[0].release);
  // A whole night: from a one-night release (or one night's discs of a box), with enough songs to be a show.
  const oneNight = !isCompilation(rg) && (dateIn(rg.title)?.date === date || main.every(x => !x.info.fromTitle));
  const count = tracks.filter(t => t.songs && !t.extra).length;
  nights.push({ date, venue: at?.venue, venueName: at?.name, tracks, release: releaseRef(main[0].release), whole: oneNight && count >= 10 });
}

// ---------------------------------------------------------------------------------------------------------------
// Output

const most = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const used = new Set(nights.flatMap(n => n.tracks.flatMap(t => t.songs || [])));
const songList = [...used];
for (const s of songList) s.name = most(s.names).replace(/'/g, '’');
songList.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
const songIndex = new Map(songList.map((s, i) => [s, i]));

// Covers: songs MusicBrainz marks as covers, and songs off the band's albums written by no one in the band.
const writers = new Map();
for (const s of songList) {
  if (s.albums.length && !(s.cover > s.original)) continue;
  for (const work of s.works) {
    const w = await get(`work/${work}?inc=artist-rels&fmt=json`);
    const credits = (w.relations || []).filter(r => ['writer', 'composer', 'lyricist'].includes(r.type));
    if (!credits.length) continue;
    if (credits.some(r => members.has(r.artist.id))) { s.cover = 0; break; }
    writers.set(s, [...new Set(credits.map(r => r.artist.name))]);
    s.cover = Math.max(s.cover, s.original + 1);
    break;
  }
}

const venueList = [...new Set(nights.map(n => n.venue).filter(Boolean))];
// A venue's name in the list is the one it had on most of these nights; its town, the most specific one seen.
const venueIndex = new Map(venueList.map((v, i) => [v, i]));
const albumIndex = new Map(albums.map((a, i) => [a, i]));

const venueOut = venueList.map(v => {
  const name = most(v.names) || v.current;
  return { n: name, t: most(v.towns) || '', ...(v.current && songKey(v.current) !== songKey(name) ? { now: v.current } : {}), ...(report && !v.ids.size ? { text: 1 } : {}) };
});

const out = {
  built: new Date().toISOString().slice(0, 10),
  albums: albums.map(a => ({ n: a.name, y: a.year, ...(a.by ? { by: a.by } : {}) })),
  songs: songList.map(s => {
    const o = { n: s.name };
    if (s.albums.length) o.a = s.albums.map(a => [albumIndex.get(a.album), a.length]);
    if (s.cover > s.original) o.c = writers.get(s) || [];
    return o;
  }),
  venues: venueOut,
  releases: releaseList.map(r => ({ t: r.title, y: r.year, mb: r.id })),
  nights: nights.map(n => {
    const o = { d: n.date, v: n.venue ? venueIndex.get(n.venue) : -1, r: n.release, t: [] };
    if (n.venue && n.venueName && n.venueName !== venueOut[o.v].n) o.n = n.venueName; // what it was called that night
    if (n.whole) o.w = 1;
    for (const tr of n.tracks) {
      if (!tr.songs) { o.t.push([tr.other, tr.secs]); continue; }
      const ids = tr.songs.map(s => songIndex.get(s));
      const x = { p: [tr.disc, tr.track] };
      if (tr.release !== n.release) x.r = tr.release;
      if (tr.extra) x.x = 1;
      if (tr.bits.length) x.b = tr.bits;
      if (tr.withs.length) x.w = tr.withs;
      if (tr.segue) x.s = 1;
      o.t.push([ids.length === 1 ? ids[0] : ids, tr.secs, x]);
    }
    return o;
  }),
};

const js = `// Made by tools/musicbrainz.mjs from MusicBrainz (musicbrainz.org), whose data is public domain (CC0).
export default ${JSON.stringify(out)};
`;
await writeFile(join(root, 'js/data.js'), js);

const versions = out.nights.reduce((n, x) => n + x.t.filter(t => typeof t[0] !== 'string').length, 0);
console.log(`${out.nights.length} nights (${out.nights.filter(n => n.w).length} whole), ${out.songs.length} songs, ${versions} versions, ${out.venues.length} venues, ${out.releases.length} releases: js/data.js, ${(js.length / 1024).toFixed(0)} KB`);
console.log(`dated by: track title ${how.title}, recording ${how.rel}, disc title ${how.disc}, release title ${how.release}`);

if (report) {
  const counts = out.songs.map((s, i) => [s.n, out.nights.reduce((n, x) => n + x.t.filter(t => t[0] === i || (Array.isArray(t[0]) && t[0].includes(i))).length, 0), s.a ? 'album' : '', s.c ? 'cover: ' + s.c.join(', ') : '']);
  console.log('\nSongs, most versions first:\n' + counts.sort((a, b) => b[1] - a[1]).map(c => c.join(' | ')).join('\n'));
  console.log('\nNot songs:', [...new Set(out.nights.flatMap(n => n.t.filter(t => typeof t[0] === 'string').map(t => t[0])))].join(' | '));
  console.log('\nVenues:\n' + out.venues.map((v, i) => `${out.nights.filter(n => n.v === i).length} ${v.n} (${v.t})${v.now ? ' now ' + v.now : ''}${v.text ? ' [from a title]' : ''}`).join('\n'));
}
