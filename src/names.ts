import { DEDICATION_KEY, type Church, type ChurchFeast } from './church.js';
import { DAY_HEADINGS, NAMES } from './generated/data.js';
import type { Language, Ymd } from './types.js';

const LANGUAGES: readonly Language[] = ['la', 'en', 'es', 'pl'];

const DEDICATION_NAMES: Readonly<Record<Language, string>> = {
  la: 'In Anniversario Dedicationis Ecclesiæ',
  en: 'Anniversary of the Dedication of the Church',
  es: 'Aniversario de la Dedicación de la iglesia',
  pl: 'Rocznica Poświęcenia Kościoła',
};

export interface NameOptions {
  /** The church whose own feasts may carry names of their own. */
  readonly church?: Church;
  /**
   * The date the observance is kept or commemorated on. With it, a Sunday or
   * feria after Epiphany that is resumed after Pentecost is named as resumed
   * ("Resumed V Sunday after Epiphany").
   */
  readonly date?: Ymd;
}

/** A language code as the titles are kept: `en-US` and `ES` are `en` and `es`. */
function languageOf(language: string): Language {
  const code = String(language).toLowerCase().split(/[-_]/)[0] as Language;
  if (!LANGUAGES.includes(code)) throw new RangeError(`no titles in ${JSON.stringify(language)}; the languages are ${LANGUAGES.join(', ')}`);
  return code;
}

// The Sundays after Epiphany that find no room before Septuagesima are kept
// between the 23rd and the last Sunday after Pentecost, and the Missal heads them
// "Dominica ... quæ superfuit post Epiphaniam". The key is the same in both
// places, so the date says which it is: they fall in October and November.
const AFTER_EPIPHANY = /^epi[1-6]-[0-6]$/;
const isResumed = (key: string, date: Ymd | undefined) => date !== undefined && AFTER_EPIPHANY.test(key) && date.slice(5, 7) >= '10';

function resumed(title: string, key: string, language: Language): string {
  if (language === 'la') return title.replace('post Epiphaniam', 'quæ superfuit post Epiphaniam');
  if (language === 'es') return title.replace('después de Epifanía', 'que sobró después de Epifanía');
  if (language === 'en') return key.endsWith('-0') ? `Resumed ${title}` : title.replace(' after ', ' after the resumed ');
  return title;
}

/** The church's records for a feast: one saint may be given as patron and as titular. */
function churchFeasts(church: Church | undefined, key: string): ChurchFeast[] {
  return [church?.titular, ...(church?.patrons ?? [])].filter((feast): feast is ChurchFeast => feast?.key === key);
}

/**
 * The title of an observance in a language, or `undefined` for a key the
 * calendar does not know. Every observance of the catalogue and the layers has
 * Latin, English and Spanish; where Polish has none, the Latin is given. A
 * church's new feast takes the names given with it, in the language asked for,
 * else in Latin, else in whichever language it was given; with no names it has
 * no title.
 *
 * This names an observance, a Mass or a commemoration. For the heading of a day
 * use `titleOf`: Christmas and All Souls are keyed by their first Mass, whose
 * title this returns.
 */
export function nameOf(key: string, language: Language | string, options: NameOptions = {}): string | undefined {
  const code = languageOf(language);
  if (key === DEDICATION_KEY) return DEDICATION_NAMES[code];
  const known = NAMES[code][key] ?? NAMES.la[key];
  // Where Polish has no title the Latin stands in, and is worded as Latin.
  if (known) return isResumed(key, options.date) ? resumed(known, key, NAMES[code][key] ? code : 'la') : known;
  const records = churchFeasts(options.church, key);
  for (const wanted of [code, 'la', ...LANGUAGES] as Language[]) {
    for (const feast of records) if (feast.names?.[wanted]) return feast.names[wanted];
  }
  return undefined;
}

/**
 * The heading of a resolved day in a language: the title of what is celebrated,
 * as an ordo prints it at the head of the day. It differs from `nameOf` of the
 * celebration's key where that key is also one Mass of several ("Natividad del
 * Señor", not "Natividad del Señor, en la noche"; "Our Lady on Saturday", not the
 * Mass of the season), and it names the Sundays after Epiphany resumed in
 * November as resumed.
 */
export function titleOf(
  day: { readonly date: Ymd; readonly celebration: { readonly key: string } },
  language: Language | string,
  options: Pick<NameOptions, 'church'> = {},
): string | undefined {
  const code = languageOf(language);
  const key = day.celebration.key;
  const heading = DAY_HEADINGS[key];
  if (heading) return heading[code] ?? heading.la;
  return nameOf(key, code, { ...options, date: day.date });
}
