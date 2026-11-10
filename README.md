# ordo-1962

The Roman calendar of 1962 (1960 Code of Rubrics) for any year, nation,
institute and church, computed in process with no network calls.

Status: early. The engine decides each day's principal celebration, class,
colour and commemorations, including transfers, for the universal calendar with
a nation's proper (the United States, Poland), an institute's (the FSSP) and a
church's own feasts, and gives every observance's title in Latin, English and
Spanish, and lists the Masses an ordo offers beside the day's own: votive
Masses, Masses for the dead, the Rogation Mass, external solemnities and the
Mass of a commemorated saint.

## Install

```sh
npm install ordo-1962
```

Node 22 or later. There are no runtime dependencies.

## Names

```js
import { nameOf, resolveDay, titleOf } from 'ordo-1962';

const day = resolveDay('2026-03-27');
titleOf(day, 'es');                                  // 'Viernes en la semana de Pasión'
day.commemorations.map((key) => nameOf(key, 'es', { date: day.date }));
                                                     // ['San Juan Damasceno, confesor y doctor de la Iglesia', 'Conmemoración de los Siete Dolores…']
nameOf('st-blaise', 'la');                           // 'S. Blasii Episcopi et Martyris'

titleOf(resolveDay('2026-12-25'), 'es');             // 'Natividad del Señor'
titleOf(resolveDay('2026-11-08'), 'en');             // 'Resumed V Sunday after Epiphany'
```

Two lookups:

- **`titleOf(day, language)`** is the heading of a resolved day, as an ordo
  prints it. Use it for the day.
- **`nameOf(key, language, { date })`** is the title of one observance: a
  commemoration, or one Mass of a day.

They differ in three places. Christmas and All Souls are keyed by their first
Mass, so `nameOf` of the day's key is that Mass ("Natividad del Señor, en la
noche") and `titleOf` is the day ("Natividad del Señor"). A Saturday of Our Lady
is keyed by the Mass of the season and headed "Santa María en sábado". And the
Sundays after Epiphany kept in November have the same key as in January: with
the date they are named as the Missal heads them, "Dominica V quæ superfuit post
Epiphaniam", "Resumed V Sunday after Epiphany".

Every observance, in the universal calendar and in every layer, has a title in
Latin (`la`), English (`en`) and Spanish (`es`); the build fails if one is
missing. Polish (`pl`) is Missale Meum's and covers its calendar; where it has
none, the Latin is given. A language is taken by its code (`en-US` is `en`); any
other is refused. A church's new feast takes the `names` given with it
(`{ key, date, colors, names: { es: '…' } }`, passed as `{ church }`), from
whichever of its records has them, in the language asked for, else Latin, else
another; given no names it has no title. The dedication has its own.

Where the titles come from:

| Language | Source |
|---|---|
| Latin, English, Polish | Missale Meum (`data/names/{la,en,pl}.json`, written by the conversion script) |
| Spanish | Divinum Officium's Spanish missal (`data/names/es.json`, written by `scripts/import-divinum-officium-es.mjs`; 688 titles, 43 of them corrected by hand) |
| Any | `data/reviewed/names.json`, by hand, each with its reason: 138 Latin titles, 89 Spanish, 39 English, and the 7 day headings |
| Any | A layer's own observances (`data/layers/*.json`) |

