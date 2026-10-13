import DATA from './data.js';
import { build, clock, duration, dateText, story } from './model.js';
import { buildShow, encode, decode, encoreSize, pool, PICKS, JAMS } from './builder.js';
import { lifeline, sparkline } from './chart.js';
import { bandOn } from './lineup.js';
import { esc, plural, venueLine, songLink, nightLink, songsNav, nightRow, atPlace, placeText } from './ui.js';
import { renderBefore, renderFlow, renderYear, yearsChart, beforeFact } from './insight-pages.js';

const M = build(DATA);
const SITE = 'https://night-after-night.junkdrawer.works/';
const view = document.getElementById('view');
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');

// localStorage can be missing or refuse (private windows, the Artifact viewer), so every use is wrapped.
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('night-after-night.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) { // true if it was saved
    try { localStorage.setItem('night-after-night.' + key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

const first = M.nights[0].date.slice(0, 4), last = M.nights.at(-1).date.slice(0, 4);
document.getElementById('span-years').textContent = `${first} to ${last}`;
document.getElementById('count').textContent =
  `${plural(M.versions.length, 'version')} of ${plural(M.songs.length, 'song')} from ${plural(M.nights.length, 'night')} on ${plural(new Set(M.nights.map(n => n.release)).size, 'official release')}.`;

// ---------------------------------------------------------------------------------------------------------------
// Little pieces used on every page

const trackTitle = t => t.songs.map(s => esc(s.name)).join('<span class="arrow"> &gt; </span>');

function where(t) {
  const r = t.release;
  const pos = t.disc && t.track ? (r.title === t.night.release.title && t.night.tracks.some(x => x.disc > 1) ? `, disc ${t.disc} track ${t.track}` : `, track ${t.track}`) : '';
  return `${esc(r.label)}${pos}`;
}

function listen(t) {
  const q = `Dave Matthews Band ${t.songs.map(s => s.name).join(' ')} ${t.release.query || 'live'}`.replace(/\s+/g, ' ').trim();
  return `<a href="https://open.spotify.com/search/${encodeURIComponent(q)}" target="_blank" rel="noopener">Spotify</a>`
    + `<a href="https://music.apple.com/us/search?term=${encodeURIComponent(q)}" target="_blank" rel="noopener">Apple Music</a>`
    + `<a href="https://musicbrainz.org/release-group/${t.release.mb}" target="_blank" rel="noopener">The release</a>`;
}

// "with LeRoi Moore and Boyd Tinsley": who was on stage besides Dave, Carter and Stefan.
function bandWith(date) {
  const extra = bandOn(date).filter(p => !['Dave Matthews', 'Carter Beauford', 'Stefan Lessard'].includes(p.name));
  if (!extra.length) return '';
  const names = extra.map(p => `${p.name} on ${p.role}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

function inNight(t) {
  const bits = [];
  if (t.prev) bits.push(`after ${t.prev.songs.map(songLink).join(' &gt; ')}`);
  if (t.next) bits.push(`before ${t.next.songs.map(songLink).join(' &gt; ')}`);
  return bits.join(', ');
}

function extras(t) {
  const out = [];
  if (t.bits.length) out.push(`with a bit of ${t.bits.map(esc).join(', ')}`);
  if (t.withs.length) out.push(`with ${t.withs.map(esc).join(', ')}`);
  return out.join('; ');
}

// Scrolls glide, unless the phone or computer is set to cut down on motion.
const glide = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    // Some frames refuse the clipboard: show the text so it can be copied by hand.
    openSheet(`<button class="close" data-close aria-label="Close">×</button><h2 id="sheet-title">Copy this</h2>
      <p class="muted small">Your browser wouldn’t let the page copy it. Select it and copy.</p>
      <textarea readonly rows="12" style="width:100%;font:14px/1.45 Archivo,sans-serif;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg-2);color:var(--ink)">${esc(text)}</textarea>`);
    sheetBody.querySelector('textarea').select();
  }
}

function openSheet(html) {
  sheetBody.innerHTML = html;
  if (!sheet.open) {
    if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
  }
}
function closeSheet() { if (sheet.open) { if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open'); } }
sheet.addEventListener('click', e => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

// ---------------------------------------------------------------------------------------------------------------
// Build a show

const TIMES = [[30, '30 min'], [60, '1 hour'], [90, '90 min'], [120, '2 hours'], [165, 'A whole show']];
const WHEN = {
  any: ['Any year', '0000', '9999'],
  '90s': ['The ’90s', '1991-01-01', '1999-12-31'],
  '00s': ['2000s', '2000-01-01', '2009-12-31'],
  '10s': ['2010s', '2010-01-01', '2019-12-31'],
  '20s': ['2020s', '2020-01-01', '2029-12-31'],
  leroi: ['With LeRoi', '0000', '2008-06-28'],
  pick: ['Pick years', null, null],
};
const venueChoices = M.venues.filter(v => v.nights.filter(n => n.songCount >= 5).length >= 2)
  .sort((a, b) => b.nights.length - a.nights.length || a.name.localeCompare(b.name));
// Venues are kept by name and town, which stay put when the data is rebuilt; their place in the list may not.
const venueKey = v => `${v.name}|${v.town}`;
const venueByKey = new Map(M.venues.map(v => [venueKey(v), v]));

// "From when?" and "Where?" take any number of choices: a night in any of them counts.
const DEFAULTS = { minutes: 90, when: ['any'], from: +first, to: +last, venues: [], picks: 'mix', jams: 'any', covers: true };
let opts = readOptions();
let show = null;
let showMinutes = opts.minutes;

// The saved choices, including ones saved when each of those took a single choice. Anything that isn't one of the
// choices on the page goes back to the usual one.
function own(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
function readOptions() {
  const saved = store.get('options', {});
  const o = { ...DEFAULTS, ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) };
  o.when = [].concat(o.when).filter(k => k !== 'any' && own(WHEN, k));
  if (!o.when.length) o.when = ['any'];
  if ('venue' in o) {
    const v = o.venue === '' ? null : M.venues[+o.venue];
    o.venues = v ? [venueKey(v)] : [];
    delete o.venue;
  }
  o.venues = [].concat(o.venues).filter(k => venueByKey.has(k));
  const minutes = Math.round(o.minutes);
  o.minutes = minutes >= 15 && minutes <= 240 ? minutes : DEFAULTS.minutes;
  o.from = M.years.includes(+o.from) ? +o.from : DEFAULTS.from;
  o.to = M.years.includes(+o.to) ? +o.to : DEFAULTS.to;
  if (!own(PICKS, o.picks)) o.picks = DEFAULTS.picks;
  if (!own(JAMS, o.jams)) o.jams = DEFAULTS.jams;
  if (typeof o.covers !== 'boolean') o.covers = DEFAULTS.covers;
  return o;
}

// Tapping a choice turns it on or off. The "any" choice clears the rest, and comes back when nothing else is on.
function toggle(list, v, any) {
  if (v === any) return [any];
  const on = list.filter(x => x !== any);
  const next = on.includes(v) ? on.filter(x => x !== v) : [...on, v];
  return next.length ? next : [any];
}

function ranges() {
  return opts.when.filter(k => k !== 'any').map(k => (k === 'pick'
    ? [`${Math.min(opts.from, opts.to)}-01-01`, `${Math.max(opts.from, opts.to)}-12-31`]
    : WHEN[k].slice(1)));
}
function builderOptions() {
  return {
    minutes: opts.minutes, ranges: ranges(), venues: opts.venues.map(k => venueByKey.get(k).id),
    picks: opts.picks, jams: opts.jams, covers: opts.covers,
  };
}

function writeShow(animate = true) {
  showMinutes = opts.minutes;
  show = buildShow(M, builderOptions());
  renderPaper(animate);
  history.replaceState(null, '', '#/');
}

function renderBuilder(shared) {
  const yearsOpts = M.years.map(y => `<option value="${y}">${y}</option>`).join('');
  view.innerHTML = `
    <section class="builder">
      <form class="order" id="order" onsubmit="return false">
        <h2>Build a show</h2>
        <p class="hint">Pick how long you’ve got. It writes a setlist from the band’s official live recordings, each song from a real night, landing on your time.</p>
        <fieldset class="field f-time"><legend>How long have you got?</legend>
          <div class="chips" data-opt="minutes">${TIMES.map(([m, t]) => `<button type="button" class="chip" data-v="${m}">${t}</button>`).join('')}</div>
          <div class="row" style="margin-top:8px">
            <span class="stepper"><button type="button" data-step="-5" aria-label="5 minutes less">−</button><output id="mins" aria-live="polite"></output><button type="button" data-step="5" aria-label="5 minutes more">+</button></span>
            <span class="muted small">to the minute, if you like</span>
          </div>
        </fieldset>
        <h3 class="section-title f-more more-title">Change what it picks from</h3>
        <fieldset class="field f-more"><legend>From when? <span class="also">As many as you like.</span></legend>
          <div class="chips" data-opt="when">${Object.entries(WHEN).map(([k, [t]]) => `<button type="button" class="chip" data-v="${k}">${t}</button>`).join('')}</div>
          <div class="years" id="years" hidden>
            <select id="from" aria-label="From">${yearsOpts}</select><span class="muted">to</span><select id="to" aria-label="To">${yearsOpts}</select>
          </div>
        </fieldset>
        <fieldset class="field f-more"><legend>Where? <span class="also">As many as you like.</span></legend>
          <div class="chips" data-opt="venues" id="where"></div>
          <select id="venue" aria-label="Add a venue" style="width:100%;margin-top:8px">
            <option value="">Add a venue</option>
            ${venueChoices.map(v => `<option value="${esc(venueKey(v))}">${esc(v.name)}${v.town ? `, ${esc(v.town)}` : ''} (${v.nights.length})</option>`).join('')}
          </select>
        </fieldset>
        <fieldset class="field f-more"><legend>Which songs?</legend>
          <div class="chips" data-opt="picks">${Object.entries(PICKS).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${t}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="field f-more"><legend>Jams</legend>
          <div class="chips" data-opt="jams">${Object.entries(JAMS).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${t}</button>`).join('')}</div>
        </fieldset>
        <label class="check field f-more"><input type="checkbox" id="covers"> Covers too</label>
        <button type="button" class="btn primary go" id="again">Write another</button>
      </form>
      <div class="stage">
        <div class="paper-wrap"><article class="paper" id="paper" aria-live="polite"></article></div>
        <div class="actions">
          <button type="button" class="btn primary again-phone" id="again2">Write another</button>
          <button type="button" class="btn" id="copy"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>Copy the list</button>
          <button type="button" class="btn" id="share"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 7l4-4 4 4M4 12v4h12v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Share</button>
          <button type="button" class="btn" id="save"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h10v14l-5-3.5L5 17z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Keep it</button>
        </div>
        <section class="saved" id="saved"></section>
      </div>
    </section>`;

  const form = document.getElementById('order');
  form.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const key = chip.parentElement.dataset.opt, v = chip.dataset.v;
      if (key === 'when') opts.when = toggle(opts.when, v, 'any');
      else if (key === 'venues') opts.venues = v ? opts.venues.filter(k => k !== v) : []; // a venue's chip takes it off
      else opts[key] = key === 'minutes' ? +v : v;
      changed();
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      opts.minutes = Math.min(240, Math.max(15, Math.round((opts.minutes + +step.dataset.step) / 5) * 5));
      changed();
    }
  });
  document.getElementById('from').addEventListener('change', e => { opts.from = +e.target.value; changed(); });
  document.getElementById('to').addEventListener('change', e => { opts.to = +e.target.value; changed(); });
  document.getElementById('venue').addEventListener('change', e => {
    if (e.target.value && !opts.venues.includes(e.target.value)) opts.venues = [...opts.venues, e.target.value];
    changed();
  });
  document.getElementById('covers').addEventListener('change', e => { opts.covers = e.target.checked; changed(); });
  document.getElementById('again').addEventListener('click', () => writeShow());
  document.getElementById('again2').addEventListener('click', () => writeShow());
  document.getElementById('copy').addEventListener('click', () => show?.slots.length && copy(showText(), 'Copied the setlist.'));
  document.getElementById('share').addEventListener('click', shareShow);
  document.getElementById('save').addEventListener('click', keepShow);
  document.getElementById('paper').addEventListener('click', e => {
    const item = e.target.closest('[data-i]');
    if (item) openSlot(+item.dataset.i);
  });
  reflectOptions();
  renderSaved();
  if (shared) { show = shared; showMinutes = shared.minutes; renderPaper(true); }
  else if (show) renderPaper(false);
  else writeShow();
}

function changed() {
  store.set('options', opts);
  reflectOptions();
  writeShow();
  // On a phone the choices sit under the setlist, so bring the new one into view.
  const paper = document.getElementById('paper');
  const top = paper?.getBoundingClientRect().top;
  if (paper && matchMedia('(max-width: 860px)').matches && (top < 40 || top > innerHeight * 0.75)) {
    document.querySelector('.paper-wrap').scrollIntoView({ behavior: glide(), block: 'start' });
  }
}

function reflectOptions() {
  // The chosen venues are chips of their own, after "Anywhere"; tapping one takes it off.
  document.getElementById('where').innerHTML = `<button type="button" class="chip" data-v="">Anywhere</button>${opts.venues.map(k => {
    const v = venueByKey.get(k);
    return `<button type="button" class="chip" data-v="${esc(k)}" aria-label="${esc(`${v.name}: take it off`)}">${esc(v.name)}<span class="x" aria-hidden="true">×</span></button>`;
  }).join('')}`;
  for (const group of document.querySelectorAll('#order .chips')) {
    const on = group.dataset.opt === 'venues' ? (opts.venues.length ? opts.venues : ['']) : [].concat(opts[group.dataset.opt]).map(String);
    for (const chip of group.children) chip.setAttribute('aria-pressed', String(on.includes(chip.dataset.v)));
  }
  document.getElementById('mins').textContent = clock(opts.minutes * 60).replace(/:00$/, '') + (opts.minutes < 60 ? ' min' : '');
  document.getElementById('years').hidden = !opts.when.includes('pick');
  document.getElementById('from').value = opts.from;
  document.getElementById('to').value = opts.to;
  const add = document.getElementById('venue');
  add.value = '';
  add.options[0].textContent = opts.venues.length ? 'Add another venue' : 'Add a venue';
  for (const o of add.options) if (o.value) o.disabled = opts.venues.includes(o.value);
  document.getElementById('covers').checked = opts.covers;
}

function renderPaper(animate) {
  const paper = document.getElementById('paper');
  if (!paper) return;
  paper.classList.toggle('writing', !!animate);
  paper.classList.toggle('empty', !show?.slots.length);
  if (!show?.slots.length) {
    paper.innerHTML = `<span class="tape l"></span><span class="tape r"></span>
      <p class="hand" style="font-size:22px;margin:0 0 8px">Nothing to play</p>
      <p class="muted small" style="color:var(--paper-meta)">No official recordings fit all of that. Try another venue or more years.</p>`;
    return;
  }
  const enc = encoreSize(show.slots);
  const nights = new Set(show.slots.map(s => s.item.night));
  const years = show.slots.map(s => s.item.night.year);
  const lo = Math.min(...years), hi = Math.max(...years);
  const songCount = show.slots.reduce((n, s) => n + s.item.songs.length, 0);
  const target = showMinutes * 60;
  const off = show.total - target;
  paper.innerHTML = `<span class="tape l"></span><span class="tape r"></span>
    <div class="paper-head"><span class="hand">Night After Night</span><span class="hand num">${clock(target)}</span></div>
    <ol class="set">
      ${show.slots.map((s, i) => `${i === show.slots.length - enc ? '<li class="encore-mark">Encore</li>' : ''}
        <li style="animation-delay:${Math.min(i * 55, 1400)}ms"><button type="button" class="item" data-i="${i}">
          <span class="title">${trackTitle(s.item)}</span>
          <span class="meta"><b>${clock(s.item.secs)}</b> · ${dateText(s.item.night.date)} · ${esc(venueLine(s.item.night))}</span>
        </button></li>`).join('')}
    </ol>
    <div class="paper-foot">
      <span class="total num">${clock(show.total)}</span>
      <span class="about">${plural(songCount, 'song')} from ${plural(nights.size, 'night')}, ${lo === hi ? lo : `${lo} to ${hi}`}. ${Math.abs(off) <= 60 ? (off === 0 ? 'Right on time.' : `${plural(Math.abs(off), 'second')} ${off > 0 ? 'over' : 'under'}.`) : `${clock(Math.abs(off))} ${off > 0 ? 'over' : 'under'} what you asked for.`}</span>
    </div>`;
}

function showText() {
  const enc = encoreSize(show.slots);
  const lines = [`Night After Night, ${clock(show.total)}`];
  show.slots.forEach((s, i) => {
    if (i === show.slots.length - enc) lines.push('Encore:');
    lines.push(`${i + 1}. ${s.item.songs.map(x => x.name).join(' > ')} (${clock(s.item.secs)}): ${dateText(s.item.night.date)}, ${venueLine(s.item.night)}. ${s.item.parts[0].release.label}`);
  });
  lines.push('', shareUrl());
  return lines.join('\n');
}

const shareUrl = () => `${SITE}#/show/${showMinutes}/${encode(show)}`;

async function shareShow() {
  if (!show?.slots.length) return;
  const url = shareUrl();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Night After Night', text: `A ${duration(show.total)} Dave Matthews Band show from the official recordings`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copy(url, 'Copied a link to this show.');
}

// The kept shows as stored. Each is { name, minutes, code, at }; anything else in the list is left where it is but
// not shown, so Remove takes out the one it's next to.
function keptList() {
  const list = store.get('saved', []);
  return Array.isArray(list) ? list : [];
}
const isKept = s => typeof s?.code === 'string' && Number.isFinite(s.minutes);

function keepShow() {
  if (!show?.slots.length) return;
  const saved = keptList();
  const name = `${duration(show.total)}: ${show.slots[0].item.songs[0].name} to ${show.slots.at(-1).item.songs.at(-1).name}`;
  saved.unshift({ name, minutes: showMinutes, code: encode(show), at: new Date().toISOString().slice(0, 10) });
  if (!store.set('saved', saved.slice(0, 30))) { toast('Your browser wouldn’t let the page keep it.'); return; }
  renderSaved();
  toast('Kept. It’s under Kept shows.');
}

function renderSaved() {
  const el = document.getElementById('saved');
  if (!el) return;
  const saved = keptList().map((s, i) => [s, i]).filter(([s]) => isKept(s));
  el.hidden = !saved.length;
  el.innerHTML = saved.length ? `<h3 class="section-title">Kept shows</h3><ul>${saved.map(([s, i]) => `
    <li><a href="#/show/${s.minutes}/${esc(s.code)}">${esc(s.name)}</a><button type="button" class="del" data-del="${i}">Remove</button></li>`).join('')}</ul>` : '';
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const list = keptList();
    list.splice(+b.dataset.del, 1);
    store.set('saved', list);
    renderSaved();
  }));
}

