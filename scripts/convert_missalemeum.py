"""Convert Missale Meum's calendar tables into ordo-1962's catalogue.

Usage: python3 -I scripts/convert_missalemeum.py <missalemeum-backend-dir>

The Missale Meum source is read with `ast.parse` and never imported or executed,
so nothing from the checkout runs. Output goes to data/ in this repository.

Keys are stable: once data/keys.json assigns a key to a Missale Meum id, later
runs reuse it, so a change of English title upstream never renames a key.
"""

import ast
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

FILES = {
    "common": "api/constants/common.py",
    "blocks_la": "api/constants/la/blocks.py",
    "blocks_pl": "api/constants/pl/blocks.py",
    "titles_la": "api/constants/la/translation.py",
    "titles_en": "api/constants/en/translation.py",
    "titles_pl": "api/constants/pl/translation.py",
}

BLOCK_NAMES = [
    "POST_EPIPHANY",
    "FROM_PRE_LENT_TO_POST_PENTECOST",
    "EMBER_DAYS_SEPTEMBER",
    "WEEK_24_AFTER_PENTECOST",
    "ADVENT",
    "NATIVITY_OCTAVE_SUNDAY",
    "NATIVITY_OCTAVE_FERIA",
    "HOLY_NAME",
    "CHRIST_KING",
    "SUNDAY_IN_CHRISTMAS_OCTAVE",
]

REFERENCE_LISTS = [
    "EMBER_DAYS",
    "FEASTS_OF_JESUS_CLASS_1_AND_2",
    "FIXED_VIGILS_SUPPRESSED_ON_SUNDAY",
    "TABLE_OF_PRECEDENCE",
]

GENERATED_IDS = {
    "FERIA": ("feria", "feria"),
    "TEMPORA_C_10A": ("our-lady-on-saturday-advent", "our-lady-on-saturday"),
    "TEMPORA_C_10B": ("our-lady-on-saturday-christmastide", "our-lady-on-saturday"),
    "TEMPORA_C_10C": ("our-lady-on-saturday-after-purification", "our-lady-on-saturday"),
    "TEMPORA_C_10PASC": ("our-lady-on-saturday-paschaltide", "our-lady-on-saturday"),
    "TEMPORA_C_10T": ("our-lady-on-saturday-after-pentecost", "our-lady-on-saturday"),
}

# Movable days whose kind is not the default for their weekday. Reviewed by hand
# against the 1960 General Rubrics; the resolver milestone re-checks each one.
TEMPORA_FEASTS = {
    "Epi1-0",   # Holy Family
    "Nat2-0",   # Holy Name
    "Pasc5-4",  # Ascension
    "Pent01-0", # Trinity Sunday
    "Pent01-4", # Corpus Christi
    "Pent02-5", # Sacred Heart
}

# Movable observances that are not a day of the cycle, keyed by Missale Meum name.
TEMPORA_SPECIAL = {
    "Quad5-5Feriac": ("seven-sorrows-in-passiontide", "commemoration"),
}

# Corrections to what Missale Meum says of a movable day, keyed by cycle position.
# The lesser litanies have nothing in the office (General Rubrics no. 88) and violet
# belongs to their procession and its Mass (no. 130a), so the Monday and Tuesday
# before the Ascension are ordinary ferias of Paschaltide. Missale Meum gives them
# the title of the litanies and, on Monday, the colour of the Rogation Mass. The
# Latin titles already name the feria and are kept.
REVIEWED_COLORS = {"Pasc5-1": "w"}
REVIEWED_TITLES = {
    "Pasc5-1": {"en": "Monday after V Sunday after Easter", "pl": "Poniedziałek po 5 Niedzieli po Wielkanocy"},
    "Pasc5-2": {"en": "Tuesday after V Sunday after Easter", "pl": "Wtorek po 5 Niedzieli po Wielkanocy"},
}

# A national feast that takes the place of a universal one on another date.
# Missale Meum expresses this as a removal and an addition; these pairings were
# checked by hand (same saint, different date or class).
NATIONAL_REPLACEMENTS = {
    "pl": {"SANCTI_05_08PL": "SANCTI_05_07"},  # St. Stanislaus: 7 May, III class -> 8 May, I class
}

# The 1962 Missal's calendar keeps these two feasts one day later in a leap year.
# Missale Meum does the same in rules.py (rule_st_matthias, rule_feb27).
LEAP_YEAR_DATES = {
    "SANCTI_02_24": "02-25",  # St. Matthias
    "SANCTI_02_27": "02-28",  # St. Gabriel of Our Lady of Sorrows
}

