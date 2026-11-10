// Development-time check of the titles of fixed-date observances against the
// headings of the 1962 Missale Romanum, read from saved pages of its Proper of
// Saints (www.clerus.org/bibliaclerusonline/en/gmu.htm, gmv, gmw, gmx, gmy, gmz
// and gm0). The pages are not part of this repository.
//
// The Missal abbreviates ("Ss. Alexandri, Eventii et Theoduli Mm. ac Iuvenalis
// Ep. et Conf."), so titles are not compared word for word. What is compared is
// what the heading says the saint is: pope, bishop, martyr, confessor, doctor,
// virgin, widow, abbot. A title that says more or less than the Missal is a
// leftover from before 1960 (Alexander "I, papa") or has lost a word (St. Anthony
// of Padua, "doctor de la Iglesia").
//
// Usage: node scripts/compare-missal-titles.mjs <dir of saved pages> [--json]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOGUE, NAMES } from '../dist/esm/index.js';

const MONTHS = ['ianuarii', 'februarii', 'martii', 'aprilis', 'maii', 'iunii', 'iulii', 'augusti', 'septembris', 'octobris', 'novembris', 'decembris'];
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/y/g, 'i');
const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The headings of each day: month-day → [{ title, rank }], in the order printed. */
export function readMissal(dir) {
  const days = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.htm')).sort()) {
    const lines = readFileSync(join(dir, file), 'latin1').split(/<br\s*\/?>/i).map(clean);
    for (let i = 0; i < lines.length; i += 1) {
      // A heading opens a line or follows a month title ("FESTA APRILIS Die 2 aprilis"). References in the
      // text are in lower case ("ut in festo ..., die 2 aprilis").
      const head = /(?:^|\s)(?:Eodem die|Die) (\d{1,2}) ([a-z]+)\b\s*(.*)$/.exec(lines[i]);
      if (!head || !MONTHS.includes(head[2])) continue;
      const md = `${String(MONTHS.indexOf(head[2]) + 1).padStart(2, '0')}-${head[1].padStart(2, '0')}`;
      // The title is on the same line or the next ones, up to the line that gives the class.
      const parts = head[3] ? [head[3]] : [];
      let rank = '';
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
        if (!lines[j] || /^Missale 1962\b/.test(lines[j])) continue; // a page header between the date and the title
        const cls = /^(I{1,3}V?|IV) classis|^Commemoratio$/.exec(lines[j]);
        if (cls) { rank = lines[j]; break; }
        if (/^(Missa|Introitus|Oratio|Statio)\b/.test(lines[j])) break;
        parts.push(lines[j]);
      }
      const list = days.get(md) ?? [];
      // A heading in capitals carries its class on the same line ("S. LAURENTII MARTYRIS II classis Ant. ...").
      const inline = /^(.*?)\s+((?:I{1,3}|IV) classis|Commemoratio)\b/.exec(parts.join(' ').trim());
      list.push({ title: inline ? inline[1] : parts.join(' ').trim(), rank: inline ? inline[2] : rank });
      days.set(md, list);
    }
  }
  return days;
}