// One line of the setlist: its version, the others to swap in, a different song, or out.
function openSlot(i) {
  const slot = show.slots[i];
  const t = slot.item.parts.at(-1);
  const items = pool(M, builderOptions()).filter(it => it.songs.includes(slot.anchor));
  const inShow = new Set(show.slots.filter(s => s !== slot).flatMap(s => s.item.songs));
  const options = items.filter(it => it.songs.every(s => !inShow.has(s)));
  const night = slot.item.night;
  openSheet(`<button class="close" data-close aria-label="Close">×</button>
    <p class="when">${esc(dateText(night.date, 'long'))}</p>
    <h2 id="sheet-title">${slot.item.songs.map(s => esc(s.name)).join(' &gt; ')}</h2>
    <p style="margin:6px 0 0">${esc(venueLine(night))}. <b class="num">${clock(slot.item.secs)}</b>${slot.anchor.album ? ` <span class="muted">(${clock(slot.anchor.album.length)} on ${esc(slot.anchor.album.album.name)})</span>` : ''}.</p>
    <p class="muted small" style="margin:4px 0 0">On ${where(slot.item.parts[0])}.${extras(t) ? ` ${esc(extras(t)).replace(/^w/, 'W')}.` : ''}</p>
    <div class="picked" style="margin-top:10px;padding:10px 12px"><div class="links" style="margin:0">${listen(slot.item.parts[0])}<a href="#/night/${night.date}">The whole night</a><a href="#/song/${slot.anchor.slug}">Every ${esc(slot.anchor.name)}</a></div></div>
    <h3 class="section-title" style="margin:16px 0 4px">Swap in another version (${options.length})</h3>
    <ul class="others">${options.map((it, k) => `<li><button type="button" data-k="${k}"${it.night === night ? ' aria-current="true"' : ''}>
      <span class="num">${dateText(it.night.date)}</span><span>${esc(venueLine(it.night))}</span><span class="l num">${clock(it.secs)}</span></button></li>`).join('')}</ul>
    <div class="row-actions">
      <button type="button" class="btn" id="other-song">A different song</button>
      <button type="button" class="btn" id="drop">Take it out</button>
    </div>`);
  sheetBody.querySelector('.others [aria-current]')?.scrollIntoView({ block: 'nearest' });
  sheetBody.querySelectorAll('.others button').forEach(b => b.addEventListener('click', () => {
    slot.item = options[+b.dataset.k];
    afterEdit(i);
  }));
  sheetBody.querySelector('#drop').addEventListener('click', () => {
    show.slots.splice(i, 1);
    afterEdit(i);
  });
  sheetBody.querySelector('#other-song').addEventListener('click', () => {
    const all = pool(M, builderOptions()).filter(it => it.songs.every(s => !inShow.has(s) && !slot.item.songs.includes(s)) && it.secs >= 120);
    if (!all.length) { toast('No other songs fit those choices.'); return; }
    // Something about as long, so the total stays close.
    const near = all.filter(it => Math.abs(it.secs - slot.item.secs) <= Math.max(60, slot.item.secs * 0.2));
    const list = near.length ? near : all;
    const it = list[Math.floor(Math.random() * list.length)];
    slot.item = it;
    slot.anchor = it.songs[0];
    afterEdit(i);
  });
}

