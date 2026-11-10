import { PATRON_OF_THE_PLACE } from './church.js';
import { excludes, isOfTheSeason } from './commemorations.js';
import { fromYmd, toYmd, weekday } from './dates.js';
import { EXTERNAL_SOLEMNITIES, LAYERS, MASSES, OF_THE_DAY, ORDOS } from './generated/data.js';
import { properCalendar, type ProperCalendar } from './proper.js';
import { resolveYear, type ResolvedDay } from './resolver.js';
import type { PlacementOptions } from './temporal.js';
import type { CatalogueEntry, Color, ExternalSolemnity, OrdoProfile, Ymd } from './types.js';

// The Masses an ordo offers on a day beside the Mass of the day, from the Rubricae
// generales Missalis of the Code of Rubrics as the 1962 Missal prints it. Numbers
// are those of the Code:
//   nos. 302-303  Masses "festive in the broad sense": a 3rd class feast impeded by
//                 another, and on a 4th class day the Mass of a commemoration;
//   nos. 341-346  votive Masses of the 2nd class: the Rogation Mass, external solemnities;
//   nos. 356-361  external solemnities;
//   no. 369       the Mass for the Propagation of the Faith on the Sunday for the Missions;
//   nos. 384-386  votive Masses of the 3rd class: the first Thursday, Friday and Saturday;
//   nos. 415-423  Masses for the dead of the 3rd class within the octave of All Souls,
//                 and of the 4th class on 4th class ferias.
// Votive Masses of the 4th class (no. 388: any votive Mass, for a just cause) and
// Masses of saints in the Martyrology are open-ended; an ordo lists only those of
// its Masses for certain places (data/ordos/). Votive Masses of the 2nd class that
// hang on an occasion (nos. 345, 348-355, 362-368, 370-382) are not listed either.

export type MassKind =
  /** A Mass of the day's celebration (three at Christmas and on All Souls). */
  | 'day'
  /** A 3rd class feast impeded by another 3rd class feast, on its own day (nos. 302a, 303a). */
  | 'impeded-feast'
  /** On a 4th class day, the Mass of an observance commemorated that day (nos. 302b, 303b). */
  | 'commemoration'
  /** The external solemnity of a feast, on a Sunday (nos. 356-361). */
  | 'external-solemnity'
  /** On the greater and lesser litanies (nos. 86, 89, 346). */
  | 'rogation'
  /**
   * A votive Mass the rubrics give a day: of the 3rd class on the first Thursday,
   * Friday and Saturday (no. 385), of the 2nd class for the Propagation of the
   * Faith on the next to last Sunday of October (nos. 369, 453).
   */
  | 'votive'
  /** A Mass for the dead (nos. 415d, 422, 423). */
  | 'requiem'
  /** A Mass for certain places that the ordo offers on a 4th class day. */
  | 'for-certain-places';

/** Something the rubrics require before the Mass may be said. */
export type MassCondition =
  /** Exercises of piety for the sanctification of the clergy that day (no. 385a). */
  | 'devotions-for-the-clergy'
  /** Special exercises in honour of the Sacred Heart that day (no. 385b). */
  | 'devotions-to-the-sacred-heart'
  /** Special exercises in honour of the Immaculate Heart that day (no. 385c). */
  | 'devotions-to-the-immaculate-heart'
  /** The procession of the litanies, or the special prayers that replace it (no. 346). */
  | 'rogation-procession'
  /** Special celebrations for the Missions that day (no. 369). */
  | 'celebrations-for-the-missions'
  /**
   * The Mass is applied for the dead: within the octave of All Souls only such a
   * Mass may be of Requiem (no. 422). For the 4th class Requiem no. 423 says only
   * that this is most fitting, so that Mass carries no condition.
   */
  | 'applied-for-the-dead';

