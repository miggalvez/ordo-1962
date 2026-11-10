import { DEDICATION_KEY } from './church.js';
import { tableItem, type Ranked } from './precedence.js';
import type { CatalogueEntry } from './types.js';

// Commemorations, General Rubrics (1960) nos. 106-114. The numbers are those of
// the Latin text: no. 108 says where commemorations are made, no. 109 lists the
// privileged ones. (The English translation in the Divinum Officium repository
// drops a paragraph and prints that list as no. 108.)
//
// What is decided here is the list for a low or conventual Mass of the day. The
// rules are the same for the office (no. 106), but the lists can differ: the
// greater litanies have nothing in the office (no. 81), ordinary commemorations
// are not made at Vespers (no. 108), and a sung Mass that is not conventual
// admits only a privileged one (no. 111a).

const TRINITY = 'pent01-0';
const CHRISTMAS_OCTAVE = /^for-octave-of-the-nativity/;
const GREATER_LITANIES = 'for-the-rogations';
const FIRST_CLASS_VIGILS = new Set(['vigil-of-christmas', 'pasc6-6']);

/** Of the season (no. 113): a movable day of the cycle, or the commemoration of the Christmas octave. */
export function isOfTheSeason(entry: CatalogueEntry): boolean {
  if (CHRISTMAS_OCTAVE.test(entry.key)) return true;
  return 'temporal' in entry.date && entry.kind !== 'feast' && entry.kind !== 'commemoration';
}

// The dedication of a church is a feast of the Lord: the 1962 Missal says so at the head
// of the Common of the Dedication ("Festum Dedicationis ecclesiae est festum Domini"). So
// it takes a 2nd class Sunday without commemorating it (nos. 16a, 112b). It is not a feast
// or mystery of a divine Person, which is what nos. 95 and 112a ask about, so it is
// transferred like any 1st class feast when a feast of the Lord impedes it. The FSSP's
// shrine at Warrington kept the dedication of its cathedral on Friday 15 May 2026, the
// Ascension having fallen on its date, the 14th.
const DEDICATIONS: ReadonlySet<string> = new Set([DEDICATION_KEY, 'dedication-of-the-archbasilica-of-our-holy-savior']);

/** The divine Person a feast or mystery is of, where that is known. The Trinity is not of one Person. */
function divinePerson(entry: CatalogueEntry): 'son' | null {
  if (!entry.ofTheLord || entry.key === TRINITY || DEDICATIONS.has(entry.key)) return null;
  return 'son';
}

/**
 * Two feasts or mysteries of one divine Person (nos. 95, 112a). Both must be known to be
 * of that Person: being feasts of the Lord is not enough.
 */
export function sameDivinePerson(a: CatalogueEntry, b: CatalogueEntry): boolean {
  const person = divinePerson(a);
  return person !== null && person === divinePerson(b);
}

// Observances in which the intercession of the Blessed Virgin is implored (no. 112d).
// The Purification is kept as a feast of the Lord. The catalogue does not yet say
// whom an observance honours; when it does (it is needed for other saints, and for
// no. 95), this list moves there.
const OF_OUR_LADY: ReadonlySet<string> = new Set([
  'annunciation-of-the-blessed-virgin-mary',
  'assumption-of-the-blessed-virgin-mary',
  'vigil-of-the-assumption',
  'dedication-of-the-basilica-of-st-mary-major',
  'immaculate-conception-of-the-blessed-virgin-mary',
  'immaculate-heart-of-mary',
  'maternity-of-the-blessed-virgin-mary',
  'most-holy-name-of-mary',
  'nativity-of-the-blessed-virgin-mary',
  'our-lady-of-lourdes',
  'our-lady-of-mt-carmel',
  'our-lady-of-ransom',
  'our-lady-of-the-rosary',
  'presentation-of-the-blessed-virgin-mary',
  'queenship-of-the-blessed-virgin-mary',
  'seven-sorrows-in-passiontide',
  'seven-sorrows-of-the-blessed-virgin-mary',
  'visitation-of-the-blessed-virgin-mary',
  'pl-beatae-mariae-virginis-confessoris-auxiliatrix',
  'pl-beatae-mariae-virginis-reginae-poloniae',
  'pl-beate-mariae-virginis-claromontane-czestochoviensis',
]);

/** An office, Mass or commemoration of the Blessed Virgin (no. 112d). */
export function isOfOurLady(entry: CatalogueEntry): boolean {
  return entry.kind === 'our-lady-on-saturday' || entry.ofOurLady === true || OF_OUR_LADY.has(entry.key);
}

/** Privileged commemorations, no. 109. */
function isPrivileged({ entry, class: cls }: Ranked): boolean {
  if (entry.kind === 'sunday') return true; // a
  if (cls === 1) return true; // b
  if (CHRISTMAS_OCTAVE.test(entry.key) || (entry.kind === 'within-octave' && cls === 2)) return true; // c
  if (entry.kind === 'ember-day' && 'temporal' in entry.date && /^sep-ember/.test(entry.date.temporal)) return true; // d
  if ((entry.kind === 'feria' || entry.kind === 'ember-day') && 'temporal' in entry.date
      && /^(adv|quad)/.test(entry.date.temporal)) return true; // e: Advent, Lent and Passiontide
  if (entry.key === GREATER_LITANIES) return true; // f, in the Mass
  return false;
}