# Further Masses of one celebration, keyed by Missale Meum constant.
FORMULARIES = {
    "SANCTI_12_25_2": "SANCTI_12_25_1",  # Christmas: Mass at dawn
    "SANCTI_12_25_3": "SANCTI_12_25_1",  # Christmas: Mass during the day
    "SANCTI_11_02_2": "SANCTI_11_02_1",  # All Souls: second Mass
    "SANCTI_11_02_3": "SANCTI_11_02_1",  # All Souls: third Mass
}

COLOR_NAMES = {"w": "white", "r": "red", "g": "green", "v": "violet", "b": "black", "p": "rose"}

ID_PATTERN = re.compile(r"^(tempora|sancti|commune|):[^:]+:\d:[a-z]+$")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse(path):
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def string_value(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = string_value(node.left), string_value(node.right)
        if left is not None and right is not None:
            return left + right
    return None


def module_constants(tree):
    consts = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            value = string_value(node.value)
            if value is not None:
                consts[node.targets[0].id] = value
    return consts


def assignment(tree, name):
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) and node.targets[0].id == name:
            return node.value
    return None


def constant_name(node):
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    raise ValueError(f"not a constant reference at line {getattr(node, 'lineno', '?')}: {ast.dump(node)}")


def tuple_of_names(node):
    return [constant_name(elt) for elt in node.elts]


def block(node):
    days = []
    for elt in node.elts:
        if not isinstance(elt, ast.Tuple):
            raise ValueError(f"block day is not a tuple at line {elt.lineno}")
        days.append(tuple_of_names(elt))
    return days


def titles(tree, consts, inherited=None):
    node = assignment(tree, "TITLES")
    if not isinstance(node, ast.Dict):
        raise ValueError("TITLES is not a dict literal")
    result = {}
    skipped = []
    for key, value in zip(node.keys, node.values):
        if key is None:
            if inherited is None:
                raise ValueError("TITLES unpacks a dict but no inherited titles were given")
            result.update(inherited)
            continue
        name = constant_name(key)
        text = string_value(value)
        if name not in consts or text is None:
            skipped.append(name)
            continue
        result[consts[name]] = text
    return result, skipped


def temporal_name(name):
    """Missale Meum's cycle position, without its 'r' (reformed text) and 'Feria' suffixes."""
    name = re.sub(r"(\d)r$", r"\1", name)
    name = re.sub(r"(\d)Feria$", r"\1", name)
    september = re.match(r"^093-(\d)$", name)
    return f"Sep-ember-{september.group(1)}" if september else name


def slug(text):
    text = text.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("Œ", "Oe")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\b(st|sts|ss|s)\b\.?", lambda m: "st" if m.group(1) in ("st", "s") else "sts", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80].rstrip("-")


def read_source(backend):
    paths = {name: backend / rel for name, rel in FILES.items()}
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    trees = {name: parse(path) for name, path in paths.items()}
    consts = module_constants(trees["common"])
    ids = {name: value for name, value in consts.items()
           if (name.startswith(("TEMPORA_", "SANCTI_")) or name == "FERIA") and ID_PATTERN.match(value)}
    titles_la, skipped_la = titles(trees["titles_la"], consts)
    titles_en, skipped_en = titles(trees["titles_en"], consts, inherited=titles_la)
    titles_pl, skipped_pl = titles(trees["titles_pl"], consts)
    return {
        "paths": paths,
        "ids": ids,
        "blocks_la": {name: block(assignment(trees["blocks_la"], name)) for name in BLOCK_NAMES},
        "sancti": {
            "universal": tuple_of_names(assignment(trees["blocks_la"], "SANCTI")),
            "pl": tuple_of_names(assignment(trees["blocks_pl"], "SANCTI")),
        },
        "reference": {
            name: [f"literal:{elt.value}" if isinstance(elt, ast.Constant) else constant_name(elt)
                   for elt in assignment(trees["common"], name).elts]
            for name in REFERENCE_LISTS
        },
        "titles": {"la": titles_la, "en": titles_en, "pl": titles_pl},
        "skipped": {"la": skipped_la, "en": skipped_en, "pl": skipped_pl},
    }