The importer follows each observance's Missale Meum id to the Divinum Officium
file of the same name, takes the variant of its title for the 1960 rubrics, and
writes it in the style of the Spanish missal: San, Santa and Santos in full and
the category in lower case ("San Blas, obispo y mártir", not "S. Blas, Obispo y
Mártir"). The hand-written titles cover what that cannot: Missale Meum's own
commemorations, titles Divinum Officium gives in Latin or English, two ids that
name a different Divinum Officium file (St. John Vianney, St. Telesphorus), and
titles of the calendar before 1960 (1 January is the Octave of the Nativity, not
the Circumcision; Alexander on 3 May is not called pope). Missale Meum's Latin
is often not a title at all ("S. Mauro Abbate", "S. Joanne", one in Polish):
those are written from the headings of the 1962 Missal.

Three checks at development time, none of whose sources is in this repository:

- **The 1962 Missal's headings.** `scripts/compare-missal-titles.mjs <saved
  pages>` reads the heading of each day of the Proper of Saints and compares
  what it says the saint is (pope, bishop, martyr, confessor, doctor, virgin,
  widow, abbot) with the Latin and the Spanish. Of 335 fixed-date observances
  one differs, where the saved page misreads the heading, and 37 have no
  heading the script can match (`test/fixtures/missal-title-differences.json`).
  With `MISSAL_DIR` set, `npm test` re-checks.
- **Printed Spanish ordos** (Toledo, 2012-2013 and 2014-2015).
  `scripts/compare-names-es.mjs <ordo as text>` lists the days whose heading
  shares few words with the engine's, and the days where the ordo or the engine
  has a word the other lacks for what the saint is. It was run on the ordos
  before that second comparison was added, and has not been re-run since.
- **A fresh import.** With `DO_DIR` set to a Divinum Officium checkout,
  `npm test` checks that `data/names/es.json` is what the importer produces.

The Spanish still needs a read-through by someone who knows the 1962 calendar;
`node scripts/names-sheet.mjs > names.tsv` writes every title with its source
for that. Two wordings in particular were written here and not taken from a
Spanish source: "que sobró después de Epifanía" for the resumed Sundays, and "en
la semana después de la Ascensión".

## Propers

```js
const parish = {
  nations: ['us'],
  institutes: ['fssp'],
  church: {
    titular: { key: 'st-anne-mother-of-the-blessed-virgin' }, // raised to the 1st class
    dedication: '10-03',                                     // anniversary of the dedication
    patrons: [{ key: 'st-local-patron', date: '06-12', colors: ['red'] }], // a feast the calendar lacks
  },
};
resolveDay('2026-11-13', parish).celebration.key;  // 'us-st-frances-xavier-cabrini'
resolveDay('2026-07-26', parish).celebration.key;  // the titular, with the Sunday commemorated
```

Layers apply in order: nations, then institutes, then the church. Every proper
feast takes the place the table of precedence gives proper feasts (no. 91 items
12, 19, 23).

A church's feasts are of the 1st class (no. 45):

- A feast the calendar has is raised where the calendar keeps it: on its movable
  day (`'epi1-0'` for a church of the Holy Family), on its leap-year date, and
  under the nation's entry where a nation keeps it on another date. A feast
  already of the 1st class is left alone.
- `churchFeastChoices({ nations, institutes })` lists the observances a church
  may take: the feasts and commemorated saints that calendar keeps. Any other
  key of the catalogue is refused: a Sunday, a vigil, a further Mass of
  Christmas or All Souls, a feast the nation's proper removes, and a prayer said
  in another Mass (the companion prayer of St. Peter or St. Paul, the
  commemoration of the octave of Christmas, the greater litanies).
- A feast the calendar lacks needs a `date` and `colors`. A date that does not
  exist, 29 February and an unknown colour are refused.
- On one date the patron of the place comes first, then the dedication, then
  the titular (item 12, 3 to 5). One saint who is both patron and titular is
  kept once.
- A feast of the 1st or 2nd class that another always impedes in that church is
  kept for good on the nearest following day that is not of the 1st or 2nd
  class (nos. 100-102). With the dedication on 10 August, St. Lawrence is on
  the 11th every year; a titular on the Assumption is on 17 August. That day is
  then its own, so `transferredFrom` is not set, and its vigil is dropped. This
  is applied only where one of the two is the church's own feast.
- Impeded by accident, a church's feast is transferred (no. 96), into January
  if need be.
- The dedication is a feast of the Lord (the Missal says so at the head of the
  Common of the Dedication), so it takes a 2nd class Sunday without
  commemorating it. It is not a feast of a divine Person in the sense of no.
  95, so it is transferred, not omitted, when the Ascension, Corpus Christi,
  the Sacred Heart or Christ the King falls on it: with the dedication on 12
  June, 2026 has the Sacred Heart on Friday the 12th and the dedication on
  Saturday the 13th. The FSSP's shrine at Warrington kept its cathedral's
  dedication this way on 15 May 2026, after the Ascension on the 14th.

`scripts/check-titulars.mjs` places a titular on every date of 2026-2055 and
checks that it is kept once each year and that no fixed feast of the 1st or 2nd
class is dropped on its day; with `--dedication` it does the same for the
dedication.

Not done:

- Church feasts below the 1st class (a saint whose body the church keeps, no.
  45c; secondary patrons).
- The right no. 100 gives proper 3rd class feasts.

The United States layer comes from the FSSP seminary's 2026 calendar. The FSSP
layer raises the Chair of St. Peter to the 1st class, on the Fraternity's own
statements; in 2026 it is kept on Monday 23 February, the 22nd being the 1st
Sunday of Lent. Both list what is still to be checked against the printed
*Liturgical Ordo & FSSP Directory* (`toConfirm`). The Masses for certain places
that the seminary's page prints on some ferias are not in the calendar; the
FSSP ordo offers them as Masses of the day (below).

## Masses

`ordoDay` and `ordoYear` return the resolved day with `masses`: the Masses the
rubrics give that day, of the kinds an ordo prints, first the one the ordo
prints first. Without an ordo that is the Mass of the day; with
`ordo: 'fssp'` it is what the Fraternity's ordo puts first. Good Friday has no
Mass, and its list is empty.

```js
import { ordoDay, nameOf } from 'ordo-1962';

const options = { nations: ['us'], institutes: ['fssp'], ordo: 'fssp' };
ordoDay('2026-09-04', options).masses.map((m) => [m.key, m.kind, m.class]);
// [['votive-sacred-heart-of-jesus', 'votive', 3], ['pent14-5', 'day', 4]]
ordoDay('2026-11-06', options).masses[0];
// { key: 'requiem-daily', kind: 'requiem', class: 3, colors: ['black'], commemorations: [],
//   rubric: 'nos. 415d, 416, 422', condition: 'applied-for-the-dead' }
ordoDay('2026-04-03', options).masses;         // [] (Good Friday)
nameOf('votive-sacred-heart-of-jesus', 'es');  // 'Misa votiva del Sagrado Corazón de Jesús'
```

Each Mass has its key (titled by `nameOf`), kind, class, colours,
commemorations and the rubric that permits it; a `condition` where the rubric
requires one (the first Friday's devotions, the Rogation procession, a Mass
applied for the dead); and `atMost` where it says how many such Masses a church
may have that day. Numbers are those of the Rubricae generales Missalis in the
Code of Rubrics, as the 1962 Missal prints it:

| Kind | When | Rubric |
|---|---|---|
| `day` | Every Mass of the celebration (three at Christmas and on All Souls; none on Good Friday) | no. 270; nos. 298, 299, 301 for a Sunday, a feria, a feast |
| `impeded-feast` | A 3rd class feast impeded by another 3rd class feast, on its own day | nos. 302a, 303a |
| `commemoration` | On a 4th class day, the Mass of a saint commemorated that day | nos. 302b, 303b |
| `external-solemnity` | On a Sunday of the 2nd class; two Masses at most. See below | nos. 341, 356-361 |
| `rogation` | On the greater and lesser litanies, but not on a 1st class day | nos. 86, 89, 341, 346 |
| `votive` | Of the 3rd class, on days of the 3rd and 4th class: Christ the High Priest on the first Thursday or the first Saturday (one Mass), the Sacred Heart on the first Friday (two), the Immaculate Heart on the first Saturday (one). Of the 2nd class: the Mass for the Propagation of the Faith on the next to last Sunday of October (one) | nos. 384-386; nos. 369, 453 |
| `requiem` | The daily Mass for the dead: of the 3rd class within the octave of All Souls, on days of the 3rd and 4th class, for a Mass applied for the dead; of the 4th class on 4th class ferias outside Christmastide, not on a Saturday of Our Lady | nos. 391, 415d, 416, 422, 423 |
| `for-certain-places` | An ordo's own Masses for certain places, on a 4th class day | nos. 302c, 303b, 388 |

A Mass of the day has the day's colours and commemorations, with three
exceptions from `data/masses.json`: the Mass of Palm Sunday is violet (red is
for the palms) and the Mass of the Easter Vigil white; and at Christmas St.
Anastasia is commemorated at the second Mass only.

A Mass said instead of the Mass of the day commemorates the office of the day
(not a 4th class feria or the Saturday of Our Lady) and the day's
commemorations, the season first (no. 113), without those it excludes (no.
112): a Mass of the Lord does not commemorate the Sunday, nor one of Our Lady a
feast of Our Lady. A 2nd class votive Mass admits one commemoration (no. 343b),
a 3rd class one two (no. 386b), a Mass for the dead none (no. 391).

External solemnities. A feast has one, whoever gives it:

- by right in every church, the Sacred Heart and Our Lady of the Rosary (no.
  358a, b). The Rosary's is assigned to the 1st Sunday of October. The Sacred
  Heart's is not assigned a Sunday in the 1962 text, so it is offered on the
  Sunday after the feast, the 3rd after Pentecost, as the FSSP seminary's page
  has it;
- a nation's by indult (no. 361), in its layer: Corpus Christi and Sts. Peter
  and Paul in the United States, on the Sunday after;
- an institute's own feast (no. 358e, h), in its layer: the Chair of St. Peter
  for the FSSP, which no FSSP source read so far shows;
- a church's principal patron (no. 358d), dedication and titular (no. 358g), on
  the Sunday after the day the feast is kept, or `church.externalSolemnity:
  'preceding-sunday'` or `'none'`. A church of All Souls has none: a Mass
  for the dead is not the solemnity of a feast.

`externalSolemnities: { key: 'following-sunday' | 'preceding-sunday' | 'none' }`
chooses for one feast (no. 359); one assigned to its day can only be left out.
A feast in the last days of December has its Sunday in January of the next
year. `highPriest: 'thursday' | 'saturday'` says which day the church holds its
devotions for the clergy; it overrides the ordo, and with neither the Mass is
listed on both days.

Not listed: votive Masses of the 4th class (any votive Mass, for a just cause,
no. 388) and the Mass of any saint in the Martyrology, which are open-ended,
except an ordo's own; votive Masses of the 2nd class that hang on an occasion
(a wedding, the Forty Hours, the Pope's anniversary); an external solemnity on
another day the Ordinary names (no. 359), the Purification's (no. 358c) and
those of feasts kept with a great gathering (no. 358i). Nor does the engine say
when a prayer is added to the Mass of the day under one conclusion: that of a
2nd class votive Mass the day impedes (nos. 318, 343c), and the prayer for the
Propagation of the Faith on the Sunday for the Missions (no. 453).

An ordo is a file in `data/ordos/`; the build checks every field of it. The
FSSP's, read from the seminary's 2026 page, prints the Requiem first on 4th
class days of the octave of All Souls and the first Thursday, Friday and
Saturday votive Masses first on a feria or a Saturday of Our Lady; it gives
Christ the High Priest on Thursday; it leaves out the daily Requiem outside that
octave, those votive Masses in Lent, where no. 384 permits them, and the Mass for
the Propagation of the Faith; and it offers nine Masses for certain places on
their days.

Against the page, every row is compared, in class, commemorations and their
order. Of the 365 days of 2026 the page's first row names the ordo's first Mass
on 358, and has its class and commemorations too on 345. Of the 445 rows the
page prints, 440 are a Mass the ordo lists and 414 are the same in everything.
The 30 days with any difference are reviewed in
`test/fixtures/fssp-2026-masses.json`, in four groups: six where the page puts
another listed Mass first without a rule (the Mass of St. Valentine on 14
February, the Rogation Mass on 11 May but not on the 12th); three where it also
prints the universal calendar's Masses on a day the United States keeps a 3rd
class feast, which the rubrics do not permit; fourteen where the difference is
in the calendar and already reviewed; and seven where a later row has other
commemorations. The plan's gate for this stage, the first row the same on every
day but 1 and 11 January, is therefore not met to the letter: the first row
differs on 20 days, each reviewed. `node scripts/compare-fssp.mjs <page> 2026
--layers us,fssp --masses` prints the days and the counts; set `FSSP_PAGE` to
re-check in `npm test`.

Where a later row differs, the engine follows the rubrics rather than the page.
The page commemorates the Sunday in the external solemnities of Corpus Christi
and the Sacred Heart; a Mass of a feast of the Lord excludes the Sunday (no.
112b). It gives the Rogation Mass two commemorations on the vigil of the
Ascension; a votive Mass of the 2nd class admits one (no. 343b). It lists three
commemorations in the votive Mass of 4 December; a votive Mass of the 3rd class
admits two (no. 386b). It puts a commemorated saint before the office of the day
in the first Friday's votive Mass (6 February, 7 August); the order is that of
the table of precedence (no. 113). It commemorates a Mass for certain places in
other Masses of the day (5 November); these are offered, not commemorated. And
it gives the Mass of St. Didacus on 13 November no commemoration; the engine
commemorates the office of the day, St. Frances Xavier Cabrini.

## Use

```js
import { resolveDay, resolveYear, movableDates, temporalYear, fixedFeasts } from 'ordo-1962';

resolveDay('2026-11-01').celebration;  // { key: 'all-saints', class: 1, colors: ['white'], masses: ['all-saints'] }
resolveDay('2025-11-03').celebration.transferredFrom;  // '2025-11-02' (All Souls after a Sunday)

movableDates(2026).christTheKing;             // '2026-10-25'
temporalYear(2026).tempora.get('2026-03-27'); // ['quad5-5', 'seven-sorrows-in-passiontide']
fixedFeasts(2026).get('2026-11-19');          // ['st-elizabeth-of-hungary', 'st-pontian']
fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-08');
```

The resolver follows the Table of Liturgical Days (General Rubrics 1960, no. 91)
by kind and class, so a feast it has never seen still finds its place, plus the
occurrence and transfer rules of nos. 33, 78 and 95-99. Against Missale Meum it
agrees on all 50,769 days of 1962-2100 except 97, listed with their rubric in
`test/fixtures/oracle-deviations.json`; on those the SSPX Ordo agrees with this
engine. `node scripts/compare-oracle.mjs` prints the comparison.

Commemorations follow nos. 106-114 of the Latin text (privileged commemorations,
no. 109; the number each class admits, no. 111; the exclusions of no. 112; the
order of no. 113), with no. 80 for the greater litanies and no. 110 for the
inseparable prayer of St. Peter with St. Paul, which is returned in
`inseparable`, not counted as a commemoration.

`commemorations` is the list for a low or conventual Mass of the day. It is not
the list for every liturgy: the greater litanies have nothing in the office
(no. 81), so at Lauds on Sunday 25 April St. Mark is commemorated in their
place; ordinary commemorations are not made at Vespers (no. 108); and a sung
Mass that is not conventual admits only a privileged one (no. 111a).

Missale Meum differs in 14 patterns (594 days), all its own gaps (the Sunday or
Advent feria on a feast, a second commemoration on 3rd and 4th class days, Our
Lady of Mount Carmel on a Saturday), listed with their rubric in
`test/fixtures/commemoration-differences.json`.
`node scripts/compare-commemorations.mjs` prints them. Against the SSPX Ordo for
2026-2040 (development-time check, `scripts/compare-ordo.mjs`), 77 days differ, in
five groups where the rubrics side with the engine, and the FSSP's 2026 calendar
does too where it covers them (`test/fixtures/ordo-differences-2026-2040.json`,
which also says what differs on each group's days). Set `ORDO_DIR` to a folder of
Ordo responses to re-run that check in `npm test`; a day missing from those
files counts as a difference.

One order is unresolved. On the Friday of Passion Week the FSSP prints the Seven
Sorrows before an impeded 3rd class feast; the engine and the SSPX Ordo put the
feast first (no. 113). The FSSP test accepts either order on that day until a
printed ordo settles it.

```js
resolveDay('2026-11-30').commemorations;  // ['adv1-1']  (St. Andrew, with the Advent feria)
resolveDay('2027-01-25').inseparable;     // ['st-peter']
```

Both `import` and `require` work. Dates are `YYYY-MM-DD` calendar labels with no
time zone. `npm run build` writes `dist/`; `npm test` builds first.

## What is here

| Path | Contents |
|---|---|
| `data/catalogue.json` | Every observance with a stable key, its date rule, kind, class, colours and whether it is a feast of the Lord |
| `data/temporal-blocks.json` | The movable cycle as ordered blocks of keys |
| `data/names/{la,en,pl}.json` | Titles by key, from Missale Meum |
| `data/names/es.json` | Spanish titles by key, from Divinum Officium's Spanish missal |
| `data/divinum-officium/source.json` | Provenance of the Spanish: the Divinum Officium commit and the SHA-256 of every file read |
| `data/reviewed/names.json` | Titles written by hand where the generated files have none or a wrong one, each with its reason |
| `data/keys.json` | Missale Meum id → key. Keys never change once assigned |
| `data/missalemeum/` | Provenance: source commit, file hashes, all source ids, and Missale Meum's reference lists |
| `data/layers/us.json` | The United States proper, written by hand: each observance with its date, class, colours, Latin, English and Spanish names and where it was found |
| `data/layers/fssp.json` | The FSSP's proper: the Chair of St. Peter raised to the 1st class, with its sources, and its external solemnity |
| `data/masses.json` | Masses that are not observances: the first Thursday, Friday and Saturday votive Masses, the Mass for the Propagation of the Faith, the Rogation Mass and the daily Mass for the dead, with their titles; where a Mass of the day differs from the day (no Mass on Good Friday, the colours of Palm Sunday's and the Easter Vigil's, St. Anastasia at Christmas); and the external solemnities every church has by right |
| `data/ordos/fssp.json` | The FSSP's ordo: which Mass it prints first, what it leaves out, and its Masses for certain places with their titles, dates and Latin titles checked against the 1962 Missal |
| `test/fixtures/fssp-2026-masses.json` | Every 2026 day on which the FSSP ordo's Masses differ from the seminary's page in any row, and the counts of what agrees: 30 days in four reviewed groups. Runs with `FSSP_PAGE` |
| `test/fixtures/fssp-2026-differences.json` | Every 2026 day on which the engine, with both layers, differs from the FSSP seminary's page, and how: 30 days in five reviewed groups. Set `FSSP_PAGE` to a saved copy of the page to re-check in `npm test` |
| `test/fixtures/snapshots/` | Whole years with the United States and FSSP propers, 2026-2030, one line a day, and the FSSP ordo's Masses for 2026 to 2028 with their colours, conditions and commemorations. `npm run snapshot` rewrites them; the diff shows which days a change moves |
| `data/layers/pl.json` | Missale Meum's Polish proper as operations on the universal calendar: feasts added, removed, or added in place of another (St. Stanislaus moves from 7 to 8 May), and the order of a day's entries where Poland lists them differently |
| `data/reviewed/feasts-of-the-lord.json` | Hand-reviewed list behind `ofTheLord`, with the rubric or source for each entry. The rubrics give no complete list |
| `data/reviewed/additions.json` | Observances of the universal calendar that Missale Meum lacks (St. Barbara on 4 December), with where each was confirmed |
| `data/oracle/missalemeum-pl/<year>.json` | Missale Meum's Polish calendar for 2026–2028, used to check the Polish layer |
| `test/fixtures/multiple-celebrations.json` | The 32 days on which Missale Meum lists two celebrations that are not Masses of one feast, with the expected result checked against the SSPX Ordo at development time |
| `test/fixtures/fssp-2026.json` | Days from the FSSP's published 2026 calendar that Missale Meum gets wrong or cannot express. The United States day waits for that layer |
| `data/oracle/missalemeum/<year>.json` | Missale Meum's own result for every day of 1962–2100, in ordo-1962 keys. The engine's tests compare against it |
| `scripts/convert_missalemeum.py` | Regenerates the catalogue from a Missale Meum checkout |
| `scripts/missalemeum_oracle.py` | Regenerates the oracle by running Missale Meum's calendar code |

Fixed-date entries carry `dayOrder` (their place among the day's entries as the
calendar lists them) and, for St. Matthias and St. Gabriel, a `leapYear` date.
The further Masses of Christmas and All Souls carry `formularyOf`, naming the
principal entry. The shared data is frozen; every list the engine returns is a
fresh copy.

The catalogue's `kind` and `ofTheLord` attributes are a first pass. They are
reviewed against the General Rubrics when the resolver is written. Where Missale
Meum's own title or colour is wrong for the day, the correction is a named
constant in the conversion script, with its rubric: the Monday and Tuesday of
the Rogations are ordinary white ferias of Paschaltide (nos. 88, 130a).

`transferredFrom` is the feast's own date whenever a 1st class feast is kept on
another day. That includes the two rightful places of no. 96: the Annunciation
on the Monday after Low Sunday and All Souls on Monday 3 November. An ordo may
not call those transfers; the date is given all the same. A feast impeded at the
end of December is kept in January, so the date can be in the previous year. No
feast of the universal calendar does this; a church's own feast can.

## Regenerating the catalogue

```bash
git clone https://github.com/mmolenda/missalemeum.git /path/to/missalemeum
git -C /path/to/missalemeum checkout eb723e5dd0bef3951b7706da97af4b673c579e40
npm run convert -- /path/to/missalemeum/backend
npm run test:convert -- /path/to/missalemeum/backend
npm test
```

`test:convert` checks that a fresh import is deterministic, that importing on
top of the saved keys gives the same result as a fresh import, and that the
committed data is what a fresh import produces.

The script reads Missale Meum's Python files with `ast.parse`. It never imports
or runs them.

## Regenerating the Spanish titles

```bash
git clone https://github.com/DivinumOfficium/divinum-officium.git /path/to/divinum-officium
git -C /path/to/divinum-officium checkout d52ccd8ad669a205da689bedf58e3d2ae68bc0dc
node scripts/import-divinum-officium-es.mjs /path/to/divinum-officium
DO_DIR=/path/to/divinum-officium npm test
```

With `DO_DIR` set, `npm test` checks that `data/names/es.json` and
`data/divinum-officium/source.json` are what a fresh import produces. Only
`web/www/missa/Espanol` is read; a sparse checkout of that folder is enough.

## Regenerating the oracle

This one does run Missale Meum's calendar code, so use a separate virtual
environment:

```bash
python3 -m venv /path/to/venv
/path/to/venv/bin/pip install "python-dateutil~=2.9.0" "PyYAML~=6.0.3" "mistune~=3.2.0" "trans~=2.1.0"
/path/to/venv/bin/python -I scripts/missalemeum_oracle.py /path/to/missalemeum/backend
```

Add `--lang pl --from 2026 --to 2028` for the Polish check. It refuses a
checkout at a different commit from the one the catalogue came from, a checkout
with local changes or untracked files, and converted files whose hashes differ
from `data/missalemeum/source.json`. It compiles into a fresh bytecode cache, so
no `.pyc` left in the checkout is used. On 2026-11-09 the local run (Python 3.11) was identical to the hosted
`/en/api/v5/calendar/{year}` responses on all 1,096 days of 2026–2028.

## Licence

MIT. The catalogue is derived from Missale Meum and the Spanish titles from
Divinum Officium, both also MIT; see `NOTICE.md`.
