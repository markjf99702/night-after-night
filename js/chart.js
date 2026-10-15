// The pictures: a song's lifeline (every official version, by date and by length, against the album version),
// the band's lineup underneath it on the same years, and the small copy of the lifeline in the song list.
import { LINEUP, ROWS } from './lineup.js';
import { clock, trend, yearOf } from './model.js';
import { plural } from './ui.js';

// The years along the bottom run from just before the first release to the end of the year after the newest one
// (2027 at least), so a release from next year still lands inside. Every chart takes the same end, from endYear.
export const START = 1991.6;
export const endYear = years => Math.max(2027, ...years.map(y => y + 1));

export function sparkline(song, end = 2027) {
  const W = 96, H = 28;
  const timed = song.versions.filter(v => v.secs > 0);
  const max = Math.max(1, song.album?.length || 0, ...timed.map(v => v.secs));
  const x = d => 3 + (yearOf(d) - START) / (end - START) * (W - 6);
  const y = s => H - 3 - (s / max) * (H - 6);
  let out = `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  if (song.album) out += `<line x1="3" x2="${W - 3}" y1="${y(song.album.length).toFixed(1)}" y2="${y(song.album.length).toFixed(1)}"/>`;
  for (const v of timed) out += `<circle cx="${x(v.date).toFixed(1)}" cy="${y(v.secs).toFixed(1)}" r="1.8"/>`;
  return out + '</svg>';
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Returns the SVG and where each dot landed, so the page can find the dot nearest a tap.
export function lifeline(song, { width = 700, selected = null, end = 2027 } = {}) {
  const W = Math.max(300, Math.round(width));
  const narrow = W < 520;
  const L = narrow ? 50 : 56, R = 10, T = 22;
  const plotH = narrow ? 210 : 270;
  const axisH = 22, laneH = 13, laneGap = 4;
  const lanesTop = T + plotH + axisH + 10;
  const H = lanesTop + ROWS.length * (laneH + laneGap) + 2;
  const timed = song.versions.filter(v => v.secs > 0);
  const maxSecs = Math.max(60, song.album?.length || 0, ...timed.map(v => v.secs));
  const maxMin = Math.max(4, Math.ceil(maxSecs / 60 / (maxSecs > 900 ? 5 : 2)) * (maxSecs > 900 ? 5 : 2));
  const step = maxMin > 14 ? 5 : maxMin > 6 ? 2 : 1;
  const x = yr => L + (yr - START) / (end - START) * (W - L - R);
  const y = secs => T + plotH - (secs / 60) / maxMin * plotH;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary(song))}">`;

  // Minutes up the side, years along the bottom.
  svg += `<text x="${L - 6}" y="${T - 10}" text-anchor="end">min</text>`;
  for (let m = 0; m <= maxMin; m += step) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(m * 60)}" y2="${y(m * 60)}"/>`;
    svg += `<text x="${L - 6}" y="${y(m * 60) + 4}" text-anchor="end">${m}</text>`;
  }
  for (let yr = 1995; yr <= end - 2; yr += 5) {
    const label = narrow ? `’${String(yr).slice(2)}` : yr;
    svg += `<line class="grid" x1="${x(yr)}" x2="${x(yr)}" y1="${T + plotH}" y2="${T + plotH + 5}"/>`;
    svg += `<text x="${x(yr)}" y="${T + plotH + 18}" text-anchor="middle">${label}</text>`;
  }

  // The album version, from the year it came out, labelled wherever along it the fewest dots are in the way.
  const dots = timed.map(v => [x(yearOf(v.date)), y(v.secs)]);
  for (const a of song.albums) {
    if (!a.length) continue;
    const x0 = Math.max(L, x(a.album.year + 0.4));
    const yy = y(a.length);
    const main = a === song.album;
    svg += `<line class="album" x1="${x0}" x2="${W - R}" y1="${yy}" y2="${yy}"${main ? '' : ' style="opacity:.35"'}/>`;
    if (!main) continue;
    const text = `${a.album.name} ${clock(a.length)}`;
    const w = text.length * 6.6 + 6;
    const spots = [[W - R - 2, yy - 6, 'end'], [x0 + 2, yy - 6, 'start'], [W - R - 2, yy + 15, 'end'], [x0 + 2, yy + 15, 'start']];
    const hits = ([tx, ty, anchor]) => {
      const left = anchor === 'end' ? tx - w : tx;
      return dots.filter(([dx, dy]) => dx > left - 5 && dx < left + w + 5 && dy > ty - 15 && dy < ty + 5).length;
    };
    const [tx, ty, anchor] = spots.reduce((best, spot) => (hits(spot) < hits(best) ? spot : best));
    svg += `<text class="album-label" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(text)}</text>`;
  }

  for (const run of trend(song.versions)) svg += `<polyline class="trend" points="${run.map(([t, s]) => `${x(t).toFixed(1)},${y(s).toFixed(1)}`).join(' ')}"/>`;

  const points = [];
  const r = narrow ? 3.8 : 4.4;
  for (const v of timed) {
    const px = x(yearOf(v.date)), py = y(v.secs);
    points.push({ x: px, y: py, v });
    svg += `<circle class="dot${v.shared ? ' shared' : ''}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}"/>`;
  }
  if (selected && selected.secs > 0) {
    svg += `<circle class="ring" cx="${x(yearOf(selected.date)).toFixed(1)}" cy="${y(selected.secs).toFixed(1)}" r="${r + 4}"/>`;
  }

  // Who was in the band, on the same years.
  ROWS.forEach((row, i) => {
    const top = lanesTop + i * (laneH + laneGap);
    svg += `<text class="lane-label" x="${L - 6}" y="${top + laneH - 3}" text-anchor="end">${row}</text>`;
    for (const p of LINEUP.filter(p => p.row === row)) {
      const x0 = Math.max(L, x(yearOf(p.from))), x1 = p.to ? x(yearOf(p.to)) : W - R;
      if (x1 <= x0) continue;
      svg += `<rect class="lane" x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0).toFixed(1)}" height="${laneH}" rx="3" style="fill:var(--${row.toLowerCase()})"><title>${esc(p.name)}, ${esc(p.role)}</title></rect>`;
      const label = narrow ? p.short : p.name;
      if ((x1 - x0) > label.length * 5.6 + 8) svg += `<text class="lane-name" x="${(x0 + 5).toFixed(1)}" y="${top + laneH - 3}">${esc(label)}</text>`;
    }
  });
  svg += '</svg>';
  return { svg, points, width: W, height: H };
}

