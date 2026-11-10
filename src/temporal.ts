import { dayNumber, easterSunday, isLeapYear, monthDay, toYmd, weekday } from './dates.js';
import { TEMPORAL_BLOCKS } from './generated/data.js';
import { compareRanked, tableItem, type Ranked } from './precedence.js';
import { properCalendar, type ProperCalendar, type ProperOptions } from './proper.js';
import type { CatalogueEntry, TemporalBlockName, Ymd } from './types.js';

export interface MovableDates {
  readonly easter: Ymd;
  readonly septuagesima: Ymd;
  readonly ashWednesday: Ymd;
  readonly pentecost: Ymd;
  readonly holyFamily: Ymd;
  readonly holyName: Ymd;
  readonly septemberEmberWednesday: Ymd;
  readonly christTheKing: Ymd;
  readonly lastSundayAfterPentecost: Ymd;
  readonly firstSundayOfAdvent: Ymd;
  readonly sundayWithinChristmasOctave: Ymd | null;
}

interface MovableDays {
  readonly easter: number;
  readonly septuagesima: number;
  readonly holyFamily: number;
  readonly holyName: number;
  readonly septemberEmberWednesday: number;
  readonly christTheKing: number;
  readonly lastSundayAfterPentecost: number;
  readonly firstSundayOfAdvent: number;
  readonly sundayWithinChristmasOctave: number | null;
}

/** The first day on or after `day` that falls on `wd` (0 = Sunday). */
function onOrAfter(day: number, wd: number): number {
  return day + ((wd - weekday(day) + 7) % 7);
}

function movableDays(year: number): MovableDays {
  const easter = easterSunday(year);
  const firstSundayOfAdvent = onOrAfter(dayNumber(year, 11, 27), 0);
  const firstSundayOfJanuary = onOrAfter(dayNumber(year, 1, 1), 0);
  const firstOfJanuary = dayNumber(year, 1, 1);
  const christmasOctaveSunday = onOrAfter(dayNumber(year, 12, 26), 0);
  return {
    easter,
    septuagesima: easter - 63,
    // First Sunday after the Epiphany (General Rubrics no. 17(b)).
    holyFamily: onOrAfter(dayNumber(year, 1, 7), 0),
    // The Sunday from 2 to 5 January, otherwise 2 January (no. 17(a)).
    holyName: firstSundayOfJanuary - firstOfJanuary >= 1 && firstSundayOfJanuary - firstOfJanuary <= 4
      ? firstSundayOfJanuary
      : dayNumber(year, 1, 2),
    // Wednesday after the third Sunday of September.
    septemberEmberWednesday: onOrAfter(dayNumber(year, 9, 15), 0) + 3,
    // Last Sunday of October (no. 17(d)).
    christTheKing: onOrAfter(dayNumber(year, 10, 25), 0),
    lastSundayAfterPentecost: firstSundayOfAdvent - 7,
    firstSundayOfAdvent,
    sundayWithinChristmasOctave: christmasOctaveSunday <= dayNumber(year, 12, 31) ? christmasOctaveSunday : null,
  };
}

export function movableDates(year: number): MovableDates {
  const days = movableDays(year);
  return {
    easter: toYmd(days.easter),
    septuagesima: toYmd(days.septuagesima),
    ashWednesday: toYmd(days.easter - 46),
    pentecost: toYmd(days.easter + 49),
    holyFamily: toYmd(days.holyFamily),
    holyName: toYmd(days.holyName),
    septemberEmberWednesday: toYmd(days.septemberEmberWednesday),
    christTheKing: toYmd(days.christTheKing),
    lastSundayAfterPentecost: toYmd(days.lastSundayAfterPentecost),
    firstSundayOfAdvent: toYmd(days.firstSundayOfAdvent),
    sundayWithinChristmasOctave: days.sundayWithinChristmasOctave === null ? null : toYmd(days.sundayWithinChristmasOctave),
  };
}

export interface TemporalYear {
  /** Movable days of the cycle placed on each date, in block order. */
  readonly tempora: ReadonlyMap<Ymd, readonly string[]>;
  /** Feasts whose date is computed rather than fixed (Holy Name, Christ the King). */
  readonly computedFeasts: ReadonlyMap<Ymd, readonly string[]>;
}

