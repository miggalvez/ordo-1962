// Compare the engine's Spanish titles with the headings of a printed Spanish ordo,
// as plain text (for a scanned ordo, the text read from its pages). The ordo is
// not part of this repository and nothing of it is written out except the
// differences this prints.
//
// It reads day headings such as "JUEVES 4. San Pedro Crisólogo, obispo…" under
// month headings ("DICIEMBRE" and "2014", or "CALENDARIO LITURGICO DICIEMBRE 1 2012"),
// takes the heading up to the line with the class, and scores how many of the
// engine's words for that day's celebration it contains.
//
// Usage: node scripts/compare-names-es.mjs <ordo.txt> [--below 0.6]
import { readFileSync } from 'node:fs';

import { nameOf, resolveDay } from '../dist/esm/index.js';

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const WEEKDAYS = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6 };
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const STOP = new Set(['de', 'la', 'el', 'y', 'e', 'en', 'del', 'los', 'las', 'san', 'santo', 'santa', 'santos', 'santas', 'a', 'su', 'sus']);
const words = (s) => plain(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));

/** The headings of each day the ordo prints, first one first. */
export function readOrdo(text) {
  const lines = text.split('\n').map((line) => line.trim());
  const days = new Map();
  let month = null;
  let year = null;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const oneLine = /CALENDARIO LIT[UÚ]RGICO\s+([A-ZÁÉÍÓÚ]+)\s+\S*\s*(20\d\d)/.exec(line);
    if (oneLine && MONTHS.includes(oneLine[1])) { month = MONTHS.indexOf(oneLine[1]) + 1; year = Number(oneLine[2]); continue; }
    if (MONTHS.includes(line) && /^20\d\d$/.test(lines[i + 1] ?? '')) { month = MONTHS.indexOf(line) + 1; year = Number(lines[i + 1]); i++; continue; }
    const day = /^[^A-ZÁÉÍÓÚ]*(DOMINGO|LUNES|MARTES|MI[ÉE]RCOLES|JUEVES|VIERNES|S[ÁA]BADO)\s+(\d{1,2})\s*[.,]\s*(.*)$/.exec(line);
    if (day && month) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day[2]).padStart(2, '0')}`;
      const weekday = WEEKDAYS[plain(day[1]).toUpperCase()];
      current = days.has(date) || new Date(`${date}T12:00:00Z`).getUTCDay() !== weekday ? null : { date, heading: [day[3]] };
      if (current) days.set(date, current);
      continue;
    }
    if (!current) continue;
    if (/\bclase\b/i.test(line) || /^[•▪■]/.test(line) || current.heading.length >= 4) { current = null; continue; }
    if (!MONTHS.includes(line) && !/^20\d\d$/.test(line)) current.heading.push(line);
  }
  return new Map([...days].map(([date, day]) => [date, day.heading.join(' ').replace(/[!~&|]/g, ' ').replace(/\s+/g, ' ').trim()]));
}

export function compareNames(text, options = {}) {
  const rows = [];
  for (const [date, heading] of readOrdo(text)) {
    const day = resolveDay(date, options);
    const ours = nameOf(day.celebration.key, 'es', options) ?? '';
    const ourWords = words(ours);
    const theirs = new Set(words(heading));
    const found = ourWords.filter((w) => theirs.has(w)).length;
    rows.push({ date, key: day.celebration.key, ours, ordo: heading, score: ourWords.length ? found / ourWords.length : 1 });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const belowAt = process.argv.indexOf('--below');
  const below = belowAt > 0 ? Number(process.argv[belowAt + 1]) : 0.6;
  const rows = compareNames(readFileSync(file, 'utf8'));
  const low = rows.filter((row) => row.score < below);
  for (const row of low) console.log(`${row.date} ${row.score.toFixed(2)} ${row.key}\n  ours: ${row.ours}\n  ordo: ${row.ordo}`);
  console.log(`${rows.length} days read; ${low.length} share less than ${below} of our words`);
}
