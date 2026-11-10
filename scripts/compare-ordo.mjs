// Development-time cross-check of celebrations and commemorations against the
// SSPX Ordo (ordo.fsspx.org). Its responses are not part of this repository.
//
// Usage: node scripts/compare-ordo.mjs <dir with ordo-en-<year>.json> [from] [to] [--json]
// Fetch a year with: https://ordo.fsspx.org/api/v1/calendar/<year>?lang=en&congregation=
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveYear } from '../dist/esm/index.js';

const NAMES = JSON.parse(readFileSync(new URL('../data/names/en.json', import.meta.url), 'utf8'));

const decode = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ');
const deburr = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const UNITS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
const ORD = { ...UNITS, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
const STOP = new Set('st sts ss s saint saints of the and in on at a an for to with his her their day feast from within or our lord jesus christ confessor confessors martyr martyrs bishop bishops virgin virgins doctor doctors pope popes abbot widow king queen apostle apostles evangelist priest deacon companions church hermit commemoration'.split(' '));
const roman = (t) => { const m = { i: 1, v: 5, x: 10, l: 50 }; let n = 0; for (let i = 0; i < t.length; i += 1) { const c = m[t[i]]; const nx = m[t[i + 1]] || 0; n += c < nx ? -c : c; } return n; };
function tokens(s) {
  let t = deburr(decode(s)).toLowerCase();
  t = t.replace(/\b(twenty|thirty)[\s-]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/g, (_, a, b) => String((a === 'twenty' ? 20 : 30) + UNITS[b]));
  t = t.replace(/\bb\.?\s*v\.?\s*m\.?\b|\bblessed virgin mary\b|\bour lady\b/g, ' mary ').replace(/[^a-z0-9\s]/g, ' ');
  const out = new Set();
  for (let w of t.split(/\s+/).filter(Boolean)) {
    if (/^\d+(st|nd|rd|th)$/.test(w)) w = w.replace(/\D+$/, '');
    if (ORD[w]) w = String(ORD[w]); else if (w.length <= 6 && /^(?=[ivxl]+$)(l?x{0,3})(ix|iv|v?i{0,3})$/.test(w)) w = String(roman(w));
    if (!STOP.has(w)) out.add(w);
  }
  return [...out];
}
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j += 1) d[0][j] = j; for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const tm = (a, b) => a === b || (!/\d/.test(a + b) && a.length >= 5 && b.length >= 5 && (a.slice(0, 4) === b.slice(0, 4) || lev(a, b) <= 2));
const numbers = (list) => list.filter((t) => /^\d+$/.test(t));
function sim(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.length || !y.length) return x.length === y.length ? 1 : 0;
  // Numbers must not contradict: the 7th Sunday after Pentecost is not the 9th.
  const [fewer, more] = numbers(x).length <= numbers(y).length ? [numbers(x), numbers(y)] : [numbers(y), numbers(x)];
  if (fewer.length && !fewer.every((t) => more.includes(t))) return 0;
  return x.filter((t) => y.some((u) => tm(t, u))).length / Math.min(x.length, y.length);
}

/**
 * How much of each name is found in the other: [share of the shorter, share of the longer].
 * A stricter caller asks for both, so that "St. Peter" is not "St. Peter Claver".
 */
export function overlap(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.length || !y.length) return x.length === y.length ? [1, 1] : [0, 0];
  const [fewer, more] = numbers(x).length <= numbers(y).length ? [numbers(x), numbers(y)] : [numbers(y), numbers(x)];
  if (fewer.length && !fewer.every((t) => more.includes(t))) return [0, 0];
  const matched = x.filter((t) => y.some((u) => tm(t, u))).length;
  return [matched / Math.min(x.length, y.length), matched / Math.max(x.length, y.length)];
}

// Two names are the same observance when more than half the words of the shorter one are
// found in the other. Exactly half is not enough: St. John Damascene is not St. John Chrysostom.
const MATCH = 0.51;

// Names the Ordo uses that share no words with ours.
const ALIASES = {
  'octave-day-of-christmas': 'Circumcision of the Lord',
  'st-bridget-of-sweden': 'St. Birgitta',
  'st-vivian': 'St. Bibiana',
  'st-dionysius-and-companions': 'Sts. Denis Rusticus Eleutherius',
  'for-the-rogations': 'Greater Litanies',
  'our-lady-on-saturday-advent': 'Saturday of Our Lady',
  'our-lady-on-saturday-christmastide': 'Saturday of Our Lady',
  'our-lady-on-saturday-after-purification': 'Saturday of Our Lady',
  'our-lady-on-saturday-paschaltide': 'Saturday of Our Lady',
  'our-lady-on-saturday-after-pentecost': 'Saturday of Our Lady',
  'st-joseph-the-workman': 'Patronage of St. Joseph',
  'dedication-of-the-archbasilica-of-our-holy-savior': 'Dedication of the Lateran Basilica of Our Savior',
  'dedication-of-the-basilica-of-st-mary-major': 'Our Lady of the Snows',
  'st-thomas-becket': 'St. Thomas of Canterbury',
  'st-theresa-of-the-infant-jesus': 'St. Thérèse of the Child Jesus',
  'holy-machabees': 'The Holy Maccabean Martyrs',
  'vigil-of-christmas': 'Christmas Eve',
  'pasc6-1': 'Monday after the Sunday after the Ascension',
  'pasc6-2': 'Tuesday after the Sunday after the Ascension',
  'pasc6-3': 'Wednesday after the Sunday after the Ascension',
  'pasc6-4': 'Thursday after the Sunday after the Ascension',
  'pasc6-5': 'Friday after the Sunday after the Ascension',
};
export const nameOf = (key) => NAMES[key] ?? key;
const isFeriaKey = (key) => /^(adv|quad|quadp|epi|pent|pasc|sep-ember)\d*-[1-6]$|^sep-ember-\d$|^feria$/.test(key);
export function score(key, name) {
  // The Ordo calls a feria or its commemoration "Of the feria", "Feria" or by its date.
  if (isFeriaKey(key) && /^(of the feria|feria|(january|december) \d+)$/i.test(name)) return 1;
  return Math.max(sim(nameOf(key), name), ALIASES[key] ? sim(ALIASES[key], name) : 0);
}

