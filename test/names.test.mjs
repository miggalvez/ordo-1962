import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { CATALOGUE, DEDICATION_KEY, NAMES, nameOf, resolveYear } from '../dist/esm/index.js';

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
    // The category after the name is in lower case.
    assert.doesNotMatch(title, /, (?:[^,]* )?(Obispo|Confesor|Mártir|Mártires|Viuda|Papa|Abad|Apóstol|Doctor)\b/, `${key}: ${title}`);
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
