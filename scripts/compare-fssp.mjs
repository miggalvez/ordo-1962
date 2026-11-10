// Compare the engine with the FSSP seminary's published calendar
// (fsspolgs.org/liturgical-calendar), scoring the first row printed for each day.
// The page is not part of this repository; keep a copy under .cache/fssp/.
//
// Usage: node scripts/compare-fssp.mjs <saved page.html> <year> [--layers us,fssp] [--masses] [--json]
// With --masses, the FSSP ordo's first Mass (src/ordo.ts, data/ordos/fssp.json) is scored instead of the celebration.
import { readFileSync } from 'node:fs';

import { LAYERS, NAMES, ordoYear, resolveYear } from '../dist/esm/index.js';
import { nameOf, overlap } from './compare-ordo.mjs';

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

// Names the page uses for an observance, where it shares too few words with ours.
// Reviewed one by one: a name here is that observance and no other.
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
  'quad6-1': 'Monday of the Holy Week',
  'quad6-2': 'Tuesday of the Holy Week',
  'quad6-3': 'Wednesday of the Holy Week',
  'quad6-6': 'Holy Saturday and the Easter Vigil',
  'for-the-rogations': 'The Greater Litanies',
  'st-gregory-the-great': 'St. Gregory, Pope, Confessor & Doctor of the Church',
  'st-peter-of-verona': 'St. Peter, Martyr',
  'st-silverius': 'St. Silverius, Pop & Martyr', // sic
  'pope-sixtus-ii-felicissimus-and-agapitus-martyrs': 'St. Sixtus & Companions, Martyrs',
  'st-bernard-of-clairvaux': 'St. Bernard, Abbot & Doctor',
  'st-wenceslaus': 'St. Wenceslaus, Duke & Martyr',
  'st-theresa-of-the-infant-jesus': 'St. Terese of the Child Jesus, Virgin',
  'st-dionysius-and-companions': 'St. Denis, Bishop, Rusticus and Eleutherius, Martyrs',
  'st-elizabeth-of-hungary': 'St. Elizabeth, Widow',
  'st-sylvester-gozzolini': 'St. Sylvester, Abbot',
  'st-vivian': 'St. Bibiana, Virgin and Martyr',
  'st-stephen': 'St. Stephen, Deacon & Protomartyr',
};

// A feria is printed by its season. The key says which season the engine means.
const FERIA_NAME = [
  [/^adv\d-[1-6]$/, /^(major )?feria of advent$/i],
  [/^quad\d-[1-6]$/, /^feria of lent$/i],
  [/^pasc\d-[1-6]$/, /^feria of paschaltide$/i],
  // "Feria of Epiphany" is the page's name for the days to 13 January; "Feira" is its slip on 19 January.
  [/^epi\d-[1-6]$|^feria$/, /^(feria( of epiphany)?|feira)$/i],
  [/^(pent\d\d|quadp\d)-[1-6]$/, /^feria$/i],
];

/** Whether a name on the page is this observance. */
export function isSame(key, name) {
  const plain = name.replace(/^\(USA\)\s*/, '').trim();
  const feria = FERIA_NAME.find(([keys]) => keys.test(key));
  if (feria && /^(major )?fe(ri|ir)a\b/i.test(plain)) return feria[1].test(plain);
  if (/^our-lady-on-saturday-/.test(key)) return plain === 'Our Lady on Saturday';
  if (FSSP_ALIASES[key] === plain) return true;
  // More than half of each name must be found in the other: St. Peter is not St. Peter Claver.
  const [ofShorter, ofLonger] = overlap(LAYER_NAMES[key] ?? nameOf(key), plain);
  return ofShorter >= 0.51 && ofLonger >= 0.51;
}

function matchFssp(ours, theirs) {
  const used = new Set();
  const pairs = [];
  const oursOnly = [];
  for (const key of ours) {
    const j = theirs.findIndex((name, k) => !used.has(k) && isSame(key, name));
    if (j >= 0) { used.add(j); pairs.push(j); } else oursOnly.push(key);
  }
  return {
    oursOnly,
    theirsOnly: theirs.filter((_, k) => !used.has(k)),
    sameOrder: pairs.every((j, k) => k === 0 || j > pairs[k - 1]),
  };
}

function compareRow(day, row) {
  const sameCelebration = isSame(day.celebration.key, row.name);
  const sameClass = row.class === day.celebration.class;
  const { oursOnly, theirsOnly, sameOrder } = matchFssp(day.commemorations, row.commemorations);
  const same = sameCelebration && sameClass && !oursOnly.length && !theirsOnly.length && sameOrder;
  return { same, sameCelebration, sameClass, oursOnly, fsspOnly: theirsOnly, sameOrder, row };
}

/**
 * Every day on which the engine differs from the page. The first printed row is
 * scored, as the plan asks. Where that row is another Mass the ordo permits and
 * the page also prints the day's own celebration lower down, that row is scored
 * too (`own`), so a difference in the day's own commemorations is not hidden.
 */
export function compareWithFssp(html, year, options = {}) {
  const fssp = readFsspPage(html, year);
  const differences = [];
  for (const day of resolveYear(year, options)) {
    const rows = fssp.get(day.date);
    if (!rows) { differences.push({ date: day.date, missing: true }); continue; }
    const first = compareRow(day, rows[0]);
    if (first.same) continue;
    const ownRow = first.sameCelebration ? undefined : rows.slice(1).find((row) => isSame(day.celebration.key, row.name));
    differences.push({
      date: day.date,
      ours: `${day.celebration.key} [${day.celebration.class}]`,
      fssp: `${rows[0].name} [${rows[0].class}]`,
      rowsPrinted: rows.length,
      ...first,
      row: undefined,
      own: ownRow ? compareRow(day, ownRow) : undefined,
      otherRows: rows.slice(1).map((r) => `${r.name} [${r.class}]`),
    });
  }
  return differences;
}