def assign_keys(source, saved):
    """Return {id: key}, keeping every key in `saved` and sharing a key between
    ids that Missale Meum uses for the same movable day."""
    ids = source["ids"]
    titles_ = source["titles"]
    keys = dict(saved)
    used = set(keys.values())
    by_position = {}
    for id_, key in keys.items():
        flexibility, name, _, _ = id_.split(":")
        if flexibility == "tempora" and name not in TEMPORA_SPECIAL:
            by_position.setdefault(temporal_name(name), key)

    universal = {ids[n] for n in source["sancti"]["universal"]}
    national = {v for n, v in ids.items()
                if v not in universal and (n.endswith("PL") or n in source["sancti"]["pl"])}
    generated = {ids[name]: spec for name, spec in GENERATED_IDS.items()}

    def take(id_, proposal):
        candidate = proposal or slug(id_)
        if candidate in used:
            candidate = f"{candidate}-{slug(id_.split(':')[1])}"
        base, n = candidate, 2
        while candidate in used:
            candidate, n = f"{base}-{n}", n + 1
        keys[id_] = candidate
        used.add(candidate)
        return candidate

    for id_ in sorted(set(ids.values())):
        if id_ in keys:
            continue
        flexibility, name, _, _ = id_.split(":")
        if id_ in generated:
            take(id_, generated[id_][0])
        elif flexibility == "tempora" and name in TEMPORA_SPECIAL:
            take(id_, TEMPORA_SPECIAL[name][0])
        elif flexibility == "tempora":
            # Missale Meum gives an Advent feria a second id when its class rises on
            # 17-23 December; both ids are the same observance, so they share a key.
            position = temporal_name(name)
            if position in by_position:
                keys[id_] = by_position[position]
            else:
                by_position[position] = take(id_, slug(position))
        else:
            title = titles_["en"].get(id_) or titles_["la"].get(id_) or titles_["pl"].get(id_)
            proposal = slug(title) if title else None
            if proposal and id_ in national:
                proposal = f"pl-{proposal}"
            take(id_, proposal)
    return keys