// The chart in words, for screen readers: "Tangerine: 1 official live version from 1992, usually 2:10 long".
function summary(song) {
  const timed = song.versions.filter(v => v.secs > 0);
  if (!timed.length) return `${song.name}: no timed versions`;
  const from = song.first.date.slice(0, 4), to = song.last.date.slice(0, 4);
  return `${song.name}: ${plural(song.count, 'official live version')} from ${from}${to !== from ? ` to ${to}` : ''}`
    + (song.median ? `, usually ${clock(song.median)} long` : '') // no typical length when every version shared a track
    + (song.album?.length ? `, against ${clock(song.album.length)} on ${song.album.album.name}` : '');
}

// How often a song was played, year by year: the share of the band's shows that year (with a setlist in the DMB
// Almanac) that had it. A year with no shows has no column at all; a year it wasn't played, an empty one.
export function playedChart(song, rows, { width = 700 } = {}) {
  const W = Math.max(300, Math.round(width)), narrow = W < 520;
  const L = narrow ? 36 : 42, R = 8, T = 8, plotH = narrow ? 76 : 88;
  const H = T + plotH + 22;
  const band = (W - L - R) / rows.length;
  const y = share => T + plotH - share * plotH;
  const most = rows.reduce((a, r) => (r.sets && (!a || r.plays / r.sets > a.plays / a.sets) ? r : a), null);
  const label = `${song.name}: played at ${plural(song.playCount || 0, 'show')}${most?.plays ? `, most often in ${most.year} (${most.plays} of ${most.sets})` : ''}`;
  let svg = `<svg class="played" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
  for (const p of [0.5, 1]) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p * 100}%</text>`;
  }
  svg += `<line class="base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const x = L + i * band, bw = Math.max(1.5, band * 0.68), bx = x + (band - bw) / 2;
    if (r.year % 5 === 0) svg += `<text x="${x + band / 2}" y="${H - 4}" text-anchor="middle">${narrow ? `’${String(r.year).slice(2)}` : r.year}</text>`;
    if (!r.sets) { svg += `<line class="none" x1="${x + band / 2}" x2="${x + band / 2}" y1="${y(0) - 3}" y2="${y(0) + 3}"><title>${r.year}: no shows</title></line>`; return; }
    const share = r.plays / r.sets;
    svg += `<g class="col"><title>${r.year}: ${r.plays ? `${r.plays} of ${plural(r.sets, 'show')}` : `none of ${plural(r.sets, 'show')}`}</title><rect class="hit" x="${x}" y="${T}" width="${band}" height="${plotH}"/>`
      + (r.plays ? `<rect class="bar" x="${bx.toFixed(1)}" y="${y(share).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, plotH * share).toFixed(1)}" rx="1"/>` : '') + '</g>';
  });
  return svg + '</svg>';
}
