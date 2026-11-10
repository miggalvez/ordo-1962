// Spanish titles from Divinum Officium (MIT), read from a checkout of
// https://github.com/DivinumOfficium/divinum-officium at the commit recorded in
// data/divinum-officium/source.json.
//
// Each catalogue entry's Missale Meum id names a Divinum Officium missal file
// (sancti:11-19 -> Sancti/11-19.txt); its title is the [Officium] section of the
// Spanish file, the variant for the 1960 rubrics where the file has several.
// Titles are written in the style of the Spanish missal: San, Santa and Santos in
// full, and the saint's category in lower case ("San Blas, obispo y mártir").
// Observances with no usable Spanish title are left out; data/reviewed/names.json
// supplies them.
//
// Usage: node scripts/import-divinum-officium-es.mjs <divinum-officium checkout> [--check]
//   --check  compare with the committed files instead of writing them
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = (path) => new URL(`../${path}`, import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(here(path), 'utf8'));
const json = (value) => `${JSON.stringify(value, null, 1)}\n`;

/** The sections of a Divinum Officium file: name, rubric condition, lines. */
function sections(text) {
  const out = [];
  let current = { name: '', condition: '', lines: [] };
  out.push(current);
  for (const line of text.split(/\r?\n/)) {
    const header = /^\[([^\]]+)\]\s*(?:\((.*)\))?\s*$/.exec(line);
    if (header) {
      current = { name: header[1], condition: header[2] ?? '', lines: [] };
      out.push(current);
    } else current.lines.push(line);
  }
  return out;
}

// A condition that applies under the 1960 rubrics ("rubrica 196", "rubrica 196 aut rubrica 1955").
const for1960 = (condition) => /rubrica 196(?!\d)/.test(condition);

/** The first line of the named section that applies in 1960, or null. */
function sectionLine(parts, name) {
  const candidates = parts.filter((part) => part.name === name);
  const chosen = candidates.find((part) => for1960(part.condition)) ?? candidates.find((part) => !part.condition);
  const line = chosen?.lines.find((text) => text.trim());
  return line ? line.trim() : null;
}

export function readTitle(root, file, depth = 0) {
  const path = join(root, 'web/www/missa/Espanol', `${file}.txt`);
  if (!existsSync(path) || depth > 4) return null;
  const text = readFileSync(path, 'utf8');
  const parts = sections(text);
  const own = sectionLine(parts, 'Officium');
  if (own) return { title: own, files: [file] };
  // A file that begins with @Path takes everything it does not override from Path.
  const redirect = /^@([A-Za-z]+\/[^\s:]+)\s*$/.exec(parts[0].lines.find((line) => line.trim()) ?? '');
  if (redirect) {
    const inherited = readTitle(root, redirect[1], depth + 1);
    return inherited ? { title: inherited.title, files: [file, ...inherited.files] } : null;
  }
  return null;
}

// Before these names Spanish says Santo, not San.
const SANTO = /^(Domingo|Tomás|Tomas|Toribio|Tomé)\b/;
// The saint's category, written in lower case after the name.
const CATEGORY = new Set([
  'Abad', 'Abadesa', 'Apóstol', 'Apóstoles', 'Arcángel', 'Confesor', 'Confesores', 'Diácono', 'Doctor', 'Doctores',
  'Duque', 'Emperador', 'Ermitaño', 'Esposo', 'Evangelista', 'Madre', 'Mártir', 'Mártires', 'Monje', 'Obispo',
  'Obispos', 'Padre', 'Papa', 'Papas', 'Penitente', 'Pontífices', 'Presbítero', 'Primer', 'Protomártir', 'Reina',
  'Rey', 'Sumos', 'Viuda', 'Virgen', 'Vírgenes',
]);