/** Match two ordered lists of names; returns the unmatched on each side and whether the order agrees. */
export function matchLists(ours, theirs) {
  const used = new Set();
  const pairs = [];
  for (const [i, key] of ours.entries()) {
    let best = -1;
    let bestScore = MATCH;
    for (const [j, name] of theirs.entries()) {
      if (used.has(j)) continue;
      const s = score(key, name);
      if (s >= bestScore) { best = j; bestScore = s; }
    }
    if (best >= 0) { used.add(best); pairs.push([i, best]); }
  }
  const oursOnly = ours.filter((_, i) => !pairs.some(([a]) => a === i));
  const theirsOnly = theirs.filter((_, j) => !used.has(j));
  const order = pairs.map(([, j]) => j);
  const sameOrder = order.every((j, k) => k === 0 || j > order[k - 1]);
  return { oursOnly, theirsOnly, sameOrder };
}

export function compareWithOrdo(dir, year) {
  const file = path.join(dir, `ordo-en-${year}.json`);
  if (!existsSync(file)) return null;
  const ordo = new Map(JSON.parse(readFileSync(file, 'utf8')).days.map((day) => [day.date, day]));
  const differences = [];
  for (const day of resolveYear(year)) {
    const theirs = ordo.get(day.date);
    if (!theirs) {
      // A day the Ordo data lacks is a difference, not a pass.
      differences.push({ date: day.date, missing: true, oursOnly: [], ordoOnly: [], sameOrder: true, ours: day.commemorations, ordo: [], celebrated: day.celebration.key });
      continue;
    }
    const celebration = decode(theirs.celebration.name).replace(/\s+/g, ' ').trim();
    const sameCelebration = score(day.celebration.key, celebration) >= MATCH;
    const commemorations = (theirs.commemorations ?? []).map((c) => decode(c.name).replace(/\s+/g, ' ').trim());
    const { oursOnly, theirsOnly, sameOrder } = matchLists(day.commemorations, commemorations);
    if (!sameCelebration || oursOnly.length || theirsOnly.length || !sameOrder) {
      differences.push({
        date: day.date,
        celebration: sameCelebration ? undefined : { ours: day.celebration.key, ordo: celebration },
        oursOnly, ordoOnly: theirsOnly, sameOrder,
        ours: day.commemorations, ordo: commemorations,
        celebrated: day.celebration.key,
      });
    }
  }
  return differences;
}

/** What differs on a day, in a form that can be reviewed and frozen. */
export function whatDiffers(d) {
  if (d.missing) return 'missing from the Ordo data';
  const parts = [];
  if (d.celebration) parts.push(`celebration: ${d.celebration.ours} / ${d.celebration.ordo.replace(/\d+/g, 'N')}`);
  if (d.oursOnly.length) parts.push(`ours only: ${d.oursOnly.map((key) => key.replace(/-12-2\dc$/, '')).join(', ')}`);
  if (d.ordoOnly.length) parts.push(`ordo only: ${d.ordoOnly.join(', ')}`);
  if (!d.sameOrder) parts.push('order');
  return parts.join(' | ');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, ...rest] = process.argv.slice(2);
  const [from = 2026, to = 2040] = rest.filter((a) => /^\d{4}$/.test(a)).map(Number);
  const all = [];
  for (let year = from; year <= to; year += 1) all.push(...(compareWithOrdo(dir, year) ?? []));
  if (process.argv.includes('--json')) console.log(JSON.stringify(all, null, 1));
  else {
    for (const d of all) {
      const parts = d.missing ? ['MISSING from the Ordo data'] : [];
      if (d.celebration) parts.push(`CELEBRATION ours ${d.celebration.ours} / ordo ${d.celebration.ordo}`);
      if (d.oursOnly.length) parts.push(`ours only: ${d.oursOnly.join(', ')}`);
      if (d.ordoOnly.length) parts.push(`ordo only: ${d.ordoOnly.join(', ')}`);
      if (!d.sameOrder) parts.push(`order: ours ${d.ours.join(', ')} / ordo ${d.ordo.join('; ')}`);
      console.log(`${d.date} ${d.celebrated} | ${parts.join(' | ')}`);
    }
    console.log(`${all.length} differing days in ${from}-${to}`);
  }
}
