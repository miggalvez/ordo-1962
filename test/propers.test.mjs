import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CATALOGUE, DEDICATION_KEY, LAYERS, fixedFeasts, resolveDay, resolveYear } from '../dist/esm/index.js';
import { batches, checkTitulars } from '../scripts/check-titulars.mjs';

const FSSP = { nations: ['us'], institutes: ['fssp'] };
const day = (date, options = FSSP) => resolveDay(date, options);
const both = (date, options = FSSP) => {
  const d = day(date, options);
  return [d.celebration.key, d.commemorations];
};

test('the United States and FSSP layers are well formed', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../data/layers/${name}.json`, import.meta.url), 'utf8'));
  for (const [name, field, scope] of [['us', 'nation', 'national'], ['fssp', 'institute', 'institute']]) {
    const layer = read(name);
    assert.equal(LAYERS[name][field], name);
    for (const o of layer.observances) {
      for (const lang of ['la', 'en', 'es']) assert.ok(o.names[lang], `${o.key}: no ${lang} name`);
      assert.ok(o.source, `${o.key}: no source`);
      const entry = CATALOGUE.find((e) => e.key === o.key);
      assert.equal(entry.scope, scope, o.key);
      assert.ok(layer.operations.some((op) => op.op === 'add' && op.key === o.key), `${o.key} is never added`);
    }
  }
});

test('the layers apply only when asked for', () => {
  assert.equal(day('2026-11-13', {}).celebration.key, 'st-didacus');
  assert.equal(day('2026-11-13', { nations: ['us'] }).celebration.key, 'us-st-frances-xavier-cabrini');
  assert.deepEqual(day('2026-05-08', { nations: ['us'] }).commemorations, []);
  assert.throws(() => resolveYear(2026, { institutes: ['us'] }), /no layer for institute us/);
  assert.throws(() => resolveYear(2026, { nations: ['fssp'] }), /no layer for nation fssp/);
});

test('the United States days of the FSSP 2026 calendar', () => {
  // no. 91 item 23: a proper 3rd class feast precedes a universal one, which is commemorated (no. 111d).
  assert.deepEqual(both('2026-01-05'), ['us-st-john-neumann', ['st-telesphorus-pope-and-martyr']]);
  assert.deepEqual(both('2026-09-09'), ['us-st-peter-claver', ['st-gorgonius']]);
  assert.deepEqual(both('2026-11-13'), ['us-st-frances-xavier-cabrini', ['st-didacus']]);
  // Item 23 before item 25: Our Lady of Guadalupe on an Advent feria, which is commemorated first (no. 113).
  assert.deepEqual(both('2026-12-12'), ['us-our-lady-of-guadalupe', ['adv2-6']]);
  // no. 24: an ember day precedes proper 2nd class feasts and below; the martyrs are its one commemoration (no. 111c).
  assert.deepEqual(both('2026-09-26'), ['sep-ember-6', ['us-north-american-martyrs']]);
});

test('the FSSP commemorations of 2026', () => {
  assert.deepEqual(both('2026-05-08'), ['pasc4-5', ['fssp-apparition-of-st-michael', 'fssp-our-lady-mediatrix-of-all-graces']]);
  assert.deepEqual(both('2026-07-06'), ['pent06-1', ['fssp-st-maria-goretti']]);
});

test('a layer can mark its own feast of Our Lady (no. 112d)', () => {
  // A Saturday office of Our Lady excludes the Mediatrix as a commemoration, as it does Our Lady of Mount Carmel.
  // 8 May 2032 is a Saturday after the Ascension, a 4th class feria.
  const may8 = day('2032-05-08');
  assert.equal(may8.celebration.key, 'our-lady-on-saturday-paschaltide');
  assert.deepEqual(may8.commemorations, ['fssp-apparition-of-st-michael']);
});

test('a church raises its titular to the 1st class', () => {
  const church = { titular: { key: 'st-anne-mother-of-the-blessed-virgin' } };
  const anne = day('2026-07-26', { church });
  assert.deepEqual([anne.celebration.key, anne.celebration.class], ['st-anne-mother-of-the-blessed-virgin', 1]);
  // 26 July 2026 is a Sunday: the titular, a 1st class feast not of the Lord, keeps the Sunday as a commemoration.
  assert.deepEqual(anne.commemorations, ['pent09-0']);
  assert.equal(day('2026-07-26', {}).celebration.key, 'pent09-0');
  // A titular already of the 1st class keeps its higher place.
  assert.equal(day('2026-03-19', { church: { titular: { key: 'st-joseph-spouse-of-the-bl-virgin-mary' } } }).celebration.class, 1);
});

test('the anniversary of the dedication is a 1st class feast of the Lord', () => {
  const church = { dedication: '10-03' };
  // 3 October 2027 is a Sunday: the dedication takes it without a commemoration of the Sunday (nos. 16a, 112b).
  assert.deepEqual(both('2027-10-03', { church }), [DEDICATION_KEY, []]);
  assert.ok(fixedFeasts(2027, { church }).get('2027-10-03').includes(DEDICATION_KEY));
});

test('a new church feast needs a date and colours', () => {
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'st-unknown' } } }), /needs a date/);
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'st-unknown', date: '13-01', colors: ['white'] } } }), /needs a date/);
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'st-unknown', date: '05-01' } } }), /needs colors/);
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'st-anne-mother-of-the-blessed-virgin', date: '07-26' } } }), /without a date/);
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'pent01-0' } } }), /movable titular/);
});

test('a 1st class titular on any date is kept every year, on its day or transferred (no. 96), 2026-2055', () => {
  // Twenty-four titulars at a time, about two weeks apart, together on every date of the year.
  // `node scripts/check-titulars.mjs` runs one at a time; it passed for 2026-2055 on 2026-11-09.
  const groups = batches(24);
  assert.equal(groups.flat().length, 366);
  for (const group of groups) assert.deepEqual(checkTitulars(2026, 2055, group), []);
});
