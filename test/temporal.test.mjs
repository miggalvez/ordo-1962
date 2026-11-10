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

test('every fixed observance Missale Meum shows is a candidate on its date, or was moved by a rule', () => {
  const moved = new Map();
  for (const year of YEARS) {
    const candidates = fixedFeasts(year);
    for (const [date, celebration, , , commemorations, displaced] of oracle(year)) {
      const here = new Set(candidates.get(date) ?? []);
      for (const key of [...celebration, ...commemorations, ...displaced]) {
        if (!byKey.get(key) || !('fixed' in byKey.get(key).date)) continue;
        if (!here.has(key)) moved.set(key, [...(moved.get(key) ?? []), date]);
      }
    }
  }
  // Moves are the resolver's job (M3/M4). They should only be the leap-year
  // moves of 24 and 27 February, All Souls on a Sunday, and transferred I class feasts.
  const unexpected = [...moved.keys()].filter((key) => {
    const entry = byKey.get(key);
    return entry.class !== 1 && !['02-24', '02-27'].includes(entry.date.fixed);
  });
  assert.deepEqual(unexpected, []);
  assert.ok(moved.has('st-matthias'), 'St. Matthias moves to 25 February in leap years');
});

test('fixed feasts follow a national layer', () => {
  assert.ok(fixedFeasts(2026).get('2026-05-07').includes('st-stanislaus'));
  assert.ok(!fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-07').includes('st-stanislaus'));
  assert.ok(fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-08').includes('pl-st-stanislai-episcopi-et-martyris'));
  assert.ok(!(fixedFeasts(2026).get('2026-05-08') ?? []).includes('pl-st-stanislai-episcopi-et-martyris'));
  assert.throws(() => fixedFeasts(2026, { nations: ['xx'] }), /no layer/);
});
