import { DEDICATION_KEY } from './church.js';
import { excludes, isOfTheSeason } from './commemorations.js';
import { fromYmd, toYmd, weekday } from './dates.js';
import { EXTERNAL_SOLEMNITIES, LAYERS, MASSES, ORDOS } from './generated/data.js';
import { properCalendar } from './proper.js';
import { resolveYear, type ResolvedDay } from './resolver.js';
import type { PlacementOptions } from './temporal.js';
import type { CatalogueEntry, Color, ExternalSolemnity, OrdoProfile, Ymd } from './types.js';

// The Masses an ordo offers on a day beside the Mass of the day, from the Rubricae
// generales Missalis of the Code of Rubrics (1960). Numbers are those of the Code:
//   nos. 302-303  Masses "festive in the broad sense": a 3rd class feast impeded by
//                 another, and on a 4th class day the Mass of a commemoration;
//   nos. 341-346  votive Masses of the 2nd class: the Rogation Mass, external solemnities;
//   nos. 356-361  external solemnities;
//   nos. 384-386  votive Masses of the 3rd class: the first Thursday, Friday and Saturday;
//   nos. 415-423  Masses for the dead of the 3rd class within the octave of All Souls,
//                 and of the 4th class on 4th class ferias.
// Votive Masses of the 4th class (no. 388: any votive Mass, for a just cause) and
// Masses of saints in the Martyrology are open-ended; an ordo lists only those of
// its Masses for certain places (data/ordos/).

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
  /** The first Thursday, Friday and Saturday votive Masses (no. 385). */
  | 'votive'
  /** A Mass for the dead (nos. 415d, 422, 423). */
  | 'requiem'
  /** A Mass for certain places that the ordo offers on a 4th class day. */
  | 'for-certain-places';

/** Something the rubrics ask for before the Mass may be said. */
export type MassCondition =
  /** Exercises of piety for the sanctification of the clergy that day (no. 385a). */
  | 'devotions-for-the-clergy'
  /** Special exercises in honour of the Sacred Heart that day (no. 385b). */
  | 'devotions-to-the-sacred-heart'
  /** Special exercises in honour of the Immaculate Heart that day (no. 385c). */
  | 'devotions-to-the-immaculate-heart'
  /** The procession of the litanies, or the special prayers that replace it (no. 346). */
  | 'rogation-procession'
  /** Applied for the dead (no. 423, which asks that it be so). */
  | 'applied-for-the-dead';

export interface Mass {
  /** A key of the calendar (`nameOf` gives its title), of data/masses.json, or of the ordo's Masses for certain places. */
  readonly key: string;
  readonly kind: MassKind;
  /** The class of the Mass: of the day, or of the votive Mass or Mass for the dead. */
  readonly class: 1 | 2 | 3 | 4;
  readonly colors: readonly Color[];
  /** Commemorations at a low Mass, in order. */
  readonly commemorations: readonly string[];
  /** The rubric that permits it. */
  readonly rubric: string;
  readonly condition?: MassCondition;
}

export interface OrdoDay extends ResolvedDay {
  /** The Masses of the day, the ordo's first first. The Mass of the day is always among them. */
  readonly masses: readonly Mass[];
}

export interface OrdoOptions extends PlacementOptions {
  /**
   * An ordo of data/ordos/ (`'fssp'`), which says which Masses it offers and which
   * it prints first. Without one every Mass the rules permit is listed, the Mass of
   * the day first.
   */
  readonly ordo?: string;
}

const ALL_SOULS = 'commemoration-of-all-souls';
const GREATER_LITANIES = 'for-the-rogations';
const LESSER_LITANIES = /^pasc5-[123]$/;
const REQUIEM = 'requiem-daily';
const HIGH_PRIEST = 'votive-jesus-christ-the-eternal-high-priest';
const SACRED_HEART = 'votive-sacred-heart-of-jesus';
const IMMACULATE_HEART = 'votive-immaculate-heart-of-mary';

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

