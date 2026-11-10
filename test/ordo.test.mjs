import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MASSES, ORDOS, nameOf, ordoDay, ordoYear, resolveYear } from '../dist/esm/index.js';

// The Masses an ordo offers (src/ordo.ts). Numbers are those of the Rubricae
// generales Missalis in the Code of Rubrics (1960).

const US_FSSP = { nations: ['us'], institutes: ['fssp'] };
const FSSP_ORDO = { ...US_FSSP, ordo: 'fssp' };
const masses = (date, options = {}) => ordoDay(date, options).masses;
const keys = (date, options = {}) => masses(date, options).map((mass) => mass.key);
const find = (date, key, options = {}) => masses(date, options).find((mass) => mass.key === key);

test('every day lists the Masses of its celebration, and without an ordo they come first', () => {
  for (const year of [2026, 2027, 2038]) {
    const resolved = resolveYear(year, US_FSSP);
    ordoYear(year, US_FSSP).forEach((day, i) => {
      const own = resolved[i].celebration.masses;
      assert.deepEqual(day.masses.slice(0, own.length).map((mass) => [mass.key, mass.kind]), own.map((key) => [key, 'day']), day.date);
      assert.deepEqual(day.masses[0].commemorations, resolved[i].commemorations, day.date);
    });
  }
  assert.deepEqual(keys('2026-12-25'), ['the-nativity-of-our-lord', 'the-nativity-of-our-lord-morning-mass', 'the-nativity-of-our-lord-day-mass']);
});

test('every Mass offered has a title in Latin, English and Spanish', () => {
  const seen = new Set();
  for (const year of [2026, 2027]) for (const day of ordoYear(year, FSSP_ORDO)) for (const mass of day.masses) seen.add(mass.key);
  for (const key of [...seen, ...Object.keys(MASSES)]) {
    for (const language of ['la', 'en', 'es']) assert.ok(nameOf(key, language), `${key} (${language})`);
  }
  assert.equal(nameOf('votive-sacred-heart-of-jesus', 'es'), 'Misa votiva del Sagrado Corazón de Jesús');
  assert.equal(nameOf('requiem-daily', 'en'), 'Daily Mass for the Dead');
});

test('the first Thursday, Friday and Saturday votive Masses are of the 3rd class, on 3rd and 4th class days (nos. 384-385)', () => {
  assert.deepEqual(
    [find('2026-01-02', 'votive-sacred-heart-of-jesus'), find('2026-01-03', 'votive-immaculate-heart-of-mary'), find('2026-10-01', 'votive-jesus-christ-the-eternal-high-priest')]
      .map((mass) => [mass.kind, mass.class, mass.rubric, mass.condition]),
    [
      ['votive', 3, 'no. 385b', 'devotions-to-the-sacred-heart'],
      ['votive', 3, 'no. 385c', 'devotions-to-the-immaculate-heart'],
      ['votive', 3, 'no. 385a', 'devotions-for-the-clergy'],
    ],
  );
  assert.ok(find('2026-06-05', 'votive-sacred-heart-of-jesus'), 'a 3rd class feast admits it');
  assert.ok(!find('2026-05-01', 'votive-sacred-heart-of-jesus'), 'not on St. Joseph the Worker, 1st class');
  assert.ok(!find('2026-08-06', 'votive-jesus-christ-the-eternal-high-priest'), 'not on the Transfiguration, 2nd class');
  assert.ok(!find('2026-04-03', 'votive-sacred-heart-of-jesus'), 'not on Good Friday');
  assert.ok(!find('2026-01-09', 'votive-sacred-heart-of-jesus'), 'only on the first Friday');
  // No. 385a allows the first Thursday or the first Saturday; the ordo says which.
  assert.ok(!find('2026-10-03', 'votive-jesus-christ-the-eternal-high-priest'));
});

test('a votive Mass commemorates the office of the day and its commemorations, the season first (nos. 111d, 113, 386b)', () => {
  assert.deepEqual(find('2026-02-06', 'votive-sacred-heart-of-jesus').commemorations, ['st-titus', 'st-dorothy']);
  assert.deepEqual(find('2026-12-03', 'votive-jesus-christ-the-eternal-high-priest').commemorations, ['adv1-4', 'st-francis-xavier']);
  // Two at most: St. Barbara, the third, is omitted (no. 114).
  assert.deepEqual(find('2026-12-04', 'votive-sacred-heart-of-jesus').commemorations, ['adv1-5', 'st-peter-chrysologus']);
  // A 4th class feria and the Saturday office of Our Lady are not commemorated.
  assert.deepEqual(find('2026-09-04', 'votive-sacred-heart-of-jesus').commemorations, []);
  assert.deepEqual(find('2026-08-01', 'votive-immaculate-heart-of-mary').commemorations, ['holy-machabees']);
  // Of Our Lady on a feast of Our Lady: neither is commemorated in the other (nos. 112d, 317).
  assert.deepEqual(find('2028-08-05', 'votive-immaculate-heart-of-mary').commemorations, []);
});

