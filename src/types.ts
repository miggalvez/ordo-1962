export type Ymd = string;

export type ObservanceKind =
  | 'sunday'
  | 'feria'
  | 'feast'
  | 'vigil'
  | 'within-octave'
  | 'ember-day'
  | 'commemoration'
  | 'our-lady-on-saturday';

export type Color = 'white' | 'red' | 'green' | 'violet' | 'black' | 'rose';

export type DateRule =
  /** `leapYear` is the month-day used instead in a leap year. */
  | { readonly fixed: string; readonly leapYear?: string }
  | { readonly temporal: string }
  | { readonly rule: string }
  | { readonly generated: string };

export interface CatalogueEntry {
  readonly key: string;
  /** Missale Meum's id. Absent on an observance added by hand (`origin: 'reviewed'`). */
  readonly sourceId?: string;
  readonly origin?: 'reviewed';
  readonly sourceAliases?: readonly string[];
  readonly date: DateRule;
  /** Position among the universal entries of the same fixed date, as the calendar lists them. */
  readonly dayOrder?: number;
  /** Set on a further Mass of one celebration (Christmas, All Souls): the key of its principal entry. */
  readonly formularyOf?: string;
  readonly kind: ObservanceKind;
  readonly class: 1 | 2 | 3 | 4;
  readonly colors: readonly Color[];
  readonly ofTheLord: boolean;
  readonly scope: 'universal' | 'national';
  readonly nation?: string;
}

export type LayerOperation =
  | { readonly op: 'add'; readonly key: string; readonly replaces?: string }
  | { readonly op: 'remove'; readonly key: string }
  /** The layer lists this fixed date's entries in this order. */
  | { readonly op: 'order'; readonly date: string; readonly keys: readonly string[] };

export interface Layer {
  readonly nation: string;
  readonly source: string;
  readonly operations: readonly LayerOperation[];
}

export type TemporalBlockName =
  | 'POST_EPIPHANY'
  | 'FROM_PRE_LENT_TO_POST_PENTECOST'
  | 'EMBER_DAYS_SEPTEMBER'
  | 'WEEK_24_AFTER_PENTECOST'
  | 'ADVENT'
  | 'NATIVITY_OCTAVE_SUNDAY'
  | 'NATIVITY_OCTAVE_FERIA'
  | 'HOLY_NAME'
  | 'CHRIST_KING'
  | 'SUNDAY_IN_CHRISTMAS_OCTAVE';
