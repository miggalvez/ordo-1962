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
  'sunday', 'feria', 'feast', 'vigil', 'within-octave', 'ember-day', 'commemoration', 'our-lady-on-saturday',
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
  const additions = new Set(read('reviewed/additions.json').observances.map((o) => o.key));
  for (const entry of catalogue) {
    if (entry.origin === 'reviewed') {
      assert.ok(additions.has(entry.key) && !entry.sourceId, entry.key);
      assert.ok(!Object.values(keys).includes(entry.key), `${entry.key} is also a Missale Meum key`);
      continue;
    }
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
    const dateKinds = Object.keys(entry.date).filter((k) => k !== 'leapYear');
    assert.equal(dateKinds.length, 1, label);
    assert.ok(['fixed', 'temporal', 'rule', 'generated'].includes(dateKinds[0]), label);
    const monthDay = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (entry.date.fixed) assert.match(entry.date.fixed, monthDay, label);
    if ('leapYear' in entry.date) assert.match(entry.date.leapYear, monthDay, label);
    if (entry.date.fixed && entry.scope === 'universal') assert.equal(typeof entry.dayOrder, 'number', label);
    if (entry.formularyOf) {
      const principal = byKey.get(entry.formularyOf);
      assert.ok(principal && !principal.formularyOf, `${label}: formularyOf ${entry.formularyOf}`);
      assert.deepEqual(principal.date, entry.date, label);
    }
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

test('movable days are keyed by their place in the cycle', () => {
  const special = new Set(['seven-sorrows-in-passiontide']);
  const odd = Object.entries(keys)
    .filter(([id]) => id.startsWith('tempora:'))
    .map(([, key]) => key)
    .filter((key) => !special.has(key) && !/^([a-z]+\d*-\d[a-z]?|sep-ember-\d)$/.test(key));
  assert.deepEqual(odd, []);
});

test('the Seven Sorrows in Passiontide is a commemoration, not a second feria', () => {
  assert.equal(byKey.get('quad5-5').kind, 'feria');
  assert.equal(byKey.get('seven-sorrows-in-passiontide').kind, 'commemoration');
});

test('the Rogation Monday and Tuesday are white ferias of Paschaltide, named as such (no. 88)', () => {
  for (const key of ['pasc5-1', 'pasc5-2']) {
    assert.deepEqual([byKey.get(key).kind, byKey.get(key).class, byKey.get(key).colors], ['feria', 4, ['white']], key);
    assert.match(names.en[key], /^(Monday|Tuesday) after V Sunday after Easter$/, key);
    assert.doesNotMatch(read('names/pl.json')[key], /litan/i, key);
  }
});

test('feasts of the Lord are exactly the reviewed list', () => {
  const reviewed = read('reviewed/feasts-of-the-lord.json');
  const listed = reviewed.feasts.map((entry) => entry.key).sort();
  for (const entry of reviewed.feasts) assert.ok(entry.source, `${entry.key} has no source`);
  const marked = catalogue.filter((entry) => entry.ofTheLord).map((entry) => entry.key).sort();
  assert.deepEqual(marked, listed);
  // General Rubrics no. 17(a)-(d) and no. 91 item 3 name these.
  for (const key of ['christ-the-king', 'nat2-0', 'epi1-0', 'pent01-0', 'pasc5-4', 'pent01-4', 'pent02-5']) {
    assert.equal(byKey.get(key).ofTheLord, true, key);
  }
});

test('the notice names the commit the data came from', () => {
  const notice = readFileSync(new URL('../NOTICE.md', import.meta.url), 'utf8');
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  assert.ok(notice.includes(source.commit), 'NOTICE.md cites a different Missale Meum commit');
  assert.ok(notice.includes('Copyright (c) 2022 Marcin Molenda'));
});
