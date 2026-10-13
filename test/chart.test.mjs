// The song charts:  node --test test/chart.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import { build } from '../js/model.js';
import { lifeline, sparkline, endYear } from '../js/chart.js';

const M = build(data);
const label = s => lifeline(s).svg.match(/aria-label="([^"]*)"/)[1];

test('a chart says in words what it shows', () => {
  assert.match(label(M.bySlug.get('two-step')), /^Two Step: \d+ official live versions from \d{4} to \d{4}, usually \d+:\d\d long, against \d+:\d\d on Crash$/);
  for (const s of M.songs) {
    const text = label(s);
    assert.doesNotMatch(text, /\b1 official live versions\b/, `${s.name}: one version`);
    assert.doesNotMatch(text, /from (\d{4}) to \1\b/, `${s.name}: one year`);
    assert.doesNotMatch(text, /\b0:00\b/, `${s.name}: no length`);
  }
});

test('every version lands inside the charts, next year’s too', () => {
  // The newest night again, as if it were from December next year, as a rebuild of the data could bring in.
  const newest = data.nights.reduce((a, n) => (n.d > a.d ? n : a));
  const next = +newest.d.slice(0, 4) + 1;
  const later = build({ ...data, nights: [...data.nights, { ...newest, d: `${next}-12-10` }] });
  const end = endYear(later.years);
  assert.equal(end, next + 1);
  for (const s of later.songs) {
    const chart = lifeline(s, { width: 700, end });
    for (const p of chart.points) assert.ok(p.x <= chart.width - 10, `${s.name} ${p.v.date}: ${p.x.toFixed(1)} is past the chart`);
    for (const [, cx] of sparkline(s, end).matchAll(/<circle cx="([\d.]+)"/g)) assert.ok(+cx <= 96 - 3, `${s.name}: ${cx} is past the little chart`);
  }
});