function afterEdit(i) {
  show.total = show.slots.reduce((a, s) => a + s.item.secs, 0);
  closeSheet();
  renderPaper(false);
  // The setlist is drawn afresh, so put the keyboard back on the song that changed (or the one after a song taken
  // out), not at the top of the page.
  const items = document.querySelectorAll('#paper .item'), paper = document.getElementById('paper');
  if (items.length) items[Math.min(i, items.length - 1)].focus({ preventScroll: true });
  else if (paper) { paper.tabIndex = -1; paper.focus({ preventScroll: true }); }
  // A show opened from a link or Kept shows keeps its changes in the link, so coming Back to it brings them back.
  if (location.hash.startsWith('#/show/')) history.replaceState(history.state, '', `#/show/${showMinutes}/${encode(show)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Songs

const SORTS = {
  versions: ['Most versions', (a, b) => b.count - a.count || a.name.localeCompare(b.name)],
  az: ['A to Z', (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })],
  long: ['Longest on stage', (a, b) => b.median - a.median],
  grew: ['Grew the most', (a, b) => (b.stretch || 0) - (a.stretch || 0)],
  first: ['First released from the stage', (a, b) => a.first.date.localeCompare(b.first.date)],
};
let songState = { q: '', sort: 'versions', album: 'all' };
// Found however it's spelled: "cornbread" finds Corn Bread, "rhyme and reason" Rhyme & Reason, "dont" Don’t.
const searchKey = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9#]/g, '');

function renderSongs() {
  const albums = M.albums.map(a => `<option value="${a.id}">${esc(a.name)} (${a.year})</option>`).join('');
  view.innerHTML = `<section class="songs">
    ${songsNav('songs')}
    <div class="list-tools">
      <input type="search" id="q" placeholder="Find a song" aria-label="Find a song" autocomplete="off">
      <select id="sort" aria-label="Order">${Object.entries(SORTS).map(([k, [t]]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <select id="album" aria-label="Album"><option value="all">Every song</option>${albums}<option value="none">Never on a studio album</option><option value="covers">Covers</option></select>
    </div>
    <ul class="song-list" id="songs"></ul>
  </section>`;
  const q = document.getElementById('q'), sort = document.getElementById('sort'), album = document.getElementById('album');
  q.value = songState.q; sort.value = songState.sort; album.value = songState.album;
  const draw = () => {
    songState = { q: q.value, sort: sort.value, album: album.value };
    const needle = searchKey(q.value);
    let list = M.songs.filter(s => !needle || searchKey(s.name).includes(needle));
    if (album.value === 'none') list = list.filter(s => !s.albums.length && !s.cover);
    else if (album.value === 'covers') list = list.filter(s => s.cover);
    else if (album.value !== 'all') list = list.filter(s => s.albums.some(a => a.album.id === +album.value));
    if (sort.value === 'grew') list = list.filter(s => s.stretch && s.count >= 3);
    list.sort(SORTS[sort.value][1]);
    document.getElementById('songs').innerHTML = list.length ? list.map(s => {
      const sub = [plural(s.count, 'version'), s.first.date.slice(0, 4) === s.last.date.slice(0, 4) ? s.first.date.slice(0, 4) : `${s.first.date.slice(0, 4)}–${s.last.date.slice(0, 4)}`,
        s.cover ? 'cover' : s.album ? esc(s.album.album.name) : ''].filter(Boolean).join(' · ');
      const right = sort.value === 'grew' && s.stretch ? `${s.stretch.toFixed(1)}×<small>the album</small>` : s.median ? `${clock(s.median)}<small>usually</small>` : '';
      return `<li><a href="#/song/${s.slug}"><span><span class="name">${esc(s.name)}</span><span class="sub">${sub}</span></span>${sparkline(s)}<span class="med">${right}</span></a></li>`;
    }).join('') : '<li class="empty-note">No songs match.</li>';
  };
  q.addEventListener('input', draw);
  sort.addEventListener('change', draw);
  album.addEventListener('change', draw);
  draw();
}

// ---------------------------------------------------------------------------------------------------------------
// One song

let chartState = null;

function renderSong(slug, date) {
  const s = M.bySlug.get(slug);
  if (!s) { view.innerHTML = '<p class="empty-note">There’s no song by that name here. <a href="#/songs">All the songs</a></p>'; return; }
  const timed = s.versions.filter(v => v.secs > 0);
  const selected = (date && s.versions.find(v => v.date === date)) || s.longest || s.versions.at(-1);
  const from = s.cover ? `A cover${s.cover.length ? `, written by ${esc(joinNames(s.cover))}` : ''}.`
    : s.album ? `On ${esc(s.album.album.name)} (${s.album.album.year})${s.album.album.by ? `, ${esc(s.album.album.by)}’s solo album` : ''}, where it runs ${clock(s.album.length)}.${s.albums.length > 1 ? ` Also on ${s.albums.filter(a => a !== s.album).map(a => `${esc(a.album.name)} (${a.album.year}, ${clock(a.length)})`).join(', ')}.` : ''}`
      : 'Never on a studio album.';
  view.innerHTML = `<article class="song">
    <a class="back" href="#/songs">← Songs</a>
    <header class="song-head"><h2>${esc(s.name)}</h2><p class="from">${from}</p></header>
    <p class="headline">${headline(s)}</p>
    <figure class="life">
      <div class="chart-box" id="chart-box"></div>
      <figcaption class="legend">
        <span><i></i>A released version</span>${timed.some(v => v.shared) ? '<span><i class="hollow"></i>Shared a track with another song</span>' : ''}
        ${s.album ? '<span><i class="line"></i>The album version</span>' : ''}${timed.length >= 6 ? '<span><i class="trend"></i>Typical length at the time</span>' : ''}
      </figcaption>
    </figure>
    <div class="picked" id="picked"></div>
    <div class="cols">
      <section class="eras"><h3 class="section-title">How long, band by band</h3>${eras(s)}</section>
      <section><h3 class="section-title">In the show</h3><ul class="facts">${facts(s)}</ul></section>
    </div>
    <section class="versions">
      <div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 class="section-title" style="margin:0">Every version (${s.count})</h3>
        <span class="chips" id="vsort"><button type="button" class="chip" data-v="date" aria-pressed="true">By date</button><button type="button" class="chip" data-v="long" aria-pressed="false">Longest first</button></span></div>
      <ul class="vlist" id="vlist"></ul>
      ${s.count > 15 ? `<button type="button" class="btn" id="vmore" style="margin-top:12px">Show all ${s.count}</button>` : ''}
    </section>
  </article>`;
  chartState = { song: s, selected };
  let sortBy = 'date', all = s.count <= 15;
  const drawList = () => {
    const order = s.versions.map((v, i) => i);
    if (sortBy === 'long') order.sort((a, b) => s.versions[b].secs - s.versions[a].secs);
    document.getElementById('vlist').innerHTML = versionRows(s, all ? order : order.slice(0, 12));
    document.querySelectorAll('#vlist button').forEach(b => b.setAttribute('aria-current', String(s.versions[+b.dataset.v] === chartState.selected)));
  };
  drawChart();
  drawList();
  pick(selected, false);
  document.getElementById('vlist').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b) pick(s.versions[+b.dataset.v], true);
  });
  document.getElementById('vsort').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    sortBy = c.dataset.v;
    for (const x of c.parentElement.children) x.setAttribute('aria-pressed', String(x === c));
    drawList();
  });
  document.getElementById('vmore')?.addEventListener('click', e => { all = true; e.currentTarget.remove(); drawList(); });
}

const joinNames = names => names.length > 2 ? `${names.slice(0, 2).join(', ')} and others` : names.join(' and ');

function headline(s) {
  const span = `${s.first.date.slice(0, 4)}${s.last.date.slice(0, 4) !== s.first.date.slice(0, 4) ? ` to ${s.last.date.slice(0, 4)}` : ''}`;
  let text = `${plural(s.count, 'official live version')} from ${span}.`;
  if (s.median && s.album?.length) {
    const r = s.median / s.album.length;
    const how = r >= 1.85 ? `about ${r >= 2.75 ? Math.round(r) + ' times' : r >= 2.25 ? 'two and a half times' : 'twice'} as long as the album`
      : r >= 1.25 ? `${Math.round((r - 1) * 100)}% longer than the album` : r <= 0.85 ? `shorter than the album` : 'about as long as the album';
    text += ` On stage it usually runs ${clock(s.median)}, ${how}.`;
  } else if (s.median) text += ` It usually runs ${clock(s.median)}.`;
  const changed = story(s);
  if (changed) text += ` ${changed}`;
  return text;
}

function eras(s) {
  const max = Math.max(...s.eras.map(e => e.median), s.album?.length || 0, 1);
  const rows = s.eras.map(e => `<div class="era">
      <span class="t">${esc(e.era.name)}<small>${e.era.from.slice(0, 4)}${e.era.to < '2090' ? `–${e.era.to.slice(0, 4)}` : ' on'} · ${e.count ? plural(e.count, 'version') : 'none released'}</small></span>
      <span class="m">${e.median ? clock(e.median) : '–'}</span>
      <span class="bar">${e.median ? `<span style="width:${(e.median / max * 100).toFixed(1)}%"></span>` : ''}${s.album?.length ? `<i class="album-tick" style="left:${(s.album.length / max * 100).toFixed(1)}%" title="Album version"></i>` : ''}</span>
    </div>`).join('');
  return rows + `<p class="muted small" style="margin:0">Typical length of the released versions${s.album?.length ? '; the tick is the album version' : ''}.</p>`;
}

function facts(s) {
  const out = [];
  const whole = new Set(s.versions.filter(v => v.night.whole && !v.track.extra).map(v => v.night)).size;
  if (whole) {
    const bits = [];
    if (s.opens) bits.push(`opened ${plural(s.opens, 'of them', 'of them')}`.replace(/^opened 1 of them/, 'opened one of them'));
    if (s.closes) bits.push(`closed ${s.closes === 1 ? 'one' : s.closes}`);
    out.push(`<li>Played on ${plural(whole, 'whole night')} released in full${bits.length ? `, and ${bits.join(' and ')}` : ''}.</li>`);
  }
  if (s.nexts.length) out.push(`<li>Most often followed by ${s.nexts.slice(0, 3).map(([o, n]) => `${songLink(o)} (${n})`).join(', ')}.</li>`);
  // What leads where only has the nights released whole, so it has nothing for a song never on one.
  if (s.prevs.length) out.push(`<li>Most often after ${s.prevs.slice(0, 3).map(([o, n]) => `${songLink(o)} (${n})`).join(', ')}.${whole ? ` <a href="#/flow/${s.slug}">What leads where</a>.` : ''}</li>`);
  const before = beforeFact(M, s);
  if (before) out.push(`<li>${before}</li>`);
  if (s.longest && s.shortest && s.longest !== s.shortest) {
    out.push(`<li>Longest: ${clock(s.longest.secs)}, ${nightLink(s.longest.night)} ${esc(atPlace(s.longest.night))}. Shortest: ${clock(s.shortest.secs)}, ${nightLink(s.shortest.night)}.</li>`);
  }
  if (s.bits.length) out.push(`<li>Bits of other songs heard inside it: ${s.bits.slice(0, 6).map(([b, n]) => `${esc(b)}${n > 1 ? ` (${n})` : ''}`).join(', ')}.</li>`);
  out.push(`<li>First released from ${nightLink(s.first.night)}, ${esc(s.first.night.noVenue ? placeText(s.first.night) : venueLine(s.first.night))}; the latest from ${nightLink(s.last.night)}.</li>`);
  return out.join('');
}

function versionRows(s, order) {
  const max = Math.max(...s.versions.map(v => v.secs), 1);
  return order.map(i => [s.versions[i], i]).map(([v, i]) => `<li><button type="button" data-v="${i}">
      <span class="d">${dateText(v.date)}</span>
      <span class="w">${esc(venueLine(v.night))}<small>${esc(v.track.release.label)}${v.shared ? ` · with ${v.track.songs.filter(x => x !== s).map(x => esc(x.name)).join(', ')}` : ''}</small></span>
      <span class="l">${v.secs ? clock(v.secs) : '–'}</span>
      <span class="bar"><span style="width:${(v.secs / max * 100).toFixed(1)}%"></span></span>
    </button></li>`).join('');
}

function drawChart() {
  const box = document.getElementById('chart-box');
  if (!box || !chartState) return;
  const { svg, points, width } = lifeline(chartState.song, { width: box.clientWidth, selected: chartState.selected });
  box.innerHTML = svg;
  chartState.points = points;
  const el = box.firstElementChild;
  const near = e => {
    const r = el.getBoundingClientRect();
    const k = width / r.width;
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    let best = null, bd = Infinity;
    for (const p of points) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd < (34 * k) ** 2 ? best.v : null;
  };
  el.addEventListener('click', e => { const v = near(e); if (v) pick(v, false); });
  el.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const v = near(e);
    if (v && v !== chartState.selected) pick(v, false, true);
  });
}

function pick(v, scroll, hover) {
  if (!v || !chartState) return;
  chartState.selected = v;
  const s = chartState.song;
  const t = v.track;
  const vs = s.album?.length && v.secs ? v.secs / s.album.length : null;
  const marks = [v === s.longest && 'the longest released', v === s.shortest && 'the shortest released', v.opener && 'opened the night', v.closer && 'closed the night'].filter(Boolean);
  const band = bandWith(v.date);
  document.getElementById('picked').innerHTML = `<div class="picked-top">
      <div><p class="when">${esc(dateText(v.date, 'long'))}</p><h3>${esc(venueLine(v.night))}</h3></div>
      <div class="big">${v.secs ? clock(v.secs) : '–'}</div>
    </div>
    <p>${marks.length ? `${marks.join(', ').replace(/^./, c => c.toUpperCase())}. ` : ''}${vs ? `${vs >= 1.1 ? `${vs.toFixed(1)}× the album version` : vs <= 0.9 ? 'Shorter than the album version' : 'About the album’s length'}. ` : ''}${inNight(t) ? `Played ${inNight(t)}.` : ''}</p>
    ${extras(t) ? `<p class="muted small">${esc(extras(t)).replace(/^w/, 'W')}.</p>` : ''}
    ${v.shared ? `<p class="muted small">Shares a track with ${t.songs.filter(x => x !== s).map(songLink).join(', ')}, so the time is for both.</p>` : ''}
    <p class="muted small">On ${where(t)}.${band ? ` The band that night included ${esc(band)}.` : ''}</p>
    <div class="links">${listen(t)}<a href="#/night/${v.date}">The whole night</a></div>`;
  if (!hover) {
    const box = document.getElementById('chart-box');
    if (box && chartState.points) {
      const ring = box.querySelector('.ring');
      const p = chartState.points.find(p => p.v === v);
      if (p) {
        const r = p.x && box.querySelector('.dot') ? +box.querySelector('.dot').getAttribute('r') + 4 : 8;
        if (ring) { ring.setAttribute('cx', p.x.toFixed(1)); ring.setAttribute('cy', p.y.toFixed(1)); }
        else box.firstElementChild.insertAdjacentHTML('beforeend', `<circle class="ring" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"/>`);
      }
    }
    document.querySelectorAll('#vlist button').forEach(b => b.setAttribute('aria-current', String(s.versions[+b.dataset.v] === v)));
    history.replaceState(null, '', `#/song/${s.slug}/${v.date}`);
    if (scroll) document.getElementById('picked').scrollIntoView({ block: 'nearest', behavior: glide() });
  } else {
    const box = document.getElementById('chart-box');
    const ring = box?.querySelector('.ring');
    const p = chartState.points?.find(p => p.v === v);
    if (ring && p) { ring.setAttribute('cx', p.x.toFixed(1)); ring.setAttribute('cy', p.y.toFixed(1)); }
  }
}

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (document.getElementById('chart-box')) drawChart(); drawYears(); }, 120);
});

