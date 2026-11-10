// Write, or with --check compare, the snapshots of whole years under
// test/fixtures/snapshots/. A snapshot proves nothing by itself: it shows in review
// exactly which days a change to the engine or the data moves.
//
// Usage: node scripts/snapshot.mjs [--check]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { ordoYear, resolveYear } from '../dist/esm/index.js';

export const SNAPSHOTS = [
  { name: 'us-fssp', options: { nations: ['us'], institutes: ['fssp'] }, years: [2026, 2027, 2028, 2029, 2030] },
  { name: 'us-fssp-masses', options: { nations: ['us'], institutes: ['fssp'], ordo: 'fssp' }, years: [2026, 2027] },
];
const DIR = new URL('../test/fixtures/snapshots/', import.meta.url);

/** One line a day: date, celebration, class, colours, then commemorations, inseparable prayers and a transfer if any. */
export function snapshotOf(year, options) {
  if (options.ordo) return massesSnapshotOf(year, options);
  return `${resolveYear(year, options).map((day) => {
    const c = day.celebration;
    const parts = [`${day.date} ${c.key} ${c.class} ${c.colors.join('/')}`];
    if (day.commemorations.length) parts.push(`comm ${day.commemorations.join(', ')}`);
    if (day.inseparable.length) parts.push(`with ${day.inseparable.join(', ')}`);
    if (c.transferredFrom) parts.push(`from ${c.transferredFrom}`);
    return parts.join(' | ');
  }).join('\n')}\n`;
}

/** With an ordo: one line a day with the Masses it offers, its first first, each as key, kind, class and commemorations. */
function massesSnapshotOf(year, options) {
  return `${ordoYear(year, options).map((day) => `${day.date} ${day.masses.map((mass) => {
    const comm = mass.commemorations.length ? ` (${mass.commemorations.join(', ')})` : '';
    return `${mass.key} ${mass.kind} ${mass.class}${comm}`;
  }).join(' / ')}`).join('\n')}\n`;
}

export const snapshotFile = (name, year) => new URL(`${name}-${year}.txt`, DIR);

/** Lines that differ from the saved snapshot, as `-saved` / `+now` pairs; null when no snapshot is saved. */
export function compareSnapshot(name, year, options) {
  const file = snapshotFile(name, year);
  if (!existsSync(file)) return null;
  const saved = readFileSync(file, 'utf8').split('\n');
  const now = snapshotOf(year, options).split('\n');
  const changes = [];
  for (let i = 0; i < Math.max(saved.length, now.length); i += 1) {
    if (saved[i] !== now[i]) changes.push(`-${saved[i] ?? ''}\n+${now[i] ?? ''}`);
  }
  return changes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let changed = 0;
  for (const { name, options, years } of SNAPSHOTS) {
    for (const year of years) {
      if (check) {
        const changes = compareSnapshot(name, year, options);
        if (changes === null) { console.log(`${name}-${year}: no snapshot`); changed += 1; } else if (changes.length) { console.log(`${name}-${year}:\n${changes.join('\n')}`); changed += changes.length; }
      } else {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(snapshotFile(name, year), snapshotOf(year, options));
      }
    }
  }
  if (check) { console.log(changed ? `${changed} differences` : 'snapshots match'); if (changed) process.exitCode = 1; }
}
