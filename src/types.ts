export type Ymd = string;

export type ObservanceKind =
  | 'sunday'
  | 'feria'
  | 'feast'
  | 'vigil'
  | 'within-octave'
  | 'ember-day'
  | 'rogation'
  | 'commemoration'
  | 'our-lady-on-saturday';

export type Color = 'white' | 'red' | 'green' | 'violet' | 'black' | 'rose';

export type DateRule =
  | { readonly fixed: string }
  | { readonly temporal: string }
  | { readonly rule: string }
  | { readonly generated: string };

export interface CatalogueEntry {
  readonly key: string;
  readonly sourceId: string;
  readonly sourceAliases?: readonly string[];
  readonly date: DateRule;
  readonly kind: ObservanceKind;
  readonly class: 1 | 2 | 3 | 4;
  readonly colors: readonly Color[];
  readonly ofTheLord: boolean;
  readonly scope: 'universal' | 'national';
  readonly nation?: string;
}

export type LayerOperation =
  | { readonly op: 'add'; readonly key: string; readonly replaces?: string }
  | { readonly op: 'remove'; readonly key: string };

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
