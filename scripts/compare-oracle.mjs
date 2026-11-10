// Compare the resolver's principal celebration, class and colours with the
// Missale Meum oracle. Usage: node scripts/compare-oracle.mjs [from] [to] [--json]
import { readFileSync } from 'node:fs';

import { CATALOGUE, resolveYear } from '../dist/esm/index.js';

const [from = 1962, to = 2100] = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
const asJson = process.argv.includes('--json');
const byKey = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
const LETTER = { white: 'w', red: 'r', green: 'g', violet: 'v', black: 'b', rose: 'p' };
const multiple = new Map(JSON.parse(readFileSync(new URL('../test/fixtures/multiple-celebrations.json', import.meta.url), 'utf8'))
  .days.map((day) => [day.date, day.expected.celebration]));

const principal = (key) => byKey.get(key)?.formularyOf ?? key;
const isFourthClassFeria = (key) => {
  const entry = byKey.get(key);
  return entry && entry.class === 4 && ['feria', 'rogation'].includes(entry.kind);
};

export function compare(year) {
  const ours = new Map(resolveYear(year).map((day) => [day.date, day]));
  const rows = JSON.parse(readFileSync(new URL(`../data/oracle/missalemeum/${year}.json`, import.meta.url), 'utf8'));
  const differences = [];
  for (const [date, celebration, cls, colors] of rows) {
    const day = ours.get(date);
    const expected = multiple.get(date) ?? principal(celebration[0]);
    const actual = day.celebration.key;
    // Missale Meum names a bare 4th class feria "feria"; the engine names the day of the cycle.
    const sameCelebration = actual === expected || (expected === 'feria' && isFourthClassFeria(actual));
    const ourColors = day.celebration.colors.map((c) => LETTER[c]).join('');
    const problems = [];
    if (!sameCelebration) problems.push('celebration');
    if (day.celebration.class !== cls) problems.push('class');
    if (sameCelebration && ourColors !== colors) problems.push('colour');
    if (problems.length) {
      differences.push({ date, problems, ours: `${actual} [${day.celebration.class},${ourColors}]`, oracle: `${expected} [${cls},${colors}]` });
    }
  }
  return differences;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = [];
  for (let year = from; year <= to; year += 1) all.push(...compare(year));
  if (asJson) console.log(JSON.stringify(all, null, 1));
  else {
    const byPattern = new Map();
    for (const d of all) {
      const pattern = `${d.problems.join('+')}: ours ${d.ours.replace(/ \[.*/, '')} vs oracle ${d.oracle.replace(/ \[.*/, '')}`;
      byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), d]);
    }
    for (const [pattern, list] of [...byPattern].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(list.length).padStart(4)}  ${pattern}  e.g. ${list.slice(0, 3).map((d) => `${d.date} ${d.ours} | ${d.oracle}`).join('; ')}`);
    }
    console.log(`${all.length} differing days in ${from}-${to}`);
  }
}
