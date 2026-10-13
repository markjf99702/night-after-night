// The pages that step back from one song or one night: Before the album, What leads where, and a page per year.
import { clock, duration, dateText, yearOf } from './model.js';
import { beforeAlbum, yearStats, years, flow, gapText, START, END } from './insights.js';
import { esc, plural, songLink, nightLink, songsNav, nightRow, joinWords, placeText, atPlace } from './ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = d => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
const monthDay = d => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

const cache = new WeakMap();
function get(M, key, make) {
  if (!cache.has(M)) cache.set(M, {});
  const c = cache.get(M);
  return c[key] ??= make(M);
}

// ---------------------------------------------------------------------------------------------------------------
// Before the album

// For the song page: when it was on stage before its album came out.
export function beforeFact(M, s) {
  const B = get(M, 'before', beforeAlbum);
  const row = B.rows.find(r => r.song === s);
  if (!row) return '';
  return `On stage before it was on a record: the earliest released version is from ${nightLink(row.first.night)}, ${gapText(row.days)} before ${esc(row.album.name)} came out. <a href="#/before">More songs that came first</a>.`;
}

export function renderBefore(view, M) {
  const B = get(M, 'before', beforeAlbum);
  const lo = 1991.6, hi = Math.max(...M.albums.map(a => yearOf(a.date))) + 0.5;
  const pct = d => (((yearOf(d) - lo) / (hi - lo)) * 100).toFixed(2);
  const ticks = [];
  for (let y = 1995; y < hi; y += 5) ticks.push(y);
  const grid = ticks.map(y => `<i style="left:${(((y - lo) / (hi - lo)) * 100).toFixed(2)}%"></i>`).join('');
  const L = B.longest;
  view.innerHTML = `<section class="before-page">
    ${songsNav('before')}
    <header class="page-head">
      <h2>Before the album</h2>
      <p class="page-lede">Songs the band was playing live before the album they’re on came out. Each line runs from the earliest official live recording of the song to the day the album was released.</p>
      <p class="headline">${plural(B.rows.length, 'song')} were on stage first. The longest wait was ${songLink(L.song)}: released from ${nightLink(L.first.night, longDate(L.first.date))} ${esc(atPlace(L.first.night))}, then on ${esc(L.album.name)} ${gapText(L.days)} later.</p>
    </header>
    <div class="pipeline">
      <div class="axis" aria-hidden="true">${ticks.map(y => `<span style="left:${(((y - lo) / (hi - lo)) * 100).toFixed(2)}%">${y}</span>`).join('')}</div>
      ${B.albums.map(g => {
        const of = g.album.by ? '' : g.album.songCount ? ` · ${g.rows.length === g.album.songCount ? `all ${g.album.songCount} of its songs` : `${g.rows.length} of its ${g.album.songCount} songs`} ${g.rows.length === 1 ? 'was' : 'were'} on stage first` : '';
        return `<section class="album-run">
          <h3>${esc(g.album.name)}<small>${longDate(g.album.date)}${g.album.by ? `, ${esc(g.album.by)}` : ''}${of}</small></h3>
          <ol class="waits">${g.rows.map(r => `<li><a href="#/song/${r.song.slug}">
            <span class="w-name">${esc(r.song.name)}<small>${dateText(r.first.date)}, ${esc(placeText(r.first.night))}</small></span>
            <span class="w-gap">${gapText(r.days, true)}</span>
            <span class="w-track">${grid}<b class="w-line" style="left:${pct(r.first.date)}%;width:${(pct(g.album.date) - pct(r.first.date)).toFixed(2)}%"></b><b class="w-start" style="left:${pct(r.first.date)}%"></b><b class="w-album" style="left:${pct(g.album.date)}%"></b></span>
          </a></li>`).join('')}</ol>
        </section>`;
      }).join('')}
      <p class="legend"><span><i class="k-start"></i>Earliest released live version</span><span><i class="k-album"></i>The album comes out</span></p>
    </div>
    <section class="never">
      <h3 class="section-title">Never on an album</h3>
      <p class="muted small">Songs the band has released from the stage but never put on one of its studio albums. A few turned up as bonus tracks on special editions.</p>
      <ul class="never-list">${B.never.map(s => `<li><a href="#/song/${s.slug}"><span>${esc(s.name)}</span><small>${plural(s.count, 'version')}, ${s.first.date.slice(0, 4)}${s.last.date.slice(0, 4) !== s.first.date.slice(0, 4) ? `–${s.last.date.slice(0, 4)}` : ''}</small></a></li>`).join('')}</ul>
    </section>
  </section>`;
}

