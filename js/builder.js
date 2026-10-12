// Writes a show from the official recordings: songs picked the way you asked, in an order learned from the band's
// own nights, with versions chosen so the whole thing lands on the time you've got.
import { median } from './model.js';

export const PICKS = { hits: 'The big ones', mix: 'A mix', deep: 'Deep cuts' };
export const JAMS = { short: 'Short', any: 'As played', long: 'Long' };

// Short songs that lead straight into another: Pantala Naga Pampa into Rapunzel, Anyone Seen the Bridge? into
// Too Much. They only go into a show still attached to whatever they led into that night.
export function leadIns(M) {
  const out = new Map();
  for (const s of M.songs) {
    const lens = s.versions.filter(v => !v.shared && v.secs > 0).map(v => v.secs);
    if (!lens.length || median(lens) > 120) continue;
    const next = new Map();
    let n = 0;
    for (const v of s.versions) {
      const t = v.track;
      if (t.extra || t.songs.at(-1) !== s) continue;
      n++;
      const after = t.next?.songs[0];
      if (after) next.set(after, (next.get(after) || 0) + 1);
    }
    const [best, count] = [...next].sort((a, b) => b[1] - a[1])[0] || [];
    if (best && n >= 3 && count / n >= 0.6) out.set(s, best);
  }
  return out;
}

// Where each song tends to fall in a night, from 0 (opener) to 1 (last song).
function profiles(M) {
  const out = new Map();
  for (const s of M.songs) {
    const xs = [];
    for (const v of s.versions) {
      if (!v.night.whole || v.track.extra) continue;
      const main = v.night.tracks.filter(t => t.songs && !t.extra);
      if (main.length > 1) xs.push(v.track.index / (main.length - 1));
    }
    out.set(s, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5);
  }
  return out;
}

const cache = new WeakMap();
function prep(M) {
  if (!cache.has(M)) cache.set(M, { leadIns: leadIns(M), profile: profiles(M) });
  return cache.get(M);
}

// Every playable piece of the filtered recordings: a track, or a lead-in glued to the track it leads into.
export function pool(M, opts = {}) {
  const { leadIns: glue } = prep(M);
  const from = opts.from || '0000', to = opts.to || '9999';
  const items = [];
  for (const n of M.nights) {
    if (n.date < from || n.date > to) continue;
    if (opts.venue != null && n.venue?.id !== opts.venue) continue;
    const tracks = n.tracks.filter(t => t.songs);
    tracks.forEach((t, k) => {
      if (!(t.secs > 0)) return;
      const last = t.songs.at(-1);
      let parts = [t];
      if (glue.has(last)) {
        // Usually Rapunzel after Pantala Naga Pampa, but whatever it led into that night.
        const next = tracks[k + 1];
        if (!next || next.extra !== t.extra || !(next.secs > 0)) return;
        parts = [t, next];
      }
      // A lead-in by itself, or the tail of one, isn't a piece.
      if (t.songs.length === 1 && t.secs < 75 && parts.length === 1) return;
      const songs = parts.flatMap(p => p.songs);
      if (new Set(songs).size !== songs.length) return;
      if (opts.covers === false && songs.some(s => s.cover)) return;
      // A cut-down release of a song (half its usual length or less) isn't a version to build a show on.
      if (songs.length === 1 && songs[0].median && t.secs < songs[0].median * 0.55) return;
      items.push({ parts, songs, secs: parts.reduce((a, p) => a + p.secs, 0), night: n });
    });
  }
  return items;
}

function weightOf(song, picks) {
  const p = Math.max(1, song.nightCount);
  if (picks === 'hits') return p ** 1.6;
  if (picks === 'deep') return (song.cover ? 0.5 : 1) / Math.sqrt(p);
  return p ** 0.85;
}

function sample(list, weight, rand) {
  let total = 0;
  const ws = list.map(x => { const w = Math.max(0, weight(x)); total += w; return w; });
  if (!total) return null;
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i];
  return list.at(-1);
}

// How well a version's length suits "short", "as played" or "long", relative to that song's other versions.
function jamWeight(item, siblings, jams) {
  if (jams === 'any' || siblings.length < 2) return 1;
  const below = siblings.filter(x => x.secs < item.secs).length;
  const r = below / (siblings.length - 1);
  return (jams === 'long' ? r : 1 - r) ** 2 + 0.03;
}

