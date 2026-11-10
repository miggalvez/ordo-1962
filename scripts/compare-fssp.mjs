// Compare the engine with the FSSP seminary's published calendar
// (fsspolgs.org/liturgical-calendar), scoring the first row printed for each day.
// The page is not part of this repository; keep a copy under .cache/fssp/.
//
// Usage: node scripts/compare-fssp.mjs <saved page.html> <year> [--layers us,fssp] [--json]
import { readFileSync } from 'node:fs';

import { LAYERS, resolveYear } from '../dist/esm/index.js';
import { score } from './compare-ordo.mjs';

// English names of observances the layers define (they are not in data/names/en.json).
const LAYER_NAMES = Object.fromEntries(Object.values(LAYERS)
  .flatMap((layer) => (layer.observances ?? []).map((o) => [o.key, o.names.en])));

const CLASS = { I: 1, II: 2, III: 3, IV: 4 };
const decode = (s) => s.replace(/&comma;/g, ',').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&[a-z]+;/g, ' ');
const text = (s) => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Every day of the page: the rows printed for it, first row first. */
export function readFsspPage(html, year) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  if (tables.length !== 12) throw new Error(`expected 12 month tables, found ${tables.length}`);
  const days = new Map();
  tables.forEach((table, month) => {
    let current = null;
    for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = row.match(/<td[\s\S]*?<\/td>/gi);
      if (!cells || cells.length < 5) continue;
      const day = Number((text(cells[0]).match(/(\d+)/) ?? [])[1]);
      if (day) {
        current = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        days.set(current, []);
      }
      if (!current) continue;
      days.get(current).push({
        name: text(cells[1]),
        class: CLASS[text(cells[2])] ?? null,
        commemorations: cells[3].replace(/<\/?td[^>]*>/g, '').split(/<br\s*\/?>/i).map(text).filter(Boolean),
      });
    }
  });
  return days;
}

// Names the page uses that share too few words with ours.
const FSSP_ALIASES = {
  'st-maur-abbot': 'St. Maurus, Abbot',
  'our-lady-of-lourdes': 'The Apparition of the Blessed Virgin Mary Immaculate',
  'st-anicetus': 'St. Ancetus, Pope & Martyr',
  'st-melchiades': 'St. Miltiades, Pope & Martyr',
  'maternity-of-the-blessed-virgin-mary': 'Motherhood of the Blessed Virgin Mary',
  'octave-day-of-christmas': 'The Octave of Christmas',
  'for-octave-of-the-nativity': 'Day in the Octave of Christmas',
  'for-octave-of-the-nativity-12-27c': 'Day in the Octave of Christmas',
  'for-octave-of-the-nativity-12-28c': 'Day in the Octave of Christmas',
  'us-north-american-martyrs': 'Ss. Jean de Brebeuf, Isaac Jogues & Companions, Martyrs',
  'pasc6-6': 'Vigil of Pentecost',
};
const SEASON_FERIA = /^(major )?feria( of (lent|paschaltide|advent))?$/i;
const isFeria = (key) => /^(adv|quad|quadp|epi|pent|pasc)\d*-[1-6]$|^feria$/.test(key);

function fsspScore(key, name) {
  const plain = name.replace(/^\(USA\)\s*/, '');
  if (isFeria(key) && SEASON_FERIA.test(plain)) return 1;
  return Math.max(
    score(key, plain),
    LAYER_NAMES[key] && LAYER_NAMES[key].toLowerCase() === plain.toLowerCase() ? 1 : 0,
    FSSP_ALIASES[key] && FSSP_ALIASES[key] === plain ? 1 : 0,
  );
}

function matchFssp(ours, theirs) {
  const used = new Set();
  const pairs = [];
  for (const [i, key] of ours.entries()) {
    const j = theirs.findIndex((name, k) => !used.has(k) && fsspScore(key, name) >= 0.51);
    if (j >= 0) { used.add(j); pairs.push(j); }
  }
  return {
    oursOnly: ours.filter((key) => !theirs.some((name, k) => used.has(k) && fsspScore(key, name) >= 0.51)),
    theirsOnly: theirs.filter((_, k) => !used.has(k)),
    sameOrder: pairs.every((j, k) => k === 0 || j > pairs[k - 1]),
  };
}

export function compareWithFssp(html, year, options = {}) {
  const fssp = readFsspPage(html, year);
  const differences = [];
  for (const day of resolveYear(year, options)) {
    const rows = fssp.get(day.date);
    if (!rows) { differences.push({ date: day.date, missing: true }); continue; }
    const [first] = rows;
    const sameCelebration = fsspScore(day.celebration.key, first.name) >= 0.51;
    const sameClass = first.class === day.celebration.class;
    const { oursOnly, theirsOnly, sameOrder } = matchFssp(day.commemorations, first.commemorations);
    if (!sameCelebration || !sameClass || oursOnly.length || theirsOnly.length || !sameOrder) {
      differences.push({
        date: day.date,
        ours: `${day.celebration.key} [${day.celebration.class}]`,
        fssp: `${first.name} [${first.class}]`,
        rowsPrinted: rows.length,
        sameCelebration, sameClass, oursOnly, fsspOnly: theirsOnly, sameOrder,
        otherRows: rows.slice(1).map((r) => `${r.name} [${r.class}]`),
      });
    }
  }
  return differences;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, yearText] = process.argv.slice(2);
  const layersAt = process.argv.indexOf('--layers');
  const layers = layersAt > 0 ? process.argv[layersAt + 1].split(',') : [];
  const options = layers.length ? { nations: layers.filter((l) => l === 'us'), institutes: layers.filter((l) => l !== 'us') } : {};
  const differences = compareWithFssp(readFileSync(file, 'utf8'), Number(yearText), options);
  if (process.argv.includes('--json')) console.log(JSON.stringify(differences, null, 1));
  else {
    for (const d of differences) {
      const parts = [];
      if (!d.sameCelebration || !d.sameClass) parts.push(`ours ${d.ours} / fssp ${d.fssp}`);
      if (d.oursOnly?.length) parts.push(`ours only: ${d.oursOnly.join(', ')}`);
      if (d.fsspOnly?.length) parts.push(`fssp only: ${d.fsspOnly.join('; ')}`);
      if (d.sameOrder === false) parts.push('order differs');
      if (d.otherRows?.length) parts.push(`also printed: ${d.otherRows.join('; ')}`);
      console.log(`${d.date} ${d.missing ? 'not on the page' : parts.join(' | ')}`);
    }
    console.log(`${differences.length} differing days`);
  }
}
