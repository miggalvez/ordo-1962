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

// Masses an ordo offers that are not observances (data/masses.json), and the
// ordos' own Masses for certain places (data/ordos/). They are titled like
// observances and must not share a key with one.
const COLORS = ['white', 'red', 'green', 'violet', 'black', 'rose'];
const MASS_KINDS = ['day', 'impeded-feast', 'commemoration', 'external-solemnity', 'rogation', 'votive', 'requiem', 'for-certain-places'];
const OBSERVANCE_KINDS = [...new Set(catalogue.map((entry) => entry.kind))];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const checkColors = (where, colors) => {
  if (!Array.isArray(colors) || !colors.length || colors.some((color) => !COLORS.includes(color))) throw new Error(`${where}: colours ${JSON.stringify(colors)}`);
};
const checkFields = (where, object, allowed) => {
  for (const field of Object.keys(object)) if (!allowed.includes(field)) throw new Error(`${where}: unknown field ${field}`);
};
const ON = /^(following-sunday|preceding-sunday|first-sunday:(0[1-9]|1[0-2])|[a-z]+\d*-0)$/;
const checkSolemnities = (where, list) => {
  for (const s of list) {
    checkFields(`${where}: external solemnity of ${s.key}`, s, ['key', 'on', 'fixed', 'rubric', 'source']);
    if (!known.has(s.key)) throw new Error(`${where}: external solemnity of unknown observance ${s.key}`);
    if (!ON.test(s.on)) throw new Error(`${where}: external solemnity of ${s.key} on ${JSON.stringify(s.on)}`);
    if (s.fixed !== undefined && s.fixed !== true) throw new Error(`${where}: external solemnity of ${s.key}: fixed is true or absent`);
    // One the Sunday before or after its feast may be moved to the other (no. 359); one on a named Sunday is fixed.
    if (!/-sunday$/.test(s.on) && s.fixed !== true) throw new Error(`${where}: external solemnity of ${s.key} on ${s.on} must be fixed`);
    if (!s.rubric) throw new Error(`${where}: external solemnity of ${s.key} cites no rubric`);
    if (!s.source) throw new Error(`${where}: external solemnity of ${s.key} cites no source`);
  }
};
const solemnityOf = ({ key, on, fixed, rubric }) => ({ key, on, ...(fixed ? { fixed: true } : {}), rubric });
const massData = read('masses.json');
checkSolemnities('data/masses.json', massData.externalSolemnities.solemnities);
for (const [id, layer] of Object.entries(layers)) checkSolemnities(`layer ${id}`, layer.externalSolemnities ?? []);
const ordos = Object.fromEntries(readdirSync(new URL('../data/ordos/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => [file.replace(/\.json$/, ''), read(`ordos/${file}`)]));
const massKeys = new Set();
const titled = (where, mass) => {
  if (known.has(mass.key) || massKeys.has(mass.key)) throw new Error(`${where}: ${mass.key} is already a key`);
  massKeys.add(mass.key);
  for (const language of REQUIRED) if (!mass.names?.[language]) throw new Error(`${where}: ${mass.key} has no ${language} title`);
  for (const [language, title] of Object.entries(mass.names)) {
    if (!LANGUAGES.includes(language)) throw new Error(`${where}: ${mass.key} has a title in unknown language ${language}`);
    names[language][mass.key] = title;
  }
};
for (const mass of massData.masses) {
  checkFields(`data/masses.json: ${mass.key}`, mass, ['key', 'kind', 'colors', 'ofTheLord', 'ofOurLady', 'names', 'source']);
  if (!['votive', 'rogation', 'requiem'].includes(mass.kind)) throw new Error(`data/masses.json: ${mass.key} is of unknown kind ${mass.kind}`);
  checkColors(`data/masses.json: ${mass.key}`, mass.colors);
  if (!mass.source) throw new Error(`data/masses.json: ${mass.key} cites no source`);
  titled('data/masses.json', mass);
}

// Where a Mass of the day differs from the day: no Mass, its own colour, its own commemoration.
const ofTheDay = { noMass: [], colors: {}, commemorations: {} };
for (const item of massData.ofTheDay.noMass) {
  if (!known.has(item.key)) throw new Error(`data/masses.json: no Mass on unknown observance ${item.key}`);
  if (!item.source) throw new Error(`data/masses.json: no Mass on ${item.key} cites no source`);
  ofTheDay.noMass.push(item.key);
}
for (const item of massData.ofTheDay.colors) {
  if (!known.has(item.key)) throw new Error(`data/masses.json: colours of unknown Mass ${item.key}`);
  checkColors(`data/masses.json: the Mass of ${item.key}`, item.colors);
  const whole = catalogue.find((entry) => entry.key === item.key).colors;
  if (item.colors.some((color) => !whole.includes(color))) throw new Error(`data/masses.json: the Mass of ${item.key} has a colour the day has not`);
  if (!item.source) throw new Error(`data/masses.json: colours of ${item.key} cite no source`);
  ofTheDay.colors[item.key] = item.colors;
}
for (const item of massData.ofTheDay.commemorations) {
  if (!known.has(item.mass)) throw new Error(`data/masses.json: a commemoration in unknown Mass ${item.mass}`);
  if (!item.source) throw new Error(`data/masses.json: the commemoration of ${item.key} cites no source`);
  titled('data/masses.json', item);
  (ofTheDay.commemorations[item.mass] ??= []).push(item.key);
}

const checkRule = (where, rule, allowed) => {
  checkFields(where, rule, [...allowed, 'source']);
  if (!MASS_KINDS.includes(rule.kind)) throw new Error(`${where}: unknown kind of Mass ${JSON.stringify(rule.kind)}`);
  if (!rule.source) throw new Error(`${where}: cites no source`);
};
for (const [id, ordo] of Object.entries(ordos)) {
  if (ordo.ordo !== id) throw new Error(`data/ordos/${id}.json is for ordo ${ordo.ordo}`);
  checkFields(`ordo ${id}`, ordo, ['ordo', 'about', 'first', 'omit', 'highPriest', 'massesForCertainPlaces']);
  (ordo.first?.rules ?? []).forEach((rule, i) => {
    const where = `ordo ${id}: first, rule ${i + 1}`;
    checkRule(where, rule, ['kind', 'within', 'onDaysOfClass', 'onCelebrations']);
    if (rule.within !== undefined && rule.within !== 'all-souls-octave') throw new Error(`${where}: within ${JSON.stringify(rule.within)}`);
    if (rule.onDaysOfClass?.some((cls) => ![1, 2, 3, 4].includes(cls))) throw new Error(`${where}: onDaysOfClass ${JSON.stringify(rule.onDaysOfClass)}`);
    if (rule.onCelebrations?.some((kind) => !OBSERVANCE_KINDS.includes(kind))) throw new Error(`${where}: onCelebrations ${JSON.stringify(rule.onCelebrations)}`);
  });
  (ordo.omit?.masses ?? []).forEach((rule, i) => {
    const where = `ordo ${id}: omit, rule ${i + 1}`;
    checkRule(where, rule, ['kind', 'class', 'season']);
    if (rule.class !== undefined && ![1, 2, 3, 4].includes(rule.class)) throw new Error(`${where}: class ${JSON.stringify(rule.class)}`);
    if (rule.season !== undefined && rule.season !== 'lent') throw new Error(`${where}: season ${JSON.stringify(rule.season)}`);
  });
  if (ordo.highPriest !== undefined && !['thursday', 'saturday'].includes(ordo.highPriest)) throw new Error(`ordo ${id}: highPriest ${JSON.stringify(ordo.highPriest)}`);
  for (const mass of ordo.massesForCertainPlaces?.masses ?? []) {
    const where = `ordo ${id}: ${mass.key}`;
    checkFields(where, mass, ['key', 'date', 'colors', 'ofTheLord', 'ofOurLady', 'commemoratedOnThePage', 'names']);
    const date = /^(\d\d)-(\d\d)$/.exec(mass.date ?? '');
    if (!date || Number(date[1]) < 1 || Number(date[1]) > 12 || Number(date[2]) < 1 || Number(date[2]) > DAYS_IN_MONTH[Number(date[1]) - 1]) throw new Error(`${where} needs a date as MM-DD`);
    checkColors(where, mass.colors);
    titled(`ordo ${id}`, mass);
  }
}
const masses = Object.fromEntries(massData.masses.map(({ names: _, ...mass }) => [mass.key, mass]));
const ordoProfiles = Object.fromEntries(Object.entries(ordos).map(([id, ordo]) => [id, {
  ordo: id,
  first: (ordo.first?.rules ?? []).map(({ source: _, ...rule }) => rule),
  omit: (ordo.omit?.masses ?? []).map(({ source: _, ...rule }) => rule),
  ...(ordo.highPriest ? { highPriest: ordo.highPriest } : {}),
  massesForCertainPlaces: (ordo.massesForCertainPlaces?.masses ?? []).map(({ names: _, commemoratedOnThePage: __, ...mass }) => mass),
}]));
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
  MASSES: [masses, 'Readonly<Record<string, MassFormulary>>'],
  EXTERNAL_SOLEMNITIES: [massData.externalSolemnities.solemnities.map(solemnityOf), 'readonly ExternalSolemnity[]'],
  OF_THE_DAY: [ofTheDay, 'MassesOfTheDay'],
  ORDOS: [ordoProfiles, 'Readonly<Record<string, OrdoProfile>>'],
};

const lines = [
  '// Generated by scripts/generate-data.mjs from data/. Do not edit.',
  "import { deepFreeze } from '../freeze.js';",
  "import type { CatalogueEntry, ExternalSolemnity, Language, Layer, MassesOfTheDay, MassFormulary, OrdoProfile, TemporalBlockName } from '../types.js';",
  '',
];
for (const [name, [value, type]] of Object.entries(sources)) {
  lines.push(`export const ${name}: ${type} = deepFreeze(${JSON.stringify(value)});`, '');
}

const dir = new URL('../src/generated/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('data.ts', dir), lines.join('\n'));
