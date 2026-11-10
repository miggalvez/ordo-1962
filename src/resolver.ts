import { dayNumber, easterSunday, fromYmd, toYmd, weekday } from './dates.js';
import { CATALOGUE } from './generated/data.js';
import { commemorationsOf, sameDivinePerson } from './commemorations.js';
import { compareRanked, tableItem, type Ranked } from './precedence.js';
import { entriesFor, fixedFeasts, temporalYear, type PlacementOptions } from './temporal.js';
import type { CatalogueEntry, Color, Ymd } from './types.js';

const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]));

function entryOf(key: string): CatalogueEntry {
  const entry = BY_KEY.get(key);
  if (!entry) throw new Error(`unknown observance ${key}`);
  return entry;
}

// A vigil of the 2nd or 3rd class is omitted on a Sunday, on a 1st class feast,
// and when its feast is transferred or reduced to a commemoration (no. 33).
// Nos. 30-32 name the vigils.
const VIGIL_OF: Readonly<Record<string, string>> = {
  'pasc5-3': 'pasc5-4',
  'vigil-of-the-assumption': 'assumption-of-the-blessed-virgin-mary',
  'vigil-of-the-nativity-of-st-john-the-baptist': 'nativity-of-st-john-the-baptist',
  'vigil-of-sts-peter-and-paul': 'sts-peter-and-paul',
  'vigil-of-st-lawrence': 'st-lawrence',
};

const ALL_SOULS = 'commemoration-of-all-souls';
const ANNUNCIATION = 'annunciation-of-the-blessed-virgin-mary';
const GREATER_LITANIES = 'for-the-rogations';

// Two feasts of the same saint (also no. 95) need an attribute the catalogue does not carry yet.

/**
 * The colour of the day. A 4th class feria of the weeks after Epiphany takes
 * the colour of its season, which depends on the date: white to 13 January
 * (nos. 72, 119a), green from the 14th (no. 127a).
 */
function colorsOf(entry: CatalogueEntry, day: number): Color[] {
  if (entry.class === 4 && entry.kind === 'feria' && 'temporal' in entry.date && /^epi/.test(entry.date.temporal)) {
    return [toYmd(day).slice(5) < '01-14' ? 'white' : 'green'];
  }
  return [...entry.colors];
}

export interface Celebration {
  /** The observance celebrated. Further Masses of the same celebration are in `masses`. */
  readonly key: string;
  readonly class: 1 | 2 | 3 | 4;
  readonly colors: readonly Color[];
  /** The Mass formularies of the celebration, principal first (three at Christmas and All Souls). */
  readonly masses: readonly string[];
  /**
   * Set when a 1st class feast is kept here instead of on its own date (nos. 95-99):
   * that date in this year. This includes the two rightful places of no. 96, the
   * Annunciation on the Monday after Low Sunday and All Souls on Monday 3 November,
   * which some ordos do not mark as transfers.
   */
  readonly transferredFrom?: Ymd;
}

export interface ResolvedDay {
  readonly date: Ymd;
  readonly celebration: Celebration;
  /**
   * Commemorations at a low or conventual Mass of the day, in order (nos. 106-114).
   * The office can differ (the greater litanies have nothing in it, no. 81), and a
   * sung Mass that is not conventual admits only a privileged one (no. 111a).
   */
  readonly commemorations: readonly string[];
  /**
   * Inseparable prayers (no. 110): St. Peter's in a Mass or commemoration of St. Paul
   * alone, and the reverse. They join that collect and are not counted.
   */
  readonly inseparable: readonly string[];
  /** Movable days of the cycle on this date. */
  readonly tempora: readonly string[];
  /** Observances that had a claim on this date and lost it, before commemorations are decided. */
  readonly displaced: readonly string[];
}

interface Candidate extends Ranked {
  readonly transferredFrom?: number;
}

/**
 * Observances outside the catalogue, by the month-day they are kept on. Not part
 * of the public API: it is the seam a church's own feasts will use, and it lets a
 * test place a feast on any date.
 */
export type Extras = ReadonlyMap<string, readonly CatalogueEntry[]>;

const NO_EXTRAS: Extras = new Map();

function rank(key: string, day: number, movable: boolean, transferredFrom?: number): Candidate {
  return rankEntry(entryOf(key), day, movable, transferredFrom);
}

function rankEntry(entry: CatalogueEntry, day: number, movable: boolean, transferredFrom?: number): Candidate {
  let cls = entry.class;
  // Advent ferias from 17 to 23 December are of the 2nd class (no. 24a).
  const month = toYmd(day).slice(5, 7);
  const date = Number(toYmd(day).slice(8));
  if ((entry.kind === 'feria' || entry.kind === 'ember-day') && 'temporal' in entry.date
      && /^adv/.test(entry.date.temporal) && month === '12' && date >= 17 && date <= 23) {
    cls = 2;
  }
  return { entry, class: cls, movable, ...(transferredFrom === undefined ? {} : { transferredFrom }) };
}