// A category word is lowered where it opens a description: after a comma, after
// "y" or "e", or after another category word ("Sumos Pontífices y Mártires").
// "la Virgen Santísima" and "Bienaventurada Virgen María" are left alone.
function lowerCategories(tail) {
  let previous = ',';
  return tail.replace(/[\p{L}]+|[^\p{L}]+/gu, (token) => {
    if (!/\p{L}/u.test(token)) {
      if (token.includes(',')) previous = ',';
      return token;
    }
    const opens = previous === ',' || previous === 'y' || previous === 'e' || previous === 'category';
    if (CATEGORY.has(token) && opens) {
      previous = 'category';
      return token.toLowerCase();
    }
    previous = token === 'y' || token === 'e' ? token : 'word';
    return token;
  });
}

export function normalize(raw) {
  let title = raw.replace(/\s+/g, ' ').trim();
  title = title
    .replace(/\bVírgen\b/g, 'Virgen')
    .replace(/\bSS\.\s*Llagas/g, 'Sagradas Llagas')
    .replace(/\bStas\.\s*/g, 'Santas ')
    .replace(/\bSma\.\s*/g, 'Santísima ')
    .replace(/\bSmo\.\s*/g, 'Santísimo ')
    .replace(/\bStos\.\s*/g, 'Santos ')
    .replace(/\bSta\.\s*/g, 'Santa ')
    .replace(/\bSs\.\s*/g, 'Santos ')
    .replace(/\bS\.\s+(?=\p{Lu})/gu, (match, offset) => (SANTO.test(title.slice(offset + match.length)) ? 'Santo ' : 'San '))
    .replace(/\bB\.\s*(?=Virgen)/g, 'Bienaventurada ');
  const comma = title.indexOf(',');
  if (comma > 0) title = title.slice(0, comma) + lowerCategories(title.slice(comma));
  // Divinum Officium sometimes writes "S." for a woman ("S. Catalina de Siena, Virgen").
  if (comma > 0 && /^San /.test(title) && /\b(virgen|viuda|abadesa|reina|madre)\b/.test(title.slice(comma))) title = title.replace(/^San /, 'Santa ');
  return title.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

const looksLatin = (title) => /\b(Martyrum|Confessoris|Virginis|Episcopi|Sanctorum|Beatæ|Beatae|and)\b/.test(title);

export function importSpanish(root) {
  const catalogue = readJson('data/catalogue.json');
  const names = {};
  const files = {};
  const skipped = [];
  for (const entry of catalogue) {
    if (!entry.sourceId) continue;
    const [kind, id] = entry.sourceId.split(':');
    if (kind !== 'sancti' && kind !== 'tempora') { skipped.push(entry.key); continue; }
    const found = readTitle(root, `${kind === 'tempora' ? 'Tempora' : 'Sancti'}/${id}`);
    if (!found || looksLatin(found.title)) { skipped.push(entry.key); continue; }
    names[entry.key] = normalize(found.title);
    for (const file of found.files) {
      const path = `web/www/missa/Espanol/${file}.txt`;
      files[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
    }
  }
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  return { names: sorted(names), files: sorted(files), skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: import-divinum-officium-es.mjs <divinum-officium checkout> [--check]');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const { names, files, skipped } = importSpanish(root);
  const source = {
    repository: 'https://github.com/DivinumOfficium/divinum-officium',
    commit,
    licence: 'MIT',
    about: 'Spanish missal titles read by scripts/import-divinum-officium-es.mjs, with the SHA-256 of every file read.',
    files,
  };
  if (process.argv.includes('--check')) {
    const recorded = readJson('data/divinum-officium/source.json');
    if (recorded.commit !== commit) throw new Error(`checkout is at ${commit}; data/names/es.json came from ${recorded.commit}`);
    const same = json(names) === readFileSync(here('data/names/es.json'), 'utf8') && json(source) === json(recorded);
    console.log(same ? 'data/names/es.json is what a fresh import produces' : 'data/names/es.json differs from a fresh import');
    process.exitCode = same ? 0 : 1;
  } else {
    mkdirSync(here('data/divinum-officium/'), { recursive: true });
    writeFileSync(here('data/names/es.json'), json(names));
    writeFileSync(here('data/divinum-officium/source.json'), json(source));
    console.log(`${Object.keys(names).length} Spanish titles; ${skipped.length} left to data/reviewed/names.json: ${skipped.join(', ')}`);
  }
}
