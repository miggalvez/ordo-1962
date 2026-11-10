// Compare the engine's commemorations with the Missale Meum oracle and group the
// differences by kind. Usage: node scripts/compare-commemorations.mjs [from] [to] [--json]
import { readFileSync } from 'node:fs';

import { CATALOGUE, resolveYear } from '../dist/esm/index.js';

const byKey = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
const principal = (key) => byKey.get(key)?.formularyOf ?? key;

/** A short description of what kind of observance a key is, for grouping. */
export function describe(key) {
  const entry = byKey.get(key);
  if (!entry) return key;
  if (/^for-octave-of-the-nativity/.test(key)) return 'Christmas octave';
  if ('temporal' in entry.date && entry.kind === 'sunday') return 'Sunday';
  if ('temporal' in entry.date && ['feria', 'ember-day'].includes(entry.kind)) return `feria c${entry.class}`;
  return `${entry.kind} c${entry.class}`;
}

export function compareCommemorations(year) {
  const rows = new Map(JSON.parse(readFileSync(new URL(`../data/oracle/missalemeum/${year}.json`, import.meta.url), 'utf8'))
    .map((row) => [row[0], row]));
  const differences = [];
  for (const day of resolveYear(year)) {
    const row = rows.get(day.date);
    // Missale Meum lists the inseparable prayer of St. Peter or St. Paul as a commemoration (no. 110).
    const theirs = row[4].map(principal).filter((key) => !day.inseparable.includes(key));
    const ours = day.commemorations;
    if (JSON.stringify(ours) === JSON.stringify(theirs)) continue;
    const oursOnly = ours.filter((key) => !theirs.includes(key));
    const theirsOnly = theirs.filter((key) => !ours.includes(key));
    differences.push({
      date: day.date,
      celebrated: day.celebration.key,
      celebratedClass: day.celebration.class,
      oursOnly, theirsOnly,
      orderOnly: oursOnly.length === 0 && theirsOnly.length === 0,
      pattern: `c${day.celebration.class} ${byKey.get(day.celebration.key)?.kind ?? ''}: `
        + `ours+[${oursOnly.map(describe).join(',')}] mm+[${theirsOnly.map(describe).join(',')}]`
        + (oursOnly.length === 0 && theirsOnly.length === 0 ? ' order' : ''),
    });
  }
  return differences;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 1962, to = 2100] = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
  const all = [];
  for (let year = from; year <= to; year += 1) all.push(...compareCommemorations(year));
  if (process.argv.includes('--json')) console.log(JSON.stringify(all, null, 1));
  else {
    const groups = new Map();
    for (const d of all) groups.set(d.pattern, [...(groups.get(d.pattern) ?? []), d]);
    for (const [pattern, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const e = list.slice(0, 2).map((d) => `${d.date} ${d.celebrated} +${d.oursOnly.join('/')} -${d.theirsOnly.join('/')}`).join('; ');
      console.log(`${String(list.length).padStart(5)}  ${pattern}  e.g. ${e}`);
    }
    console.log(`${all.length} differing days in ${from}-${to}`);
  }
}
