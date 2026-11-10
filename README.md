# ordo-1962

The Roman calendar of 1962 (1960 Code of Rubrics) for any year, nation,
institute and church, computed in process with no network calls.

Status: early. The engine places the movable cycle and the fixed-date
candidates for any year, but does not yet decide which observance is celebrated
(the resolver). Nothing is published.

## Use

```js
import { movableDates, temporalYear, fixedFeasts } from 'ordo-1962';

movableDates(2026).christTheKing;             // '2026-10-25'
temporalYear(2026).tempora.get('2026-03-27'); // ['quad5-5', 'seven-sorrows-in-passiontide']
fixedFeasts(2026).get('2026-11-19');          // ['st-elizabeth-of-hungary', 'st-pontian']
fixedFeasts(2026, { nations: ['pl'] }).get('2026-05-08');
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
| `data/layers/pl.json` | Missale Meum's Polish proper as operations on the universal calendar: feasts added, removed, or added in place of another (St. Stanislaus moves from 7 to 8 May) |
| `data/reviewed/feasts-of-the-lord.json` | Hand-reviewed list behind `ofTheLord`, with the rubric or source for each entry. The rubrics give no complete list |
| `data/oracle/missalemeum-pl/<year>.json` | Missale Meum's Polish calendar for 2026–2028, used to check the Polish layer |
| `test/fixtures/fssp-2026.json` | Days from the FSSP's published 2026 calendar that Missale Meum gets wrong or cannot express. Their engine tests are marked todo until the engine exists |
| `data/oracle/missalemeum/<year>.json` | Missale Meum's own result for every day of 1962–2100, in ordo-1962 keys. The engine's tests compare against it |
| `scripts/convert_missalemeum.py` | Regenerates the catalogue from a Missale Meum checkout |
| `scripts/missalemeum_oracle.py` | Regenerates the oracle by running Missale Meum's calendar code |

The catalogue's `kind` and `ofTheLord` attributes are a first pass. They are
reviewed against the General Rubrics when the resolver is written.

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
