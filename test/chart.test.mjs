// The song charts:  node --test test/chart.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../js/data.js';
import { build } from '../js/model.js';
import { lifeline } from '../js/chart.js';

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
