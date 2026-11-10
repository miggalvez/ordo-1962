import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CATALOGUE, resolveDay, resolveYear } from '../dist/esm/index.js';
import { compareCommemorations } from '../scripts/compare-commemorations.mjs';
import { compareWithOrdo } from '../scripts/compare-ordo.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const YEARS = Array.from({ length: 139 }, (_, i) => 1962 + i);
const byKey = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
const on = (date, options) => resolveDay(date, options);

test('commemorations differ from Missale Meum only in the reviewed patterns, each with its rubric', () => {
  const reviewed = read('./fixtures/commemoration-differences.json').patterns;
  const counts = new Map();
  for (const year of YEARS) {
    for (const d of compareCommemorations(year)) counts.set(d.pattern, (counts.get(d.pattern) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), Object.fromEntries(reviewed.map((p) => [p.pattern, p.count])));
  for (const p of reviewed) assert.match(p.rubric, /^(nos?\. \d|additions\.json)/, p.pattern);
});

test('against the SSPX Ordo for 2026-2040, only the reviewed days differ', { skip: !process.env.ORDO_DIR && 'set ORDO_DIR to run' }, () => {
  const reviewed = read('./fixtures/ordo-differences-2026-2040.json').groups.flatMap((g) => g.dates).sort();
  const found = [];
  for (let year = 2026; year <= 2040; year += 1) {
    const differences = compareWithOrdo(process.env.ORDO_DIR, year);
    assert.ok(differences, `no Ordo file for ${year}`);
    found.push(...differences.map((d) => d.date));
  }
  assert.deepEqual(found.sort(), reviewed);
});

test('no day has more commemorations than its class admits (no. 111)', () => {
  for (const year of YEARS) {
    for (const day of resolveYear(year)) {
      const { class: cls, key } = day.celebration;
      const limit = cls === 1 ? 1 : cls === 2 ? 1 : 2;
      assert.ok(day.commemorations.length <= limit, `${day.date} ${key}: ${day.commemorations}`);
      assert.ok(!day.commemorations.includes(key), day.date);
      for (const c of day.commemorations) {
        const entry = byKey.get(c);
        assert.ok(!(entry.kind === 'feria' && entry.class === 4), `${day.date}: 4th class feria ${c} commemorated (no. 26)`);
      }
    }
  }
});

test('the rubrics decide these commemorations', () => {
  const c = (date, options) => on(date, options).commemorations;
  // nos. 16a, 17d: a feast of the Lord takes the Sunday without commemorating it.
  assert.deepEqual(c('2026-10-25'), []);
  // nos. 108a, 111a: a 1st class feast not of the Lord keeps the Sunday as a privileged commemoration.
  assert.deepEqual(c('2026-11-01'), ['pent23-0']);
  // nos. 108e, 111c: the Advent feria on a 2nd class feast.
  assert.deepEqual(c('2026-11-30'), ['adv1-1']);
  // no. 111d and no. 113: two on a 3rd class day, the season first.
  assert.deepEqual(c('2026-12-04'), ['adv1-5', 'st-barbara']);
  // nos. 16a and 111b: on a Sunday the Transfiguration admits only a 2nd class feast, so not St. Sixtus.
  assert.deepEqual(c('2023-08-06'), []);
  assert.deepEqual(c('2026-08-06'), ['pope-sixtus-ii-felicissimus-and-agapitus-martyrs']);
  // no. 111a: Palm Sunday admits no ordinary commemoration.
  assert.deepEqual(c('2019-04-14'), []);
  // no. 30: the Vigil of Christmas admits no commemoration.
  assert.deepEqual(c('2026-12-24'), []);
  // nos. 108c, 111c: the Christmas octave on St. Stephen; no. 111b: St. John on the Sunday within the octave.
  assert.deepEqual(c('2026-12-26'), ['for-octave-of-the-nativity']);
  assert.deepEqual(c('2026-12-27'), ['st-john-the-evangelist']);
  // no. 80: the greater litanies move to the Tuesday after Easter when 25 April is Easter Sunday or Monday.
  assert.ok(!c('2038-04-25').includes('for-the-rogations'));
  assert.deepEqual(c('2038-04-27'), ['for-the-rogations']);
  // nos. 108f, 111b: on a 2nd class Sunday the litanies displace St. Mark.
  assert.deepEqual(c('2027-04-25'), ['for-the-rogations']);
});

test('the prayer of St. Peter with St. Paul is inseparable, not a commemoration (no. 110)', () => {
  const day = on('2027-01-25');
  assert.equal(day.celebration.key, 'conversion-of-st-paul');
  assert.deepEqual(day.inseparable, ['st-peter']);
  assert.ok(!day.commemorations.includes('st-peter'));
  const chair = on('2027-02-22');
  assert.equal(chair.celebration.key, 'chair-of-st-peter');
  assert.deepEqual(chair.inseparable, ['st-paul']);
});

test('the Polish proper replaces the commemoration of St. Barbara with her feast', () => {
  const pl = on('2026-12-04', { nations: ['pl'] });
  assert.ok(![pl.celebration.key, ...pl.commemorations].includes('st-barbara'));
  assert.ok([pl.celebration.key, ...pl.commemorations].includes('pl-st-barbarae-virginis-et-martyris'));
});
