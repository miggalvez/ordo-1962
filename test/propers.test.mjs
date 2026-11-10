import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CATALOGUE, DEDICATION_KEY, LAYERS, fixedFeasts, resolveDay, resolveYear } from '../dist/esm/index.js';
import { isOfOurLady } from '../dist/esm/commemorations.js';
import { batches, checkTitulars } from '../scripts/check-titulars.mjs';
import { SNAPSHOTS, compareSnapshot } from '../scripts/snapshot.mjs';

const FSSP = { nations: ['us'], institutes: ['fssp'] };
const day = (date, options = FSSP) => resolveDay(date, options);
const both = (date, options = FSSP) => {
  const d = day(date, options);
  return [d.celebration.key, d.commemorations];
};
/** Where an observance is celebrated in a year: [date, class, transferredFrom]. */
const kept = (year, key, options) => resolveYear(year, options)
  .filter((d) => d.celebration.key === key)
  .map((d) => [d.date, d.celebration.class, d.celebration.transferredFrom ?? null]);
const read = (name) => JSON.parse(readFileSync(new URL(`../data/layers/${name}.json`, import.meta.url), 'utf8'));

test('the United States and FSSP layers are well formed', () => {
  for (const [name, field, scope] of [['us', 'nation', 'national'], ['fssp', 'institute', 'institute']]) {
    const layer = read(name);
    assert.equal(LAYERS[name][field], name);
    assert.ok(layer.source && layer.toConfirm.length, `${name}: no source or nothing left to confirm`);
    for (const o of layer.observances ?? []) {
      for (const lang of ['la', 'en', 'es']) assert.ok(o.names[lang], `${o.key}: no ${lang} name`);
      assert.ok(o.source, `${o.key}: no source`);
      assert.equal(CATALOGUE.find((e) => e.key === o.key).scope, scope, o.key);
      assert.ok(layer.operations.some((op) => op.op === 'add' && op.key === o.key), `${o.key} is never added`);
    }
    for (const op of layer.operations.filter((o) => o.op === 'raise')) assert.ok(op.source, `${op.key}: raised without a source`);
  }
});

test('the layers apply only when asked for', () => {
  assert.equal(day('2026-11-13', {}).celebration.key, 'st-didacus');
  assert.equal(day('2026-11-13', { nations: ['us'] }).celebration.key, 'us-st-frances-xavier-cabrini');
  assert.equal(day('2027-02-22', {}).celebration.class, 2);
  assert.equal(day('2027-02-22', { nations: ['us'] }).celebration.class, 2);
  assert.equal(day('2027-02-22', { institutes: ['fssp'] }).celebration.class, 1);
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
  // A layer says which of its feasts are of Our Lady (no. 112d).
  assert.ok(isOfOurLady(CATALOGUE.find((e) => e.key === 'us-our-lady-of-guadalupe')));
});

test('the Fraternity keeps the Chair of St. Peter as of the 1st class (no. 46)', () => {
  // The key stays, so St. Paul's inseparable prayer still follows it (no. 110).
  const feast = day('2027-02-22');
  assert.deepEqual([feast.celebration.key, feast.celebration.class, feast.inseparable], ['chair-of-st-peter', 1, ['st-paul']]);
  // 22 February 2026 is the 1st Sunday of Lent: the feast goes to Monday (no. 96), the Lenten feria is its
  // one privileged commemoration (nos. 109e, 111a), and St. Peter Damian, 3rd class, is not commemorated.
  assert.deepEqual(both('2026-02-22'), ['quad1-0', []]);
  const monday = day('2026-02-23');
  assert.deepEqual(
    [monday.celebration.key, monday.celebration.class, monday.celebration.transferredFrom, monday.commemorations, monday.inseparable],
    ['chair-of-st-peter', 1, '2026-02-22', ['quad1-1'], ['st-paul']],
  );
  assert.deepEqual(kept(2026, 'chair-of-st-peter', FSSP), [['2026-02-23', 1, '2026-02-22']]);
});