/** What differs on a day, as one line: the reviewed fixture records it and the test compares it. */
export function whatDiffers(d) {
  if (d.missing) return 'not on the page';
  const describe = (c, label) => {
    const parts = [];
    if (!c.sameCelebration) parts.push(`${label}${d.ours.replace(/ \[\d\]$/, '')} / ${c.row ? c.row.name : d.fssp.replace(/ \[\d\]$/, '')}`);
    if (!c.sameClass) parts.push(`${label}class ${d.ours.slice(-2, -1)} / ${(c.row ? `[${c.row.class}]` : d.fssp).slice(-2, -1)}`);
    if (c.oursOnly.length) parts.push(`${label}ours only: ${c.oursOnly.join(', ')}`);
    if (c.fsspOnly.length) parts.push(`${label}page only: ${c.fsspOnly.join('; ')}`);
    if (!c.sameOrder) parts.push(`${label}order`);
    return parts;
  };
  const parts = describe(d, '');
  if (d.own) parts.push(d.own.same ? 'own row agrees' : `own row: ${describe(d.own, '').filter((part) => !/ \/ /.test(part) || /^class/.test(part)).join(', ')}`);
  else if (!d.sameCelebration) parts.push('no own row');
  return parts.join(' | ');
}

// The page's names for the Masses of data/masses.json.
const MASS_NAMES = {
  'votive-jesus-christ-the-eternal-high-priest': ['Jesus Christ the High Priest'],
  'votive-sacred-heart-of-jesus': ['Sacred Heart of Jesus'],
  'votive-immaculate-heart-of-mary': ['Immaculate Heart of Mary'],
  'requiem-daily': ['Daily Mass for the Dead'],
  'rogation-mass': ['Rogation Mass', 'The Greater Litanies'],
};

/** Whether a row of the page is this Mass. */
export function isSameMass(mass, name) {
  const plain = name.replace(/^\(USA\)\s*/, '').trim();
  const solemnity = /^External Solemnity of (?:The )?(.*)$/i.exec(plain);
  if (mass.kind === 'external-solemnity') return Boolean(solemnity) && isSame(mass.key, solemnity[1]);
  if (solemnity) return false;
  if (MASS_NAMES[mass.key]) return MASS_NAMES[mass.key].includes(plain);
  if (mass.kind === 'for-certain-places') {
    const [ofShorter, ofLonger] = overlap(NAMES.en[mass.key], plain);
    return ofShorter >= 0.51 && ofLonger >= 0.51;
  }
  return isSame(mass.key, plain);
}

/**
 * The Masses of the FSSP ordo (data/ordos/fssp.json) against the page, on every
 * day: whether the page's first row is the ordo's first Mass, with its class and
 * commemorations; if not, where the page's first Mass is in the ordo's list; and
 * any row of the page that is none of the Masses the ordo lists.
 */
export function compareMassesWithFssp(html, year, options = {}) {
  const fssp = readFsspPage(html, year);
  const differences = [];
  for (const day of ordoYear(year, { ...options, ordo: 'fssp' })) {
    const rows = fssp.get(day.date);
    if (!rows) { differences.push({ date: day.date, line: 'not on the page' }); continue; }
    const parts = [];
    const [first] = day.masses;
    if (isSameMass(first, rows[0].name)) {
      if (rows[0].class !== first.class) parts.push(`class ${first.class} / ${rows[0].class}`);
      const { oursOnly, theirsOnly, sameOrder } = matchFssp(first.commemorations, rows[0].commemorations);
      if (oursOnly.length) parts.push(`ours only: ${oursOnly.join(', ')}`);
      if (theirsOnly.length) parts.push(`page only: ${theirsOnly.join('; ')}`);
      if (!sameOrder) parts.push('order');
    } else {
      const at = day.masses.findIndex((mass) => isSameMass(mass, rows[0].name));
      parts.push(at > 0 ? `page first: ${day.masses[at].key}, ours ${at + 1} of ${day.masses.length}; ours first: ${first.key}` : `page first: ${rows[0].name}, not ours; ours first: ${first.key}`);
    }
    const unlisted = rows.slice(1).filter((row) => !day.masses.some((mass) => isSameMass(mass, row.name)));
    if (unlisted.length) parts.push(`not ours: ${unlisted.map((row) => row.name).join('; ')}`);
    if (parts.length) differences.push({ date: day.date, line: parts.join(' | ') });
  }
  return differences;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, yearText] = process.argv.slice(2);
  const layersAt = process.argv.indexOf('--layers');
  const codes = layersAt > 0 ? process.argv[layersAt + 1].split(',') : [];
  const options = {
    nations: codes.filter((code) => Object.values(LAYERS).some((layer) => layer.nation === code)),
    institutes: codes.filter((code) => Object.values(LAYERS).some((layer) => layer.institute === code)),
  };
  if (process.argv.includes('--masses')) {
    const masses = compareMassesWithFssp(readFileSync(file, 'utf8'), Number(yearText), options);
    if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(masses.map((d) => [d.date, d.line])), null, 1));
    else for (const d of masses) console.log(`${d.date} ${d.line}`);
    if (!process.argv.includes('--json')) console.log(`${masses.length} differing days`);
    process.exit(0);
  }
  const differences = compareWithFssp(readFileSync(file, 'utf8'), Number(yearText), options);
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(differences.map((d) => [d.date, whatDiffers(d)])), null, 1));
  else {
    for (const d of differences) console.log(`${d.date} ${whatDiffers(d)}`);
    console.log(`${differences.length} differing days`);
  }
}
