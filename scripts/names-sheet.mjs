// A sheet for reviewing the titles: one row per observance with its date rule,
// class, Latin, English and Spanish titles, and where the Spanish came from.
// Written as tab-separated text, ready for a spreadsheet.
//
// Usage: node scripts/names-sheet.mjs [--only reviewed|divinum-officium|layer] > names.tsv
import { readFileSync } from 'node:fs';

import { CATALOGUE, LAYERS, NAMES } from '../dist/esm/index.js';

const reviewed = JSON.parse(readFileSync(new URL('../data/reviewed/names.json', import.meta.url), 'utf8')).names;
const layerKeys = new Set(Object.values(LAYERS).flatMap((layer) => (layer.observances ?? []).map((o) => o.key)));
const sourceOf = (key) => (reviewed[key]?.es ? 'reviewed' : layerKeys.has(key) ? 'layer' : 'divinum-officium');
const when = (entry) => Object.values(entry.date)[0];

const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
const clean = (s) => String(s ?? '').replace(/\t/g, ' ');
console.log(['key', 'date', 'class', 'la', 'en', 'es', 'es source', 'why'].join('\t'));
for (const entry of CATALOGUE) {
  const source = sourceOf(entry.key);
  if (only && source !== only) continue;
  console.log([entry.key, when(entry), entry.class, NAMES.la[entry.key], NAMES.en[entry.key], NAMES.es[entry.key], source, reviewed[entry.key]?.why]
    .map(clean).join('\t'));
}