export interface Mass {
  /**
   * A key of the calendar (`nameOf` gives its title), of data/masses.json, or of the
   * ordo's Masses for certain places.
   */
  readonly key: string;
  readonly kind: MassKind;
  /** The class of the Mass: of the day, or of the votive Mass or Mass for the dead. */
  readonly class: 1 | 2 | 3 | 4;
  /**
   * The colours of the Mass. For a Mass of the day they are the day's, except where a
   * rite of another colour comes before the Mass (the palms, the Easter Vigil).
   */
  readonly colors: readonly Color[];
  /** Commemorations at a low Mass, in order. */
  readonly commemorations: readonly string[];
  /** The rubric that permits it. */
  readonly rubric: string;
  readonly condition?: MassCondition;
  /** How many such Masses a church may have that day, where the rubrics say (nos. 360, 361, 369, 385). */
  readonly atMost?: number;
}

export interface OrdoDay extends ResolvedDay {
  /**
   * The Masses of the day, the ordo's first first. The Mass of the day is among
   * them on every day that has one: Good Friday has none, and its list is empty.
   */
  readonly masses: readonly Mass[];
}

export interface OrdoOptions extends PlacementOptions {
  /**
   * An ordo of data/ordos/ (`'fssp'`), which says which Masses it offers and which
   * it prints first. Without one every Mass the rules permit is listed, the Mass of
   * the day first.
   */
  readonly ordo?: string;
  /**
   * The day the church holds its exercises for the sanctification of the clergy, and
   * so may have the Mass of Christ the High Priest (no. 385a). It overrides the
   * ordo's. With neither, the Mass is listed on both days it may be said on.
   */
  readonly highPriest?: 'thursday' | 'saturday';
  /**
   * For a feast with an external solemnity by right, by its key: the Sunday before
   * or after the feast (no. 359), or `'none'` to leave it out. One the rubrics or
   * an indult assign to its day (the Rosary, a nation's) can only be left out.
   */
  readonly externalSolemnities?: Readonly<Record<string, 'following-sunday' | 'preceding-sunday' | 'none'>>;
}

const ALL_SOULS = 'commemoration-of-all-souls';
const GREATER_LITANIES = 'for-the-rogations';
const LESSER_LITANIES = /^pasc5-[123]$/;
const REQUIEM = 'requiem-daily';
const HIGH_PRIEST = 'votive-jesus-christ-the-eternal-high-priest';
const SACRED_HEART = 'votive-sacred-heart-of-jesus';
const IMMACULATE_HEART = 'votive-immaculate-heart-of-mary';
const MISSIONS = 'mass-for-the-propagation-of-the-faith';

// The order a list takes without an ordo, after the Masses of the day.
const KIND_ORDER: readonly MassKind[] = [
  'day', 'impeded-feast', 'commemoration', 'external-solemnity', 'rogation', 'votive', 'for-certain-places', 'requiem',
];

function profileOf(id: string | undefined): OrdoProfile | undefined {
  if (id === undefined) return undefined;
  const profile = ORDOS[id];
  if (!profile) throw new RangeError(`no ordo ${JSON.stringify(id)}; the ordos are ${Object.keys(ORDOS).join(', ')}`);
  return profile;
}

/** An entry of the calendar, or one standing for a Mass that is not, for the exclusions of no. 112. */
function asEntry(key: string, colors: readonly Color[], flags: { ofTheLord?: boolean; ofOurLady?: boolean } = {}): CatalogueEntry {
  return {
    key, date: { rule: 'mass' }, kind: 'feast', class: 4, colors, ofTheLord: flags.ofTheLord === true,
    ...(flags.ofOurLady ? { ofOurLady: true } : {}), scope: 'universal',
  };
}

const isLent = (day: ResolvedDay) => day.tempora.some((key) => /^quad[1-6]-|^quadp3-[3-6]$/.test(key));
const isChristmastide = (date: Ymd) => date.slice(5) >= '12-25' || date.slice(5) <= '01-13';

/** The rubric by which the Mass of the day is the Mass of its office (no. 270). */
function rubricOfTheDay(office: CatalogueEntry | undefined, key: string): string {
  if (office?.kind === 'sunday') return 'no. 298';
  if (office?.kind === 'feria' || office?.kind === 'ember-day' || key === 'feria') return 'no. 299';
  if (office?.kind === 'feast') return 'no. 301';
  return 'no. 270';
}

