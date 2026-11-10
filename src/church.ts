import type { Color, Language } from './types.js';

// A church's own 1st class feasts (General Rubrics nos. 44-45; no. 91 item 12):
// the principal patron of the place, the anniversary of its dedication, and its
// titular. How they join the calendar is in proper.ts.

/** A feast a church keeps as of the 1st class. */
export interface ChurchFeast {
  /**
   * A catalogue key, to raise that observance to the 1st class where the calendar
   * has it (for example `'st-anne-mother-of-the-blessed-virgin'`, or `'epi1-0'`
   * for a church of the Holy Family), or a new key for a feast the calendar does
   * not have, which then needs `date` and `colors`.
   */
  readonly key: string;
  /** Month and day, `MM-DD`, for a new feast. */
  readonly date?: string;
  readonly colors?: readonly Color[];
  readonly ofTheLord?: boolean;
  readonly ofOurLady?: boolean;
  /** Titles by language for a new feast, used by `nameOf`. A catalogue key keeps its own. */
  readonly names?: Readonly<Partial<Record<Language, string>>>;
}

export interface Church {
  /** The titular of the church (item 12.5). */
  readonly titular?: ChurchFeast;
  /** The anniversary of its dedication, `MM-DD` (item 12.4). */
  readonly dedication?: string;
  /** Principal patrons of the place, town or city (item 12.3). */
  readonly patrons?: readonly ChurchFeast[];
}

export const DEDICATION_KEY = 'anniversary-of-the-dedication-of-the-church';

/** Places within no. 91 item 12. */
export const PATRON_OF_THE_PLACE = 3;
export const DEDICATION = 4;
export const TITULAR = 5;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const COLORS: ReadonlySet<string> = new Set(['white', 'red', 'green', 'violet', 'black', 'rose']);

/** A month and day that exist every year, as `MM-DD`. */
export function checkMonthDay(value: unknown, what: string): string {
  const match = typeof value === 'string' ? /^(\d\d)-(\d\d)$/.exec(value) : null;
  const month = match ? Number(match[1]) : 0;
  const day = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > (DAYS_IN_MONTH[month - 1] as number)) {
    throw new RangeError(`${what} needs a date as MM-DD; ${JSON.stringify(value)} is not one`);
  }
  if (value === '02-29') throw new RangeError(`${what} cannot be kept on 29 February, which comes once in four years; give the date it has every year`);
  return value as string;
}

export function checkColors(value: readonly Color[] | undefined, what: string): Color[] {
  if (!value?.length) throw new RangeError(`${what} needs colors`);
  for (const color of value) if (!COLORS.has(color)) throw new RangeError(`${what}: ${JSON.stringify(color)} is not a liturgical colour`);
  return [...value];
}
