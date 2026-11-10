# ordo-1962

The Roman calendar of 1962 (1960 Code of Rubrics) for any year, nation,
institute and church, computed in process with no network calls.

Status: early. The engine decides each day's principal celebration, class,
colour and commemorations, including transfers, for the universal calendar. The
United States and institute propers, church feasts and the Masses an ordo offers
beside the day's own are not done yet. Nothing is published.

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

Commemorations follow nos. 106-114 (privileged and ordinary commemorations, the
number each class admits, the exclusions of no. 112 and the order of no. 113),
with no. 80 for the greater litanies and no. 110 for the inseparable prayer of
St. Peter with St. Paul, which is returned in `inseparable`, not counted as a
commemoration. Missale Meum differs in 13 patterns, all its own gaps (the Sunday
or Advent feria on a feast, a second commemoration on 3rd and 4th class days),
listed with their rubric in `test/fixtures/commemoration-differences.json`.
`node scripts/compare-commemorations.mjs` prints them. Against the SSPX Ordo for
2026-2040 (development-time check, `scripts/compare-ordo.mjs`), 73 days differ, in
four groups where the rubrics and the FSSP's 2026 calendar side with the engine
(`test/fixtures/ordo-differences-2026-2040.json`). Set `ORDO_DIR` to a folder of
Ordo responses to re-run that check in `npm test`.

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
| `data/names/{la,en,pl}.json` | Titles by key |
| `data/keys.json` | Missale Meum id → key. Keys never change once assigned |
| `data/missalemeum/` | Provenance: source commit, file hashes, all source ids, and Missale Meum's reference lists |
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
not call those transfers; the date is given all the same.

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

MIT. The catalogue is derived from Missale Meum, also MIT; see `NOTICE.md`.