test('Masses for the dead: the 3rd class within the octave of All Souls, the 4th class on ferias outside Christmastide (nos. 391, 415d, 416, 422, 423)', () => {
  assert.deepEqual([3, 4, 5, 6, 7].map((d) => find(`2026-11-0${d}`, 'requiem-daily')?.class), [3, 3, 3, 3, 3]);
  assert.ok(!find('2026-11-08', 'requiem-daily'), 'not on a Sunday');
  assert.ok(!find('2026-11-09', 'requiem-daily'), 'not on a 2nd class feast');
  assert.ok(!find('2026-11-10', 'requiem-daily'), 'not on a 3rd class feast after the octave');
  const daily = find('2026-01-19', 'requiem-daily');
  assert.deepEqual([daily.class, daily.rubric, daily.condition, daily.commemorations], [4, 'no. 423', 'applied-for-the-dead', []]);
  assert.ok(!find('2026-01-12', 'requiem-daily'), 'not in Christmastide');
  assert.ok(!find('2026-03-09', 'requiem-daily'), 'not on a 3rd class feria of Lent');
  for (const day of ordoYear(2026)) for (const mass of day.masses) if (mass.kind === 'requiem') assert.deepEqual(mass.commemorations, [], day.date);
});

test('the Mass of a commemorated saint on a 4th class day only; an impeded 3rd class feast on its day only if the feast impeding it is of the 3rd class (nos. 302-303)', () => {
  assert.deepEqual(find('2026-02-03', 'st-blaise'), { key: 'st-blaise', kind: 'commemoration', class: 4, colors: ['red'], commemorations: [], rubric: 'nos. 302b, 303b' });
  assert.deepEqual(find('2026-01-19', 'st-canute-martyr').commemorations, ['sts-marius-martha-audifax-and-abachum']);
  assert.ok(find('2026-01-05', 'st-telesphorus-pope-and-martyr'), 'on the feria of the universal calendar');
  assert.ok(!find('2026-01-05', 'st-telesphorus-pope-and-martyr', US_FSSP), 'not on St. John Neumann, 3rd class');
  const didacus = find('2026-11-13', 'st-didacus', US_FSSP);
  assert.deepEqual([didacus.kind, didacus.class, didacus.commemorations], ['impeded-feast', 3, ['us-st-frances-xavier-cabrini']]);
  // A 3rd class feast commemorated on a feria of Lent: the feria is not a feast (no. 303a).
  assert.deepEqual(keys('2026-03-07').filter((key) => key === 'st-thomas-aquinas'), []);
  assert.ok(!find('2026-04-25', 'for-the-rogations'), 'the greater litanies are not a Mass of a saint');
});

test('the Rogation Mass is a votive Mass of the 2nd class on the litanies, not on a 1st class day (nos. 80, 87, 341, 346)', () => {
  const mark = find('2026-04-25', 'rogation-mass');
  assert.deepEqual([mark.kind, mark.class, mark.colors, mark.commemorations, mark.condition], ['rogation', 2, ['violet'], ['st-mark'], 'rogation-procession']);
  for (const date of ['2026-05-11', '2026-05-12', '2026-05-13']) assert.ok(find(date, 'rogation-mass'), date);
  assert.ok(!find('2026-05-14', 'rogation-mass'), 'not on the Ascension');
  assert.ok(!find('2026-05-10', 'rogation-mass'));
  // 25 April 2011 was Easter Monday: the litanies go to Tuesday (no. 80), a 1st class day.
  assert.deepEqual(keys('2011-04-26'), ['pasc0-2']);
  assert.deepEqual(ordoDay('2011-04-26').commemorations, ['for-the-rogations']);
});

test('external solemnities on a Sunday of the 2nd class (nos. 341, 356-361)', () => {
  const sacredHeart = find('2026-06-14', 'pent02-5');
  assert.deepEqual([sacredHeart.kind, sacredHeart.class, sacredHeart.rubric], ['external-solemnity', 2, 'nos. 358a, 360']);
  // A feast of the Lord excludes the Sunday's commemoration, and the reverse (no. 112b).
  assert.deepEqual(sacredHeart.commemorations, []);
  assert.deepEqual(find('2026-10-04', 'our-lady-of-the-rosary').commemorations, ['pent19-0']);
  // In the United States, by indult: Corpus Christi and Sts. Peter and Paul on the following Sunday.
  assert.ok(!find('2026-06-07', 'pent01-4'));
  assert.equal(find('2026-06-07', 'pent01-4', US_FSSP).rubric, 'nos. 358c, 360');
  assert.ok(find('2026-07-05', 'sts-peter-and-paul', US_FSSP));
  // In 2027 Sts. Peter and Paul fall on a Tuesday and the solemnity is on 4 July.
  assert.ok(find('2027-07-04', 'sts-peter-and-paul', US_FSSP));
});

