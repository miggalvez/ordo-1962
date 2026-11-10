import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { CATALOGUE, DEDICATION_KEY, NAMES, nameOf, resolveDay, resolveYear, titleOf } from '../dist/esm/index.js';
import { compareNames, differs } from '../scripts/compare-names-es.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('every observance has a Latin, English and Spanish title (M6 gate)', () => {
  for (const entry of CATALOGUE) {
    for (const language of ['la', 'en', 'es']) {
      const title = nameOf(entry.key, language);
      assert.ok(title && title.trim() === title && title.length > 2, `${entry.key} (${language}): ${JSON.stringify(title)}`);
    }
  }
});

test('every day of a year with every layer resolves to titled observances', () => {
  for (const day of resolveYear(2027, { nations: ['us'], institutes: ['fssp'] })) {
    for (const key of [day.celebration.key, ...day.commemorations, ...day.inseparable]) {
      assert.ok(NAMES.es[key], `${day.date}: ${key}`);
    }
  }
});

test('the Spanish titles are written out in the Spanish missal style', () => {
  for (const [key, title] of Object.entries(NAMES.es)) {
    assert.doesNotMatch(title, /\b(S|Sta|Stas|Ss|SS|Sma|Smo|Stos)\.\s/, `${key}: abbreviation in ${title}`);
    assert.doesNotMatch(title, /\bVírgen\b/, `${key}: ${title}`);
    // San before a woman: the category says virgen, viuda, abadesa or reina.
    if (/^San /.test(title)) assert.doesNotMatch(title, /, .*\b(virgen|viuda|abadesa|reina)\b/, `${key}: ${title}`);
    // The category is in lower case wherever it stands, and follows a comma.
    assert.doesNotMatch(title, /\b(Obispo|Confesor|Mártir|Viuda|Papa|Abad|Apóstol|Doctor|Presbítero|Diácono)\b/, `${key}: ${title}`);
    if (!['forty-holy-martyrs-of-sebaste', 'holy-machabees'].includes(key)) assert.doesNotMatch(title, /\bMártires\b/, `${key}: ${title}`);
    assert.doesNotMatch(title.replace(/(Bienaventurada|Santísima) Virgen|Virgen (María|Santísima|Dolorosa)|la Virgen/g, ''), /\bVirgen\b/, `${key}: ${title}`);
    // A title does not open with an article. ("De la Octava de Navidad" is a commemoration, said of the octave.)
    if (!/^for-octave-of-the-nativity/.test(key)) assert.doesNotMatch(title, /^(La|El|Los|Las|De la) /, `${key}: ${title}`);
  }
});

test('titles checked against the printed Spanish ordos', () => {
  const expected = {
    'st-peter-chrysologus': 'San Pedro Crisólogo, obispo, confesor y doctor de la Iglesia',
    'st-nicholas': 'San Nicolás, obispo y confesor',
    'st-clare': 'Santa Clara, virgen',
    'st-catherine-of-siena': 'Santa Catalina de Siena, virgen',
    'st-thomas-aquinas': 'Santo Tomás de Aquino, confesor y doctor de la Iglesia',
    'st-dominic': 'Santo Domingo, confesor',
    'st-john-mary-vianney': 'San Juan María Vianney, confesor',
    'octave-day-of-christmas': 'Octava de la Natividad del Señor',
    'sts-felicitas-and-perpetua': 'Santas Perpetua y Felicidad, mártires',
    'adv1-0': 'Domingo I de Adviento',
    'quad5-5': 'Viernes en la semana de Pasión',
  };
  for (const [key, title] of Object.entries(expected)) assert.equal(nameOf(key, 'es'), title, key);
});

test('the layers keep their own names and the church its own', () => {
  assert.equal(nameOf('us-our-lady-of-guadalupe', 'es'), 'Nuestra Señora de Guadalupe');
  assert.equal(nameOf('us-st-peter-claver', 'en'), 'St. Peter Claver, Confessor');
  assert.equal(nameOf('us-st-peter-claver', 'pl'), nameOf('us-st-peter-claver', 'la'), 'no Polish: Latin');
  assert.equal(nameOf(DEDICATION_KEY, 'es'), 'Aniversario de la Dedicación de la iglesia');
  const church = { titular: { key: 'st-local', date: '06-12', colors: ['red'], names: { la: 'S. Localis Martyris', es: 'San Local, mártir' } } };
  assert.equal(nameOf('st-local', 'es', { church }), 'San Local, mártir');
  assert.equal(nameOf('st-local', 'en', { church }), 'S. Localis Martyris', 'no English: Latin');
  assert.equal(nameOf('st-local', 'es'), undefined, 'not without the church');
  assert.equal(nameOf('no-such-feast', 'es'), undefined);
});