// ---------------------------------------------------------------------------------------------------------------
// What leads where

const nodeLink = n => `#/flow/${n.slug}`;

// The most likely night: from the start, keep taking the song that most often comes next, without repeats.
function likeliest(F) {
  const out = [];
  let at = START;
  const used = new Set();
  while (out.length < 24) {
    const next = F.after(at).find(([s]) => s === END || !used.has(s));
    if (!next || next[0] === END) break;
    at = next[0];
    used.add(at);
    out.push(at);
  }
  return out;
}

export function renderFlow(view, M, slug) {
  const F = get(M, 'flow', flow);
  const center = slug === 'end' ? END : slug === 'start' || !slug ? START : M.bySlug.get(slug) || START;
  const choices = M.songs.filter(s => F.played(s)).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const path = likeliest(F);
  view.innerHTML = `<section class="flow-page">
    ${songsNav('flow')}
    <header class="page-head">
      <h2>What leads where</h2>
      <p class="page-lede">What the band played right before and right after each song, on the ${plural(F.nights, 'night')} released whole. Tap a song to follow the thread through a night.</p>
    </header>
    <div class="flow-pick">
      <label for="flow-song">Follow</label>
      <select id="flow-song">
        <option value="start">The start of the night</option>
        ${choices.map(s => `<option value="${s.slug}">${esc(s.name)}</option>`).join('')}
        <option value="end">The end of the night</option>
      </select>
    </div>
    <figure class="flow" id="flow" aria-live="polite"></figure>
    <div class="cols">
      <section><h3 class="section-title">Pairs the band keeps together</h3>
        <ol class="pairs">${F.pairs.slice(0, 10).map(p => `<li>
          <span class="p-songs"><a href="#/flow/${p.a.slug}">${esc(p.a.name)}</a><span class="arrow">→</span><a href="#/flow/${p.b.slug}">${esc(p.b.name)}</a></span>
          <span class="p-bar"><b style="width:${(p.share * 100).toFixed(1)}%"></b></span>
          <span class="p-note">${p.count} of ${p.of} times${p.segues ? `, ${p.segues === p.count ? 'every one' : p.segues} straight through without a break` : ''}</span>
        </li>`).join('')}</ol>
      </section>
      <section><h3 class="section-title">Runs of three</h3>
        <ol class="runs">${F.runs.slice(0, 8).map(r => `<li><span>${r.songs.map(s => `<a href="#/flow/${s.slug}">${esc(s.name)}</a>`).join('<span class="arrow">→</span>')}</span><small>${plural(r.count, 'night')}</small></li>`).join('')}</ol>
        <h3 class="section-title" style="margin-top:22px">The likeliest night</h3>
        <p class="muted small" style="margin:0 0 8px">Start at the top and keep playing whatever most often came next.</p>
        <ol class="likely">${path.map(s => `<li><a href="#/flow/${s.slug}">${esc(s.name)}</a></li>`).join('')}</ol>
      </section>
    </div>
  </section>`;
  const select = document.getElementById('flow-song');
  select.value = center.slug;
  select.addEventListener('change', () => { location.hash = `#/flow/${select.value}`; });
  drawFlow(M, F, center);
}

