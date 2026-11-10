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

test('every day but Good Friday lists the Masses of its celebration, and without an ordo they come first', () => {
  for (const year of [2026, 2027, 2038]) {
    const resolved = resolveYear(year, US_FSSP);
    ordoYear(year, US_FSSP).forEach((day, i) => {
      if (day.celebration.key === 'quad6-5') return;
      const own = resolved[i].celebration.masses;
      assert.deepEqual(day.masses.slice(0, own.length).map((mass) => [mass.key, mass.kind]), own.map((key) => [key, 'day']), day.date);
      assert.deepEqual(day.masses[0].commemorations, resolved[i].commemorations, day.date);
    });
  }
  assert.deepEqual(keys('2026-12-25'), ['the-nativity-of-our-lord', 'the-nativity-of-our-lord-morning-mass', 'the-nativity-of-our-lord-day-mass']);
});

test('Good Friday has no Mass: the day is kept and the list is empty, with or without an ordo', () => {
  for (const year of [2026, 2027, 2038]) {
    for (const options of [{}, US_FSSP, FSSP_ORDO]) {
      const days = ordoYear(year, options).filter((day) => day.masses.length === 0);
      assert.deepEqual(days.map((day) => [day.celebration.key, day.celebration.class]), [['quad6-5', 1]], `${year}`);
    }
  }
  assert.equal(ordoDay('2026-04-03').date, '2026-04-03');
  // A first Friday that is Good Friday has no votive Mass either.
  assert.deepEqual(masses('2026-04-03', FSSP_ORDO), []);
  // The Mass of the Lord's Supper and the Mass of the Easter Vigil are Masses.
  assert.deepEqual(keys('2026-04-02'), ['quad6-4']);
  assert.deepEqual(keys('2026-04-04'), ['quad6-6']);
});

test('a Mass of the day has its own colours where a rite of another colour comes before it (nos. 119b, 126, 128b)', () => {
  // Palm Sunday: red for the palms, the Mass violet. The Easter Vigil: violet, its Mass white.
  assert.deepEqual([ordoDay('2026-03-29').celebration.colors, masses('2026-03-29')[0].colors], [['red', 'violet'], ['violet']]);
  assert.deepEqual([ordoDay('2026-04-04').celebration.colors, masses('2026-04-04')[0].colors], [['violet', 'white'], ['white']]);
  // Rose or violet on Gaudete and Laetare is a choice for the Mass itself.
  assert.deepEqual(masses('2026-03-15')[0].colors, ['rose', 'violet']);
  assert.deepEqual(masses('2026-12-13')[0].colors, ['rose', 'violet']);
  // Every other Mass of the day has the day's colours.
  for (const day of ordoYear(2026)) {
    for (const mass of day.masses) if (mass.kind === 'day' && !['quad6-0', 'quad6-6'].includes(mass.key)) assert.deepEqual(mass.colors, day.celebration.colors, day.date);
  }
});

test('each Mass of Christmas has its own commemorations: St. Anastasia at the second only', () => {
  for (const options of [{}, FSSP_ORDO]) {
    assert.deepEqual(masses('2026-12-25', options).map((mass) => [mass.key, mass.commemorations]), [
      ['the-nativity-of-our-lord', []],
      ['the-nativity-of-our-lord-morning-mass', ['st-anastasia']],
      ['the-nativity-of-our-lord-day-mass', []],
    ]);
  }
  assert.deepEqual(ordoDay('2026-12-25').commemorations, [], 'she is not a commemoration of the day');
  assert.deepEqual(['la', 'en', 'es'].map((language) => nameOf('st-anastasia', language)), ['S. Anastasiæ Martyris', 'St. Anastasia, Martyr', 'Santa Anastasia, mártir']);
  assert.deepEqual(masses('2026-11-02').map((mass) => mass.commemorations), [[], [], []]);
});

test('the Mass of the day cites the rubric of its office (nos. 270, 298, 299, 301)', () => {
  assert.deepEqual(['2026-06-14', '2026-06-15', '2026-06-13', '2026-06-20', '2026-01-02'].map((date) => masses(date)[0].rubric),
    ['no. 298', 'no. 299', 'no. 301', 'no. 270', 'no. 299']);
});

