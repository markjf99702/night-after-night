// Reading track titles the way DMB's releases write them. Used by tools/musicbrainz.mjs; tested in test/titles.test.mjs.

// Two titles are the same song if they match with case, punctuation, "&"/"and", a leading "The" and anything in
// brackets ignored: "Corn Bread" and "Cornbread", "Rhyme and Reason" and "Rhyme & Reason", "Everyday (#36)".
export function songKey(title) {
  return String(title).toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9#]+/g, '');
}

// Titles MusicBrainz has no song for, and what they are.
export const ALIASES = {
  pantala: 'Pantala Naga Pampa', // "Pantala (intro)"; "Pantala Intro" on Live in Chicago is a five-minute jam into it
  pantanagapampa: 'Pantala Naga Pampa',
  27: '#27',
  34: '#34',
  36: '#36',
  40: '#40',
  41: '#41',
  staywastingtime: 'Stay (Wasting Time)',
  sexymotherfucker: 'Sexy M.F.',
  letsdance: 'Let’s Dance',
  anyoneseethebridge: 'Anyone Seen the Bridge?',
};

// Tracks that aren't songs: intros, jams between songs, solos, the encore break, talking.
export const NOT_A_SONG = /^(?:\[.*\]|.*\bintro(?:duction)?s?\b.*|.*\bjams?\b.*|.*\bsolos?\b.*|.*\bduet\b.*|.*\bencore\b.*|.*\bimprov\b.*|.*\bfake\b.*|.*\bsoundcheck\b.*|.*\bbanter\b.*|.*\btuning\b.*|.*\binterview\b.*|crowd.*|drums?|dialogue|dave speaks.*|outro|silence|untitled|unknown|segue|space|tease)$/i;

// Jams MusicBrainz files as songs of their own.
export const JAMS = new Set(['boydencore', 'boydjam']);

// Words that say which version a track is rather than what song it is: "Two Step - Live".
const VERSION_WORDS = /^(?:live\b.*|edit|radio edit|remaster.*|bonus.*|demo|acoustic|instrumental|album version|single version)$/i;
const SEPARATORS = /\s*(?:>>|>|»|->|→|\.\.\.|…|_|\s\/\s|\/|\s[-–—]\s|\s\+\s)\s*/;