let flowResize;
function drawFlow(M, F, center) {
  const box = document.getElementById('flow');
  if (!box) return;
  const before = F.before(center), after = F.after(center);
  const cap = list => {
    const top = list.slice(0, 8);
    const rest = list.slice(8).reduce((a, [, n]) => a + n, 0);
    return rest ? [...top, [{ name: `${list.length - 8} others`, other: true }, rest]] : top;
  };
  const head = `<figcaption class="flow-center"><span class="kicker">${center === START ? 'Openers' : center === END ? 'Closers' : 'Following'}</span>
    <strong>${center.virtual ? esc(center.name) : songLink(center)}</strong>
    <small>${center === START ? `How the ${plural(F.nights, 'night')} began` : center === END ? `How the ${plural(F.nights, 'night')} ended` : `On ${plural(F.nightsWith(center), 'whole night')}`}</small></figcaption>`;
  const wide = box.clientWidth >= 640;
  if (!wide) {
    // Bars are against the most common song. The others, added up, can outnumber it, so they get no bar.
    const list = (rows, dir) => rows.length ? `<ol class="flow-list">${cap(rows).map(([s, n]) => {
      if (s.other) return `<li class="other"><span class="f-name muted">${esc(s.name)}</span><span class="f-n muted">${n}</span></li>`;
      const seg = !s.virtual && !center.virtual ? (dir === 'in' ? F.segues(s, center) : F.segues(center, s)) : 0;
      const max = rows[0][1];
      return `<li><a class="f-name" href="${nodeLink(s)}">${esc(s.name)}</a>
        <span class="f-n">${n}</span><span class="f-bar"><b style="width:${((n / max) * 100).toFixed(1)}%"></b>${seg ? `<b class="seg" style="width:${((seg / max) * 100).toFixed(1)}%"></b>` : ''}</span></li>`;
    }).join('')}</ol>` : '';
    box.innerHTML = `${before.length ? `<h3 class="section-title">Came right before</h3>${list(before, 'in')}<p class="flow-arrow" aria-hidden="true">↓</p>` : ''}
      ${head}
      ${after.length ? `<p class="flow-arrow" aria-hidden="true">↓</p><h3 class="section-title">Came right after</h3>${list(after, 'out')}` : ''}
      ${!center.virtual && (before.length || after.length) ? '<p class="legend"><span><i class="k-seg"></i>Straight through, no break</span></p>' : ''}`;
  } else {
    box.innerHTML = head + sankey(F, center, cap(before), cap(after), box.clientWidth);
  }
  clearTimeout(flowResize);
  addEventListener('resize', function again() {
    clearTimeout(flowResize);
    flowResize = setTimeout(() => { removeEventListener('resize', again); if (document.getElementById('flow') === box) drawFlow(M, F, center); }, 150);
  }, { once: true });
}

// Before on the left, after on the right, each joined to the song in the middle by a band as thick as the
// number of nights.
function sankey(F, center, left, right, width) {
  const W = Math.round(width), colW = Math.min(250, W * 0.3), nodeW = 10, gap = 6, unitMin = 18;
  const sum = rows => rows.reduce((a, [, n]) => a + n, 0);
  const maxSum = Math.max(sum(left), sum(right), 1);
  const scale = Math.min(10, Math.max(2, 360 / maxSum));
  const heights = rows => rows.map(([, n]) => Math.max(unitMin, n * scale));
  const stackH = rows => heights(rows).reduce((a, h) => a + h, 0) + Math.max(0, rows.length - 1) * gap;
  const H = Math.max(stackH(left), stackH(right), 120) + 20;
  const cx = W / 2, cw = 16;
  const centerH = Math.max(sum(left), sum(right)) * scale;
  const cy0 = (H - centerH) / 2;
  let svg = `<svg class="sankey" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`What came before and after ${center.name}`)}">`;
  svg += `<rect class="s-center" x="${cx - cw / 2}" y="${cy0}" width="${cw}" height="${Math.max(centerH, 4)}" rx="3"/>`;
  const side = (rows, isLeft) => {
    const hs = heights(rows);
    let y = (H - stackH(rows)) / 2;
    let cyIn = cy0 + (centerH - sum(rows) * scale) / 2;
    rows.forEach(([s, n], i) => {
      const h = hs[i];
      const thick = n * scale;
      const nx = isLeft ? colW : W - colW - nodeW;
      const ny = y + (h - thick) / 2;
      svg += `<rect class="s-node${s.other ? ' other' : ''}" x="${nx}" y="${ny}" width="${nodeW}" height="${Math.max(thick, 2)}" rx="2"/>`;
      // the band from the node to the middle
      const x1 = isLeft ? nx + nodeW : cx + cw / 2, x2 = isLeft ? cx - cw / 2 : nx;
      const yA = isLeft ? ny : cyIn, yB = isLeft ? cyIn : ny;
      const mid = (x1 + x2) / 2;
      svg += `<path class="s-band${s.other ? ' other' : ''}" d="M${x1},${yA} C${mid},${yA} ${mid},${yB} ${x2},${yB} L${x2},${yB + thick} C${mid},${yB + thick} ${mid},${yA + thick} ${x1},${yA + thick} Z"/>`;
      const tx = isLeft ? nx - 8 : nx + nodeW + 8;
      const label = `${esc(s.name)} <tspan class="s-n">${n}</tspan>`;
      const text = `<text x="${tx}" y="${y + h / 2 + 4}" text-anchor="${isLeft ? 'end' : 'start'}">${label}</text>`;
      svg += s.other ? text.replace('<text ', '<text class="other" ') : `<a href="${nodeLink(s)}">${text}</a>`;
      y += h + gap;
      cyIn += thick;
    });
  };
  side(left, true);
  side(right, false);
  if (!left.length) svg += `<text class="s-empty" x="${colW}" y="${H / 2}" text-anchor="end">Nothing before it</text>`;
  if (!right.length) svg += `<text class="s-empty" x="${W - colW}" y="${H / 2}">Nothing after it</text>`;
  return svg + '</svg>';
}