export function ordoYear(year: number, options: OrdoOptions = {}): OrdoDay[] {
  const profile = profileOf(options.ordo);
  const days = resolveYear(year, options);
  const { entries } = properCalendar(options);
  const entryOf = (key: string) => entries.get(key);

  // The day the office of an observance is kept this year.
  const keptOn = new Map<string, Ymd>();
  for (const day of days) if (!keptOn.has(day.celebration.key)) keptOn.set(day.celebration.key, day.date);

  // The octave of All Souls: the seven days after the day it is kept (no. 422).
  const allSouls = keptOn.get(ALL_SOULS);
  const inOctave = (date: Ymd) => allSouls !== undefined && fromYmd(date) > fromYmd(allSouls) && fromYmd(date) <= fromYmd(allSouls) + 7;

  const solemnities = externalSolemnities(year, days, keptOn, options);

  /**
   * Commemorations at a Mass said instead of the Mass of the day: the office of the
   * day, where it is one that is commemorated, and the day's commemorations, the
   * season first (no. 113), without those the Mass excludes (no. 112), to the limit.
   */
  const commemorationsAt = (mass: CatalogueEntry, day: ResolvedDay, limit: number): string[] => {
    const office = entryOf(day.celebration.key);
    const officeCommemorated = office !== undefined && office.key !== mass.key
      && day.celebration.class !== 4 && office.kind !== 'our-lady-on-saturday';
    const keys = [...(officeCommemorated ? [day.celebration.key] : []), ...day.commemorations.filter((key) => key !== mass.key)];
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
    const masses: Mass[] = [];
    const add = (mass: Mass) => {
      if (!masses.some((other) => other.key === mass.key && other.kind === mass.kind)) masses.push(mass);
    };

    for (const key of day.celebration.masses) {
      add({ key, kind: 'day', class: cls, colors: day.celebration.colors, commemorations: day.commemorations, rubric: 'no. 301' });
    }

    // Festive Masses in the broad sense (nos. 302-303).
    const office = entryOf(day.celebration.key);
    for (const key of day.commemorations) {
      const entry = entryOf(key);
      if (!entry || (entry.kind !== 'feast' && entry.kind !== 'commemoration') || isOfTheSeason(entry)) continue;
      if (cls === 4) {
        add({ key, kind: 'commemoration', class: entry.class, colors: entry.colors, commemorations: commemorationsAt(entry, day, 2), rubric: 'nos. 302b, 303b' });
      } else if (cls === 3 && entry.class === 3 && office?.kind === 'feast') {
        add({ key, kind: 'impeded-feast', class: 3, colors: entry.colors, commemorations: commemorationsAt(entry, day, 2), rubric: 'nos. 302a, 303a' });
      }
    }

    // Votive Masses of the 2nd class are permitted on days of the 2nd, 3rd and 4th class (no. 341).
    if (cls >= 2) {
      for (const solemnity of solemnities.get(day.date) ?? []) {
        const entry = entryOf(solemnity.key);
        if (!entry || solemnity.key === day.celebration.key) continue;
        add({
          key: solemnity.key, kind: 'external-solemnity', class: 2, colors: entry.colors,
          commemorations: commemorationsAt(entry, day, 1), rubric: solemnity.rubric,
        });
      }
      const litanies = day.celebration.key === GREATER_LITANIES || day.commemorations.includes(GREATER_LITANIES)
        || day.tempora.some((key) => LESSER_LITANIES.test(key));
      if (litanies) {
        const rogation = MASSES['rogation-mass'];
        if (rogation) {
          const entry = asEntry(rogation.key, rogation.colors);
          add({
            key: rogation.key, kind: 'rogation', class: 2, colors: rogation.colors,
            commemorations: commemorationsAt(entry, day, 1).filter((key) => key !== GREATER_LITANIES),
            rubric: 'nos. 86, 89, 346', condition: 'rogation-procession',
          });
        }
      }
    }

    // Votive Masses of the 3rd class, on days of the 3rd and 4th class (nos. 384-386).
    if (cls >= 3) {
      const date = day.date;
      const first = Number(date.slice(8)) <= 7;
      const dow = weekday(fromYmd(date));
      const highPriestOn = (profile?.highPriest ?? 'thursday') === 'thursday' ? 4 : 6;
      const votives: [string, string, MassCondition][] = [];
      if (first && dow === highPriestOn) votives.push([HIGH_PRIEST, 'no. 385a', 'devotions-for-the-clergy']);
      if (first && dow === 5) votives.push([SACRED_HEART, 'no. 385b', 'devotions-to-the-sacred-heart']);
      if (first && dow === 6) votives.push([IMMACULATE_HEART, 'no. 385c', 'devotions-to-the-immaculate-heart']);
      for (const [key, rubric, condition] of votives) {
        const formulary = MASSES[key];
        if (!formulary) continue;
        const entry = asEntry(key, formulary.colors, formulary);
        // A votive Mass of the Person whose office is said: either Mass, neither commemorated in the other (no. 317).
        add({ key, kind: 'votive', class: 3, colors: formulary.colors, commemorations: commemorationsAt(entry, day, 2), rubric, condition });
      }

      // Masses for the dead: of the 3rd class within the octave of All Souls (nos. 415d, 416, 422);
      // of the 4th class on 4th class ferias outside Christmastide (no. 423). None has a commemoration (no. 391).
      const requiem = MASSES[REQUIEM];
      if (requiem && inOctave(date)) {
        add({ key: REQUIEM, kind: 'requiem', class: 3, colors: requiem.colors, commemorations: [], rubric: 'nos. 415d, 416, 422' });
      } else if (requiem && cls === 4 && !isChristmastide(date)
        && (office?.kind === 'feria' || office?.kind === 'our-lady-on-saturday' || day.celebration.key === 'feria')) {
        add({ key: REQUIEM, kind: 'requiem', class: 4, colors: requiem.colors, commemorations: [], rubric: 'no. 423', condition: 'applied-for-the-dead' });
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

    return { ...day, masses: arrange(masses, day, profile, inOctave(day.date), entryOf(day.celebration.key)) };
  });

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

/** The Sunday each external solemnity is offered on this year. */
function externalSolemnities(year: number, days: readonly ResolvedDay[], keptOn: ReadonlyMap<string, Ymd>, options: OrdoOptions): Map<Ymd, PlacedSolemnity[]> {
  const placed = new Map<Ymd, PlacedSolemnity[]>();
  const sundays = days.filter((day) => weekday(fromYmd(day.date)) === 0);
  const place = (solemnity: ExternalSolemnity, rubric: string) => {
    let sunday: Ymd | undefined;
    if (solemnity.on.startsWith('first-sunday:')) {
      const month = solemnity.on.slice('first-sunday:'.length);
      sunday = sundays.find((day) => day.date.slice(5, 7) === month)?.date;
    } else if (solemnity.on === 'following-sunday' || solemnity.on === 'preceding-sunday') {
      const kept = keptOn.get(solemnity.key);
      if (kept === undefined || weekday(fromYmd(kept)) === 0) return;
      const n = fromYmd(kept);
      const target = solemnity.on === 'following-sunday' ? n + 7 - weekday(n) : n - weekday(n);
      sunday = toYmd(target);
      if (Number(sunday.slice(0, 4)) !== year) return;
    } else {
      sunday = sundays.find((day) => day.tempora.includes(solemnity.on) || day.celebration.key === solemnity.on)?.date;
    }
    if (sunday === undefined) return;
    placed.set(sunday, [...(placed.get(sunday) ?? []), { key: solemnity.key, rubric }]);
  };

  for (const solemnity of EXTERNAL_SOLEMNITIES) place(solemnity, solemnity.rubric ?? 'no. 358');
  for (const code of options.nations ?? []) {
    const layer = Object.values(LAYERS).find((candidate) => candidate.nation === code);
    for (const solemnity of layer?.externalSolemnities ?? []) place(solemnity, solemnity.rubric ?? 'no. 361');
  }
  const church = options.church;
  const on = church?.externalSolemnity ?? 'following-sunday';
  if (church && on !== 'none') {
    for (const patron of church.patrons ?? []) place({ key: patron.key, on }, 'nos. 358d, 359, 360');
    if (church.dedication !== undefined) place({ key: DEDICATION_KEY, on }, 'nos. 358e, 359, 360');
    if (church.titular) place({ key: church.titular.key, on }, 'nos. 358f, 359, 360');
  }
  return placed;
}