/** Which Saturday Mass of Our Lady applies (the Missal's seasonal formularies). */
function ourLadyOnSaturday(day: number, tempora: readonly string[], year: number): string {
  const first = tempora[0] ?? '';
  if (/^adv/.test(first)) return 'our-lady-on-saturday-advent';
  if (day >= dayNumber(year, 12, 25) || day < dayNumber(year, 2, 2)) return 'our-lady-on-saturday-christmastide';
  const wednesdayOfHolyWeek = easterSunday(year) - 4;
  if (day < wednesdayOfHolyWeek) return 'our-lady-on-saturday-after-purification';
  if (/^pasc/.test(first)) return 'our-lady-on-saturday-paschaltide';
  return 'our-lady-on-saturday-after-pentecost';
}

function formulariesOf(key: string): string[] {
  return CATALOGUE.filter((entry) => entry.formularyOf === key)
    .sort((a, b) => (a.dayOrder ?? 0) - (b.dayOrder ?? 0))
    .map((entry) => entry.key);
}

function celebrationFrom(candidate: Candidate, day: number): Celebration {
  const { entry } = candidate;
  return {
    key: entry.key,
    class: candidate.class,
    colors: colorsOf(entry, day),
    masses: [entry.key, ...formulariesOf(entry.key)],
    ...(candidate.transferredFrom === undefined ? {} : { transferredFrom: toYmd(candidate.transferredFrom) }),
  };
}

interface Pass {
  readonly days: ResolvedDay[];
  /** Feasts that did not keep their own date: transferred, or reduced to a commemoration. */
  readonly lostTheirDate: Set<string>;
  /** 1st class feasts still awaiting a free day when the year ended (no. 96). */
  readonly carriedOut: Candidate[];
}

