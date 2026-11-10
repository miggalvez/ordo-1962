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

/** Languages the titles are kept in. Latin, English and Spanish cover every observance; Polish, Missale Meum's. */
export type Language = 'la' | 'en' | 'es' | 'pl';

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
  /** An office, Mass or commemoration of the Blessed Virgin (no. 112d), for entries outside the reviewed list. */
  readonly ofOurLady?: boolean;
  /**
   * Who keeps it: the universal Church, a nation, an institute, or one church.
   * Anything but `universal` is a proper feast in the table of precedence (no. 91 items 12, 19, 23).
   */
  readonly scope: 'universal' | 'national' | 'institute' | 'church';
  readonly nation?: string;
  readonly institute?: string;
  /**
   * For a proper 1st class feast, its place within no. 91 item 12 (1 to 8): 3 the
   * principal patron of the place, 4 the dedication of the church, 5 its titular,
   * 6 to 8 an institute's titular, founder and patron. Absent, the scope decides.
   */
  readonly properItem?: number;
}

/** An observance a hand-written layer defines. Its names stay in the layer file. */
export interface LayerObservance {
  readonly key: string;
  readonly date: { readonly fixed: string };
  readonly kind: 'feast' | 'commemoration';
  readonly class: 1 | 2 | 3 | 4;
  readonly colors: readonly Color[];
  readonly ofTheLord?: boolean;
  readonly ofOurLady?: boolean;
  readonly names: Readonly<Record<string, string>>;
  readonly source: string;
}

export type LayerOperation =
  | { readonly op: 'add'; readonly key: string; readonly replaces?: string }
  | { readonly op: 'remove'; readonly key: string }
  /**
   * The layer keeps an observance of the calendar at a higher rank (nos. 42-46): a
   * patron or a titular. The key stays, so everything known about the observance
   * by its key still holds.
   */
  | { readonly op: 'raise'; readonly key: string; readonly class: 1 | 2; readonly properItem?: number; readonly source?: string }
  /** The layer lists this fixed date's entries in this order. */
  | { readonly op: 'order'; readonly date: string; readonly keys: readonly string[] };

/**
 * An external solemnity (Rubricae generales Missalis nos. 356-361): a Mass of the
 * feast, as a votive Mass of the 2nd class, on a Sunday it does not fall on. `on`
 * is the Sunday: a key of the cycle (`pent03-0`), the first Sunday of a month
 * (`first-sunday:10`), or the Sunday following or preceding the feast.
 */
export interface ExternalSolemnity {
  readonly key: string;
  readonly on: string;
  /** The rubric it is offered by. */
  readonly rubric?: string;
  readonly source?: string;
}

/** A nation's or an institute's proper, as operations on the universal calendar. */
export interface Layer {
  readonly nation?: string;
  readonly institute?: string;
  readonly source: string;
  readonly observances?: readonly LayerObservance[];
  readonly operations: readonly LayerOperation[];
  /** External solemnities the nation keeps by indult. */
  readonly externalSolemnities?: readonly ExternalSolemnity[];
}

/** A Mass that is not an observance of the calendar: a votive Mass, the Rogation Mass, a Requiem. */
export interface MassFormulary {
  readonly key: string;
  readonly kind: 'votive' | 'rogation' | 'requiem';
  readonly colors: readonly Color[];
  readonly ofTheLord?: boolean;
  readonly ofOurLady?: boolean;
  readonly source: string;
}

/** What an ordo offers beside the Mass of the day, and what it prints first (data/ordos/). */
export interface OrdoProfile {
  readonly ordo: string;
  readonly first: readonly {
    readonly kind: string;
    readonly within?: 'all-souls-octave';
    readonly onDaysOfClass?: readonly number[];
    readonly onCelebrations?: readonly ObservanceKind[];
  }[];
  readonly omit: readonly { readonly kind: string; readonly class?: number; readonly season?: 'lent' }[];
  readonly highPriest: 'thursday' | 'saturday';
  readonly massesForCertainPlaces: readonly {
    readonly key: string;
    readonly date: string;
    readonly colors: readonly Color[];
    readonly ofOurLady?: boolean;
  }[];
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
