import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CATALOGUE, easterSunday, fixedFeasts, movableDates, temporalYear } from '../dist/esm/index.js';

const YEARS = Array.from({ length: 139 }, (_, i) => 1962 + i);
const oracle = (year) => JSON.parse(readFileSync(new URL(`../data/oracle/missalemeum/${year}.json`, import.meta.url), 'utf8'));
const byKey = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
const iso = (day) => new Date(day * 86_400_000).toISOString().slice(0, 10);

test('Easter falls on the published dates', () => {
  const known = {
    1962: '1962-04-22', 2000: '2000-04-23', 2008: '2008-03-23', 2011: '2011-04-24', 2026: '2026-04-05',
    2027: '2027-03-28', 2028: '2028-04-16', 2038: '2038-04-25', 2100: '2100-03-28',
  };
  for (const [year, date] of Object.entries(known)) assert.equal(iso(easterSunday(Number(year))), date, year);
});

test('the dates follow the General Rubrics for 2026', () => {
  assert.deepEqual(movableDates(2026), {
    easter: '2026-04-05',
    septuagesima: '2026-02-01',
    ashWednesday: '2026-02-18',
    pentecost: '2026-05-24',
    holyFamily: '2026-01-11',
    holyName: '2026-01-04',
    septemberEmberWednesday: '2026-09-23',
    christTheKing: '2026-10-25',
    lastSundayAfterPentecost: '2026-11-22',
    firstSundayOfAdvent: '2026-11-29',
    sundayWithinChristmasOctave: '2026-12-27',
  });
  // 1 January 2023 was a Sunday, so the Holy Name moved to 2 January (no. 17(a)).
  assert.equal(movableDates(2023).holyName, '2023-01-02');
  // 6 January 2030 is a Sunday, so the Holy Family is the next Sunday.
  assert.equal(movableDates(2030).holyFamily, '2030-01-13');
});

test('every movable day matches Missale Meum on every date from 1962 to 2100', () => {
  const differences = [];
  for (const year of YEARS) {
    const { tempora } = temporalYear(year);
    for (const row of oracle(year)) {
      const [date, , , , , , expected] = row;
      const actual = tempora.get(date) ?? [];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push(`${date}: ${actual} != ${expected}`);
    }
  }
  assert.deepEqual(differences.slice(0, 20), []);
});

test('the Holy Name and Christ the King are celebrated on their computed dates', () => {
  for (const year of YEARS) {
    const { computedFeasts } = temporalYear(year);
    const celebrated = new Map();
    for (const [date, celebration] of oracle(year)) {
      for (const key of celebration) if (key === 'nat2-0' || key === 'christ-the-king') celebrated.set(key, date);
    }
    const computed = new Map([...computedFeasts].flatMap(([date, keys]) => keys.map((key) => [key, date])));
    assert.deepEqual(computed, celebrated, String(year));
  }
});

const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function expectedPlacement(year, entries) {
  const expected = new Map();
  for (const entry of entries) {
    const monthDay = isLeap(year) && entry.date.leapYear ? entry.date.leapYear : entry.date.fixed;
    expected.set(entry.key, `${year}-${monthDay}`);
  }
  return expected;
}

function placedOnce(candidates) {
  const placed = new Map();
  const repeated = [];
  for (const [date, keys] of candidates) {
    for (const key of keys) {
      if (placed.has(key)) repeated.push(key);
      placed.set(key, date);
    }
  }
  return { placed, repeated };
}

test('every fixed universal observance is placed exactly once, on its own date, every year', () => {
  const universal = CATALOGUE.filter((entry) => 'fixed' in entry.date && entry.scope === 'universal');
  for (const year of YEARS) {
    const { placed, repeated } = placedOnce(fixedFeasts(year));
    assert.deepEqual(repeated, [], String(year));
    assert.deepEqual(placed, expectedPlacement(year, universal), String(year));
  }
});

test('with the Polish layer, each observance is placed exactly once, on its own date', () => {
  const pl = JSON.parse(readFileSync(new URL('../data/layers/pl.json', import.meta.url), 'utf8'));
  const removed = new Set(pl.operations.flatMap((op) => (op.op === 'remove' ? [op.key] : op.replaces ? [op.replaces] : [])));
  const entries = CATALOGUE.filter((entry) => 'fixed' in entry.date
    && ((entry.scope === 'universal' && !removed.has(entry.key)) || entry.nation === 'pl'));
  for (const year of [2026, 2027, 2028]) {
    const { placed, repeated } = placedOnce(fixedFeasts(year, { nations: ['pl'] }));
    assert.deepEqual(repeated, [], String(year));
    assert.deepEqual(placed, expectedPlacement(year, entries), String(year));
  }
  for (const op of pl.operations.filter((o) => o.op === 'order')) {
    assert.deepEqual(fixedFeasts(2026, { nations: ['pl'] }).get(`2026-${op.date}`), op.keys, op.date);
  }
});