/** The day each observance's office is kept in a year. */
function keptIn(days: readonly ResolvedDay[]): Map<string, Ymd> {
  const kept = new Map<string, Ymd>();
  for (const day of days) if (!kept.has(day.celebration.key)) kept.set(day.celebration.key, day.date);
  return kept;
}

export function ordoYear(year: number, options: OrdoOptions = {}): OrdoDay[] {
  const profile = profileOf(options.ordo);
  if (options.highPriest !== undefined && options.highPriest !== 'thursday' && options.highPriest !== 'saturday') {
    throw new RangeError(`highPriest is 'thursday' or 'saturday', not ${JSON.stringify(options.highPriest)}`);
  }
  const days = resolveYear(year, options);
  const proper = properCalendar(options);
  const entryOf = (key: string) => proper.entries.get(key);
  const keptOn = keptIn(days);

  // The octave of All Souls: the eight days counted from the day it is kept (no. 422),
  // so the seven after it.
  const allSouls = keptOn.get(ALL_SOULS);
  const inOctave = (date: Ymd) => allSouls !== undefined && fromYmd(date) > fromYmd(allSouls) && fromYmd(date) <= fromYmd(allSouls) + 7;

  const solemnities = externalSolemnities(year, days, keptOn, proper, options);

  // The Sunday for the Missions: the next to last of October (no. 453).
  const missionSunday = days.filter((day) => day.date.slice(5, 7) === '10' && weekday(fromYmd(day.date)) === 0).at(-2)?.date;

  // The days the Mass of Christ the High Priest may be said on (no. 385a): the church's, the ordo's, or both.
  const highPriest = options.highPriest ?? profile?.highPriest;
  const highPriestOn = highPriest === 'thursday' ? [4] : highPriest === 'saturday' ? [6] : [4, 6];

  /**
   * Commemorations at a Mass said instead of the Mass of the day: the office of the
   * day, where it is one that is commemorated, and the day's commemorations, the
   * season first (no. 113), without those the Mass excludes (no. 112), to the limit.
   */
  const commemorationsAt = (mass: CatalogueEntry, day: ResolvedDay, limit: number, without: readonly string[] = []): string[] => {
    const office = entryOf(day.celebration.key);
    const officeCommemorated = office !== undefined && office.key !== mass.key
      && day.celebration.class !== 4 && office.kind !== 'our-lady-on-saturday';
    const keys = [...(officeCommemorated ? [day.celebration.key] : []), ...day.commemorations]
      .filter((key) => key !== mass.key && !without.includes(key));
    const candidates = keys.map((key) => entryOf(key)).filter((entry): entry is CatalogueEntry => entry !== undefined);
    const season = candidates.filter(isOfTheSeason);
    const ordered = [...season, ...candidates.filter((entry) => !isOfTheSeason(entry))];
    const admitted: CatalogueEntry[] = [];
    for (const entry of ordered) {
      if (excludes(mass, entry) || admitted.some((already) => excludes(already, entry))) continue;
      admitted.push(entry);
    }
    return admitted.slice(0, limit).map((entry) => entry.key);
  };

  return days.map((day) => {
    const cls = day.celebration.class;
    const office = entryOf(day.celebration.key);
    const masses: Mass[] = [];
    // A day with no Mass (Good Friday) has none of any kind.
    if (OF_THE_DAY.noMass.includes(day.celebration.key)) return { ...day, masses };
    const add = (mass: Mass) => {
      if (!masses.some((other) => other.key === mass.key && other.kind === mass.kind)) masses.push(mass);
    };

    for (const key of day.celebration.masses) {
      add({
        key, kind: 'day', class: cls,
        colors: OF_THE_DAY.colors[key] ?? day.celebration.colors,
        commemorations: [...day.commemorations, ...(OF_THE_DAY.commemorations[key] ?? [])],
        rubric: rubricOfTheDay(office, day.celebration.key),
      });
    }

    // Festive Masses in the broad sense (nos. 302-303).
    for (const key of day.commemorations) {
      const entry = entryOf(key);
      if (!entry || (entry.kind !== 'feast' && entry.kind !== 'commemoration') || isOfTheSeason(entry)) continue;
      if (cls === 4) {
        add({ key, kind: 'commemoration', class: entry.class, colors: entry.colors, commemorations: commemorationsAt(entry, day, 2), rubric: 'nos. 302b, 303b' });
      } else if (cls === 3 && entry.class === 3 && office?.kind === 'feast') {
        add({ key, kind: 'impeded-feast', class: 3, colors: entry.colors, commemorations: commemorationsAt(entry, day, 2), rubric: 'nos. 302a, 303a' });
      }
    }

    // Votive Masses of the 2nd class are permitted on days of the 2nd, 3rd and 4th class
    // (no. 341), with one commemoration (no. 343b).
    if (cls >= 2) {
      for (const solemnity of solemnities.get(day.date) ?? []) {
        const entry = entryOf(solemnity.key);
        if (!entry || solemnity.key === day.celebration.key) continue;
        add({
          key: solemnity.key, kind: 'external-solemnity', class: 2, colors: entry.colors,
          commemorations: commemorationsAt(entry, day, 1), rubric: solemnity.rubric, atMost: 2,
        });
      }
      const litanies = day.celebration.key === GREATER_LITANIES || day.commemorations.includes(GREATER_LITANIES)
        || day.tempora.some((key) => LESSER_LITANIES.test(key));
      const rogation = MASSES['rogation-mass'];
      if (litanies && rogation) {
        add({
          key: rogation.key, kind: 'rogation', class: 2, colors: rogation.colors,
          commemorations: commemorationsAt(asEntry(rogation.key, rogation.colors), day, 1, [GREATER_LITANIES]),
          rubric: 'nos. 86, 89, 346', condition: 'rogation-procession',
        });
      }
      const missions = MASSES[MISSIONS];
      if (missions && day.date === missionSunday) {
        add({
          key: MISSIONS, kind: 'votive', class: 2, colors: missions.colors,
          commemorations: commemorationsAt(asEntry(MISSIONS, missions.colors), day, 1),
          rubric: 'nos. 369, 453', condition: 'celebrations-for-the-missions', atMost: 1,
        });
      }
    }

    // Votive Masses of the 3rd class, on days of the 3rd and 4th class (nos. 384-386).
    if (cls >= 3) {
      const date = day.date;
      const first = Number(date.slice(8)) <= 7;
      const dow = weekday(fromYmd(date));
      const votives: [string, string, MassCondition, number][] = [];
      if (first && highPriestOn.includes(dow)) votives.push([HIGH_PRIEST, 'no. 385a', 'devotions-for-the-clergy', 1]);
      if (first && dow === 5) votives.push([SACRED_HEART, 'no. 385b', 'devotions-to-the-sacred-heart', 2]);
      if (first && dow === 6) votives.push([IMMACULATE_HEART, 'no. 385c', 'devotions-to-the-immaculate-heart', 1]);
      for (const [key, rubric, condition, atMost] of votives) {
        const formulary = MASSES[key];
        if (!formulary) continue;
        const entry = asEntry(key, formulary.colors, formulary);
        // A votive Mass of the Person whose office is said: either Mass, neither commemorated in the other (no. 317).
        add({ key, kind: 'votive', class: 3, colors: formulary.colors, commemorations: commemorationsAt(entry, day, 2), rubric, condition, atMost });
      }

      // Masses for the dead. Within the octave of All Souls a Mass applied for the dead may be
      // of Requiem, of the 3rd class (nos. 415d, 416, 422). Outside it the daily Mass is of the
      // 4th class, on 4th class ferias outside Christmastide (no. 423): not on a Saturday of Our
      // Lady, which the table of precedence lists apart from the ferias (no. 91, items 27 and 28),
      // where no. 387 says "days of the 4th class" for votive Masses. None has a commemoration (no. 391).
      const requiem = MASSES[REQUIEM];
      if (requiem && inOctave(date)) {
        add({ key: REQUIEM, kind: 'requiem', class: 3, colors: requiem.colors, commemorations: [], rubric: 'nos. 415d, 416, 422', condition: 'applied-for-the-dead' });
      } else if (requiem && cls === 4 && !isChristmastide(date) && (office?.kind === 'feria' || day.celebration.key === 'feria')) {
        add({ key: REQUIEM, kind: 'requiem', class: 4, colors: requiem.colors, commemorations: [], rubric: 'no. 423' });
      }
    }

    // The ordo's Masses for certain places, on a 4th class day (nos. 302c, 303b, 309b, 388).
    if (cls === 4) {
      for (const place of profile?.massesForCertainPlaces ?? []) {
        if (place.date !== day.date.slice(5)) continue;
        const entry = asEntry(place.key, place.colors, place);
        add({ key: place.key, kind: 'for-certain-places', class: 4, colors: place.colors, commemorations: commemorationsAt(entry, day, 2), rubric: 'nos. 302c, 303b, 388' });
      }
    }

    return { ...day, masses: arrange(masses, day, profile, inOctave(day.date), office) };
  });
}