test('every Mass offered has a title in Latin, English and Spanish', () => {
  const seen = new Set();
  for (const year of [2026, 2027]) for (const day of ordoYear(year, FSSP_ORDO)) for (const mass of day.masses) seen.add(mass.key);
  for (const day of ordoYear(2026, FSSP_ORDO)) for (const mass of day.masses) for (const key of mass.commemorations) seen.add(key);
  for (const key of [...seen, ...Object.keys(MASSES)]) {
    for (const language of ['la', 'en', 'es']) assert.ok(nameOf(key, language), `${key} (${language})`);
  }
  assert.equal(nameOf('votive-sacred-heart-of-jesus', 'es'), 'Misa votiva del Sagrado Corazón de Jesús');
  assert.equal(nameOf('requiem-daily', 'en'), 'Daily Mass for the Dead');
});

test('the first Thursday, Friday and Saturday votive Masses are of the 3rd class, on 3rd and 4th class days (nos. 384-385)', () => {
  // No. 385 says how many: one, two, one.
  assert.deepEqual(
    [find('2026-01-02', 'votive-sacred-heart-of-jesus'), find('2026-01-03', 'votive-immaculate-heart-of-mary'), find('2026-10-01', 'votive-jesus-christ-the-eternal-high-priest')]
      .map((mass) => [mass.kind, mass.class, mass.rubric, mass.condition, mass.atMost]),
    [
      ['votive', 3, 'no. 385b', 'devotions-to-the-sacred-heart', 2],
      ['votive', 3, 'no. 385c', 'devotions-to-the-immaculate-heart', 1],
      ['votive', 3, 'no. 385a', 'devotions-for-the-clergy', 1],
    ],
  );
  assert.ok(find('2026-06-05', 'votive-sacred-heart-of-jesus'), 'a 3rd class feast admits it');
  assert.ok(!find('2026-05-01', 'votive-sacred-heart-of-jesus'), 'not on St. Joseph the Worker, 1st class');
  assert.ok(!find('2026-08-06', 'votive-jesus-christ-the-eternal-high-priest'), 'not on the Transfiguration, 2nd class');
  assert.ok(!find('2026-04-03', 'votive-sacred-heart-of-jesus'), 'not on Good Friday');
  assert.ok(!find('2026-01-09', 'votive-sacred-heart-of-jesus'), 'only on the first Friday');
});

test('the Mass of Christ the High Priest is on the first Thursday or the first Saturday, as the church or its ordo says (no. 385a)', () => {
  const HP = 'votive-jesus-christ-the-eternal-high-priest';
  // Without an ordo or a choice: on both days it may be said on.
  assert.ok(find('2026-10-01', HP) && find('2026-10-03', HP));
  // The FSSP ordo gives Thursday.
  assert.ok(find('2026-10-01', HP, FSSP_ORDO) && !find('2026-10-03', HP, FSSP_ORDO));
  // A church that holds the devotions on Saturday, with or against its ordo.
  for (const options of [{ highPriest: 'saturday' }, { ...FSSP_ORDO, highPriest: 'saturday' }]) {
    assert.ok(!find('2026-10-01', HP, options) && find('2026-10-03', HP, options));
  }
  assert.deepEqual(find('2026-10-03', HP, { highPriest: 'saturday' }).commemorations, ['st-theresa-of-the-infant-jesus']);
  assert.ok(find('2026-10-01', HP, { highPriest: 'thursday' }) && !find('2026-10-03', HP, { highPriest: 'thursday' }));
  assert.throws(() => ordoDay('2026-10-03', { highPriest: 'friday' }), RangeError);
});

