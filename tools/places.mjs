// The DMB Almanac writes a show's place as one line, "The Gorge Amphitheatre George, WA": the venue, then the town,
// then the state (or province and country, or just the country). Nothing marks where the venue's name ends, so this
// finds the longest run of words before the comma that is a real town there, using GeoNames' list of every town
// of 500 people or more (geonames.org, CC BY 4.0). Used by tools/almanac.mjs; tested in test/almanac.test.mjs.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The Almanac's three-letter country codes: GeoNames' two-letter code, and the name the app writes.
export const COUNTRIES = {
  ARE: ['AE', 'United Arab Emirates'], ARG: ['AR', 'Argentina'], AUS: ['AU', 'Australia'], AUT: ['AT', 'Austria'],
  BEL: ['BE', 'Belgium'], BHS: ['BS', 'Bahamas'], BRA: ['BR', 'Brazil'], CAN: ['CA', 'Canada'], CHE: ['CH', 'Switzerland'], CUB: ['CU', 'Cuba'],
  CHL: ['CL', 'Chile'], CHN: ['CN', 'China'], COL: ['CO', 'Colombia'], CRI: ['CR', 'Costa Rica'], CZE: ['CZ', 'Czech Republic'],
  DEU: ['DE', 'Germany'], DNK: ['DK', 'Denmark'], ENG: ['GB', 'England'], ESP: ['ES', 'Spain'], FIN: ['FI', 'Finland'],
  FRA: ['FR', 'France'], GRC: ['GR', 'Greece'], HUN: ['HU', 'Hungary'], IRL: ['IE', 'Ireland'], ISL: ['IS', 'Iceland'],
  ISR: ['IL', 'Israel'], ITA: ['IT', 'Italy'], JAM: ['JM', 'Jamaica'], JPN: ['JP', 'Japan'], KOR: ['KR', 'South Korea'],
  LUX: ['LU', 'Luxembourg'], MEX: ['MX', 'Mexico'], NIR: ['GB', 'Northern Ireland'], NLD: ['NL', 'Netherlands'],
  NOR: ['NO', 'Norway'], NZL: ['NZ', 'New Zealand'], PER: ['PE', 'Peru'], POL: ['PL', 'Poland'], PRI: ['PR', 'Puerto Rico'],
  PRT: ['PT', 'Portugal'], SCT: ['GB', 'Scotland'], SEN: ['SN', 'Senegal'], SGP: ['SG', 'Singapore'], SWE: ['SE', 'Sweden'],
  TUR: ['TR', 'Turkey'], URY: ['UY', 'Uruguay'], WLS: ['GB', 'Wales'], ZAF: ['ZA', 'South Africa'],
};
// Places that write a province before the country, as the app already does: "Ottawa, ON, Canada".
const WITH_PROVINCE = new Set(['CAN', 'AUS', 'BRA']);

// "St. Paul" and "Saint Paul", "Mt." and "Mount", "Cancún" and "Cancun" are the same town.
export const placeKey = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\bst\b\.?/g, 'saint').replace(/\bste\b\.?/g, 'sainte').replace(/\bft\b\.?/g, 'fort').replace(/\bmt\b\.?/g, 'mount')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const GEONAMES = 'https://download.geonames.org/export/dump/cities500.zip';

// Every town GeoNames knows, by country (and by state in the US), keyed as placeKey writes them.
export function loadTowns(cacheDir) {
  const file = `${cacheDir}/cities500.txt`;
  if (!existsSync(file)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`fetching ${GEONAMES}`);
    execFileSync('curl', ['-sS', '--max-time', '300', '-o', `${cacheDir}/cities500.zip`, GEONAMES]);
    execFileSync('unzip', ['-o', '-q', `${cacheDir}/cities500.zip`, '-d', cacheDir]);
  }
  const towns = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 11) continue;
    const [, name, ascii, alternates] = f;
    const where = f[8] === 'US' ? `US-${f[10]}` : f[8];
    const names = [name, ascii, ...alternates.split(',').filter(a => /^[\p{Script=Latin}\s.'’-]+$/u.test(a) && a.split(' ').length <= 4)];
    for (const n of names) towns.add(`${where}|${placeKey(n)}`);
  }
  return towns;
}

// "Saratoga Performing Arts Center (Saratoga Spa State Park) Saratoga Springs, NY" →
// { venue: 'Saratoga Performing Arts Center (Saratoga Spa State Park)', town: 'Saratoga Springs, NY', sure: true }.
// `extra` is a list of towns already known as "Town, ST" (or "Town, Country"), for the few too small for GeoNames.
export function placeSplitter(towns, extra = []) {
  const known = new Set(extra.map(t => {
    const parts = t.split(/,\s*/);
    return `${parts.slice(1).join(', ')}|${placeKey(parts[0])}`;
  }));
  return function split(line) {
    const parts = String(line).trim().split(/,\s*/);
    if (parts.length < 2) return { venue: /^(\[[^\]]*\]\s*)+$/.test(parts[0]) ? '' : cleanVenue(parts[0]), town: '', sure: !parts[0].trim() || /^\[/.test(parts[0]) };
    const last = parts.at(-1);
    let body, where, region, suffix;
    if (/^[A-Z]{3}$/.test(last) && COUNTRIES[last]) {
      const [iso2, country] = COUNTRIES[last];
      const province = parts.length >= 3 && /^[A-Z]{2,3}$/.test(parts.at(-2)) ? parts.at(-2) : '';
      body = parts.slice(0, province ? -2 : -1).join(', ');
      where = iso2;
      suffix = province && WITH_PROVINCE.has(last) ? `${province}, ${country}` : country;
      region = suffix;
    } else if (/^[A-Z]{2}$/.test(last)) {
      body = parts.slice(0, -1).join(', ');
      where = `US-${last}`;
      suffix = last;
      region = last;
    } else {
      return { venue: cleanVenue(parts.slice(0, -1).join(', ')), town: last, sure: false };
    }
    // A ship: "Sovereign of the Seas [Atlantic Ocean]".
    const at = body.match(/^(.*\S)\s+\[([^\]]+)\]$/);
    if (at && !/unknown/i.test(at[2])) return { venue: cleanVenue(at[1]), town: `${at[2]}, ${suffix}`, sure: true };
    const words = body.split(' ').filter(Boolean);
    if (words.every(w => /^\[?unknown\]?$/i.test(w))) return { venue: '', town: suffix, sure: true };
    for (let k = Math.min(5, words.length); k >= 1; k--) {
      const town = words.slice(-k).join(' ');
      if (/^\[.*\]$/.test(town)) break;
      if (towns.has(`${where}|${placeKey(town)}`) || known.has(`${region}|${placeKey(town)}`)) {
        return { venue: cleanVenue(words.slice(0, -k).join(' ')), town: `${town}, ${suffix}`, sure: true };
      }
    }
    // Not a town we know: guess the last word, and say so in the report.
    const unknown = /^\[unknown\]$/i.test(words.at(-1) || '');
    return {
      venue: cleanVenue(words.slice(0, -1).join(' ')),
      town: unknown ? '' : `${words.at(-1)}, ${suffix}`,
      sure: false,
    };
  };
}

// "[Unknown]" and "[Private Residence]" are the Almanac's notes, not names.
function cleanVenue(v) {
  const s = String(v || '').trim().replace(/^\[unknown[^\]]*\]\s*/i, '').replace(/^\((.*)\)$/, '$1');
  if (!s) return '';
  return s.replace(/^\[(.*)\]$/, (_, x) => x[0].toUpperCase() + x.slice(1).toLowerCase());
}
