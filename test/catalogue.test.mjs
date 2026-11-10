import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));

const catalogue = read('catalogue.json');
const keys = read('keys.json');
const ids = read('missalemeum/ids.json');
const blocks = read('temporal-blocks.json');
const source = read('missalemeum/source.json');
const names = { la: read('names/la.json'), en: read('names/en.json') };

const KINDS = new Set([
  'sunday', 'feria', 'feast', 'vigil', 'within-octave', 'ember-day', 'rogation', 'commemoration', 'our-lady-on-saturday',
]);
const COLORS = new Set(['white', 'red', 'green', 'violet', 'black', 'rose']);
const byKey = new Map(catalogue.map((entry) => [entry.key, entry]));
const position = (id) => id.split(':').slice(0, 2).join(':').replace(/(\d)r$/, '$1');

test('every Missale Meum observance id maps to exactly one key', () => {
  const missing = Object.values(ids).filter((id) => !(id in keys));
  assert.deepEqual(missing, []);
  const extra = Object.keys(keys).filter((id) => !Object.values(ids).includes(id));
  assert.deepEqual(extra, []);
});

test('a key is shared only by ids for the same movable day', () => {
  const idsByKey = new Map();
  for (const [id, key] of Object.entries(keys)) idsByKey.set(key, [...(idsByKey.get(key) || []), id]);
  const bad = [...idsByKey].filter(([, list]) => list.length > 1 && new Set(list.map(position)).size > 1);
  assert.deepEqual(bad, []);
  for (const [, list] of idsByKey) {
    if (list.length > 1) assert.ok(list.every((id) => id.startsWith('tempora:')), list.join());
  }
});

test('catalogue entries are unique and agree with the key map', () => {
  assert.equal(byKey.size, catalogue.length);
  for (const entry of catalogue) {
    assert.equal(keys[entry.sourceId], entry.key, entry.sourceId);
    for (const alias of entry.sourceAliases || []) assert.equal(keys[alias], entry.key, alias);
  }
});

test('catalogue entries have valid attributes', () => {
  for (const entry of catalogue) {
    const label = entry.key;
    assert.ok(KINDS.has(entry.kind), `${label}: kind ${entry.kind}`);
    assert.ok([1, 2, 3, 4].includes(entry.class), `${label}: class ${entry.class}`);
    assert.ok(entry.colors.length > 0 && entry.colors.every((c) => COLORS.has(c)), `${label}: colors`);
    assert.equal(typeof entry.ofTheLord, 'boolean', label);
    assert.ok(['universal', 'national'].includes(entry.scope), label);
    const dateKinds = Object.keys(entry.date);
    assert.equal(dateKinds.length, 1, label);
    assert.ok(['fixed', 'temporal', 'rule', 'generated'].includes(dateKinds[0]), label);
    if (entry.date.fixed) assert.match(entry.date.fixed, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, label);
  }
});

test('every movable day in the temporal blocks is in the catalogue', () => {
  for (const [block, days] of Object.entries(blocks)) {
    for (const day of days) for (const key of day) assert.ok(byKey.has(key), `${block}: ${key}`);
  }
});

test('every universal observance has a Latin and an English name', () => {
  const missing = catalogue
    .filter((entry) => entry.scope === 'universal')
    .filter((entry) => !names.la[entry.key] || !names.en[entry.key])
    .map((entry) => entry.key);
  assert.deepEqual(missing, []);
});

test('the notice names the commit the data came from', () => {
  const notice = readFileSync(new URL('../NOTICE.md', import.meta.url), 'utf8');
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  assert.ok(notice.includes(source.commit), 'NOTICE.md cites a different Missale Meum commit');
  assert.ok(notice.includes('Copyright (c) 2022 Marcin Molenda'));
});
