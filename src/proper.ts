import {
  checkColors, checkMonthDay, DEDICATION, DEDICATION_KEY, PATRON_OF_THE_PLACE, TITULAR, type Church, type ChurchFeast,
} from './church.js';
import { CATALOGUE, LAYERS } from './generated/data.js';
import type { CatalogueEntry, Layer } from './types.js';

// The calendar a church actually keeps: the universal calendar with a nation's
// proper, an institute's, and the church's own feasts applied in that order
// (General Rubrics nos. 41-58). Everything downstream looks observances up here,
// so an observance whose rank a proper raises is raised everywhere.

export interface ProperOptions {
  readonly nations?: readonly string[];
  readonly institutes?: readonly string[];
  readonly church?: Church;
}

export interface ProperCalendar {
  /** Every observance as this calendar keeps it, by key. */
  readonly entries: ReadonlyMap<string, CatalogueEntry>;
  /** The observances with a fixed date that this calendar keeps. */
  readonly fixed: readonly CatalogueEntry[];
  /** Fixed dates whose entries a layer lists in its own order. */
  readonly order: ReadonlyMap<string, readonly string[]>;
  /** The church's own feasts. */
  readonly churchKeys: ReadonlySet<string>;
  /**
   * Every feast the church gave, by the key it is kept under, with its place in no. 91
   * item 12 (3 patron of the place, 4 dedication, 5 titular; the higher of two). Unlike
   * `churchKeys` it has a feast the universal calendar already keeps as of the 1st class.
   */
  readonly churchFeasts: ReadonlyMap<string, number>;
}

function resolveLayers(options: ProperOptions): Layer[] {
  const pick = (codes: readonly string[] = [], field: 'nation' | 'institute') => codes.map((code) => {
    const layer = Object.values(LAYERS).find((candidate) => candidate[field] === code);
    if (!layer) throw new RangeError(`no layer for ${field} ${code}`);
    return layer;
  });
  return [...pick(options.nations, 'nation'), ...pick(options.institutes, 'institute')];
}

const raisedKind = (entry: CatalogueEntry) => (entry.kind === 'commemoration' ? 'feast' : entry.kind);

export function properCalendar(options: ProperOptions = {}): ProperCalendar {
  const entries = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
  const removed = new Set<string>();
  const replacedBy = new Map<string, string>();
  const added = new Set<string>();
  const order = new Map<string, readonly string[]>();

  for (const layer of resolveLayers(options)) {
    const owner = layer.nation ? { scope: 'national' as const, nation: layer.nation } : { scope: 'institute' as const, institute: layer.institute as string };
    for (const op of layer.operations) {
      if (op.op === 'remove') removed.add(op.key);
      else if (op.op === 'order') order.set(op.date, op.keys);
      else if (op.op === 'raise') {
        const existing = entries.get(op.key);
        if (!existing) throw new Error(`layer raises unknown observance ${op.key}`);
        entries.set(op.key, {
          ...existing, ...owner, kind: raisedKind(existing), class: op.class,
          ...(op.properItem === undefined ? {} : { properItem: op.properItem }),
        });
      } else {
        added.add(op.key);
        if (op.replaces) { removed.add(op.replaces); replacedBy.set(op.replaces, op.key); }
      }
    }
  }
  const kept = (entry: CatalogueEntry) => (entry.scope === 'universal' ? !removed.has(entry.key) : added.has(entry.key) && !removed.has(entry.key));
  const keptKeys = new Set(CATALOGUE.filter(kept).map((entry) => entry.key));

  // The church's feasts, each with its place in item 12. One observance may hold two
  // places (the patron of the town who is also the titular): it is kept once, in the higher.
  const churchKeys = new Set<string>();
  const churchFeasts = new Map<string, number>();
  const given = new Map<string, string>();
  const place = (feast: ChurchFeast, role: number) => {
    if (feast.key === DEDICATION_KEY) throw new RangeError(`${DEDICATION_KEY} is the key of the dedication; give its date as \`dedication\``);
    // A nation or institute that keeps this observance under its own entry: that entry is the one raised.
    const key = replacedBy.get(feast.key) ?? feast.key;
    const signature = JSON.stringify([feast.date ?? null, feast.colors ?? null, feast.ofTheLord === true, feast.ofOurLady === true]);
    if (given.has(key) && given.get(key) !== signature) throw new RangeError(`${key} is given twice, differently`);
    given.set(key, signature);
    const giveFeast = () => churchFeasts.set(key, Math.min(role, churchFeasts.get(key) ?? Infinity));

    const original = CATALOGUE.find((entry) => entry.key === key);
    if (original) {
      if (feast.date !== undefined) throw new RangeError(`${key} is in the calendar; give it without a date`);
      if (original.formularyOf) throw new RangeError(`${key} is a further Mass of ${original.formularyOf}; give that key`);
      if (original.kind !== 'feast' && original.kind !== 'commemoration') throw new RangeError(`${key} is not a feast; it cannot be a church's feast`);
      if (removed.has(key)) throw new RangeError(`${key} is not kept in this calendar`);
      const current = entries.get(key) as CatalogueEntry;
      // Already of the 1st class in the universal calendar: it keeps its higher place (item 11).
      if (current.class === 1 && current.scope === 'universal') { giveFeast(); return; }
      const already = churchKeys.has(key) ? (current.properItem as number) : Infinity;
      entries.set(key, { ...current, kind: 'feast', class: 1, scope: 'church', properItem: Math.min(role, already) });
    } else {
      const what = `${key}, which is not in the calendar,`;
      const already = entries.get(key)?.properItem ?? Infinity;
      entries.set(key, {
        key,
        date: { fixed: checkMonthDay(feast.date, what) },
        kind: 'feast',
        class: 1,
        colors: checkColors(feast.colors, what),
        ofTheLord: feast.ofTheLord === true,
        ...(feast.ofOurLady ? { ofOurLady: true } : {}),
        scope: 'church',
        properItem: Math.min(role, already),
      });
    }
    churchKeys.add(key);
    giveFeast();
  };

  const church = options.church;
  for (const patron of church?.patrons ?? []) place(patron, PATRON_OF_THE_PLACE);
  if (church?.dedication !== undefined) {
    // The dedication of a church is a feast of the Lord (the Missal, at the head of the Common
    // of the Dedication), but not of a divine Person for no. 95: see commemorations.ts.
    entries.set(DEDICATION_KEY, {
      key: DEDICATION_KEY,
      date: { fixed: checkMonthDay(church.dedication, 'the dedication') },
      kind: 'feast',
      class: 1,
      colors: ['white'],
      ofTheLord: true,
      scope: 'church',
      properItem: DEDICATION,
    });
    churchKeys.add(DEDICATION_KEY);
    churchFeasts.set(DEDICATION_KEY, DEDICATION);
  }
  if (church?.titular) place(church.titular, TITULAR);

  const fixed = [...entries.values()].filter((entry) => 'fixed' in entry.date && (keptKeys.has(entry.key) || churchKeys.has(entry.key)));
  return { entries, fixed, order, churchKeys, churchFeasts };
}