test('Masses for certain places on the seminary page are not commemorations of the calendar', () => {
  // data/ordos/fssp.json offers them as Masses of a 4th class day (test/ordo.test.mjs).
  assert.deepEqual(both('2026-05-08'), ['pasc4-5', []]);
  assert.deepEqual(both('2026-07-06'), ['pent06-1', []]);
  assert.equal(read('fssp').notInTheCalendar, undefined);
  assert.ok(!CATALOGUE.some((e) => /^fssp-/.test(e.key)));
});

test('a church raises its titular to the 1st class', () => {
  const church = { titular: { key: 'st-anne-mother-of-the-blessed-virgin' } };
  const anne = day('2026-07-26', { church });
  assert.deepEqual([anne.celebration.key, anne.celebration.class], ['st-anne-mother-of-the-blessed-virgin', 1]);
  // 26 July 2026 is a Sunday: the titular, a 1st class feast not of the Lord, keeps the Sunday as a commemoration.
  assert.deepEqual(anne.commemorations, ['pent09-0']);
  assert.equal(day('2026-07-26', {}).celebration.key, 'pent09-0');
  // A titular already of the 1st class keeps its higher place, movable or not.
  assert.equal(day('2026-03-19', { church: { titular: { key: 'st-joseph-spouse-of-the-bl-virgin-mary' } } }).celebration.class, 1);
  for (const key of ['pent01-0', 'pent01-4', 'pent02-5', 'pasc5-4', 'christ-the-king']) {
    assert.deepEqual(kept(2026, key, { church: { titular: { key } } }), kept(2026, key, {}), key);
  }
});

test('a raised titular keeps the date the calendar gives it', () => {
  // Movable: the Holy Family, 2nd class, on the Sunday after the Epiphany.
  assert.deepEqual(kept(2026, 'epi1-0', { church: { titular: { key: 'epi1-0' } } }), [['2026-01-11', 1, null]]);
  assert.deepEqual(kept(2026, 'nat2-0', { church: { titular: { key: 'nat2-0' } } }), [['2026-01-04', 1, null]]);
  // Leap years: St. Matthias on the 25th and St. Gabriel on the 28th of February.
  for (const [key, common, leap] of [['st-matthias', '2027-02-24', '2028-02-25'], ['st-gabriel-of-our-lady-of-sorrows', '2027-02-27', '2028-02-28']]) {
    const church = { titular: { key } };
    assert.deepEqual([kept(2027, key, { church }), kept(2028, key, { church })], [[[common, 1, null]], [[leap, 1, null]]], key);
  }
});

test('a titular is raised where the nation keeps it', () => {
  // Poland keeps St. Stanislaus on 8 May under its own entry: that one is the titular, and 7 May has no feast of his.
  const church = { titular: { key: 'st-stanislaus' } };
  const days = resolveYear(2026, { nations: ['pl'], church });
  assert.deepEqual(days.filter((d) => ['st-stanislaus', 'pl-st-stanislai-episcopi-et-martyris'].includes(d.celebration.key)).map((d) => [d.date, d.celebration.key, d.celebration.class]),
    [['2026-05-08', 'pl-st-stanislai-episcopi-et-martyris', 1]]);
  // Without the Polish proper he is raised on the universal date.
  assert.deepEqual(kept(2026, 'st-stanislaus', { church }), [['2026-05-07', 1, null]]);
  assert.throws(() => resolveYear(2026, { nations: ['pl'], church: { titular: { key: 'st-george' } } }), /not kept in this calendar/);
});

test('the anniversary of the dedication is a 1st class feast of the Lord', () => {
  const church = { dedication: '10-03' };
  // 3 October 2027 is a Sunday: the dedication takes it without a commemoration of the Sunday (nos. 16a, 112b).
  assert.deepEqual(both('2027-10-03', { church }), [DEDICATION_KEY, []]);
  assert.ok(fixedFeasts(2027, { church }).get('2027-10-03').includes(DEDICATION_KEY));
});