function arrange(masses: Mass[], day: ResolvedDay, profile: OrdoProfile | undefined, octave: boolean, office: CatalogueEntry | undefined): Mass[] {
  const kept = masses.filter((mass) => !profile?.omit.some((rule) => mass.kind === rule.kind
    && (rule.class === undefined || rule.class === mass.class)
    && (rule.season === undefined || (rule.season === 'lent' && isLent(day)))));
  const sorted = [...kept].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  for (const rule of profile?.first ?? []) {
    if (rule.within === 'all-souls-octave' && !octave) continue;
    if (rule.onDaysOfClass && !rule.onDaysOfClass.includes(day.celebration.class)) continue;
    if (rule.onCelebrations && !(office && rule.onCelebrations.includes(office.kind)) && !(day.celebration.key === 'feria' && rule.onCelebrations.includes('feria'))) continue;
    const chosen = sorted.find((mass) => mass.kind === rule.kind);
    if (chosen) return [chosen, ...sorted.filter((mass) => mass !== chosen)];
  }
  return sorted;
}

/** The ordo's day: the resolved day with the Masses it offers. */
export function ordoDay(date: Ymd, options: OrdoOptions = {}): OrdoDay {
  fromYmd(date);
  const day = ordoYear(Number(date.slice(0, 4)), options).find((d) => d.date === date);
  if (!day) throw new RangeError(date);
  return day;
}

