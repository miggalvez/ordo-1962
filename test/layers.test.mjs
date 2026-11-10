import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
const catalogue = read('catalogue.json');
const byKey = new Map(catalogue.map((entry) => [entry.key, entry]));
const pl = read('layers/pl.json');

const removedBy = (layer) => new Set(layer.operations.flatMap((op) =>
  op.op === 'remove' ? [op.key] : op.replaces ? [op.replaces] : []));
const addedBy = (layer) => new Set(layer.operations.filter((op) => op.op === 'add').map((op) => op.key));

function fixedObservances(monthDay, layer) {
  const removed = layer ? removedBy(layer) : new Set();
  const added = layer ? addedBy(layer) : new Set();
  return catalogue
    .filter((entry) => entry.date.fixed === monthDay)
    .filter((entry) => (entry.scope === 'universal' && !removed.has(entry.key)) || added.has(entry.key))
    .map((entry) => entry.key);
}

test('the Polish layer refers only to catalogue entries of the right scope', () => {
  for (const op of pl.operations) {
    assert.ok(['add', 'remove'].includes(op.op), op.op);
    const entry = byKey.get(op.key);
    assert.ok(entry, op.key);
    if (op.op === 'remove') assert.equal(entry.scope, 'universal', op.key);
    if (op.op === 'add') {
      assert.equal(entry.scope, 'national', op.key);
      assert.equal(entry.nation, 'pl', op.key);
    }
    if (op.replaces) assert.equal(byKey.get(op.replaces)?.scope, 'universal', op.replaces);
  }
});

test('every Polish feast is added by the Polish layer', () => {
  const national = catalogue.filter((entry) => entry.nation === 'pl').map((entry) => entry.key).sort();
  assert.deepEqual([...addedBy(pl)].sort(), national);
});

test('in the Polish calendar St. Stanislaus is kept only on 8 May', () => {
  assert.ok(fixedObservances('05-07').includes('st-stanislaus'));
  assert.ok(!fixedObservances('05-07', pl).includes('st-stanislaus'));
  assert.deepEqual(
    fixedObservances('05-08', pl).filter((key) => /stanisla/.test(key)),
    ['pl-st-stanislai-episcopi-et-martyris'],
  );
});

test("the Polish layer agrees with Missale Meum's own Polish calendar", () => {
  const dir = new URL('../data/oracle/missalemeum-pl/', import.meta.url);
  const years = readdirSync(dir).filter((name) => /^\d{4}\.json$/.test(name));
  assert.ok(years.length >= 3);
  const removed = removedBy(pl);
  const seen = new Set();
  for (const file of years) {
    for (const [date, celebration, , , commemorations, displaced, tempora] of JSON.parse(readFileSync(new URL(file, dir), 'utf8'))) {
      const all = [...celebration, ...commemorations, ...displaced, ...tempora];
      for (const key of all) {
        seen.add(key);
        assert.ok(!removed.has(key), `${date}: ${key} is removed in Poland`);
      }
      if (date.endsWith('-05-08')) assert.ok(all.includes('pl-st-stanislai-episcopi-et-martyris'), date);
    }
  }
  const unseen = [...addedBy(pl)].filter((key) => !seen.has(key));
  assert.deepEqual(unseen, []);
});
