import { DEDICATION_KEY, type Church } from './church.js';
import { NAMES } from './generated/data.js';
import type { Language } from './types.js';

const DEDICATION_NAMES: Readonly<Record<Language, string>> = {
  la: 'In Anniversario Dedicationis Ecclesiæ',
  en: 'Anniversary of the Dedication of the Church',
  es: 'Aniversario de la Dedicación de la iglesia',
  pl: 'Rocznica Poświęcenia Kościoła',
};

export interface NameOptions {
  /** The church whose own feasts may carry names of their own. */
  readonly church?: Church;
}

/**
 * The title of an observance in a language, or `undefined` for a key the
 * calendar does not know. Every observance of the catalogue and the layers has
 * Latin, English and Spanish; where Polish has none, the Latin is given. A
 * church's new feast takes the names given with it, else its key.
 */
export function nameOf(key: string, language: Language, options: NameOptions = {}): string | undefined {
  if (key === DEDICATION_KEY) return DEDICATION_NAMES[language];
  const known = NAMES[language][key] ?? NAMES.la[key];
  if (known) return known;
  const church = options.church;
  const feast = [church?.titular, ...(church?.patrons ?? [])].find((candidate) => candidate?.key === key);
  if (!feast) return undefined;
  return feast.names?.[language] ?? feast.names?.la ?? feast.key;
}
