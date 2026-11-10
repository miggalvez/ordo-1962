import type { CatalogueEntry } from './types.js';

// The Table of Liturgical Days, General Rubrics (1960) no. 91. Items 1-5, 8 and 9
// name particular days, so those stay named here; every other item is described
// by kind and class, which is what lets a feast the table has never seen (a
// national, institute or church feast) find its place.

const NAMED_ITEMS: Readonly<Record<string, number>> = {
  // 1. Christmas day, Easter Sunday and Pentecost Sunday.
  'the-nativity-of-our-lord': 1,
  'pasc0-0': 1,
  'pasc7-0': 1,
  // 2. The sacred triduum.
  'quad6-4': 2,
  'quad6-5': 2,
  'quad6-6': 2,
  // 3. Epiphany, Ascension, Trinity, Corpus Christi, Sacred Heart, Christ the King.
  'epiphany-of-the-lord': 3,
  'pasc5-4': 3,
  'pent01-0': 3,
  'pent01-4': 3,
  'pent02-5': 3,
  'christ-the-king': 3,
  // 4. Immaculate Conception and Assumption.
  'immaculate-conception-of-the-blessed-virgin-mary': 4,
  'assumption-of-the-blessed-virgin-mary': 4,
  // 5. The vigil and the octave day of Christmas.
  'vigil-of-christmas': 5,
  'octave-day-of-christmas': 5,
  // 8. The commemoration of All the Faithful Departed.
  'commemoration-of-all-souls': 8,
  // 9. The vigil of Pentecost.
  'pasc6-6': 9,
};

export interface Ranked {
  readonly entry: CatalogueEntry;
  /** Class after date-dependent changes (Advent ferias of 17-23 December are II class, no. 24). */
  readonly class: 1 | 2 | 3 | 4;
  readonly movable: boolean;
}

const isUniversal = (entry: CatalogueEntry) => entry.scope === 'universal';
const temporal = (entry: CatalogueEntry) => ('temporal' in entry.date ? entry.date.temporal : '');

/**
 * The item of no. 91 an observance belongs to (1 is highest), or null for an
 * observance that is only ever commemorated.
 */
export function tableItem({ entry, class: cls }: Ranked): number | null {
  const principal = entry.formularyOf ?? entry.key;
  const named = NAMED_ITEMS[principal];
  if (named !== undefined) return named;

  switch (entry.kind) {
    case 'commemoration':
      return null;
    case 'sunday':
      if (cls === 1) return 6; // Sundays of Advent, Lent and Passiontide, and Low Sunday
      if (cls === 2) return 15;
      break;
    case 'feria':
    case 'ember-day':
      if (cls === 1) return 7; // Ash Wednesday; Monday to Wednesday of Holy Week
      if (cls === 2) return 18; // Advent 17-23 December; ember days (no. 24)
      if (cls === 3 && /^quad/.test(temporal(entry))) return 22; // Lent and Passiontide (no. 25a)
      if (cls === 3 && /^adv/.test(temporal(entry))) return 25; // Advent to 16 December (no. 25b)
      if (cls === 4) return 28;
      break;
    case 'within-octave':
      if (cls === 1) return 10; // within the octaves of Easter and Pentecost
      if (cls === 2) return 17; // within the octave of Christmas
      break;
    case 'feast':
      if (cls === 1) return isUniversal(entry) ? 11 : 12;
      if (cls === 2 && entry.ofTheLord) return 14;
      if (cls === 2) return isUniversal(entry) ? 16 : 19;
      if (cls === 3) return isUniversal(entry) ? 24 : 23;
      break;
    case 'vigil':
      if (cls === 2) return 21;
      if (cls === 3) return 26;
      break;
    case 'our-lady-on-saturday':
      return 27;
  }
  throw new Error(`${entry.key} (${entry.kind}, class ${cls}) has no place in the table of precedence`);
}

/**
 * The place of a proper 1st class feast within item 12 (1 to 8). A nation's feast
 * is taken as its patron's (1), an institute's as its titular (6) and a church's
 * as its titular (5) unless the entry says otherwise.
 */
export function properPlace(entry: CatalogueEntry): number {
  if (entry.properItem !== undefined) return entry.properItem;
  if (entry.scope === 'national') return 1;
  if (entry.scope === 'institute') return 6;
  return 5;
}

/** Order by the table: the item, and within item 12 its own numbered list (nos. 97-98). */
export function compareByTable(a: Ranked, b: Ranked): number {
  const ia = tableItem(a) ?? Infinity;
  const ib = tableItem(b) ?? Infinity;
  if (ia !== ib) return ia - ib;
  return ia === 12 ? properPlace(a.entry) - properPlace(b.entry) : 0;
}

/**
 * Order two observances that both have a place in the table: the higher item
 * first; within item 12 its own list; within an item, movable before fixed
 * (no. 91 items 13, 14, 20, 23, 24), then the order the calendar lists them in.
 */
export function compareRanked(a: Ranked, b: Ranked): number {
  const byTable = compareByTable(a, b);
  if (byTable !== 0) return byTable;
  if (a.movable !== b.movable) return a.movable ? -1 : 1;
  return (a.entry.dayOrder ?? 0) - (b.entry.dayOrder ?? 0);
}