/**
 * Lay the movable cycle over the year.
 *
 * The blocks come from Missale Meum, and so does the order they are laid in:
 * later blocks overwrite earlier ones, so the resumed Sundays after Epiphany
 * fill only the gap left before the last Sunday after Pentecost.
 */
export function temporalYear(year: number): TemporalYear {
  const days = movableDays(year);
  const first = dayNumber(year, 1, 1);
  const last = dayNumber(year, 12, 31);
  const tempora = new Map<number, readonly string[]>();
  const computed = new Map<number, readonly string[]>();
  const occupied = new Set<number>();

  const lay = (
    start: number,
    name: TemporalBlockName,
    { reverse = false, overwrite = true, through }: { reverse?: boolean; overwrite?: boolean; through?: number } = {},
  ): void => {
    const block = reverse ? [...TEMPORAL_BLOCKS[name]].reverse() : TEMPORAL_BLOCKS[name];
    for (let i = 0; i < block.length; i += 1) {
      const day = start + (reverse ? -i : i);
      const keys = block[i] ?? [];
      if (keys.length === 0) continue;
      if (!overwrite && occupied.has(day)) break;
      if (through !== undefined && day > through) break;
      if (day < first || day > last) continue;
      tempora.set(day, keys);
      occupied.add(day);
    }
  };

  lay(days.holyFamily, 'POST_EPIPHANY');
  lay(days.septuagesima, 'FROM_PRE_LENT_TO_POST_PENTECOST');
  lay(days.lastSundayAfterPentecost - 1, 'POST_EPIPHANY', { reverse: true, overwrite: false });
  lay(days.lastSundayAfterPentecost, 'WEEK_24_AFTER_PENTECOST');
  lay(days.firstSundayOfAdvent, 'ADVENT', { through: dayNumber(year, 12, 23) });
  lay(days.septemberEmberWednesday, 'EMBER_DAYS_SEPTEMBER');

  for (const [day, block] of [[days.holyName, 'HOLY_NAME'], [days.christTheKing, 'CHRIST_KING']] as const) {
    computed.set(day, TEMPORAL_BLOCKS[block][0] ?? []);
    occupied.add(day);
  }

  if (days.sundayWithinChristmasOctave !== null) lay(days.sundayWithinChristmasOctave, 'NATIVITY_OCTAVE_SUNDAY');
  for (const date of [29, 30, 31]) lay(dayNumber(year, 12, date), 'NATIVITY_OCTAVE_FERIA', { overwrite: false });

  // Callers get their own arrays, so sorting one cannot change the shared blocks.
  const byDate = (map: Map<number, readonly string[]>) =>
    new Map([...map].sort(([a], [b]) => a - b).map(([day, keys]) => [toYmd(day), [...keys]] as const));
  return { tempora: byDate(tempora), computedFeasts: byDate(computed) };
}

/**
 * Which propers to apply: national ones by code (for example `['us']`), then those
 * of institutes or orders (for example `['fssp']`), then the church's own feasts.
 */
export type PlacementOptions = ProperOptions;

export interface FixedPlacement {
  /** Candidates on each day of the year, in the order the calendar lists them. */
  readonly byDate: ReadonlyMap<Ymd, readonly string[]>;
  /** Feasts kept on another fixed date in this church (nos. 100-102), with both month-days. */
  readonly reassigned: ReadonlyMap<string, { readonly from: string; readonly to: string }>;
}

/**
 * A feast of the 1st or 2nd class that another always impedes in a church is
 * assigned for good to the nearest following day that is not of the 1st or 2nd
 * class, and that day is then its own (nos. 100-102). This is worked out on the
 * fixed calendar: the days from 17 December to 1 January are always of those
 * classes; movable days impede only by accident, which is the resolver's business.
 *
 * It is applied where a church's own feast is one of the two. A nation's or an
 * institute's proper is taken as published, with its feasts already on the dates
 * that calendar gives them. The right no. 100 also gives proper 3rd class feasts
 * outside Advent and Lent is not applied.
 */