// ---------------------------------------------------------------------------------------------------------------
// The years

// One column per year: how many nights were released from it, and how long a whole night ran.
export function yearsChart(M, width) {
  const Y = get(M, 'years', years);
  const W = Math.max(300, Math.round(width)), L = 44, R = 6;
  const T = 20, topH = 108, gapH = 26, lowH = 62, axisH = 18;
  const H = topH + gapH + lowH + axisH + 4;
  const band = (W - L - R) / Y.length;
  const maxN = Math.max(...Y.map(y => y.full + y.bits), 1);
  const lens = Y.filter(y => y.length).map(y => y.length);
  const lo = Math.min(90 * 60, ...lens), hi = Math.max(200 * 60, ...lens);
  const yLen = s => topH + gapH + lowH - ((s - lo) / (hi - lo)) * lowH;
  let svg = `<svg class="years-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Nights released from each year, ${Y[0].year} to ${Y.at(-1).year}, and how long a whole night ran">`;
  svg += `<text class="y-label" x="0" y="12">Nights released</text>`;
  for (const n of [0, Math.round(maxN / 2), maxN]) {
    const yy = topH - (n / maxN) * (topH - T);
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${n}</text>`;
  }
  svg += `<text class="y-label" x="0" y="${topH + gapH - 6}">A whole night</text>`;
  for (const m of [120, 180]) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yLen(m * 60)}" y2="${yLen(m * 60)}"/><text x="${L - 6}" y="${yLen(m * 60) + 4}" text-anchor="end">${m / 60} hr</text>`;
  const pts = [];
  Y.forEach((y, i) => {
    const x = L + i * band;
    const bw = Math.max(2, band * 0.66);
    const bx = x + (band - bw) / 2;
    const fullH = (y.full / maxN) * (topH - T), bitsH = (y.bits / maxN) * (topH - T);
    let col = '';
    if (y.full) col += `<rect class="y-full" x="${bx}" y="${topH - fullH}" width="${bw}" height="${fullH}" rx="1.5"/>`;
    if (y.bits) col += `<rect class="y-bits" x="${bx}" y="${topH - fullH - bitsH}" width="${bw}" height="${bitsH}" rx="1.5"/>`;
    if (y.length) { pts.push([x + band / 2, yLen(y.length)]); col += `<circle class="y-len" cx="${x + band / 2}" cy="${yLen(y.length)}" r="${Math.min(4, band / 3)}"/>`; }
    if (y.year % 5 === 0) col += `<text x="${x + band / 2}" y="${H - 4}" text-anchor="middle">${W < 520 ? `’${String(y.year).slice(2)}` : y.year}</text>`;
    const has = y.full || y.bits;
    const tip = `${y.year}: ${has ? `${plural(y.full + y.bits, 'night')} released${y.length ? `, a whole night about ${duration(y.length)}` : ''}` : 'nothing released'}`;
    svg += has ? `<a href="#/year/${y.year}" class="y-col"><title>${tip}</title><rect class="hit" x="${x}" y="0" width="${band}" height="${H - axisH}"/>${col}</a>` : `<g class="y-col none"><title>${tip}</title>${col}</g>`;
  });
  return svg + '</svg>';
}

export function renderYear(view, M, year) {
  year = +year;
  if (!M.years.includes(year)) { view.innerHTML = `<p class="empty-note">No official releases from that year. <a href="#/nights">All the nights</a></p>`; return; }
  const Y = yearStats(M, year);
  const i = M.years.indexOf(year);
  const prevY = M.years[i - 1], nextY = M.years[i + 1];
  const B = get(M, 'before', beforeAlbum);
  const waiting = new Map(B.rows.map(r => [r.song, r]));
  const bars = (rows, of) => `<ol class="bars">${rows.map(([s, n]) => `<li><a href="#/song/${s.slug}">${esc(s.name)}</a><span class="b-n">${n}</span><span class="b-bar"><b style="width:${((n / of) * 100).toFixed(1)}%"></b></span></li>`).join('')}</ol>`;
  const band = Y.band.map(p => p.name);
  view.innerHTML = `<article class="year-page">
    <nav class="year-nav" aria-label="Years"><a class="back" href="#/nights">← Nights</a>
      <span>${prevY ? `<a href="#/year/${prevY}">‹ ${prevY}</a>` : ''}${nextY ? `<a href="#/year/${nextY}">${nextY} ›</a>` : ''}</span></nav>
    <header class="year-head">
      <h2>${year}</h2>
      <p class="headline">${plural(Y.nights.length, 'night')} released${Y.whole.length ? `, ${Y.whole.length === Y.nights.length ? 'all' : Y.whole.length} of them whole` : ''}.${Y.length ? ` A whole night ran about ${duration(Y.length)}, ${Math.round(Y.songs)} songs.` : ''}</p>
      ${Y.albums.length ? `<p>${joinWords(Y.albums.map(a => `<b>${esc(a.name)}</b>`))} came out on ${joinWords(Y.albums.map(a => monthDay(a.date)))}.</p>` : ''}
      <p class="band">On stage: ${esc(joinWords(band))}.</p>
      ${Y.changes.length ? `<ul class="changes">${Y.changes.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
    </header>
    <div class="cols">
      <section><h3 class="section-title">Played on the most nights</h3>${bars(Y.most.slice(0, 10), Y.nights.length)}
        <p class="muted small">Out of the ${plural(Y.nights.length, 'night')} released from ${year}.</p></section>
      ${Y.whole.length ? `<section><h3 class="section-title">How the nights began</h3>${bars(Y.openers.slice(0, 5), Y.whole.length)}
        <h3 class="section-title" style="margin-top:18px">How they ended</h3>${bars(Y.closers.slice(0, 5), Y.whole.length)}
        <p class="muted small">On the ${plural(Y.whole.length, 'night')} released whole.</p></section>` : ''}
      ${Y.firsts.length ? `<section><h3 class="section-title">First released from the stage</h3>
        <p class="muted small" style="margin:0 0 8px">Songs whose earliest official live recording is from ${year}.</p>
        <ul class="firsts">${Y.firsts.map(s => {
          const w = waiting.get(s);
          return `<li><a href="#/song/${s.slug}">${esc(s.name)}</a><small>${dateText(s.first.date, 'year')}${w ? ` · ${gapText(w.days)} before ${esc(w.album.name)}` : s.cover ? ' · a cover' : ''}</small></li>`;
        }).join('')}</ul></section>` : ''}
      <section><h3 class="section-title">The longest</h3>
        <ol class="longest">${Y.longest.map(v => `<li><a href="#/song/${v.song.slug}/${v.date}">${esc(v.song.name)}</a><span class="num">${clock(v.secs)}</span><small>${dateText(v.date, 'year')}, ${esc(placeText(v.night))}</small></li>`).join('')}</ol></section>
    </div>
    <section class="year-nights"><h3 class="section-title">The nights</h3>
      <ul class="night-list">${Y.nights.filter(n => n.songCount >= 5).map(nightRow).join('')}</ul>
      ${Y.nights.some(n => n.songCount < 5) ? `<p class="bits">Also: ${Y.nights.filter(n => n.songCount < 5).map(n => `${nightLink(n, dateText(n.date, 'year'))} (${n.tracks.filter(t => t.songs).flatMap(t => t.songs).map(s => esc(s.name)).join(', ')})`).join('; ')}.</p>` : ''}
    </section>
  </article>`;
}