test('the Mass for the Propagation of the Faith is a 2nd class votive Mass on the next to last Sunday of October (nos. 369, 453)', () => {
  const mass = find('2026-10-18', 'mass-for-the-propagation-of-the-faith');
  assert.deepEqual(mass, {
    key: 'mass-for-the-propagation-of-the-faith', kind: 'votive', class: 2, colors: ['violet'], commemorations: ['pent21-0'],
    rubric: 'nos. 369, 453', condition: 'celebrations-for-the-missions', atMost: 1,
  });
  for (const [year, date] of [[2027, '10-24'], [2028, '10-22'], [2029, '10-21'], [2033, '10-23']]) {
    const days = ordoYear(year).filter((day) => day.masses.some((m) => m.key === 'mass-for-the-propagation-of-the-faith'));
    assert.deepEqual(days.map((day) => day.date), [`${year}-${date}`]);
  }
  // Not on a 1st class day: a church whose dedication falls on that Sunday.
  assert.ok(!find('2026-10-18', 'mass-for-the-propagation-of-the-faith', { church: { dedication: '10-18' } }));
  // The FSSP ordo does not print it.
  assert.ok(!find('2026-10-18', 'mass-for-the-propagation-of-the-faith', FSSP_ORDO));
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
  // Within the octave only a Mass applied for the dead may be of Requiem (no. 422); the FSSP ordo, which puts it first, says so too.
  for (const options of [{}, FSSP_ORDO]) {
    const octave = find('2026-11-06', 'requiem-daily', options);
    assert.deepEqual([octave.class, octave.rubric, octave.condition], [3, 'nos. 415d, 416, 422', 'applied-for-the-dead']);
  }
  assert.equal(masses('2026-11-06', FSSP_ORDO)[0].key, 'requiem-daily');
  // All Souls kept on Monday 3 November 2025: the octave runs to the 10th.
  assert.deepEqual(['2025-11-04', '2025-11-10', '2025-11-11'].map((date) => find(date, 'requiem-daily')?.class), [3, 3, undefined]);
  assert.ok(!find('2026-11-08', 'requiem-daily'), 'not on a Sunday');
  assert.ok(!find('2026-11-09', 'requiem-daily'), 'not on a 2nd class feast');
  assert.ok(!find('2026-11-10', 'requiem-daily'), 'not on a 3rd class feast after the octave');
  const daily = find('2026-01-19', 'requiem-daily');
  // No. 423 says only that applying it for the dead is most fitting: no condition.
  assert.deepEqual([daily.class, daily.rubric, daily.condition, daily.commemorations], [4, 'no. 423', undefined, []]);
  // On 4th class ferias only: not on a Saturday of Our Lady (no. 91, items 27 and 28).
  const saturdays = ordoYear(2026).filter((day) => /^our-lady-on-saturday/.test(day.celebration.key));
  assert.ok(saturdays.length > 5);
  for (const day of saturdays) assert.ok(!day.masses.some((mass) => mass.kind === 'requiem' && mass.class === 4), day.date);
  assert.ok(find('2026-02-13', 'requiem-daily') && !find('2026-02-14', 'requiem-daily'));
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
  // No. 360: one sung Mass and one low, or two low.
  assert.deepEqual([sacredHeart.kind, sacredHeart.class, sacredHeart.rubric, sacredHeart.atMost], ['external-solemnity', 2, 'nos. 358a, 359, 360', 2]);
  // A feast of the Lord excludes the Sunday's commemoration, and the reverse (no. 112b).
  assert.deepEqual(sacredHeart.commemorations, []);
  assert.deepEqual(find('2026-10-04', 'our-lady-of-the-rosary').commemorations, ['pent19-0']);
  // In the United States, by indult: Corpus Christi and Sts. Peter and Paul on the following Sunday.
  assert.ok(!find('2026-06-07', 'pent01-4'));
  assert.equal(find('2026-06-07', 'pent01-4', US_FSSP).rubric, 'nos. 359, 360, 361');
  assert.equal(find('2026-07-05', 'sts-peter-and-paul', US_FSSP).rubric, 'nos. 359, 360, 361');
  assert.ok(find('2026-07-05', 'sts-peter-and-paul', US_FSSP));
  // In 2027 Sts. Peter and Paul fall on a Tuesday and the solemnity is on 4 July.
  assert.ok(find('2027-07-04', 'sts-peter-and-paul', US_FSSP));
});