/** Whether an observance that lost the day is commemorated at all, before the limits of no. 111. */
function mayBeCommemorated({ entry, class: cls }: Ranked): boolean {
  if (entry.kind === 'feria' && cls === 4) return false; // no. 26: never commemorated
  if (entry.kind === 'feast' && cls === 1) return false; // transferred, or omitted (nos. 95-96)
  if (entry.kind === 'our-lady-on-saturday') return false;
  return true;
}

/** Whether the celebration, or a commemoration already admitted, excludes this one (no. 112). */
export function excludes(a: CatalogueEntry, b: CatalogueEntry): boolean {
  if (sameDivinePerson(a, b)) return true; // a
  if ((a.kind === 'sunday' && b.ofTheLord) || (b.kind === 'sunday' && a.ofTheLord)) return true; // b
  if (isOfTheSeason(a) && isOfTheSeason(b)) return true; // c
  // d: Our Lady of Mount Carmel on a Saturday, when the Saturday office of Our Lady is said.
  // The Missal lets the Mass be either one; neither is commemorated in the other.
  if (isOfOurLady(a) && isOfOurLady(b)) return true;
  return false;
}

/** Order of no. 113: the season first, then the table of precedence. */
function compareCommemorations(a: Ranked, b: Ranked): number {
  const sa = isOfTheSeason(a.entry) ? 0 : 1;
  const sb = isOfTheSeason(b.entry) ? 0 : 1;
  if (sa !== sb) return sa - sb;
  const ia = tableItem(a) ?? 29;
  const ib = tableItem(b) ?? 29;
  if (ia !== ib) return ia - ib;
  if (a.movable !== b.movable) return a.movable ? -1 : 1;
  return (a.entry.dayOrder ?? 0) - (b.entry.dayOrder ?? 0);
}

// The prayer of St. Paul in a Mass of St. Peter, and the reverse, is inseparable:
// it joins the collect and does not count as a commemoration (no. 110). It follows
// from the observance itself, celebrated or commemorated, so it is given for each
// Mass of one apostle alone. Missale Meum lists the prayer as a commemoration on
// 25 January and 22 February and has no entry for it on 30 June, where the Missal
// prints it too.
const COMPANION_PRAYER: Readonly<Record<string, string>> = {
  'conversion-of-st-paul': 'st-peter',
  'commemoration-of-st-paul-the-apostle': 'st-peter',
  'chair-of-st-peter': 'st-paul',
};
const COMPANION_PRAYERS: ReadonlySet<string> = new Set(Object.values(COMPANION_PRAYER));

export interface Commemorations {
  /** Commemorations in order (nos. 111-114). */
  readonly commemorations: string[];
  /** Inseparable prayers said with the celebration or a commemoration (no. 110). */
  readonly inseparable: string[];
}

/**
 * The commemorations of a day, in order, given what is celebrated and the
 * observances of the day that are not celebrated. `omitted` are observances the
 * rubrics remove entirely that day (a vigil under no. 33). `sunday` says the day
 * is a Sunday: a feast that takes a 2nd class Sunday's place does so "with all
 * its rights and privileges" (nos. 16a, 17), so the Sunday limit of no. 111b holds.
 */
export function commemorationsOf(
  celebration: Ranked,
  others: readonly Ranked[],
  omitted: ReadonlySet<string>,
  sunday: boolean,
): Commemorations {
  const { entry: celebrated, class: cls } = celebration;
  const withInseparable = (commemorations: string[]): Commemorations => ({
    commemorations,
    inseparable: [...new Set([celebrated.key, ...commemorations]
      .map((key) => COMPANION_PRAYER[key])
      .filter((prayer): prayer is string => prayer !== undefined))],
  });
  // The vigils of Christmas and Pentecost admit no commemoration (no. 30).
  if (FIRST_CLASS_VIGILS.has(celebrated.key)) return withInseparable([]);

  const eligible = others
    .filter((other) => other.entry.key !== celebrated.key && !omitted.has(other.entry.key))
    .filter((other) => !COMPANION_PRAYERS.has(other.entry.key))
    .filter(mayBeCommemorated)
    .sort(compareCommemorations);

  const admitted: Ranked[] = [];
  const admit = (candidate: Ranked) => {
    if (excludes(celebrated, candidate.entry)) return;
    if (admitted.some((already) => excludes(already.entry, candidate.entry))) return;
    admitted.push(candidate);
  };

  if (cls === 1) {
    // a) 1st class days: none but one privileged commemoration ("praeter unam privilegiatam").
    for (const candidate of eligible) {
      if (admitted.length >= 1) break;
      if (isPrivileged(candidate)) admit(candidate);
    }
  } else if (cls === 2 && (celebrated.kind === 'sunday' || (sunday && celebrated.kind === 'feast'))) {
    // b) 2nd class Sundays: one, a 2nd class feast, omitted if a privileged one is made.
    const privileged = eligible.find((candidate) => isPrivileged(candidate) && !excludes(celebrated, candidate.entry));
    const feast = eligible.find((candidate) => candidate.entry.kind === 'feast' && candidate.class === 2);
    const chosen = privileged ?? feast;
    if (chosen) admit(chosen);
  } else {
    // c) other 2nd class days: one; d) 3rd and 4th class days: two (no. 114: any more are omitted).
    const limit = cls === 2 ? 1 : 2;
    for (const candidate of eligible) {
      if (admitted.length >= limit) break;
      admit(candidate);
    }
  }
  return withInseparable(admitted.sort(compareCommemorations).map((candidate) => candidate.entry.key));
}