// The songs in a track title, in order: "Pantala Naga Pampa > Rapunzel" is two, "Two Step »" is one,
// "The Stone (9.2.00 – Charlotte, NC – Blockbuster Pavilion)" is one, "Captain (Partial)... Too Much" is a bit of
// one and all of another. Each part has its raw text, its text without brackets, and whether it says "partial".
export function splitTitle(title) {
  const groups = [];
  let s = String(title).trim().replace(/\s*(?:>>|>|»|->|→)\s*$/, '');
  s = s.replace(/\([^()]*\)|\[[^\[\]]*\]/g, g => `\u0000${groups.push(g) - 1}\u0000`);
  s = s.replace(/\s*\([^()]*$/, g => `\u0000${groups.push(g) - 1}\u0000`); // an unclosed "(" runs to the end
  return s.split(SEPARATORS).map(part => {
    const inner = [...part.matchAll(/\u0000(\d+)\u0000/g)].map(m => groups[+m[1]]);
    const raw = part.replace(/\u0000(\d+)\u0000/g, (_, i) => groups[+i]).trim();
    const text = part.replace(/\u0000\d+\u0000/g, ' ').replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
    return { raw, text, partial: inner.some(g => /\bpartial\b/i.test(g)) };
  }).filter(p => p.text && !VERSION_WORDS.test(p.text));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = n => String(n).padStart(2, '0');
function ymd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += y > 50 ? 1900 : 2000;
  if (y < 1990 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// A show date written into a title, in any of the ways DMB's releases write them, and the text after it.
// Short dates are month first, as on every DMB release: "9.2.00" is September 2, 2000.
export function dateIn(text) {
  if (!text) return null;
  const tries = [
    [/(\d{4})[-‐‑–](\d{1,2})[-‐‑–](\d{1,2})/, m => ymd(m[1], m[2], m[3])],
    [/(\d{4})\.(\d{2})\.(\d{2})/, m => ymd(m[1], m[2], m[3])],
    [/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?![\d.])/, m => ymd(m[3], m[1], m[2])],
    [new RegExp(`\\b(${MONTHS.join('|')}) (\\d{1,2}),? (\\d{4})`, 'i'), m => ymd(m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2])],
  ];
  for (const [re, make] of tries) {
    const m = String(text).match(re);
    if (m) {
      const date = make(m);
      if (date) return { date, rest: text.slice(m.index + m[0].length) };
    }
  }
  return null;
}

// Letters it takes to turn one title into another, for catching typos like "Satelite" and "Proundest Monkey".
export function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

// Venue names compare like song titles, with "Theater"/"Theatre" and "Center"/"Centre" counted the same.
export const venueKey = name => songKey(name).replace(/theater/g, 'theatre').replace(/center/g, 'centre');

// Towns as MusicBrainz or a release writes them, and how to show them.
export const TOWNS = {
  'East Troy': 'East Troy, WI', George: 'George, WA', 'Mountain View': 'Mountain View, CA', Bristow: 'Bristow, VA',
  Athens: 'Athens, GA', Durham: 'Durham, NC', Austin: 'Austin, TX', Boulder: 'Boulder, CO',
  Charlottesville: 'Charlottesville, VA', Norfolk: 'Norfolk, VA', Alexandria: 'Alexandria, VA', Pelham: 'Pelham, AL',
  Tampa: 'Tampa, FL', Atlanta: 'Atlanta, GA', Chicago: 'Chicago, IL', Nashville: 'Nashville, TN',
  Charleston: 'Charleston, SC', Clarkston: 'Clarkston, MI', 'The Woodlands': 'The Woodlands, TX', Irvine: 'Irvine, CA',
  Albany: 'Albany, NY', Buffalo: 'Buffalo, NY', Cleveland: 'Cleveland, OH', 'East Rutherford': 'East Rutherford, NJ',
  Toronto: 'Toronto, ON', Bend: 'Bend, OR', 'Des Moines': 'Des Moines, IA', 'Atlantic City': 'Atlantic City, NJ',
  'Bonner Springs': 'Bonner Springs, KS', 'Nantucket Island': 'Nantucket, MA', 'Rio de Janeiro': 'Rio de Janeiro, Brazil',
  Madrid: 'Madrid, Spain', 'Darien Center': 'Darien Center, NY', 'Fenway–Kenmore': 'Boston, MA',
  'Hollywood Hills': 'Los Angeles, CA', Manhattan: 'New York, NY', 'New York': 'New York, NY',
  'New York City, NY': 'New York, NY', 'Queens, NY': 'New York, NY', 'Flushing, NY': 'New York, NY',
  'Union Square, NY': 'New York, NY', 'Upper West Side, NY': 'New York, NY', 'Midtown Manhattan, NY': 'New York, NY',
  Greenwich: 'London, England', Northriding: 'Johannesburg, South Africa', Lisboa: 'Lisbon, Portugal',
  Padova: 'Padua, Italy', 'Berkeley, California': 'Berkeley, CA', 'W. Palm Beach, FL': 'West Palm Beach, FL',
  'Alpharretta, GA': 'Alpharetta, GA', 'Washington, D.C.': 'Washington, DC', 'Washington, D.C., DC': 'Washington, DC',
  'Luther College, Decorah, IA': 'Decorah, IA', 'Virginia Beach': 'Virginia Beach, VA',
  'Elkorn, WI': 'Elkhorn, WI', 'Hollywood, CA': 'Los Angeles, CA',
};

// Towns for venues a release names without one.
export const VENUE_TOWNS = {
  soma: 'San Diego, CA',
  mgmgrandgardenarena: 'Las Vegas, NV',
  milehighmusicfestival: 'Commerce City, CO',
};

// Dates MusicBrainz has wrong, by date and venue: the 1994 McIntire Amphitheatre show is also filed under 2004.
export const DATE_FIXES = {
  '2004-09-27|mcintireamphitheatre': '1994-09-27',
};

// Discs MusicBrainz files under the wrong night, by release and disc, for a night that shares its date and venue with
// the right one: The Complete Weekend on the Rocks has Red Rocks' September 9, 2005 (discs 1 and 2) under September
// 10, the night on discs 3 and 4. The DMB Almanac's setlists say which is which.
export const DISC_DATES = {
  '5ea71eab-a51d-4584-b84c-e7f23c0cdd1f': { 1: '2005-09-09', 2: '2005-09-09' },
};

// Venue names that are simply wrong where they're written down.
export const VENUE_FIXES = {
  soulshine: 'Madison Square Garden', // "live, 2024-11-24: Soulshine, Madison Square Garden, …"
  cocacoledome: 'Coca-Cola Dome',
  thegorge: 'The Gorge Amphitheatre',
};

// Venues a release names by an older (or misspelled) name than the one MusicBrainz files them under.
// Keyed by songKey(name), or songKey(name)|songKey(town) where the name alone is ambiguous.
export const VENUE_ALIASES = {
  'tweetercentre|camden': 'Freedom Mortgage Pavilion',
  susquehannabankcentre: 'Freedom Mortgage Pavilion',
  soundadviceamphitheatre: 'iTHINK Financial Amphitheatre at the South Florida Fairgrounds',
  nissanpavillionatstoneridge: 'Jiffy Lube Live',
  nissanpavilionatstoneridge: 'Jiffy Lube Live',
  verizonwirelessamphitheatreatencorepark: 'Ameris Bank Amphitheatre',
  ruoffhomemortgagemusiccentre: 'Ruoff Music Center',
  bankofnewhampshirepavilion: 'BankNH Pavilion',
  spac: 'Saratoga Performing Arts Center',
  saratogaspringsartscentre: 'Saratoga Performing Arts Center',
  darienlakeperformingartscentre: 'Darien Lake Amphitheater',
  centrum: 'Worcester Centrum Centre',
  gorge: 'The Gorge Amphitheatre',
  alpinevalleymusiccentre: 'Alpine Valley Music Theatre',
  ctnowcommeadowsmusictheatre: 'Meadows Music Theatre',
  hifibuysamphitheatre: 'Lakewood Amphitheatre',
  aaronsamphitheatreatlakewood: 'Lakewood Amphitheatre',
  tweetercentrefortheperformingarts: 'Great Woods Performing Arts Center',
  'comcastcentre|mansfield': 'Great Woods Performing Arts Center',
  verizonwirelessvirginiabeachamphitheatre: 'GTE Virginia Beach Amphitheater',
  blockbusterpavilion: 'PNC Music Pavilion',
  'verizonwirelessamphitheatre|charlotte': 'PNC Music Pavilion',
  dteenergymusictheatre: 'Pine Knob Music Theatre',
  sandstoneamphitheatre: 'Azura Amphitheater',
  randallsislandparknewyork: 'Randall’s Island Park',
  klipschmusiccentre: 'Ruoff Music Center',
  firstniagarapavilion: 'Post-Gazette Pavilion',
  'cricketwirelessamphitheatre|chulavista': 'Coors Amphitheatre',
  mcicentre: 'Capital One Arena',
  pacificbellpark: 'SBC Park',
  molsoncanadianamphitheatre: 'Molson Amphitheatre',
};
