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
        if name not in consts:
            skipped.append(name)
            continue
        if text is None:
            skipped.append(name)
            continue
        result[consts[name]] = text
    return result, skipped


def temporal_name(name):
    """Missale Meum's cycle position without its 'r' (reformed text) suffix."""
    name = re.sub(r"(\d)r$", r"\1", name)
    september = re.match(r"^093-(\d)$", name)
    return f"Sep-ember-{september.group(1)}" if september else name


def slug(text):
    text = text.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("Œ", "Oe")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\b(st|sts|ss|s)\b\.?", lambda m: "st" if m.group(1) in ("st", "s") else "sts", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80].rstrip("-")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    backend = Path(sys.argv[1]).resolve()
    paths = {name: backend / rel for name, rel in FILES.items()}
    for path in paths.values():
        if not path.is_file():
            sys.exit(f"missing {path}")

    trees = {name: parse(path) for name, path in paths.items()}
    consts = module_constants(trees["common"])
    ids = {name: value for name, value in consts.items()
           if (name.startswith(("TEMPORA_", "SANCTI_")) or name == "FERIA") and ID_PATTERN.match(value)}

    blocks_la = {name: block(assignment(trees["blocks_la"], name)) for name in BLOCK_NAMES}
    sancti_la = tuple_of_names(assignment(trees["blocks_la"], "SANCTI"))
    sancti_pl = tuple_of_names(assignment(trees["blocks_pl"], "SANCTI"))
    reference = {
        name: [f"literal:{elt.value}" if isinstance(elt, ast.Constant) else constant_name(elt)
               for elt in assignment(trees["common"], name).elts]
        for name in REFERENCE_LISTS
    }

    titles_la, skipped_la = titles(trees["titles_la"], consts)
    titles_en, skipped_en = titles(trees["titles_en"], consts, inherited=titles_la)
    titles_pl, skipped_pl = titles(trees["titles_pl"], consts)

    problems = []
    for name in [n for days in blocks_la.values() for day in days for n in day] + sancti_la + sancti_pl:
        if name not in ids:
            problems.append(f"block refers to {name}, which is not an observance id")

    # One key per distinct id string. Several constant names can share one id.
    keys_path = DATA / "keys.json"
    keys = json.loads(keys_path.read_text()) if keys_path.exists() else {}
    used = set(keys.values())
    tempora_key = {}

    def assign(id_, proposal, alias_of=None):
        if id_ in keys:
            return keys[id_]
        if alias_of is not None and alias_of in tempora_key:
            keys[id_] = tempora_key[alias_of]
            return keys[id_]
        candidate = proposal or slug(id_)
        if candidate in used:
            flexibility, name, _, _ = id_.split(":")
            candidate = f"{candidate}-{slug(name)}"
        n = 2
        base = candidate
        while candidate in used:
            candidate = f"{base}-{n}"
            n += 1
        keys[id_] = candidate
        used.add(candidate)
        if alias_of is not None:
            tempora_key[alias_of] = candidate
        return candidate

    generated = {ids[name]: spec for name, spec in GENERATED_IDS.items()}
    universal_sancti = {ids[n] for n in sancti_la}
    polish_sancti = {ids[n] for n in sancti_pl} - universal_sancti
    polish_ids = polish_sancti | {v for n, v in ids.items() if n.endswith("PL") and v not in universal_sancti}
    for id_ in sorted(set(ids.values())):
        flexibility, name, _, _ = id_.split(":")
        if id_ in generated:
            assign(id_, generated[id_][0])
        elif flexibility == "tempora":
            # Missale Meum gives an Advent feria a second id when its class rises on
            # 17-23 December; both ids are the same observance, so they share a key.
            assign(id_, slug(temporal_name(name)), alias_of=temporal_name(name))
        else:
            title = titles_en.get(id_) or titles_la.get(id_) or titles_pl.get(id_)
            proposal = slug(title) if title else None
            if proposal and id_ in polish_ids:
                proposal = f"pl-{proposal}"
            assign(id_, proposal)

    placed_tempora = {ids[n] for days in blocks_la.values() for day in days for n in day}
    reachable = placed_tempora | universal_sancti | polish_sancti | set(generated)

    lord = {ids[n] for n in reference["FEASTS_OF_JESUS_CLASS_1_AND_2"]}
    # Named by Missale Meum's rules as taking a Sunday without commemoration.
    lord |= {ids["SANCTI_09_14"], ids["SANCTI_11_09"]}
    ember = {ids[n] for n in reference["EMBER_DAYS"]}

    catalogue = []
    for id_ in sorted(reachable, key=lambda i: keys[i]):
        flexibility, name, rank, color = id_.split(":")
        title_en = titles_en.get(id_, "")
        if id_ in generated:
            kind = generated[id_][1]
            date = {"generated": kind}
        elif flexibility == "tempora":
            position = temporal_name(name)
            date = {"temporal": position.lower()}
            if position in TEMPORA_FEASTS:
                kind = "feast"
            elif re.match(r"^(Nat1-1|Pasc0-[1-6]|Pasc7-[1-6])$", position):
                kind = "within-octave"
            elif id_ in ember:
                kind = "ember-day"
            elif position == "Pasc6-6" or re.search(r"\bvigil\b", title_en, re.I):
                kind = "vigil"
            elif re.search(r"rogation|litan", title_en, re.I):
                kind = "rogation"
            elif re.match(r"^[A-Za-z]+\d*-0", position):
                kind = "sunday"
            else:
                kind = "feria"
        else:
            day = name[:5]
            date = {"rule": "christ-the-king"} if day == "10-DU" else {"fixed": day}
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
            "kind": kind,
            "class": int(rank),
            "colors": [COLOR_NAMES.get(c, c) for c in color],
            "ofTheLord": id_ in lord,
            "scope": "national" if id_ in polish_sancti else "universal",
            **({"nation": "pl"} if id_ in polish_sancti else {}),
        })

    def keyed(names):
        return [keys[ids[n]] for n in names]

    temporal_blocks = {name: [keyed(day) for day in days] for name, days in blocks_la.items()}
    reference_out = {
        "TEMPORA_RANK_MAP": "Advent ferias from 17 to 23 December are II class (common.py TEMPORA_RANK_MAP)",
    }
    for name, members in reference.items():
        reference_out[name] = [keys[ids[n]] if n in ids else n if n.startswith("literal:") else f"pattern:{n}"
                               for n in members]

    names = {}
    for lang, table in (("la", titles_la), ("en", titles_en), ("pl", titles_pl)):
        names[lang] = {keys[i]: table[i] for i in sorted(reachable, key=lambda i: keys[i]) if i in table}

    commit = subprocess.run(["git", "-C", str(backend), "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    source = {
        "repository": "https://github.com/mmolenda/missalemeum",
        "commit": commit,
        "license": "MIT, Copyright (c) 2022 Marcin Molenda",
        "files": {FILES[name]: sha256(path) for name, path in paths.items()},
        "skippedTitles": {"la": skipped_la, "en": skipped_en, "pl": skipped_pl},
    }

    DATA.mkdir(exist_ok=True)
    (DATA / "names").mkdir(exist_ok=True)
    (DATA / "missalemeum").mkdir(exist_ok=True)

    def write(path, value):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    write(keys_path, dict(sorted(keys.items())))
    write(DATA / "catalogue.json", catalogue)
    write(DATA / "temporal-blocks.json", temporal_blocks)
    for lang, table in names.items():
        write(DATA / "names" / f"{lang}.json", table)
    write(DATA / "missalemeum" / "source.json", source)
    write(DATA / "missalemeum" / "ids.json", dict(sorted(ids.items())))
    write(DATA / "missalemeum" / "reference-lists.json", reference_out)

    print(json.dumps({
        "idConstants": len(ids),
        "distinctIds": len(set(ids.values())),
        "catalogue": len(catalogue),
        "universalSancti": len(universal_sancti),
        "polishOnlySancti": len(polish_sancti),
        "placedTempora": len(placed_tempora),
        "names": {lang: len(t) for lang, t in names.items()},
        "skippedTitles": {k: len(v) for k, v in source["skippedTitles"].items()},
        "problems": problems,
    }, indent=1))
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