test("a church's titular, dedication and patron have their external solemnity on a Sunday (nos. 358d, 358g, 359)", () => {
  const lawrence = { titular: { key: 'st-lawrence' } };
  assert.deepEqual(find('2026-08-16', 'st-lawrence', { church: lawrence }).commemorations, ['pent12-0']);
  assert.ok(find('2026-08-09', 'st-lawrence', { church: { ...lawrence, externalSolemnity: 'preceding-sunday' } }));
  assert.ok(!find('2026-08-16', 'st-lawrence', { church: { ...lawrence, externalSolemnity: 'none' } }));
  // A titular kept on a Sunday needs none.
  assert.equal(masses('2026-08-02', { church: { titular: { key: 'st-alphonsus-liguori' } } }).filter((m) => m.kind === 'external-solemnity').length, 0);
  // St. Joseph on Thursday 19 March 2026: the next Sunday is Passion Sunday, of the 1st class.
  assert.deepEqual(keys('2026-03-22', { church: { titular: { key: 'st-joseph-spouse-of-the-bl-virgin-mary' } } }), ['quad5-0']);
  const dedication = find('2026-10-18', 'anniversary-of-the-dedication-of-the-church', { church: { dedication: '10-14' } });
  assert.equal(dedication.rubric, 'nos. 358g, 359, 360');
  // No. 358d is the patron of the place, no. 358g the dedication and the titular.
  const church = { titular: { key: 'assumption-of-the-blessed-virgin-mary' }, patrons: [{ key: 'st-lawrence' }] };
  assert.deepEqual(masses('2026-08-16', { church }).filter((m) => m.kind === 'external-solemnity').map((m) => [m.key, m.rubric]), [
    ['st-lawrence', 'nos. 358d, 359, 360'],
    // A titular the universal calendar already keeps as of the 1st class has one too.
    ['assumption-of-the-blessed-virgin-mary', 'nos. 358g, 359, 360'],
  ]);
});

const solemnitiesOf = (year, options, key) => ordoYear(year, options)
  .filter((day) => day.masses.some((mass) => mass.kind === 'external-solemnity' && mass.key === key)).map((day) => day.date);

test('an external solemnity beside a feast at the turn of the year is on the Sunday in the other year', () => {
  // St. Sylvester, Thursday 31 December 2026: Sunday 3 January 2027, the Holy Name, of the 2nd class.
  const sylvester = { church: { titular: { key: 'st-sylvester-i-pope' } } };
  assert.deepEqual(solemnitiesOf(2026, sylvester, 'st-sylvester-i-pope'), ['2026-01-04'], 'from 31 December 2025');
  assert.deepEqual(solemnitiesOf(2027, sylvester, 'st-sylvester-i-pope'), ['2027-01-03']);
  assert.deepEqual(find('2027-01-03', 'st-sylvester-i-pope', sylvester).commemorations, ['nat2-0']);
  // The other way: a titular on 4 January with the Sunday before. 2028 has two, for its own
  // feast (2 January) and for 2029's (31 December); 2029 has the one for 2030's (30 December).
  const january = { church: { titular: { key: 'x-titular', date: '01-04', colors: ['white'] }, externalSolemnity: 'preceding-sunday' } };
  assert.deepEqual(solemnitiesOf(2028, january, 'x-titular'), ['2028-01-02', '2028-12-31']);
  assert.deepEqual(solemnitiesOf(2029, january, 'x-titular'), ['2029-12-30']);
  assert.deepEqual(solemnitiesOf(2030, january, 'x-titular'), ['2030-12-29']);
  // Over thirty years each keeping of the feast has its Sunday once at most: in the year after, never in its own.
  for (let year = 2026; year <= 2055; year += 1) {
    const kept = ordoYear(year - 1, sylvester).find((day) => day.celebration.key === 'st-sylvester-i-pope').date;
    // None when the feast is on a Sunday, or its Sunday is 1 January (after a Saturday) or the Epiphany (after a Monday), of the 1st class.
    const none = [0, 6, 1].includes(new Date(`${kept}T00:00:00Z`).getUTCDay());
    const found = solemnitiesOf(year, sylvester, 'st-sylvester-i-pope');
    assert.equal(found.length, none ? 0 : 1, `${year}`);
    for (const date of found) assert.ok(date <= `${year}-01-07`, date);
  }
});

