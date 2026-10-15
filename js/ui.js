// Little pieces of markup every page uses.
import { dateText } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
// What the DMB Almanac files outside the band's tours, none of it counted with the band's shows. The snapshot
// doesn't name its tours, so the band's own one-offs (an album preview, a benefit) are here too unless released.
export const OUTSIDE = 'Dave &amp; Tim, solo shows and side projects, guest spots, radio and TV, and one-off shows, the band’s own among them';
export const venueLine = n => [n.place, n.town].filter(Boolean).join(', ') || 'Venue not listed';
// "Fenway Park", or "on DMB Live 25" for a recording whose release doesn't say where it's from. Plain text.
export const placeText = n => (n.noVenue ? `on ${n.release.label}` : n.place);
export const atPlace = n => (n.noVenue ? placeText(n) : `at ${n.place}`);
export const songLink = s => `<a href="#/song/${s.slug}">${esc(s.name)}</a>`;
export const nightLink = (n, text) => `<a href="#/night/${n.date}">${esc(text || dateText(n.date))}</a>`;
export const joinWords = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] || '');

// The three ways into the songs, above each of their pages.
export function songsNav(current) {
  const items = [['songs', '#/songs', 'Every song'], ['before', '#/before', 'Before the album'], ['flow', '#/flow', 'What leads where']];
  return `<nav class="subnav" aria-label="Ways into the songs">${items.map(([k, href, text]) =>
    `<a href="${href}"${k === current ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</nav>`;
}

// A night in a list: the date, the venue and town, which release, how many songs.
export const nightRow = n => `<li><a href="#/night/${n.date}">
  <span class="dd">${dateText(n.date, 'year')}</span>
  <span class="v">${esc(n.place)}<small>${esc(n.town || '')}${n.town ? ' · ' : ''}${esc(n.release.label)}</small></span>
  <span class="n">${plural(n.songCount, 'song')}</span></a></li>`;

// A show from the DMB Almanac, which has a page whether or not anything from it was released.
export const showLink = (show, text) => `<a href="#/night/${show.date}">${esc(text || dateText(show.date))}</a>`;
export const showPlace = show => [show.place || 'Venue unknown', show.town].filter(Boolean).join(', ');
// A show in a list: the date, the venue and town, the release if there is one, how many songs.
export const showRow = (show, withYear = false) => `<li${show.night ? ' class="released"' : ''}><a href="#/night/${show.date}">
  <span class="dd">${dateText(show.date, withYear ? 'short' : 'year')}</span>
  <span class="v">${esc(show.night?.place || show.place || 'Venue unknown')}<small>${esc(show.town)}${show.night ? `${show.town ? ' · ' : ''}${esc(show.night.release.label)}` : ''}</small></span>
  <span class="n">${show.sequence.length ? plural(show.sequence.length, 'song') : 'No setlist'}</span></a></li>`;