test("a church's feasts on one date follow the order of the table (no. 91 item 12)", () => {
  // The patron of the place, then the dedication, then the titular, whatever their keys.
  for (const [patron, titular] of [['a-patron', 'z-titular'], ['z-patron', 'a-titular']]) {
    const church = {
      patrons: [{ key: patron, date: '10-06', colors: ['red'] }],
      dedication: '10-06',
      titular: { key: titular, date: '10-06', colors: ['white'] },
    };
    // Each then has its own day for good (nos. 100-102): 6 October, and the next days not of the 1st or 2nd class.
    const days = resolveYear(2027, { church }).filter((d) => [patron, titular, DEDICATION_KEY].includes(d.celebration.key));
    assert.deepEqual(days.map((d) => [d.date, d.celebration.key, d.celebration.transferredFrom ?? null]),
      [['2027-10-06', patron, null], ['2027-10-08', DEDICATION_KEY, null], ['2027-10-09', titular, null]]);
  }
  // One saint who is both patron of the town and titular is kept once.
  const anne = { key: 'st-anne-mother-of-the-blessed-virgin' };
  assert.deepEqual(kept(2027, anne.key, { church: { titular: anne, patrons: [anne] } }), [['2027-07-26', 1, null]]);
  assert.throws(() => resolveYear(2026, { church: { titular: { key: 'x', date: '05-05', colors: ['white'] }, patrons: [{ key: 'x', date: '05-06', colors: ['white'] }] } }), /given twice, differently/);
});

test('a feast always impeded in a church has another day for good (nos. 100-102)', () => {
  // The dedication on 10 August: St. Lawrence, 2nd class, is kept on the 11th every year, not dropped.
  const church = { dedication: '08-10' };
  for (const year of [2026, 2027, 2028]) {
    assert.deepEqual(both(`${year}-08-10`, { church }), [DEDICATION_KEY, []]);
    assert.deepEqual(kept(year, 'st-lawrence', { church }), [[`${year}-08-11`, 2, null]], String(year));
    // His vigil no longer precedes his feast.
    assert.notEqual(day(`${year}-08-09`, { church }).celebration.key, 'vigil-of-st-lawrence');
  }
  // The 11th is his own day there: on a Sunday he is commemorated as on any 2nd class Sunday (no. 111b).
  assert.deepEqual(both('2030-08-11', { church }), ['pent09-0', ['st-lawrence']]);
  assert.deepEqual(fixedFeasts(2027, { church }).get('2027-08-11').slice(-1), ['st-lawrence']);
  // The church's own feast gives way to a higher one in the same manner: a titular on the Assumption
  // passes St. Joachim, 2nd class, to the 17th.
  const church15 = { titular: { key: 'st-local', date: '08-15', colors: ['red'] } };
  assert.deepEqual(kept(2027, 'st-local', { church: church15 }), [['2027-08-17', 1, null]]);
  assert.deepEqual(kept(2027, 'st-joachim-father-of-the-blessed-virgin', { church: church15 }), [['2027-08-16', 2, null]]);
  // From Christmas day the next day not of the 1st or 2nd class is 2 January.
  assert.deepEqual(kept(2027, DEDICATION_KEY, { church: { dedication: '12-25' } }), [['2027-01-02', 1, null]]);
  // Without a church nothing is reassigned.
  assert.deepEqual(kept(2027, 'st-lawrence', FSSP), [['2027-08-10', 2, null]]);
});

test('a church feast is checked before it is used', () => {
  const titular = (feast) => () => resolveYear(2026, { church: { titular: feast } });
  assert.throws(titular({ key: 'st-unknown' }), /needs a date/);
  for (const date of ['13-01', '02-30', '04-31', '6-12']) assert.throws(titular({ key: 'st-unknown', date, colors: ['white'] }), /needs a date/, date);
  assert.throws(titular({ key: 'st-unknown', date: '02-29', colors: ['white'] }), /29 February/);
  assert.throws(titular({ key: 'st-unknown', date: '05-01' }), /needs colors/);
  assert.throws(titular({ key: 'st-unknown', date: '05-01', colors: ['purple'] }), /not a liturgical colour/);
  assert.throws(titular({ key: 'st-anne-mother-of-the-blessed-virgin', date: '07-26' }), /without a date/);
  assert.throws(titular({ key: 'pent03-0' }), /not a feast/);
  assert.throws(titular({ key: DEDICATION_KEY, date: '05-05', colors: ['white'] }), /give its date as `dedication`/);
  assert.throws(() => resolveYear(2026, { church: { dedication: '04-31' } }), /the dedication needs a date/);
});