test('every hand-written title gives its reason and names a real observance', () => {
  const known = new Set(CATALOGUE.map((entry) => entry.key));
  for (const [key, entry] of Object.entries(read('../data/reviewed/names.json').names)) {
    assert.ok(known.has(key), key);
    assert.ok(entry.why, key);
  }
});

test('data/names/es.json is what a fresh import of Divinum Officium gives', { skip: !process.env.DO_DIR && 'set DO_DIR to a Divinum Officium checkout to run' }, () => {
  execFileSync(process.execPath, ['scripts/import-divinum-officium-es.mjs', process.env.DO_DIR, '--check'], {
    cwd: new URL('..', import.meta.url), stdio: 'pipe',
  });
});

test('the heading of a day is not the title of one of its Masses', () => {
  const heading = (date, language) => titleOf(resolveDay(date), language);
  assert.deepEqual(['es', 'en', 'la'].map((l) => heading('2026-12-25', l)), ['Natividad del Señor', 'The Nativity of Our Lord', 'In Nativitate Domini']);
  assert.deepEqual(['es', 'en', 'la'].map((l) => heading('2026-11-02', l)),
    ['Conmemoración de Todos los Fieles Difuntos', 'Commemoration of All Souls', 'In Commemoratione Omnium Fidelium Defunctorum']);
  assert.deepEqual(['es', 'en', 'la'].map((l) => heading('2026-07-04', l)), ['Santa María en sábado', 'Our Lady on Saturday', 'Sanctæ Mariæ in Sabbato']);
  // The three Masses keep their own titles.
  const masses = resolveDay('2026-12-25').celebration.masses;
  assert.deepEqual(masses.map((key) => nameOf(key, 'es')), ['Natividad del Señor, en la noche', 'Natividad del Señor, en la aurora', 'Natividad del Señor, en el día']);
  assert.deepEqual(masses.map((key) => nameOf(key, 'en')),
    ['The Nativity of Our Lord – Midnight Mass', 'The Nativity of Our Lord – Morning Mass', 'The Nativity of Our Lord – Day Mass']);
  // Every celebration with several Masses has a heading, and any other day's heading is its title.
  for (const entry of CATALOGUE.filter((e) => e.formularyOf)) assert.notEqual(titleOf({ date: '2026-01-01', celebration: { key: entry.formularyOf } }, 'es'), nameOf(entry.formularyOf, 'es'));
  assert.equal(heading('2026-06-13', 'es'), nameOf('st-anthony-of-padua', 'es'));
});

test('the Sundays after Epiphany kept in November are named as resumed', () => {
  // The FSSP's 2026 calendar prints "Resumed Fifth Sunday after Epiphany" on 8 November.
  const fifth = resolveDay('2026-11-08');
  assert.equal(fifth.celebration.key, 'epi5-0');
  assert.deepEqual(['en', 'la', 'es'].map((l) => titleOf(fifth, l)),
    ['Resumed V Sunday after Epiphany', 'Dominica V quæ superfuit post Epiphaniam', 'Domingo V que sobró después de Epifanía']);
  assert.equal(titleOf(resolveDay('2026-11-15'), 'en'), 'Resumed VI Sunday after Epiphany');
  // The same observance before Septuagesima keeps its plain title, and so does the key without a date.
  assert.equal(titleOf(resolveDay('2026-01-25'), 'en'), 'III Sunday after Epiphany');
  assert.equal(nameOf('epi5-0', 'en'), 'V Sunday after Epiphany');
  // Its ferias, and a commemoration of it, when the date is given.
  assert.equal(resolveDay('2027-11-05').celebration.key, 'epi4-5');
  assert.equal(titleOf(resolveDay('2027-11-05'), 'en'), 'Feria VI after the resumed IV Sunday after Epiphany');
  assert.equal(nameOf('epi5-0', 'es', { date: '2026-11-08' }), 'Domingo V que sobró después de Epifanía');
});

test('titles corrected by hand say what the 1962 Missal says', () => {
  // The Vigil of Pentecost, a 1st class vigil, on 23 May 2026.
  assert.equal(titleOf(resolveDay('2026-05-23'), 'en'), 'Vigil of Pentecost');
  // Latin that was Polish, the wrong week, or the wrong day.
  assert.equal(nameOf('pasc5-3', 'la'), 'In Vigilia Ascensionis');
  assert.deepEqual(['adv3-1', 'adv3-2', 'adv3-4'].map((key) => nameOf(key, 'la')),
    ['Feria II infra Hebd III Adventus', 'Feria III infra Hebd III Adventus', 'Feria V infra Hebd III Adventus']);
  assert.equal(nameOf('pasc0-3', 'la'), 'Die IV infra octavam Paschæ');
  assert.deepEqual([nameOf('pent01-5', 'la'), nameOf('pent01-5', 'en')], ['Feria VI infra Hebd I post Octavam Pentecostes', 'Feria VI after I Sunday after Pentecost']);
  // 3 May: Alexander is not called pope in the 1962 Missal. 13 June: St. Anthony is a doctor of the Church.
  assert.equal(nameOf('sts-alexander-and-companions', 'es'), 'Santos Alejandro, Evencio y Teódulo, mártires, y Juvenal, obispo y confesor');
  assert.equal(nameOf('st-anthony-of-padua', 'es'), 'San Antonio de Padua, confesor y doctor de la Iglesia');
  assert.equal(nameOf('st-anthony-of-padua', 'la'), 'S. Antonii de Padua Confessoris et Ecclesiæ Doctoris');
  // No Latin title is in Polish or English, ends in an abbreviation, or writes SS. for Ss.
  for (const [key, title] of Object.entries(NAMES.la)) assert.doesNotMatch(title, /[ąćęłńśźż]|\.$|\band\b|\bSS\./, `${key}: ${title}`);
});