// ---------------------------------------------------------------------------------------------------------------
// Nights

let newestFirst = store.get('newest', false);

function renderNights() {
  const years = [...M.years];
  if (newestFirst) years.reverse();
  view.innerHTML = `<section class="nights-page">
    <figure class="years-chart">
      <figcaption><h2 class="section-title">The years</h2><p class="muted small">How many nights were released from each year (the pale part is nights with only a song or two out), and how long a whole night ran. Tap a year for its page.</p></figcaption>
      <div id="years-box"></div>
    </figure>
    <div class="list-tools">
      <input type="search" id="nq" placeholder="Find a venue or town" aria-label="Find a venue or town" autocomplete="off">
      <button type="button" class="chip" id="order-btn">${newestFirst ? 'Newest first' : 'Oldest first'}</button>
    </div>
    <nav class="year-jump" aria-label="Years">${years.map(y => `<a href="#/nights" data-year="${y}">${y}</a>`).join('')}</nav>
    <div id="years-list"></div>
  </section>`;
  const nq = document.getElementById('nq');
  const draw = () => {
    const needle = nq.value.trim().toLowerCase();
    const match = n => !needle || `${n.place} ${n.town} ${n.venue?.name || ''} ${n.release.label} ${n.date}`.toLowerCase().includes(needle);
    document.getElementById('years-list').innerHTML = years.map(y => {
      const nights = M.nights.filter(n => n.year === y && match(n));
      if (newestFirst) nights.reverse();
      const full = nights.filter(n => n.songCount >= 5), small = nights.filter(n => n.songCount < 5);
      if (!nights.length) return '';
      return `<section class="year" id="y${y}"><h3><a href="#/year/${y}">${y}</a> <small>${plural(full.length, 'night')}${small.length ? `, plus ${plural(small.length, 'night')} with a song or two` : ''}</small><a class="year-more" href="#/year/${y}">The year →</a></h3>
        <ul class="night-list">${full.map(nightRow).join('')}</ul>
        ${small.length ? `<p class="bits">Also: ${small.map(n => `${nightLink(n, dateText(n.date, 'year'))} (${n.tracks.filter(t => t.songs).flatMap(t => t.songs).map(s => esc(s.name)).join(', ')})`).join('; ')}.</p>` : ''}
      </section>`;
    }).join('') || '<p class="empty-note">No nights match.</p>';
  };
  drawYears();
  nq.addEventListener('input', draw);
  document.getElementById('order-btn').addEventListener('click', () => { newestFirst = !newestFirst; store.set('newest', newestFirst); renderNights(); });
  view.querySelector('.year-jump').addEventListener('click', e => {
    const a = e.target.closest('[data-year]');
    if (!a) return;
    e.preventDefault();
    document.getElementById('y' + a.dataset.year)?.scrollIntoView({ behavior: glide(), block: 'start' });
  });
  draw();
}

