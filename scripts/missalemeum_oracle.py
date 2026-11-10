"""Dump Missale Meum's computed calendar as the reference for ordo-1962's tests.

Usage:
  python3 -I scripts/missalemeum_oracle.py <missalemeum-backend-dir> [--from 1962] [--to 2100]
      [--api-shape <dir> --api-years 2026,2027,2028]

Unlike convert_missalemeum.py this imports and runs Missale Meum's calendar code,
so run it from an isolated environment (a venv with python-dateutil, PyYAML,
mistune and trans) against a checkout of the commit named in
data/missalemeum/source.json.

Writes data/oracle/missalemeum/<year>.json: one row per day,
  [date, celebration keys, class, colours, commemoration keys, displaced keys, tempora keys]
using ordo-1962 keys, so the tests never depend on Missale Meum's id format.

--api-shape also writes the same days in the shape of Missale Meum's
/api/v5/calendar/{year} response, to check the local run against the hosted API.
"""

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backend")
    parser.add_argument("--from", dest="start", type=int, default=1962)
    parser.add_argument("--to", dest="end", type=int, default=2100)
    parser.add_argument("--api-shape")
    parser.add_argument("--api-years", default="")
    args = parser.parse_args()

    backend = Path(args.backend).resolve()
    source = json.loads((DATA / "missalemeum" / "source.json").read_text())
    commit = subprocess.run(["git", "-C", str(backend), "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    if commit != source["commit"]:
        sys.exit(f"checkout is at {commit}, but the catalogue was converted from {source['commit']}")

    sys.path.insert(0, str(backend))
    from api.kalendar.factory import MissalFactory  # noqa: E402

    keys = json.loads((DATA / "keys.json").read_text())
    by_position = {}
    for id_, key in keys.items():
        flexibility, name, _, _ = id_.split(":")
        by_position.setdefault(f"{flexibility}:{name}", set()).add(key)

    unmapped = set()

    def key_of(observance):
        if observance.id in keys:
            return keys[observance.id]
        # Missale Meum rebuilds an id when the class depends on the date
        # (Advent ferias on 17-23 December); the movable day is still the same.
        candidates = by_position.get(f"{observance.flexibility}:{observance.name}", set())
        if len(candidates) == 1:
            return next(iter(candidates))
        unmapped.add(observance.id)
        return f"?{observance.id}"

    out_dir = DATA / "oracle" / "missalemeum"
    out_dir.mkdir(parents=True, exist_ok=True)
    api_years = {int(y) for y in args.api_years.split(",") if y}
    days_written = 0

    for year in range(args.start, args.end + 1):
        calendar = MissalFactory().create(year, "en")
        rows = []
        api_items = []
        for date_, day in calendar.items():
            celebration_id = day.get_celebration_id()
            rows.append([
                date_.isoformat(),
                [key_of(o) for o in day.celebration],
                day.get_celebration_rank(),
                "".join(day.get_celebration_colors() or []),
                [key_of(o) for o in day.get_commemorations()],
                [key_of(o) for o in day.get_displaced()],
                [key_of(o) for o in day.tempora],
            ])
            if year in api_years:
                title = day.get_celebration_name()
                tempora = day.get_tempora_name()
                api_items.append({
                    "title": title,
                    "tags": [tempora] if tempora and title != tempora else [],
                    "colors": day.get_celebration_colors(),
                    "rank": day.get_celebration_rank(),
                    "id": date_.strftime("%Y-%m-%d"),
                    "commemorations": [{"id": o.id, "title": o.title} for o in day.get_commemorations()],
                    "displaced": [{"id": o.id, "title": o.title} for o in day.get_displaced()],
                })
            assert celebration_id is None or day.celebration[0].id == celebration_id
        days_written += len(rows)
        text = "[\n" + ",\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n]\n"
        (out_dir / f"{year}.json").write_text(text, encoding="utf-8")
        if year in api_years and args.api_shape:
            Path(args.api_shape).mkdir(parents=True, exist_ok=True)
            (Path(args.api_shape) / f"mm-en-{year}.json").write_text(
                json.dumps(api_items, ensure_ascii=False, indent=1), encoding="utf-8")

    (out_dir / "README.md").write_text(
        f"Missale Meum's calendar, commit `{commit}`, run locally for {args.start}–{args.end} in English.\n"
        "Regenerate with `scripts/missalemeum_oracle.py`. Each row is\n"
        "`[date, celebration keys, class, colours, commemoration keys, displaced keys, tempora keys]`.\n",
        encoding="utf-8")
    print(json.dumps({"years": args.end - args.start + 1, "days": days_written,
                      "unmappedIds": sorted(unmapped)}, indent=1))
    if unmapped:
        sys.exit(1)


if __name__ == "__main__":
    main()
