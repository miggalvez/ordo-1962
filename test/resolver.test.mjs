import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CATALOGUE, resolveDay, resolveYear, tableItem } from '../dist/esm/index.js';
import { compare } from '../scripts/compare-oracle.mjs';

const YEARS = Array.from({ length: 139 }, (_, i) => 1962 + i);
const deviations = JSON.parse(readFileSync(new URL('./fixtures/oracle-deviations.json', import.meta.url), 'utf8')).days;
const celebrated = (date) => resolveDay(date).celebration;

test('the principal celebration, class and colour match Missale Meum on every day of 1962-2100, except the reviewed deviations', () => {
  const found = YEARS.flatMap((year) => compare(year));
  const expected = deviations.map(({ date, problems, engine, missaleMeum }) => ({ date, problems, ours: engine, oracle: missaleMeum }));
  assert.deepEqual(found, expected);
  for (const day of deviations) assert.match(day.rubric, /^no\. \d+/, `${day.date} cites no rubric`);
});

test('every observance has a place in the table of precedence or is only ever commemorated', () => {
  for (const entry of CATALOGUE) {
    const item = tableItem({ entry, class: entry.class, movable: 'temporal' in entry.date });
    if (item === null) assert.equal(entry.kind, 'commemoration', entry.key);
    else assert.ok(item >= 1 && item <= 28, entry.key);
  }
});

test('every universal 1st class feast is celebrated exactly once a year, on its date or transferred, unless no. 95 omits it', () => {
  const firstClass = CATALOGUE.filter((e) => e.scope === 'universal' && e.class === 1 && e.kind === 'feast' && !e.formularyOf)
    .map((e) => e.key);
  const omittedYears = [];
  for (const year of YEARS) {
    const days = resolveYear(year);
    const counts = new Map();
    for (const day of days) counts.set(day.celebration.key, (counts.get(day.celebration.key) ?? 0) + 1);
    // no. 95: the Precious Blood is omitted when the Sacred Heart falls on its date.
    const sacredHeartOnFirstOfJuly = days.find((day) => day.date === `${year}-07-01`).celebration.key === 'pent02-5';
    if (sacredHeartOnFirstOfJuly) omittedYears.push(year);
    for (const key of firstClass) {
      const expected = key === 'the-precious-blood-of-our-lord-jesus-christ' && sacredHeartOnFirstOfJuly ? 0 : 1;
      assert.equal(counts.get(key) ?? 0, expected, `${key} in ${year}`);
    }
  }
  assert.deepEqual(omittedYears, [2011, 2095]);
});

test('the rubrics decide these cases', () => {
  // no. 15: the Immaculate Conception is preferred to the Sunday of Advent.
  assert.equal(celebrated('2024-12-08').key, 'immaculate-conception-of-the-blessed-virgin-mary');
  // no. 30a: the Vigil of Christmas takes the place of the Fourth Sunday of Advent.
  assert.equal(celebrated('2023-12-24').key, 'vigil-of-christmas');
  // no. 91 item 8 and no. 96b: All Souls yields to a Sunday and moves to Monday.
  assert.equal(celebrated('2025-11-02').key, 'pent21-0');
  assert.deepEqual(
    { key: celebrated('2025-11-03').key, from: celebrated('2025-11-03').transferredFrom, masses: celebrated('2025-11-03').masses.length },
    { key: 'commemoration-of-all-souls', from: '2025-11-02', masses: 3 },
  );
  // no. 96a: the Annunciation, impeded in Holy Week, goes to the Monday after Low Sunday.
  assert.equal(celebrated('2024-03-25').key, 'quad6-1');
  assert.equal(celebrated('2024-04-08').key, 'annunciation-of-the-blessed-virgin-mary');
  // no. 16a: a 2nd class feast of the Lord takes a 2nd class Sunday.
  assert.equal(celebrated('2023-08-06').key, 'transfiguration-of-our-lord');
  // no. 91 items 15 and 16: a 2nd class Sunday precedes a 2nd class feast not of the Lord.
  assert.equal(celebrated('2024-09-08').key, 'pent16-0');
  // no. 33: St. Lawrence yields to Sunday in 2025, so his vigil is omitted; no. 78 then gives Our Lady.
  assert.equal(celebrated('2025-08-10').key, 'pent09-0');
  assert.equal(celebrated('2025-08-09').key, 'our-lady-on-saturday-after-pentecost');
  // no. 17(a): Holy Name on 2 January when 1 January is a Sunday.
  assert.equal(celebrated('2023-01-02').key, 'nat2-0');
  // nos. 96-97: the Sacred Heart outranks the Nativity of St. John, which moves to the next free day.
  assert.equal(celebrated('2022-06-24').key, 'pent02-5');
  assert.deepEqual([celebrated('2022-06-25').key, celebrated('2022-06-25').transferredFrom], ['nativity-of-st-john-the-baptist', '2022-06-24']);
  // no. 24: Advent ferias of 17-23 December and the Advent ember days are 2nd class; no. 25b: earlier ones 3rd.
  assert.deepEqual([celebrated('2026-12-17').key, celebrated('2026-12-17').class], ['adv3-4', 2]);
  assert.deepEqual([celebrated('2026-12-16').key, celebrated('2026-12-16').class], ['adv3-3', 2]);
  assert.deepEqual([celebrated('2026-12-15').key, celebrated('2026-12-15').class], ['adv3-2', 3]);
  // no. 95: of two feasts of the same divine Person the lower is omitted, not transferred.
  assert.equal(celebrated('2011-07-01').key, 'pent02-5');
  assert.deepEqual([celebrated('2011-07-04').key, celebrated('2011-07-04').class], ['pent03-1', 4]);
  // no. 96: a 1st class feast impeded by a feast of another Person is still transferred.
  assert.equal(celebrated('2038-06-25').key, 'nativity-of-st-john-the-baptist');
});

test('a 4th class feria takes the colour of its season', () => {
  const colours = (date) => [celebrated(date).key, celebrated(date).colors];
  // nos. 72, 119a and 127a: the same Friday of the week after Epiphany is white to 13 January, green from the 14th.
  assert.deepEqual(colours('2029-01-12'), ['epi1-5', ['white']]);
  assert.deepEqual(colours('2030-01-18'), ['epi1-5', ['green']]);
  // nos. 88 and 130a: the Rogation days are white ferias of Paschaltide; violet is for the procession and its Mass.
  assert.deepEqual(colours('2028-05-22'), ['pasc5-1', ['white']]);
  assert.deepEqual(colours('2028-05-23'), ['pasc5-2', ['white']]);
  // The weeks after Epiphany resumed in November keep their green.
  assert.deepEqual(colours('2027-11-05'), ['epi4-5', ['green']]);
});

test('Christmas has its three Masses', () => {
  assert.deepEqual(celebrated('2026-12-25').masses, [
    'the-nativity-of-our-lord', 'the-nativity-of-our-lord-morning-mass', 'the-nativity-of-our-lord-day-mass',
  ]);
});

test('a national layer changes the celebration', () => {
  const pl = new Map(resolveYear(2026, { nations: ['pl'] }).map((day) => [day.date, day.celebration.key]));
  assert.equal(pl.get('2026-05-08'), 'pl-st-stanislai-episcopi-et-martyris');
  assert.notEqual(celebrated('2026-05-08').key, 'pl-st-stanislai-episcopi-et-martyris');
  assert.equal(celebrated('2026-05-07').key, 'st-stanislaus');
  assert.notEqual(pl.get('2026-05-07'), 'st-stanislaus');
});