export function buildShow(M, opts = {}, rand = Math.random) {
  const target = Math.round((opts.minutes || 90) * 60);
  const picks = opts.picks || 'mix', jams = opts.jams || 'any';
  const items = pool(M, opts);
  const { profile } = prep(M);
  const bySong = new Map();
  for (const it of items) for (const s of it.songs) {
    if (!bySong.has(s)) bySong.set(s, []);
    bySong.get(s).push(it);
  }
  // Fragments (every version under two minutes) don't anchor a slot.
  const songs = [...bySong.keys()].filter(s => bySong.get(s).some(it => it.secs >= 120));
  if (!songs.length) return { slots: [], total: 0, target, empty: true };

  const used = new Set();
  const slots = [];
  const free = it => it.songs.every(s => !used.has(s));
  const choose = (song, near) => {
    const options = bySong.get(song).filter(free);
    if (!options.length) return null;
    if (near != null) return options.reduce((a, b) => (Math.abs(b.secs - near) < Math.abs(a.secs - near) ? b : a));
    return sample(options, it => jamWeight(it, options, jams), rand);
  };
  const take = (song, it) => { it.songs.forEach(s => used.add(s)); slots.push({ anchor: song, item: it }); };
  const total = () => slots.reduce((a, s) => a + s.item.secs, 0);

  // Fill to just under the time.
  const slack = Math.min(240, target * 0.06);
  for (let guard = 0; total() < target - slack && guard < 400; guard++) {
    const left = songs.filter(s => !used.has(s) && bySong.get(s).some(free));
    if (!left.length) break;
    const song = sample(left, s => weightOf(s, picks), rand);
    const it = choose(song);
    if (it) take(song, it);
  }

  // Then land it: swap versions, drop or add a song, whichever gets closest, until it's within a few seconds.
  for (let round = 0; round < 300; round++) {
    const diff = total() - target;
    if (Math.abs(diff) <= 8) break;
    let best = null;
    const consider = (gain, apply) => { if (gain > 0.5 && (!best || gain > best.gain)) best = { gain, apply }; };
    for (const slot of slots) {
      slot.item.songs.forEach(s => used.delete(s));
      for (const alt of bySong.get(slot.anchor)) {
        if (alt === slot.item || !free(alt)) continue;
        const d2 = diff - slot.item.secs + alt.secs;
        const keepFeel = jamWeight(alt, bySong.get(slot.anchor), jams) >= 0.2 ? 0 : 20;
        consider(Math.abs(diff) - Math.abs(d2) - keepFeel, () => { slot.item = alt; });
      }
      slot.item.songs.forEach(s => used.add(s));
    }
    if (diff > 0 && slots.length > 2) {
      slots.forEach((slot, i) => {
        const d2 = diff - slot.item.secs;
        consider(Math.abs(diff) - Math.abs(d2) - 45, () => { slot.item.songs.forEach(s => used.delete(s)); slots.splice(i, 1); });
      });
    }
    if (diff < 0) {
      for (const s of songs) {
        if (used.has(s)) continue;
        const it = choose(s, -diff);
        if (!it) continue;
        consider(Math.abs(diff) - Math.abs(diff + it.secs) - 45 / Math.sqrt(weightOf(s, picks) + 1), () => take(s, it));
      }
    }
    if (!best) break;
    best.apply();
    used.clear();
    for (const slot of slots) slot.item.songs.forEach(s => used.add(s));
  }

  return { slots: order(M, slots, profile, rand), total: total(), target };
}

// Put the songs in an order the band might: an opener that often opens, something that often ends the night
// last, and in between each song followed by what tends to follow it, early songs early and late songs late.
export function order(M, slots, profile = prep(M).profile, rand = Math.random) {
  if (slots.length < 3) return slots;
  const first = s => s.item.songs[0], last = s => s.item.songs.at(-1);
  const left = [...slots];
  const pick = (list, w) => { const x = sample(list, w, rand); left.splice(left.indexOf(x), 1); return x; };
  const opener = pick(left, s => ((M.openers.get(first(s)) || 0) + 0.4) * (1.3 - profile.get(first(s))));
  const closer = pick(left, s => ((M.closers.get(last(s)) || 0) + 0.3) ** 1.3 * (0.4 + profile.get(last(s))));
  const out = [opener];
  while (left.length) {
    const prev = last(out.at(-1));
    const at = out.length / (slots.length - 1);
    const follows = M.follows.get(prev);
    const next = pick(left, s => {
      const f = follows?.get(first(s)) || 0;
      return (1 + 3 * f) * Math.exp(-6 * Math.abs(profile.get(first(s)) - at)) + 0.01;
    });
    out.push(next);
  }
  out.push(closer);
  return out;
}

// How many songs at the end to write under "Encore": two once it's a real show, one for a short one.
export const encoreSize = slots => (slots.length >= 10 ? 2 : slots.length >= 5 ? 1 : 0);

// Share links name each piece by its night and song, so they survive the data being rebuilt.
export function encode(show) {
  return show.slots.map(s => {
    const t = s.item.parts[0];
    return `${t.night.date.replaceAll('-', '')}~${t.songs[0].slug}${s.item.parts.length > 1 ? '+' : ''}`;
  }).join(',');
}

export function decode(M, text) {
  const slots = [];
  for (const token of String(text || '').split(',')) {
    const m = token.match(/^(\d{4})(\d{2})(\d{2})~([a-z0-9-]+)(\+?)$/);
    if (!m) continue;
    const night = M.byDate.get(`${m[1]}-${m[2]}-${m[3]}`);
    const song = M.bySlug.get(m[4]);
    if (!night || !song) continue;
    const tracks = night.tracks.filter(t => t.songs);
    const k = tracks.findIndex(t => t.songs[0] === song);
    if (k < 0) continue;
    const parts = m[5] && tracks[k + 1] ? [tracks[k], tracks[k + 1]] : [tracks[k]];
    slots.push({ anchor: song, item: { parts, songs: parts.flatMap(p => p.songs), secs: parts.reduce((a, p) => a + p.secs, 0), night } });
  }
  return { slots, total: slots.reduce((a, s) => a + s.item.secs, 0) };
}