test('a movable day is named by its own weekday and week, and no two share a title', () => {
  const FERIA = { II: 1, III: 2, IV: 3, V: 4, VI: 5 };
  const movable = CATALOGUE.filter((entry) => 'temporal' in entry.date && /^[a-z]+\d+-\d$/.test(entry.date.temporal));
  for (const entry of movable) {
    const weekday = Number(entry.date.temporal.slice(-1));
    for (const language of ['la', 'en']) {
      const numbered = /\b(?:Feria|Die) (II|III|IV|V|VI)\b/.exec(NAMES[language][entry.key]);
      if (numbered) assert.equal(FERIA[numbered[1]], weekday, `${entry.key} (${language}): ${NAMES[language][entry.key]}`);
    }
  }
  for (const language of ['la', 'en', 'es']) {
    const seen = new Map();
    for (const entry of movable) {
      const title = NAMES[language][entry.key];
      assert.ok(!seen.has(title), `${language}: ${entry.key} and ${seen.get(title)} are both "${title}"`);
      seen.set(title, entry.key);
    }
  }
});

test('a language is taken by its code, and an unknown one is refused', () => {
  assert.equal(nameOf('st-blaise', 'en-US'), nameOf('st-blaise', 'en'));
  assert.equal(nameOf('st-blaise', 'ES'), 'San Blas, obispo y mártir');
  assert.throws(() => nameOf('st-blaise', 'fr'), /no titles in "fr"/);
  assert.throws(() => titleOf(resolveDay('2026-12-25'), 'toString'), RangeError);
});

test('a church feast given in two roles is named from either record', () => {
  const church = {
    titular: { key: 'st-local', date: '06-12', colors: ['red'], names: { en: 'St. Local' } },
    patrons: [{ key: 'st-local', date: '06-12', colors: ['red'], names: { es: 'San Local' } }],
  };
  assert.equal(resolveDay('2027-06-12', { church }).celebration.key, 'st-local');
  assert.deepEqual(['es', 'en'].map((l) => nameOf('st-local', l, { church })), ['San Local', 'St. Local']);
  assert.equal(titleOf(resolveDay('2027-06-12', { church }), 'es', { church }), 'San Local');
  // No Latin was given: another language stands in. With no names at all the feast has no title.
  assert.equal(nameOf('st-local', 'la', { church }), 'St. Local');
  assert.equal(nameOf('st-x', 'es', { church: { titular: { key: 'st-x', date: '06-12', colors: ['red'] } } }), undefined);
});

test('the comparison with a Spanish ordo sees a word missing on either side', () => {
  const text = readFileSync(new URL('./fixtures/ordo-es-sample.txt', import.meta.url), 'utf8');
  const rows = new Map(compareNames(text).map((row) => [row.date, row]));
  assert.equal(rows.size, 4);
  // Agreeing days, and the two the sample alters.
  assert.ok(!differs(rows.get('2026-06-13')) && !differs(rows.get('2026-06-18')));
  assert.deepEqual([rows.get('2026-06-19').score, rows.get('2026-06-19').missingFromOurs], [1, ['martir']]);
  assert.deepEqual(rows.get('2026-06-22').missingFromOrdo, ['obispo']);
  assert.ok(differs(rows.get('2026-06-19')) && differs(rows.get('2026-06-22')));
});

test('fixed-date titles say what the 1962 Missal\'s headings say, but for the reviewed ones', { skip: !process.env.MISSAL_DIR && 'set MISSAL_DIR to saved pages of the Missal to run' }, async () => {
  const { compareWithMissal, describe } = await import('../scripts/compare-missal-titles.mjs');
  const reviewed = read('./fixtures/missal-title-differences.json');
  const rows = compareWithMissal(process.env.MISSAL_DIR);
  assert.deepEqual(Object.fromEntries(rows.filter(describe).map((row) => [row.key, describe(row)])),
    Object.fromEntries(Object.entries(reviewed.differing).map(([key, entry]) => [key, entry.differs])));
  assert.deepEqual(rows.filter((row) => row.heading === null).map((row) => row.key).sort(), [...reviewed.noHeading.keys].sort());
});
