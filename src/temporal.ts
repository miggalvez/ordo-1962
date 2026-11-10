import { dayNumber, easterSunday, monthDay, toYmd, weekday } from './dates.js';
import { CATALOGUE, LAYERS, TEMPORAL_BLOCKS } from './generated/data.js';
import type { CatalogueEntry, Layer, TemporalBlockName, Ymd } from './types.js';

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

  const byDate = (map: Map<number, readonly string[]>) =>
    new Map([...map].sort(([a], [b]) => a - b).map(([day, keys]) => [toYmd(day), keys] as const));
  return { tempora: byDate(tempora), computedFeasts: byDate(computed) };
}

export interface PlacementOptions {
  /** National layers to apply, by nation code (for example `['pl']`). */
  readonly nations?: readonly string[];
}

function resolveLayers(nations: readonly string[] = []): Layer[] {
  return nations.map((nation) => {
    const layer = LAYERS[nation];
    if (!layer) throw new RangeError(`no layer for nation ${nation}`);
    return layer;
  });
}

/**
 * The observances with a fixed date that are candidates on each day of the
 * year, before any rule decides between them. Leap-year moves and transfers
 * are decided later, by the resolver.
 */
export function fixedFeasts(year: number, options: PlacementOptions = {}): ReadonlyMap<Ymd, readonly string[]> {
  const layers = resolveLayers(options.nations);
  const removed = new Set<string>();
  const added = new Set<string>();
  for (const layer of layers) {
    for (const op of layer.operations) {
      if (op.op === 'remove') removed.add(op.key);
      else {
        added.add(op.key);
        if (op.replaces) removed.add(op.replaces);
      }
    }
  }
  const byMonthDay = new Map<string, string[]>();
  for (const entry of CATALOGUE as readonly CatalogueEntry[]) {
    if (!('fixed' in entry.date)) continue;
    const included = entry.scope === 'universal' ? !removed.has(entry.key) : added.has(entry.key);
    if (!included) continue;
    const list = byMonthDay.get(entry.date.fixed) ?? [];
    list.push(entry.key);
    byMonthDay.set(entry.date.fixed, list);
  }
  const result = new Map<Ymd, readonly string[]>();
  for (let day = dayNumber(year, 1, 1); day <= dayNumber(year, 12, 31); day += 1) {
    const keys = byMonthDay.get(monthDay(day));
    if (keys) result.set(toYmd(day), keys);
  }
  return result;
}
