import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveDay } from '../dist/esm/index.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalogue = read('../data/catalogue.json');
const byKey = new Map(catalogue.map((entry) => [entry.key, entry]));
const fixture = read('./fixtures/multiple-celebrations.json');

// Christmas and All Souls have three Masses each; they are one celebration.
const principal = (key) => byKey.get(key)?.formularyOf ?? key;

test('grouping the Masses of Christmas and All Souls leaves exactly the reviewed days with two celebrations', () => {
  const found = [];
  for (let year = 1962; year <= 2100; year += 1) {
    for (const [date, celebration] of read(`../data/oracle/missalemeum/${year}.json`)) {
      if (new Set(celebration.map(principal)).size > 1) found.push(date);
    }
  }
  assert.deepEqual(found, fixture.days.map((day) => day.date));
});

test('Christmas and All Souls each have their principal entry and two further Masses', () => {
  for (const key of ['the-nativity-of-our-lord', 'commemoration-of-all-souls']) {
    assert.equal(catalogue.filter((entry) => entry.formularyOf === key).length, 2, key);
  }
});

test('the reviewed days name catalogue entries and agree with what Missale Meum lists', () => {
  for (const day of fixture.days) {
    for (const key of [day.expected.celebration, ...day.expected.commemorations]) assert.ok(byKey.has(key), `${day.date}: ${key}`);
    assert.ok(day.missaleMeum.celebration.includes(day.expected.celebration), day.date);
  }
});

for (const rule of [...new Set(fixture.days.map((day) => day.rule))]) {
  const days = fixture.days.filter((day) => day.rule === rule);
  test(`engine celebration: ${rule} (${days.length} days)`, () => {
    for (const day of days) assert.equal(resolveDay(day.date).celebration.key, day.expected.celebration, day.date);
  });
  test(`engine commemorations: ${rule} (${days.length} days)`, { todo: 'commemorations are M4' });
}