// What a title says the saint is, in each form the three sources use.
const TRAITS = {
  doctor: { missal: /Eccl\.? ?Doct|Doctoris/i, la: /Doctor/, es: /doctor/ },
  pope: { missal: /\bPapae\b|\bPp\.|Pontific/i, la: /Pap[aæ]|Pontific/, es: /\bpapas?\b|pontífice/ },
  bishop: { missal: /\bEpp?[.,]|Episcop/i, la: /Episc/, es: /\bobispos?\b/ },
  martyr: { missal: /\bMm\.|\bM\.(?=\s|$)|\bMart(\.|yr)/i, la: /Martyr|Mart\.|\bMm?\.(?=\s|$)/, es: /mártir|protomártir/i },
  confessor: { missal: /\bConf[.,]|\bCc\.|Confessor/i, la: /Conf/, es: /confesor/ },
  virgin: { missal: /\bVirg\.|\bVv\.|Virgin/i, la: /Virg/, es: /\bvirgen\b|vírgenes/i },
  widow: { missal: /\bVid\.|Vidu/i, la: /Vidu/i, es: /viuda/ },
  abbot: { missal: /\bAbb\.|Abbat/i, la: /Abbat/, es: /\babad\b/ },
};
// "Virgin" in the name of Our Lady is not a category.
const withoutOurLady = (text) => text.replace(/B(eat[aæ]e?)?\.? ?M(ari[aæ]e?)?\.? ?V(irg(ini?s?|ine)?)?\.?|Bienaventurada Virgen María|Santísima Virgen( María)?|Virgen Santísima|Virgen María|Virgen Dolorosa/gi, ' ');
const traitsOf = (text, form) => Object.keys(TRAITS).filter((trait) => TRAITS[trait][form].test(withoutOurLady(text)));

const STOP = new Set('s ss sancti sanctae sanctorum beatae mariae virginis b m v et ac in de pro die eodem atque mm ep conf eccl doct virg vid abb mart papae episcopi confessoris martyris martyrum doctoris ecclesiae'.split(' '));
const STOP_PLAIN = new Set([...STOP].map(plain));
const nameWords = (s) => plain(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_PLAIN.has(w));
function sameSaint(ours, heading) {
  const a = nameWords(ours);
  const b = nameWords(heading);
  if (!a.length || !b.length) return 0;
  return a.filter((w) => b.some((u) => u.slice(0, 4) === w.slice(0, 4))).length / Math.min(a.length, b.length);
}

/** For every fixed-date universal observance: the Missal's heading and where our Latin or Spanish says something else. */
export function compareWithMissal(dir) {
  const missal = readMissal(dir);
  const rows = [];
  for (const entry of CATALOGUE) {
    if (entry.scope !== 'universal' || !('fixed' in entry.date) || entry.formularyOf) continue;
    const la = NAMES.la[entry.key];
    const es = NAMES.es[entry.key];
    const headings = missal.get(entry.date.fixed) ?? [];
    const best = headings.map((h) => ({ ...h, score: sameSaint(la, h.title) })).sort((x, y) => y.score - x.score)[0];
    if (!best || best.score < 0.5) { rows.push({ key: entry.key, date: entry.date.fixed, la, es, heading: null }); continue; }
    const want = traitsOf(best.title, 'missal');
    const differs = {};
    for (const [form, text] of [['la', la], ['es', es]]) {
      const have = traitsOf(text, form);
      const missing = want.filter((trait) => !have.includes(trait));
      const extra = have.filter((trait) => !want.includes(trait));
      if (missing.length || extra.length) differs[form] = { missing, extra };
    }
    rows.push({ key: entry.key, date: entry.date.fixed, la, es, heading: best.title, rank: best.rank, differs });
  }
  return rows;
}

/** One line for a row that differs, or null. */
export function describe(row) {
  if (row.heading === null) return null;
  const parts = Object.entries(row.differs).map(([form, { missing, extra }]) => `${form}${missing.length ? ` lacks ${missing.join(', ')}` : ''}${extra.length ? ` adds ${extra.join(', ')}` : ''}`);
  return parts.length ? parts.join('; ') : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = compareWithMissal(process.argv[2]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(rows.map((row) => [row.key, describe(row) ?? (row.heading === null ? 'no heading found' : 'agrees')])), null, 1));
  else {
    const unmatched = rows.filter((row) => row.heading === null);
    const differing = rows.filter((row) => describe(row));
    for (const row of differing) console.log(`${row.date} ${row.key}: ${describe(row)}\n   missal: ${row.heading}\n   la: ${row.la}\n   es: ${row.es}`);
    console.log(`\n${rows.length} fixed-date observances; ${differing.length} differ from the Missal's heading; ${unmatched.length} have no heading of their own:`);
    console.log(unmatched.map((row) => `${row.date} ${row.key}`).join(', '));
  }
}