function reassign(byMonthDay: Map<string, string[]>, proper: ProperCalendar, monthDays: readonly string[]): Map<string, { from: string; to: string }> {
  const reassigned = new Map<string, { from: string; to: string }>();
  const contenders = (md: string): Ranked[] => (byMonthDay.get(md) ?? [])
    .map((key) => proper.entries.get(key) as CatalogueEntry)
    .filter((entry) => !entry.formularyOf)
    .map((entry) => ({ entry, class: entry.class, movable: false }))
    .filter((ranked) => tableItem(ranked) !== null);
  const firstOrSecondClass = (md: string) => (md >= '12-17' && md <= '12-23') || (md >= '12-29' && md <= '12-31')
    || contenders(md).some((ranked) => ranked.class <= 2);

  for (const [index, md] of monthDays.entries()) {
    const here = contenders(md).sort(compareRanked);
    if (here.length < 2 || !here.some((ranked) => proper.churchKeys.has(ranked.entry.key))) continue;
    for (const { entry, class: cls } of here.slice(1)) {
      if (entry.kind !== 'feast' || cls > 2) continue;
      let to: string | undefined;
      for (let step = 1; step < monthDays.length && to === undefined; step += 1) {
        const next = monthDays[(index + step) % monthDays.length] as string;
        if (!firstOrSecondClass(next)) to = next;
      }
      if (to === undefined) throw new Error(`no free day for ${entry.key}`);
      byMonthDay.set(md, (byMonthDay.get(md) ?? []).filter((key) => key !== entry.key));
      byMonthDay.set(to, [...(byMonthDay.get(to) ?? []), entry.key]);
      reassigned.set(entry.key, { from: md, to });
    }
  }
  return reassigned;
}

/** Where this calendar keeps its fixed observances in a year, before the rules of occurrence decide between them. */
export function placeFixed(year: number, proper: ProperCalendar): FixedPlacement {
  const byNominalDate = new Map<string, CatalogueEntry[]>();
  for (const entry of proper.fixed) {
    if (!('fixed' in entry.date)) continue;
    const list = byNominalDate.get(entry.date.fixed) ?? [];
    list.push(entry);
    byNominalDate.set(entry.date.fixed, list);
  }

  const leap = isLeapYear(year);
  const byPlacedDate = new Map<string, string[]>();
  for (const nominal of [...byNominalDate.keys()].sort()) {
    const entries = byNominalDate.get(nominal) ?? [];
    // Universal entries in the calendar's own order, then proper additions.
    entries.sort((a, b) => (a.dayOrder ?? Infinity) - (b.dayOrder ?? Infinity) || a.key.localeCompare(b.key));
    let keys = entries.map((entry) => entry.key);
    const layerOrder = proper.order.get(nominal);
    if (layerOrder) keys = [...layerOrder.filter((key) => keys.includes(key)), ...keys.filter((key) => !layerOrder.includes(key))];
    for (const key of keys) {
      const entry = entries.find((candidate) => candidate.key === key);
      const date = entry && 'fixed' in entry.date && leap && entry.date.leapYear ? entry.date.leapYear : nominal;
      const list = byPlacedDate.get(date) ?? [];
      list.push(key);
      byPlacedDate.set(date, list);
    }
  }

  const first = dayNumber(year, 1, 1);
  const last = dayNumber(year, 12, 31);
  const monthDays: string[] = [];
  for (let day = first; day <= last; day += 1) monthDays.push(monthDay(day));
  const reassigned = proper.churchKeys.size > 0 ? reassign(byPlacedDate, proper, monthDays) : new Map<string, { from: string; to: string }>();

  const byDate = new Map<Ymd, readonly string[]>();
  for (let day = first; day <= last; day += 1) {
    const keys = byPlacedDate.get(monthDay(day));
    if (keys?.length) byDate.set(toYmd(day), [...keys]);
  }
  return { byDate, reassigned };
}

/**
 * The observances with a fixed date that are candidates on each day of the
 * year, in the order the calendar lists them, before any rule decides between
 * them. Leap-year dates and a church's permanent reassignments (nos. 100-102)
 * are applied here; transfers are the resolver's job.
 */
export function fixedFeasts(year: number, options: PlacementOptions = {}): ReadonlyMap<Ymd, readonly string[]> {
  return placeFixed(year, properCalendar(options)).byDate;
}
