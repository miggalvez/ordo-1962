// Bundle data/*.json into src/generated/data.ts so the ESM and CommonJS builds
// both carry the catalogue without reading files at runtime.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));

// Every file in data/layers/ is a layer, named by its file. A hand-written layer
// (us) defines its own observances; they join the catalogue with the layer's scope.
// Their names stay in the layer file.
const layers = Object.fromEntries(readdirSync(new URL('../data/layers/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => [file.replace(/\.json$/, ''), read(`layers/${file}`)]));

const catalogue = read('catalogue.json');
const known = new Set(catalogue.map((entry) => entry.key));
for (const [id, layer] of Object.entries(layers)) {
  if (Boolean(layer.nation) === Boolean(layer.institute)) throw new Error(`layer ${id} must name exactly one nation or institute`);
  for (const o of layer.observances ?? []) {
    if (known.has(o.key)) throw new Error(`layer ${id}: ${o.key} is already in the catalogue`);
    known.add(o.key);
    catalogue.push({
      key: o.key,
      origin: 'reviewed',
      date: o.date,
      kind: o.kind,
      class: o.class,
      colors: o.colors,
      ofTheLord: o.ofTheLord === true,
      ...(o.ofOurLady ? { ofOurLady: true } : {}),
      scope: layer.nation ? 'national' : 'institute',
      ...(layer.nation ? { nation: layer.nation } : { institute: layer.institute }),
    });
  }
  for (const op of layer.operations) {
    for (const key of op.op === 'order' ? op.keys : [op.key, ...(op.replaces ? [op.replaces] : [])]) {
      if (!known.has(key)) throw new Error(`layer ${id}: ${op.op} names unknown observance ${key}`);
    }
    if (op.op === 'raise') {
      const entry = catalogue.find((candidate) => candidate.key === op.key);
      if (![1, 2].includes(op.class) || op.class >= entry.class) throw new Error(`layer ${id}: ${op.key} is raised to class ${op.class} from ${entry.class}`);
      if (!op.source) throw new Error(`layer ${id}: raising ${op.key} cites no source`);
    }
  }
}

// Titles by language: the generated files (Missale Meum for la, en and pl;
// Divinum Officium for es), then the hand-written data/reviewed/names.json, then
// the names each layer gives its own observances. Every observance must have
// Latin, English and Spanish.
const LANGUAGES = ['la', 'en', 'es', 'pl'];
const REQUIRED = ['la', 'en', 'es'];
const names = Object.fromEntries(LANGUAGES.map((language) => [language, { ...read(`names/${language}.json`) }]));
for (const [key, entry] of Object.entries(read('reviewed/names.json').names)) {
  if (!known.has(key)) throw new Error(`data/reviewed/names.json names unknown observance ${key}`);
  if (!entry.why) throw new Error(`data/reviewed/names.json: ${key} gives no reason`);
  for (const field of Object.keys(entry)) if (field !== 'why' && !LANGUAGES.includes(field)) throw new Error(`data/reviewed/names.json: ${key} has a title in unknown language ${field}`);
  for (const language of LANGUAGES) if (entry[language]) names[language][key] = entry[language];
}
for (const [id, layer] of Object.entries(layers)) {
  for (const o of layer.observances ?? []) {
    for (const [language, title] of Object.entries(o.names ?? {})) {
      if (!LANGUAGES.includes(language)) throw new Error(`layer ${id}: ${o.key} has a name in unknown language ${language}`);
      names[language][o.key] = title;
    }
  }
}
for (const language of LANGUAGES) {
  for (const key of Object.keys(names[language])) if (!known.has(key)) throw new Error(`names/${language}.json names unknown observance ${key}`);
}
const missing = catalogue.flatMap((entry) => REQUIRED.filter((language) => !names[language][entry.key]).map((language) => `${entry.key} (${language})`));
if (missing.length) throw new Error(`observances without a title: ${missing.join(', ')}`);
const sortedNames = Object.fromEntries(LANGUAGES.map((language) => [language,
  Object.fromEntries(Object.entries(names[language]).sort(([a], [b]) => a.localeCompare(b)))]));

// The title of the day where the celebration's key is also the key of one of its
// Masses (Christmas, All Souls) or of a Mass of the season (Our Lady on Saturday).
const dayHeadings = {};
for (const [key, entry] of Object.entries(read('reviewed/names.json').dayHeadings)) {
  if (!known.has(key)) throw new Error(`data/reviewed/names.json: day heading for unknown observance ${key}`);
  if (!entry.why) throw new Error(`data/reviewed/names.json: day heading ${key} gives no reason`);
  for (const language of REQUIRED) if (!entry[language]) throw new Error(`data/reviewed/names.json: day heading ${key} has no ${language}`);
  dayHeadings[key] = Object.fromEntries(LANGUAGES.filter((language) => entry[language]).map((language) => [language, entry[language]]));
}
// A celebration with several Masses is keyed by its first: it needs a heading of its own.
for (const entry of catalogue) {
  if (entry.formularyOf && !dayHeadings[entry.formularyOf]) throw new Error(`${entry.formularyOf} has several Masses and no day heading`);
}

const sources = {
  CATALOGUE: [catalogue, 'readonly CatalogueEntry[]'],
  TEMPORAL_BLOCKS: [read('temporal-blocks.json'), 'Readonly<Record<TemporalBlockName, readonly (readonly string[])[]>>'],
  LAYERS: [layers, 'Readonly<Record<string, Layer>>'],
  NAMES: [sortedNames, 'Readonly<Record<Language, Readonly<Record<string, string>>>>'],
  DAY_HEADINGS: [dayHeadings, 'Readonly<Record<string, Readonly<Partial<Record<Language, string>>>>>'],
};

const lines = [
  '// Generated by scripts/generate-data.mjs from data/. Do not edit.',
  "import { deepFreeze } from '../freeze.js';",
  "import type { CatalogueEntry, Language, Layer, TemporalBlockName } from '../types.js';",
  '',
];
for (const [name, [value, type]] of Object.entries(sources)) {
  lines.push(`export const ${name}: ${type} = deepFreeze(${JSON.stringify(value)});`, '');
}

const dir = new URL('../src/generated/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('data.ts', dir), lines.join('\n'));