def build(backend, saved_keys, lord_keys):
    source = read_source(backend)
    ids = source["ids"]
    titles_ = source["titles"]
    problems = []

    sancti = source["sancti"]
    for name in [n for days in source["blocks_la"].values() for day in days for n in day] \
            + sancti["universal"] + sancti["pl"]:
        if name not in ids:
            problems.append(f"block refers to {name}, which is not an observance id")

    keys = assign_keys(source, saved_keys)

    generated = {ids[name]: spec for name, spec in GENERATED_IDS.items()}
    placed_tempora = {ids[n] for days in source["blocks_la"].values() for day in days for n in day}
    universal_sancti = {ids[n] for n in sancti["universal"]}
    polish_set = {ids[n] for n in sancti["pl"]}
    polish_added = polish_set - universal_sancti
    polish_removed = universal_sancti - polish_set
    reachable = placed_tempora | universal_sancti | polish_added | set(generated)

    unknown_lord = sorted(set(lord_keys) - {keys[i] for i in reachable})
    if unknown_lord:
        problems.append(f"feasts-of-the-lord.json names keys not in the catalogue: {unknown_lord}")
    ember = {ids[n] for n in source["reference"]["EMBER_DAYS"]}
    leap_dates = {ids[n]: d for n, d in LEAP_YEAR_DATES.items()}
    formulary_of = {ids[n]: ids[p] for n, p in FORMULARIES.items()}

    # Order of same-day entries as Missale Meum lists them (la/blocks.py). A
    # national layer that lists a day differently says so with an "order" operation.
    def by_date(names):
        days = {}
        for n in names:
            days.setdefault(ids[n].split(":")[1][:5], []).append(ids[n])
        return days

    universal_days = by_date(sancti["universal"])
    day_order = {id_: i for day_ids in universal_days.values() for i, id_ in enumerate(day_ids)}
    polish_order = []
    for day, day_ids in sorted(by_date(sancti["pl"]).items()):
        default = [i for i in universal_days.get(day, []) if i in polish_set] + \
                  [i for i in day_ids if i in polish_added]
        if day_ids != default:
            polish_order.append({"op": "order", "date": day, "keys": [keys[i] for i in day_ids]})

    catalogue = []
    for id_ in sorted(reachable, key=lambda i: keys[i]):
        flexibility, name, rank, color = id_.split(":")
        title_en = titles_["en"].get(id_, "")
        if id_ in generated:
            kind = generated[id_][1]
            date = {"generated": kind}
        elif flexibility == "tempora":
            position = temporal_name(name)
            date = {"temporal": position.lower()}
            color = REVIEWED_COLORS.get(position, color)
            if name in TEMPORA_SPECIAL:
                kind = TEMPORA_SPECIAL[name][1]
            elif position in TEMPORA_FEASTS:
                kind = "feast"
            elif re.match(r"^(Nat1-1|Pasc0-[1-6]|Pasc7-[1-6])$", position):
                kind = "within-octave"
            elif id_ in ember:
                kind = "ember-day"
            elif position == "Pasc6-6" or re.search(r"\bvigil\b", title_en, re.I):
                kind = "vigil"
            elif re.match(r"^[A-Za-z]+\d*-0", position):
                kind = "sunday"
            else:
                kind = "feria"
        else:
            day = name[:5]
            if day == "10-DU":
                date = {"rule": "christ-the-king"}
            elif id_ in leap_dates:
                date = {"fixed": day, "leapYear": leap_dates[id_]}
            else:
                date = {"fixed": day}
            if re.search(r"\bvigil\b", title_en, re.I):
                kind = "vigil"
            elif rank == "4":
                kind = "commemoration"
            else:
                kind = "feast"
        unknown = [c for c in color if c not in COLOR_NAMES]
        if unknown:
            problems.append(f"{id_}: unknown colour letters {unknown}")
        aliases = sorted(i for i, k in keys.items() if k == keys[id_] and i != id_)
        catalogue.append({
            "key": keys[id_],
            "sourceId": id_,
            **({"sourceAliases": aliases} if aliases else {}),
            "date": date,
            **({"dayOrder": day_order[id_]} if id_ in day_order else {}),
            **({"formularyOf": keys[formulary_of[id_]]} if id_ in formulary_of else {}),
            "kind": kind,
            "class": int(rank),
            "colors": [COLOR_NAMES.get(c, c) for c in color],
            "ofTheLord": keys[id_] in lord_keys,
            "scope": "national" if id_ in polish_added else "universal",
            **({"nation": "pl"} if id_ in polish_added else {}),
        })

    replacements = {ids[a]: ids[r] for a, r in NATIONAL_REPLACEMENTS["pl"].items()}
    for added, removed in replacements.items():
        if added not in polish_added or removed not in polish_removed:
            problems.append(f"replacement {added} -> {removed} no longer matches Missale Meum's Polish blocks")
    replaced = set(replacements.values())
    layer_pl = {
        "nation": "pl",
        "source": "Missale Meum api/constants/pl/blocks.py compared with la/blocks.py",
        "operations": (
            [{"op": "remove", "key": keys[i]} for i in sorted(polish_removed - replaced, key=lambda i: keys[i])]
            + [{"op": "add", "key": keys[i], **({"replaces": keys[replacements[i]]} if i in replacements else {})}
               for i in sorted(polish_added, key=lambda i: keys[i])]
            + polish_order
        ),
    }

    reference_out = {
        "TEMPORA_RANK_MAP": "Advent ferias from 17 to 23 December are II class (common.py TEMPORA_RANK_MAP)",
    }
    for name, members in source["reference"].items():
        reference_out[name] = [keys[ids[n]] if n in ids else n if n.startswith("literal:") else f"pattern:{n}"
                               for n in members]

    names = {lang: {keys[i]: table[i] for i in sorted(reachable, key=lambda i: keys[i]) if i in table}
             for lang, table in titles_.items()}
    key_at = {e["date"]["temporal"]: e["key"] for e in catalogue if "temporal" in e["date"]}
    for position in REVIEWED_COLORS:
        if position.lower() not in key_at:
            problems.append(f"reviewed colour for {position} matches no movable day")
    for position, reviewed in REVIEWED_TITLES.items():
        key = key_at.get(position.lower())
        for lang, title in reviewed.items():
            if key is None or key not in names.get(lang, {}):
                problems.append(f"reviewed title for {position} ({lang}) matches no named observance")
            else:
                names[lang][key] = title

    commit = subprocess.run(["git", "-C", str(backend), "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    provenance = {
        "repository": "https://github.com/mmolenda/missalemeum",
        "commit": commit,
        "license": "MIT, Copyright (c) 2022 Marcin Molenda",
        "files": {FILES[name]: sha256(path) for name, path in source["paths"].items()},
        "skippedTitles": source["skipped"],
    }

    outputs = {
        "keys.json": dict(sorted(keys.items())),
        "catalogue.json": catalogue,
        "temporal-blocks.json": {name: [[keys[ids[n]] for n in day] for day in days]
                                 for name, days in source["blocks_la"].items()},
        "layers/pl.json": layer_pl,
        "missalemeum/source.json": provenance,
        "missalemeum/ids.json": dict(sorted(ids.items())),
        "missalemeum/reference-lists.json": reference_out,
        **{f"names/{lang}.json": table for lang, table in names.items()},
    }
    summary = {
        "distinctIds": len(set(ids.values())),
        "catalogue": len(catalogue),
        "universalSancti": len(universal_sancti),
        "polish": {"added": len(polish_added), "removed": len(polish_removed), "replacements": len(replacements)},
        "placedTempora": len(placed_tempora),
        "feastsOfTheLord": sum(1 for e in catalogue if e["ofTheLord"]),
        "names": {lang: len(t) for lang, t in names.items()},
        "problems": problems,
    }
    return outputs, summary


def load_lord_keys():
    reviewed = json.loads((DATA / "reviewed" / "feasts-of-the-lord.json").read_text())
    return {entry["key"] for entry in reviewed["feasts"]}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    backend = Path(sys.argv[1]).resolve()
    keys_path = DATA / "keys.json"
    saved = json.loads(keys_path.read_text()) if keys_path.exists() else {}
    outputs, summary = build(backend, saved, load_lord_keys())
    print(json.dumps(summary, indent=1))
    if summary["problems"]:
        sys.exit(1)
    for rel, value in outputs.items():
        path = DATA / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
