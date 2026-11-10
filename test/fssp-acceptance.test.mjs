import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveDay } from '../dist/esm/index.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixture = read('./fixtures/fssp-2026.json');
const catalogue = read('../data/catalogue.json');
const known = new Set(catalogue.map((entry) => entry.key));
const oracle = new Map(read('../data/oracle/missalemeum/2026.json').map((row) => [row[0], row]));

const universalDays = fixture.days.filter((day) => !day.layer);

test('the FSSP acceptance days name observances that exist in the catalogue', () => {
  for (const day of universalDays) {
    for (const key of [day.celebration, ...day.commemorations]) assert.ok(known.has(key), `${day.date}: ${key}`);
  }
});

test('Missale Meum agrees with the FSSP on the principal celebration of these days', () => {
  for (const day of universalDays) {
    assert.deepEqual(oracle.get(day.date)[1], [day.celebration], day.date);
  }
});

test('Missale Meum misses commemorations the FSSP prints, so these days test more than the oracle can', () => {
  const missed = universalDays
    .filter((day) => JSON.stringify(oracle.get(day.date)[4]) !== JSON.stringify(day.commemorations))
    .map((day) => day.date);
  assert.deepEqual(missed, ['2026-03-27', '2026-11-01', '2026-11-30']);
});

for (const day of fixture.days) {
  if (day.layer) {
    test(`engine matches the FSSP on ${day.date}: ${day.tests}`, { todo: `the ${day.layer} layer is M5` });
    continue;
  }
  test(`engine celebration matches the FSSP on ${day.date}`, () => {
    const { celebration } = resolveDay(day.date);
    assert.equal(celebration.key, day.celebration);
  });
  test(`engine commemorations match the FSSP on ${day.date}: ${day.tests}`, () => {
    const { commemorations } = resolveDay(day.date);
    if (day.orderNote) assert.deepEqual([...commemorations].sort(), [...day.commemorations].sort());
    else assert.deepEqual(commemorations, day.commemorations);
  });
}