function drawYears() {
  const box = document.getElementById('years-box');
  if (box) box.innerHTML = yearsChart(M, box.clientWidth);
}

function renderNight(date) {
  const n = M.byDate.get(date);
  if (!n) { view.innerHTML = '<p class="empty-note">No official release from that night here. <a href="#/nights">All the nights</a></p>'; return; }
  const main = n.tracks.filter(t => !t.extra);
  const extra = n.tracks.filter(t => t.extra);
  const max = Math.max(...n.tracks.map(t => t.secs), 600);
  const band = bandOn(date).map(p => p.name);
  const others = n.venue ? n.venue.nights.filter(x => x !== n && x.songCount >= 1) : [];
  const row = t => {
    if (!t.songs) {
      if (/encore/i.test(t.other)) return `<li class="encore"><span>Encore</span></li>`;
      return `<li class="other"><span class="s">${esc(t.other)}</span><span class="len">${t.secs ? clock(t.secs) : ''}</span></li>`;
    }
    return `<li><span class="s">${t.songs.map(songLink).join('<span class="seg">&gt;</span>')}${t.segue ? '<span class="seg">&gt;</span>' : ''}${extras(t) ? `<small>${esc(extras(t))}</small>` : ''}</span>
      <span class="len">${t.secs ? clock(t.secs) : '–'}</span>
      <span class="bar"><span style="width:${(t.secs / max * 100).toFixed(1)}%"></span></span></li>`;
  };
  view.innerHTML = `<article class="night">
    <a class="back" href="#/nights">← Nights</a>
    <header class="night-head">
      <p class="kicker">${esc(dateText(date, 'long').replace(/\d{4}$/, ''))}<a href="#/year/${n.year}">${n.year}</a></p>
      <h2>${esc(n.place)}</h2>
      <p class="where">${esc(n.town || 'Venue not listed')} · ${esc(n.release.label)} · ${plural(n.songCount, 'song')}${n.timed && n.total ? ` · ${clock(n.total)}` : ''}</p>
      <p class="band">On stage: ${esc(band.slice(0, -1).join(', '))} and ${esc(band.at(-1))}.</p>
    </header>
    ${!n.whole && n.songCount >= 5 ? '<p class="muted small" style="margin:14px 0 0">Not every song from this night was released, so this isn’t the whole setlist.</p>' : ''}
    ${n.songCount < 5 ? '<p class="muted small" style="margin:14px 0 0">Only part of this night has been released, on a compilation.</p>' : ''}
    <ol class="setlist">${main.map(row).join('')}</ol>
    ${extra.length ? `<h3 class="section-title" style="margin-top:28px">Also released from this night</h3><ol class="setlist">${extra.map(row).join('')}</ol>` : ''}
    <div class="row" style="margin-top:24px">
      ${n.venue && n.venue.nights.length > 1 ? `<button type="button" class="btn primary" id="from-here">Build a show from ${esc(n.venue.name)}</button>` : ''}
      <a class="btn" href="https://musicbrainz.org/release-group/${n.release.mb}" target="_blank" rel="noopener">The release on MusicBrainz</a>
    </div>
    ${others.length ? `<section style="margin-top:28px"><h3 class="section-title">Other nights here</h3><p>${others.map(x => nightLink(x, dateText(x.date))).join(' · ')}</p></section>` : ''}
  </article>`;
  document.getElementById('from-here')?.addEventListener('click', () => {
    opts.venues = [venueKey(n.venue)];
    opts.when = ['any'];
    store.set('options', opts);
    show = null;
    location.hash = '#/';
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Pages

function route() {
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  const tab = ['song', 'songs', 'before', 'flow'].includes(page) ? 'songs' : ['night', 'nights', 'year'].includes(page) ? 'nights' : 'build';
  document.querySelectorAll('.tabs a').forEach(t => {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  closeSheet();
  chartState = null;
  if (page === 'show' && b) {
    // A link cut off in the middle of a %-escape (a chat app's %2C for a comma) can't be decoded whole, so decode
    // each escape that's all there and leave the cut one, which drops only the last song.
    let code = b;
    try { code = decodeURIComponent(b); } catch { code = b.replace(/%([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16))); }
    const shared = decode(M, code);
    if (shared.slots.length) {
      // The time the link asked for, if it's one the page could have asked for; otherwise the show's own length.
      const asked = +a;
      shared.minutes = Number.isInteger(asked) && asked >= 15 && asked <= 240 ? asked : Math.round(shared.total / 60);
      renderBuilder(shared);
    } else renderBuilder();
  } else if (page === 'songs') renderSongs();
  else if (page === 'song') renderSong(a, b);
  else if (page === 'nights') renderNights();
  else if (page === 'night') renderNight(a);
  else if (page === 'before') renderBefore(view, M);
  else if (page === 'flow') renderFlow(view, M, a);
  else if (page === 'year') renderYear(view, M, a);
  else renderBuilder();
  const titles = {
    song: M.bySlug.get(a)?.name, night: M.byDate.get(a) && dateText(a), year: M.years.includes(+a) && a,
    before: 'Before the album', flow: 'What leads where',
  };
  document.title = titles[page] ? `${titles[page]} · Night After Night` : 'Night After Night';
}

// Back comes back to the same spot on a page: following a link keeps how far down the page you were, and what was
// in the Nights search, with the page's place in the history, and coming back to it puts them back.
document.addEventListener('click', e => {
  if (!e.target.closest?.('a[href^="#"]')) return;
  try { history.replaceState({ y: Math.round(scrollY), nq: document.getElementById('nq')?.value || '' }, ''); } catch { /* not kept */ }
}, true);

let lastPage = null;
addEventListener('hashchange', () => {
  const page = location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/');
  const was = lastPage;
  const left = history.state; // read before the page is drawn: a song page replaces it
  route();
  if (Number.isFinite(left?.y)) {
    const nq = document.getElementById('nq');
    if (nq && left.nq) { nq.value = left.nq; nq.dispatchEvent(new Event('input')); }
    scrollTo({ top: left.y });
  } else {
    // Following a song around the map keeps the map in view; anything else starts at the top.
    const map = /^flow\b/.test(page) && /^flow\b/.test(was || '') && document.querySelector('.flow-pick');
    if (map && map.getBoundingClientRect().top < 60) map.scrollIntoView({ block: 'start' });
    else if (!map && page !== was) scrollTo({ top: 0 });
  }
  lastPage = page;
});
lastPage = location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/');
route();

// A copy for offline use; not in the single-file copy, which has nothing to cache.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !document.documentElement.hasAttribute('data-single')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// For the screenshot tool and the tests.
window.nightAfterNight = { M, opts, get show() { return show; }, writeShow, renderPaper: () => renderPaper(false) };