// Missale Meum moves these by its rules; the resolver (M3/M4) must do the same.
const TRANSFERRED = [
  'annunciation-of-the-blessed-virgin-mary',
  'commemoration-of-all-souls',
  'commemoration-of-all-souls-second-mass',
  'commemoration-of-all-souls-third-mass',
  'nativity-of-st-john-the-baptist',
  'st-joseph-spouse-of-the-bl-virgin-mary',
  'st-joseph-the-workman',
  'sts-peter-and-paul',
  'the-precious-blood-of-our-lord-jesus-christ',
];

test('Missale Meum shows fixed observances on their placed date, except the named transfers, which only move later', () => {
  const moved = new Map();
  for (const year of YEARS) {
    const candidates = fixedFeasts(year);
    const { placed } = placedOnce(candidates);
    for (const [date, celebration, , , commemorations, displaced] of oracle(year)) {
      const here = new Set(candidates.get(date) ?? []);
      for (const key of [...celebration, ...commemorations, ...displaced]) {
        const entry = byKey.get(key);
        if (!entry || !('fixed' in entry.date) || here.has(key)) continue;
        // Missale Meum places St. Matthias and St. Gabriel on their usual date and
        // then moves them, so in a leap year it also lists them as displaced there.
        const leapArtefact = entry.date.leapYear && isLeap(year) && date === `${year}-${entry.date.fixed}`
          && displaced.includes(key) && !celebration.includes(key) && !commemorations.includes(key);
        if (leapArtefact) continue;
        assert.ok(date > placed.get(key), `${key} moved back from ${placed.get(key)} to ${date}`);
        moved.set(key, [...(moved.get(key) ?? []), date]);
      }
    }
  }
  assert.deepEqual([...moved.keys()].sort(), TRANSFERRED);
});

test('St. Matthias and St. Gabriel move one day later only in a leap year', () => {
  const on = (year, monthDay) => fixedFeasts(year).get(`${year}-${monthDay}`) ?? [];
  for (const year of [2000, 2028]) {
    assert.ok(!on(year, '02-24').includes('st-matthias'), String(year));
    assert.ok(on(year, '02-25').includes('st-matthias'), String(year));
    assert.ok(!on(year, '02-27').includes('st-gabriel-of-our-lady-of-sorrows'), String(year));
    assert.ok(on(year, '02-28').includes('st-gabriel-of-our-lady-of-sorrows'), String(year));
  }
  for (const year of [2026, 2100]) {
    assert.ok(on(year, '02-24').includes('st-matthias'), String(year));
    assert.ok(!on(year, '02-25').includes('st-matthias'), String(year));
    assert.ok(on(year, '02-27').includes('st-gabriel-of-our-lady-of-sorrows'), String(year));
    assert.ok(!on(year, '02-28').includes('st-gabriel-of-our-lady-of-sorrows'), String(year));
  }
});

test('same-day observances keep the order the calendar lists them in', () => {
  assert.deepEqual(fixedFeasts(1963).get('1963-01-19'), ['sts-marius-martha-audifax-and-abachum', 'st-canute-martyr']);
  assert.deepEqual(fixedFeasts(2026).get('2026-12-25'), [
    'the-nativity-of-our-lord', 'the-nativity-of-our-lord-morning-mass', 'the-nativity-of-our-lord-day-mass',
  ]);
  for (const year of [1963, 2026, 2028]) {
    for (const [date, keys] of fixedFeasts(year)) {
      const orders = keys.map((key) => byKey.get(key).dayOrder);
      assert.deepEqual(orders, [...orders].sort((a, b) => a - b), date);
    }
  }
});

test('returned lists are copies and the shared data is frozen', () => {
  const first = temporalYear(2026);
  first.tempora.get('2026-03-27').reverse();
  first.computedFeasts.get('2026-10-25').push('x');
  fixedFeasts(2026).get('2026-12-25').reverse();
  const again = temporalYear(2026);
  assert.deepEqual(again.tempora.get('2026-03-27'), ['quad5-5', 'seven-sorrows-in-passiontide']);
  assert.deepEqual(again.computedFeasts.get('2026-10-25'), ['christ-the-king']);
  assert.equal(fixedFeasts(2026).get('2026-12-25')[0], 'the-nativity-of-our-lord');
  assert.ok(Object.isFrozen(CATALOGUE) && Object.isFrozen(CATALOGUE[0]) && Object.isFrozen(CATALOGUE[0].colors));
  assert.throws(() => { CATALOGUE[0].colors.push('red'); }, TypeError);
});

test('fixed feasts follow a national layer', () => {
  assert.ok(fixedFeasts(2026).get('2026-05-07').includes('st-stanislaus'));
  assert.ok(!fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-07').includes('st-stanislaus'));
  assert.ok(fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-08').includes('pl-st-stanislai-episcopi-et-martyris'));
  assert.ok(!(fixedFeasts(2026).get('2026-05-08') ?? []).includes('pl-st-stanislai-episcopi-et-martyris'));
  assert.throws(() => fixedFeasts(2026, { nations: ['xx'] }), /no layer/);
});
