import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dataUrl = (path) => new URL(`../data/${path}`, import.meta.url);
const catalogue = JSON.parse(readFileSync(dataUrl('catalogue.json'), 'utf8'));
const known = new Set(catalogue.map((entry) => entry.key));
const years = readdirSync(dataUrl('oracle/missalemeum'))
  .filter((name) => /^\d{4}\.json$/.test(name))
  .map((name) => Number(name.slice(0, 4)))
  .sort((a, b) => a - b);

const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

test('the oracle covers every year from 1962 to 2100', () => {
  assert.equal(years[0], 1962);
  assert.equal(years.at(-1), 2100);
  assert.equal(years.length, 139);
});

test('each oracle year has every date once, in order, with known keys', () => {
  for (const year of years) {
    const rows = JSON.parse(readFileSync(dataUrl(`oracle/missalemeum/${year}.json`), 'utf8'));
    assert.equal(rows.length, isLeap(year) ? 366 : 365, String(year));
    const first = Date.UTC(year, 0, 1);
    rows.forEach(([date, celebration, cls, colors, commemorations, displaced, tempora], i) => {
      assert.equal(date, new Date(first + i * 86400000).toISOString().slice(0, 10));
      assert.ok(celebration.length > 0, date);
      assert.ok([1, 2, 3, 4].includes(cls), `${date}: class ${cls}`);
      assert.match(colors, /^[wrgvbp]+$/, date);
      for (const key of [...celebration, ...commemorations, ...displaced, ...tempora]) {
        assert.ok(known.has(key), `${date}: ${key} is not in the catalogue`);
      }
    });
  }
});