test("a church's titular, dedication and patron have their external solemnity on a Sunday (nos. 358d-f, 359)", () => {
  const lawrence = { titular: { key: 'st-lawrence' } };
  assert.deepEqual(find('2026-08-16', 'st-lawrence', { church: lawrence }).commemorations, ['pent12-0']);
  assert.ok(find('2026-08-09', 'st-lawrence', { church: { ...lawrence, externalSolemnity: 'preceding-sunday' } }));
  assert.ok(!find('2026-08-16', 'st-lawrence', { church: { ...lawrence, externalSolemnity: 'none' } }));
  // A titular kept on a Sunday needs none.
  assert.equal(masses('2026-08-02', { church: { titular: { key: 'st-alphonsus-liguori' } } }).filter((m) => m.kind === 'external-solemnity').length, 0);
  // St. Joseph on Thursday 19 March 2026: the next Sunday is Passion Sunday, of the 1st class.
  assert.deepEqual(keys('2026-03-22', { church: { titular: { key: 'st-joseph-spouse-of-the-bl-virgin-mary' } } }), ['quad5-0']);
  const dedication = find('2026-10-18', 'anniversary-of-the-dedication-of-the-church', { church: { dedication: '10-14' } });
  assert.equal(dedication.rubric, 'nos. 358e, 359, 360');
});

test('the FSSP ordo: what it prints first, what it leaves out, its Masses for certain places', () => {
  assert.throws(() => ordoDay('2026-01-02', { ordo: 'sspx' }), RangeError);
  assert.deepEqual(Object.keys(ORDOS), ['fssp']);
  const first = (date) => masses(date, FSSP_ORDO)[0].key;
  // The Requiem first on 4th class days of the octave of All Souls, before the first Friday's votive.
  assert.deepEqual(['2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07'].map(first), ['requiem-daily', 'st-charles-borromeo', 'requiem-daily', 'requiem-daily']);
  // The first Friday and Saturday votives first on a feria or a Saturday of Our Lady, second on a feast.
  assert.deepEqual(['2026-01-02', '2026-01-03', '2026-12-05', '2026-02-06'].map(first), ['votive-sacred-heart-of-jesus', 'votive-immaculate-heart-of-mary', 'votive-immaculate-heart-of-mary', 'st-titus']);
  // None in Lent, where no. 384 permits them; no daily Requiem outside the octave.
  assert.ok(find('2026-03-06', 'votive-sacred-heart-of-jesus'));
  assert.ok(!find('2026-03-06', 'votive-sacred-heart-of-jesus', FSSP_ORDO));
  assert.ok(!find('2026-01-19', 'requiem-daily', FSSP_ORDO));
  // Masses for certain places, on a 4th class day only, and only in this ordo.
  assert.deepEqual(keys('2026-05-08', FSSP_ORDO), ['pasc4-5', 'apparition-of-st-michael', 'our-lady-mediatrix-of-all-graces']);
  assert.deepEqual(keys('2026-05-08'), ['pasc4-5', 'requiem-daily']);
  assert.ok(!find('2027-08-01', 'st-peter-in-chains', FSSP_ORDO), 'a Sunday in 2027');
  assert.deepEqual(find('2026-08-01', 'st-peter-in-chains', FSSP_ORDO).commemorations, ['holy-machabees']);
});

const FSSP_PAGE = process.env.FSSP_PAGE;
test('against the whole FSSP 2026 page, the ordo\'s first Mass and its list differ only on the reviewed days, each in the reviewed way', { skip: !FSSP_PAGE && 'set FSSP_PAGE to run' }, async () => {
  const { compareMassesWithFssp } = await import('../scripts/compare-fssp.mjs');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/fssp-2026-masses.json', import.meta.url), 'utf8'));
  const reviewed = Object.assign({}, ...fixture.groups.map((group) => group.days));
  const found = Object.fromEntries(compareMassesWithFssp(readFileSync(FSSP_PAGE, 'utf8'), 2026, US_FSSP).map((d) => [d.date, d.line]));
  assert.deepEqual(found, reviewed);
});
