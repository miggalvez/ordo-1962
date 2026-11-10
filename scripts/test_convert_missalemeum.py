"""Tests for convert_missalemeum.py that need a Missale Meum checkout.

Usage: python3 -I scripts/test_convert_missalemeum.py <missalemeum-backend-dir>

Nothing is written; each test calls build() in memory.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import convert_missalemeum as convert  # noqa: E402

BACKEND = None


class IncrementalImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lord = convert.load_lord_keys()
        cls.fresh, _ = convert.build(BACKEND, {}, cls.lord)
        cls.fresh_keys = cls.fresh["keys.json"]

    def rebuild(self, saved):
        outputs, summary = convert.build(BACKEND, saved, self.lord)
        self.assertEqual(summary["problems"], [])
        return outputs

    def test_fresh_import_is_deterministic(self):
        self.assertEqual(self.rebuild({}), self.fresh)

    def test_a_new_class_variant_reuses_the_saved_key(self):
        # The case Codex reported: the III class Advent Monday is already saved,
        # then Missale Meum adds its II class form for 17-23 December.
        saved = {i: k for i, k in self.fresh_keys.items() if i != "tempora:Adv3-1:2:v"}
        keys = self.rebuild(saved)["keys.json"]
        self.assertEqual(keys["tempora:Adv3-1:2:v"], "adv3-1")
        self.assertEqual(keys, self.fresh_keys)

    def test_incremental_import_matches_a_fresh_one(self):
        aliases = {i for i, k in self.fresh_keys.items()
                   if list(self.fresh_keys.values()).count(k) > 1}
        sample = set(sorted(self.fresh_keys)[::7])
        saved = {i: k for i, k in self.fresh_keys.items() if i not in aliases | sample}
        self.assertEqual(self.rebuild(saved), self.fresh)

    def test_the_committed_data_matches_a_fresh_import(self):
        import json
        for rel, value in self.fresh.items():
            committed = json.loads((convert.DATA / rel).read_text(encoding="utf-8"))
            self.assertEqual(committed, value, rel)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    BACKEND = Path(sys.argv.pop(1)).resolve()
    unittest.main()