test('a 1st class titular on any date is kept once a year and erases nothing, 2026-2055', () => {
  // Twenty-four titulars at a time, about two weeks apart, together on every date of the year: each is
  // celebrated once, on its day, on the day it has for good (nos. 100-102) or transferred (no. 96), and no
  // fixed feast of the 1st or 2nd class is left on its day to be dropped.
  // `node scripts/check-titulars.mjs` runs one at a time.
  const groups = batches(24);
  assert.equal(groups.flat().length, 365);
  for (const group of groups) assert.deepEqual(checkTitulars(2026, 2055, group), []);
});

test('the dedication is transferred, not omitted, when a feast of the Lord falls on it (nos. 95-96)', () => {
  const at = (date, dedication) => {
    const d = day(date, { ...FSSP, church: { dedication } });
    return [d.celebration.key, d.celebration.class, d.celebration.colors, d.celebration.transferredFrom ?? null, d.commemorations];
  };
  // The FSSP's shrine at Warrington keeps the dedication of its cathedral on 14 May. In 2026 the Ascension
  // fell on that Thursday, and its bulletin has the dedication, 1st class, on Friday the 15th. (That is the
  // cathedral's anniversary; a church's own has the same rank and the same Common.)
  assert.deepEqual(at('2026-05-14', '05-14'), ['pasc5-4', 1, ['white'], null, []]);
  assert.deepEqual(at('2026-05-15', '05-14'), [DEDICATION_KEY, 1, ['white'], '2026-05-14', []]);
  // The Sacred Heart on Friday 12 June 2026: the dedication is kept on Saturday the 13th, where
  // St. Anthony of Padua, 3rd class, leaves the day free and is not commemorated (no. 111a).
  assert.deepEqual(at('2026-06-12', '06-12'), ['pent02-5', 1, ['white'], null, []]);
  assert.deepEqual(at('2026-06-13', '06-12'), [DEDICATION_KEY, 1, ['white'], '2026-06-12', []]);
  assert.ok(day('2026-06-13', { ...FSSP, church: { dedication: '06-12' } }).displaced.includes('st-anthony-of-padua'));

  // Every year of 2026-2055, for each movable feast of the Lord that can fall on a dedication.
  for (const feast of ['pasc5-4', 'pent01-4', 'pent02-5', 'christ-the-king']) {
    for (let year = 2026; year <= 2055; year += 1) {
      const own = resolveYear(year).find((d) => d.celebration.key === feast).date;
      const days = resolveYear(year, { church: { dedication: own.slice(5) } });
      assert.equal(days.find((d) => d.date === own).celebration.key, feast, own);
      // Kept once, on a later day, transferred from its own date. Where a fixed feast always holds that
      // date (24 June, the Nativity of St. John), the dedication's own day is the next one for good.
      const found = days.filter((d) => d.celebration.key === DEDICATION_KEY);
      assert.equal(found.length, 1, `${feast} ${year}: kept ${found.length} times`);
      assert.ok(found[0].date > own, `${own}: kept on ${found[0].date}`);
      const home = [...fixedFeasts(year, { church: { dedication: own.slice(5) } })].find(([, keys]) => keys.includes(DEDICATION_KEY))[0];
      assert.equal(found[0].celebration.transferredFrom, home === own ? own : undefined, own);
      if (home !== own) assert.equal(own.slice(5), '06-24');
    }
  }
  // Two feasts of the same divine Person are another matter: the Precious Blood is still omitted
  // when the Sacred Heart falls on 1 July (test/resolver.test.mjs).
  assert.equal(resolveYear(2011, FSSP).filter((d) => d.celebration.key === 'the-precious-blood-of-our-lord-jesus-christ').length, 0);
});

test('whole years with the United States and FSSP propers match their snapshots', () => {
  for (const { name, options, years } of SNAPSHOTS) {
    for (const year of years) assert.deepEqual(compareSnapshot(name, year, options), [], `${name} ${year}: run "npm run snapshot" and review the diff`);
  }
});