test('a feast has one external solemnity, on the day the rubrics assign or the Sunday chosen (nos. 358, 359)', () => {
  // A church of the Rosary: the 1st Sunday of October (no. 358b), not also the Sunday after 7 October.
  assert.deepEqual(solemnitiesOf(2026, { church: { titular: { key: 'our-lady-of-the-rosary' } } }, 'our-lady-of-the-rosary'), ['2026-10-04']);
  assert.deepEqual(solemnitiesOf(2026, { church: { titular: { key: 'our-lady-of-the-rosary' }, externalSolemnity: 'preceding-sunday' } }, 'our-lady-of-the-rosary'), ['2026-10-04']);
  // The Sacred Heart: no. 358a names no Sunday, so the one after the feast, or the one before where the church or the options say.
  assert.deepEqual(solemnitiesOf(2026, {}, 'pent02-5'), ['2026-06-14']);
  assert.deepEqual(solemnitiesOf(2026, { externalSolemnities: { 'pent02-5': 'preceding-sunday' } }, 'pent02-5'), ['2026-06-07']);
  assert.deepEqual(solemnitiesOf(2026, { church: { titular: { key: 'pent02-5' }, externalSolemnity: 'preceding-sunday' } }, 'pent02-5'), ['2026-06-07']);
  assert.deepEqual(solemnitiesOf(2026, { church: { titular: { key: 'pent02-5' } } }, 'pent02-5'), ['2026-06-14']);
  // A church that offers none of its own still has the Sacred Heart's, which every church has.
  assert.deepEqual(solemnitiesOf(2026, { church: { titular: { key: 'pent02-5' }, externalSolemnity: 'none' } }, 'pent02-5'), ['2026-06-14']);
  // Any may be left out; one assigned to its day cannot be moved.
  assert.deepEqual(solemnitiesOf(2026, { externalSolemnities: { 'our-lady-of-the-rosary': 'none' } }, 'our-lady-of-the-rosary'), []);
  assert.deepEqual(solemnitiesOf(2026, { ...US_FSSP, externalSolemnities: { 'pent01-4': 'none' } }, 'pent01-4'), []);
  assert.throws(() => ordoYear(2026, { externalSolemnities: { 'our-lady-of-the-rosary': 'preceding-sunday' } }), /assigned to its day/);
  assert.throws(() => ordoYear(2026, { ...US_FSSP, externalSolemnities: { 'pent01-4': 'preceding-sunday' } }), /assigned to its day/);
  assert.throws(() => ordoYear(2026, { externalSolemnities: { 'st-blaise': 'none' } }), /has no external solemnity/);
  assert.throws(() => ordoYear(2026, { externalSolemnities: { 'pent02-5': 'tuesday' } }), RangeError);
  // One church's choice for one feast.
  const lawrence = { church: { titular: { key: 'st-lawrence' } }, externalSolemnities: { 'st-lawrence': 'preceding-sunday' } };
  assert.deepEqual(solemnitiesOf(2026, lawrence, 'st-lawrence'), ['2026-08-09']);
});

test("the Fraternity's own feast has an external solemnity by right (no. 358e)", () => {
  // 2026: kept on Monday 23 February; both Sundays beside it are of the 1st class.
  assert.deepEqual(solemnitiesOf(2026, US_FSSP, 'chair-of-st-peter'), []);
  // 2028: Tuesday 22 February; Quinquagesima, 27 February, is of the 2nd class.
  assert.deepEqual(solemnitiesOf(2028, US_FSSP, 'chair-of-st-peter'), ['2028-02-27']);
  const mass = find('2028-02-27', 'chair-of-st-peter', FSSP_ORDO);
  assert.deepEqual([mass.class, mass.rubric, mass.commemorations, mass.atMost], [2, 'nos. 358e, 359, 360', ['quadp3-0'], 2]);
  assert.deepEqual(solemnitiesOf(2028, { ...US_FSSP, externalSolemnities: { 'chair-of-st-peter': 'preceding-sunday' } }, 'chair-of-st-peter'), ['2028-02-20']);
  assert.deepEqual(solemnitiesOf(2028, { ...US_FSSP, externalSolemnities: { 'chair-of-st-peter': 'none' } }, 'chair-of-st-peter'), []);
  // Not without the Fraternity's layer.
  assert.deepEqual(solemnitiesOf(2028, { nations: ['us'] }, 'chair-of-st-peter'), []);
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
test('against the whole FSSP 2026 page, every row differs from the ordo\'s Masses only on the reviewed days, each in the reviewed way', { skip: !FSSP_PAGE && 'set FSSP_PAGE to run' }, async () => {
  const { compareMassesWithFssp } = await import('../scripts/compare-fssp.mjs');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/fssp-2026-masses.json', import.meta.url), 'utf8'));
  const reviewed = Object.assign({}, ...fixture.groups.map((group) => group.days));
  const differences = compareMassesWithFssp(readFileSync(FSSP_PAGE, 'utf8'), 2026, US_FSSP);
  assert.deepEqual(Object.fromEntries(differences.map((d) => [d.date, d.line])), reviewed);
  const { about: _, ...agreement } = fixture.agreement;
  assert.deepEqual(differences.agreement, agreement);
});