function resolvePass(
  year: number,
  options: PlacementOptions,
  omittedVigils: ReadonlySet<string>,
  extras: Extras,
  carriedIn: readonly Candidate[],
  firstDay?: number,
): Pass {
  const { tempora, computedFeasts } = temporalYear(year);
  const fixed = fixedFeasts(year, options);
  const lookup = entriesFor(options);
  const easter = easterSunday(year);
  const palmSunday = easter - 7;
  const lowSunday = easter + 7;
  const first = dayNumber(year, 1, 1);
  const last = dayNumber(year, 12, 31);
  const april25 = dayNumber(year, 4, 25);
  const litaniesDay = april25 === easter || april25 === easter + 1 ? easter + 2 : april25;

  // Feasts given a rightful place on another date when impeded (no. 96a, 96b).
  const rightfulPlace = new Map<number, Candidate[]>();
  const pending: Candidate[] = [...carriedIn];
  const lostTheirDate = new Set<string>();
  const days: ResolvedDay[] = [];

  for (let day = firstDay ?? first; day <= last; day += 1) {
    const date = toYmd(day);
    const dayTempora = tempora.get(date) ?? [];
    const sunday = weekday(day) === 0;

    // The greater litanies are on 25 April, or on the Tuesday after Easter when Easter
    // Sunday or Monday falls on that date (no. 80).
    const fixedHere = (fixed.get(date) ?? []).filter((key) => key !== GREATER_LITANIES || day === litaniesDay);
    if (day === litaniesDay && !fixedHere.includes(GREATER_LITANIES)) fixedHere.push(GREATER_LITANIES);

    const candidates: Candidate[] = [
      ...dayTempora.map((key) => rank(key, day, true)),
      ...(computedFeasts.get(date) ?? []).map((key) => rank(key, day, true)),
      ...fixedHere.map((key) => lookup.get(key) ?? entryOf(key)).filter((entry) => !entry.formularyOf)
        .map((entry) => rankEntry(entry, day, false)),
      ...(extras.get(date.slice(5)) ?? []).map((entry) => rankEntry(entry, day, false)),
      ...(rightfulPlace.get(day) ?? []),
    ];

    const hasFirstClassFeast = candidates.some((c) => c.entry.kind === 'feast' && c.class === 1);
    const contenders = candidates.filter((c) => {
      if (tableItem(c) === null) return false;
      const vigilOf = VIGIL_OF[c.entry.key];
      if (vigilOf && (sunday || hasFirstClassFeast || omittedVigils.has(vigilOf))) return false; // no. 33
      return true;
    });

    contenders.sort((a, b) => {
      // All Souls yields to a Sunday occurring on its date (no. 91 item 8; no. 16b).
      if (a.entry.key === ALL_SOULS && b.entry.kind === 'sunday') return 1;
      if (b.entry.key === ALL_SOULS && a.entry.kind === 'sunday') return -1;
      return compareRanked(a, b);
    });

    let winner: Candidate | undefined = contenders[0];

    // Impeded 1st class feasts are transferred (nos. 95-98); others lose their date.
    for (const [place, loser] of contenders.entries()) {
      if (place === 0) continue;
      if (loser.transferredFrom === undefined) lostTheirDate.add(loser.entry.key);
      if (loser.entry.kind !== 'feast' || loser.class !== 1) continue;
      // Of two feasts of the same divine Person the lower is omitted, not transferred (no. 95):
      // the Precious Blood when the Sacred Heart falls on 1 July.
      if (contenders.slice(0, place).some((higher) => sameDivinePerson(higher.entry, loser.entry))) continue;
      const from = loser.transferredFrom ?? day;
      if (loser.entry.key === ALL_SOULS) {
        // To the following Monday as its rightful place (no. 96b).
        rightfulPlace.set(day + 1, [...(rightfulPlace.get(day + 1) ?? []), rank(ALL_SOULS, day + 1, false, from)]);
      } else if (loser.entry.key === ANNUNCIATION && day >= palmSunday && day <= lowSunday) {
        // Transferred after Easter: to the Monday after Low Sunday as its rightful place (no. 96a).
        const monday = lowSunday + 1;
        rightfulPlace.set(monday, [...(rightfulPlace.get(monday) ?? []), rank(ANNUNCIATION, monday, false, from)]);
      } else {
        pending.push(rankEntry(loser.entry, day, false, from));
      }
    }

    // A transferred feast takes the next day that is not of the 1st or 2nd class (no. 96),
    // in the order of the table, and among equals the one impeded first (no. 98).
    if (pending.length > 0 && (!winner || winner.class >= 3)) {
      pending.sort((a, b) => (tableItem(a) ?? 0) - (tableItem(b) ?? 0) || (a.transferredFrom ?? 0) - (b.transferredFrom ?? 0));
      const transferred = pending.shift() as Candidate;
      winner = rankEntry(transferred.entry, day, false, transferred.transferredFrom);
    }

    // A 4th class feria, or no observance at all; on Saturday, the Saturday office of Our Lady (no. 78).
    let celebrated: Candidate;
    if (!winner || tableItem(winner) === 28) {
      celebrated = weekday(day) === 6
        ? rank(ourLadyOnSaturday(day, dayTempora, year), day, false)
        : winner ?? rank('feria', day, false);
    } else {
      celebrated = winner;
    }
    const celebration = celebrationFrom(celebrated, day);

    const omitted = new Set(candidates.filter((c) => VIGIL_OF[c.entry.key] && !contenders.includes(c)).map((c) => c.entry.key));
    const { commemorations, inseparable } = commemorationsOf(celebrated, candidates, omitted, sunday);
    days.push({
      date,
      celebration,
      commemorations,
      inseparable,
      tempora: [...dayTempora],
      displaced: candidates.map((c) => c.entry.key).filter((key) => key !== celebration.key),
    });
  }
  return { days, lostTheirDate, carriedOut: pending };
}

/**
 * Decide the celebration and commemorations of every day of the year.
 *
 * Vigils depend on what happens to their feast the next day (no. 33), so the
 * year is resolved again until the set of omitted vigils stops changing.
 *
 * A 1st class feast impeded at the end of December takes its free day in January
 * (no. 96), so the year starts with whatever the previous one left waiting. From
 * 17 December to 1 January every day is of the 1st or 2nd class; before that a
 * free day comes within the week, so resolving the previous year from November is
 * enough to know what it carries over. No vigil of no. 33 falls in those months.
 */
export function resolveYearWith(year: number, options: PlacementOptions = {}, extras: Extras = NO_EXTRAS): ResolvedDay[] {
  const carried = resolvePass(year - 1, options, new Set(), extras, [], dayNumber(year - 1, 11, 1)).carriedOut;
  let omitted = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pass = resolvePass(year, options, omitted, extras, carried);
    const next = new Set([...pass.lostTheirDate].filter((key) => Object.values(VIGIL_OF).includes(key)));
    if ([...next].every((key) => omitted.has(key)) && next.size === omitted.size) return pass.days;
    omitted = next;
  }
  throw new Error(`vigils did not settle for ${year}`);
}

export function resolveYear(year: number, options: PlacementOptions = {}): ResolvedDay[] {
  return resolveYearWith(year, options);
}

export function resolveDay(date: Ymd, options: PlacementOptions = {}): ResolvedDay {
  fromYmd(date);
  const day = resolveYear(Number(date.slice(0, 4)), options).find((d) => d.date === date);
  if (!day) throw new RangeError(date);
  return day;
}
