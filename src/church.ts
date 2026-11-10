import { CATALOGUE } from './generated/data.js';
import type { CatalogueEntry, Color } from './types.js';

// A church's own 1st class feasts (General Rubrics no. 91 item 12): its titular,
// the anniversary of its dedication, and the principal patron of the place.

/** A feast a church keeps as of the 1st class. */
export interface ChurchFeast {
  /**
   * A catalogue key, to raise that observance to the 1st class on its own date
   * (for example `'st-anne'` for a church of St. Anne), or a new key for a feast
   * the calendar does not have, which then needs `date` and `colors`.
   */
  readonly key: string;
  /** Month and day, `MM-DD`, for a new feast. */
  readonly date?: string;
  readonly colors?: readonly Color[];
  readonly ofTheLord?: boolean;
  readonly ofOurLady?: boolean;
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

const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]));
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface ChurchProper {
  /** The church's feasts, as catalogue entries with `scope: 'church'`. */
  readonly entries: readonly CatalogueEntry[];
  /** Observances of the calendar that the church's own entries replace. */
  readonly replaces: ReadonlySet<string>;
}

function feastEntry(feast: ChurchFeast): { entry?: CatalogueEntry; replaces?: string } {
  const existing = BY_KEY.get(feast.key);
  if (existing) {
    if (feast.date !== undefined) throw new RangeError(`${feast.key} is in the calendar; give it without a date`);
    if (!('fixed' in existing.date)) throw new RangeError(`${feast.key} has no fixed date; a movable titular is not supported yet`);
    // Already of the 1st class in the universal calendar: it keeps its higher place (item 11).
    if (existing.class === 1 && existing.scope === 'universal') return {};
    const { dayOrder: _order, formularyOf: _formulary, sourceId: _source, sourceAliases: _aliases, ...rest } = existing;
    return {
      entry: { ...rest, date: { fixed: existing.date.fixed }, kind: 'feast', class: 1, scope: 'church' },
      replaces: feast.key,
    };
  }
  if (!feast.date || !MONTH_DAY.test(feast.date)) throw new RangeError(`${feast.key} is not in the calendar; it needs a date as MM-DD`);
  if (!feast.colors?.length) throw new RangeError(`${feast.key} is not in the calendar; it needs colors`);
  return {
    entry: {
      key: feast.key,
      date: { fixed: feast.date },
      kind: 'feast',
      class: 1,
      colors: [...feast.colors],
      ofTheLord: feast.ofTheLord === true,
      ...(feast.ofOurLady ? { ofOurLady: true } : {}),
      scope: 'church',
    },
  };
}

export function churchProper(church: Church | undefined): ChurchProper {
  const entries: CatalogueEntry[] = [];
  const replaces = new Set<string>();
  if (!church) return { entries, replaces };
  for (const feast of [church.titular, ...(church.patrons ?? [])]) {
    if (!feast) continue;
    const { entry, replaces: replaced } = feastEntry(feast);
    if (entry) {
      if (entries.some((e) => e.key === entry.key)) throw new RangeError(`${entry.key} is given twice`);
      entries.push(entry);
    }
    if (replaced) replaces.add(replaced);
  }
  if (church.dedication !== undefined) {
    if (!MONTH_DAY.test(church.dedication)) throw new RangeError('dedication must be a date as MM-DD');
    // The dedication of a church is kept as a feast of the Lord, as the Lateran's is
    // (data/reviewed/feasts-of-the-lord.json).
    entries.push({
      key: DEDICATION_KEY,
      date: { fixed: church.dedication },
      kind: 'feast',
      class: 1,
      colors: ['white'],
      ofTheLord: true,
      scope: 'church',
    });
  }
  return { entries, replaces };
}