interface PlacedSolemnity {
  readonly key: string;
  readonly rubric: string;
}

interface OfferedSolemnity {
  readonly key: string;
  on: string;
  readonly fixed: boolean;
  readonly rubric: string;
}

/**
 * The Sunday each external solemnity is offered on this year. A feast has one
 * solemnity, whoever gives it: the first of the universal Church's (no. 358a, b),
 * the nation's by indult (no. 361), the institute's (no. 358e, h) and the
 * church's own (no. 358d, g).
 */
function externalSolemnities(
  year: number, days: readonly ResolvedDay[], keptOn: ReadonlyMap<string, Ymd>, proper: ProperCalendar, options: OrdoOptions,
): Map<Ymd, PlacedSolemnity[]> {
  const offered = new Map<string, OfferedSolemnity>();
  const offer = (solemnity: ExternalSolemnity, rubric: string) => {
    if (!offered.has(solemnity.key)) {
      offered.set(solemnity.key, { key: solemnity.key, on: solemnity.on, fixed: solemnity.fixed === true, rubric: solemnity.rubric ?? rubric });
    }
  };
  for (const solemnity of EXTERNAL_SOLEMNITIES) offer(solemnity, 'no. 358');
  const layerOf = (field: 'nation' | 'institute', code: string) => Object.values(LAYERS).find((candidate) => candidate[field] === code);
  for (const code of options.nations ?? []) for (const solemnity of layerOf('nation', code)?.externalSolemnities ?? []) offer(solemnity, 'no. 361');
  for (const code of options.institutes ?? []) for (const solemnity of layerOf('institute', code)?.externalSolemnities ?? []) offer(solemnity, 'no. 358e');

  // The church's own: on the Sunday it names, or the one after the feast.
  const ofTheChurch = options.church?.externalSolemnity;
  for (const [key, place] of proper.churchFeasts) {
    const existing = offered.get(key);
    if (existing) {
      // A feast that has one already (a church of the Sacred Heart): the church may still say which Sunday.
      if (!existing.fixed && (ofTheChurch === 'following-sunday' || ofTheChurch === 'preceding-sunday')) existing.on = ofTheChurch;
    } else if (ofTheChurch !== 'none') {
      offer({ key, on: ofTheChurch ?? 'following-sunday' }, place === PATRON_OF_THE_PLACE ? 'nos. 358d, 359, 360' : 'nos. 358g, 359, 360');
    }
  }

  for (const [key, choice] of Object.entries(options.externalSolemnities ?? {})) {
    const solemnity = offered.get(key);
    if (!solemnity) throw new RangeError(`${key} has no external solemnity here; those that have are ${[...offered.keys()].join(', ')}`);
    if (choice === 'none') offered.delete(key);
    else if (choice !== 'following-sunday' && choice !== 'preceding-sunday') throw new RangeError(`the external solemnity of ${key} is on 'following-sunday', 'preceding-sunday' or 'none', not ${JSON.stringify(choice)}`);
    else if (solemnity.fixed) throw new RangeError(`the external solemnity of ${key} is assigned to its day (no. 359); it can only be left out with 'none'`);
    else solemnity.on = choice;
  }

  // A feast in the last days of December has its following Sunday in the next year, and
  // one in the first days of January its preceding Sunday in the year before.
  const neighbours = new Map<number, Map<string, Ymd>>();
  const keptInYear = (other: number) => {
    if (!neighbours.has(other)) neighbours.set(other, keptIn(resolveYear(other, options)));
    return neighbours.get(other) as Map<string, Ymd>;
  };
  const sundayBeside = (kept: Ymd | undefined, on: string): Ymd | undefined => {
    if (kept === undefined || weekday(fromYmd(kept)) === 0) return undefined; // not kept, or kept on a Sunday
    const n = fromYmd(kept);
    return toYmd(on === 'following-sunday' ? n + 7 - weekday(n) : n - weekday(n));
  };

  const placed = new Map<Ymd, PlacedSolemnity[]>();
  const sundays = days.filter((day) => weekday(fromYmd(day.date)) === 0);
  for (const solemnity of offered.values()) {
    // The Sundays of this year it falls on: one, or at the turn of the year sometimes two or none.
    const on: (Ymd | undefined)[] = [];
    if (solemnity.on.startsWith('first-sunday:')) {
      const month = solemnity.on.slice('first-sunday:'.length);
      on.push(sundays.find((day) => day.date.slice(5, 7) === month)?.date);
    } else if (solemnity.on === 'following-sunday' || solemnity.on === 'preceding-sunday') {
      const kept = keptOn.get(solemnity.key);
      const fixedDate = proper.entries.get(solemnity.key)?.date;
      const monthDay = fixedDate && 'fixed' in fixedDate ? fixedDate.fixed : kept?.slice(5);
      on.push(sundayBeside(kept, solemnity.on));
      if (solemnity.on === 'following-sunday' && monthDay !== undefined && monthDay >= '12-18') on.push(sundayBeside(keptInYear(year - 1).get(solemnity.key), solemnity.on));
      if (solemnity.on === 'preceding-sunday' && monthDay !== undefined && monthDay <= '01-14') on.push(sundayBeside(keptInYear(year + 1).get(solemnity.key), solemnity.on));
    } else {
      on.push(sundays.find((day) => day.tempora.includes(solemnity.on) || day.celebration.key === solemnity.on)?.date);
    }
    for (const sunday of new Set(on)) {
      if (sunday === undefined || Number(sunday.slice(0, 4)) !== year) continue;
      placed.set(sunday, [...(placed.get(sunday) ?? []), { key: solemnity.key, rubric: solemnity.rubric }]);
    }
  }
  return placed;
}
