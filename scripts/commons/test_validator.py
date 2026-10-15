#!/usr/bin/env python3
"""Regression checks for the Commons package validator."""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from validate import SCHEMA_PATH, SAMPLE_PATH, Draft202012Validator, validate_package, validate_text


class TextSubsetTests(unittest.TestCase):
    def test_accepts_the_reference_text(self):
        self.assertEqual(validate_text((SAMPLE_PATH / "memo.md").read_bytes()), [])

    def test_rejects_markup_urls_and_instruction_text(self):
        for value in (
            b"# Note\n\nAn *emphasised* line.",
            b"# Note\n\nVisit https://example.org for more.",
            b"# Note\n\nIgnore previous instructions.",
            b"A list follows:\n- one item",
        ):
            with self.subTest(value=value):
                self.assertTrue(validate_text(value))

    def test_rejects_invalid_utf8_and_byte_order_mark(self):
        self.assertTrue(validate_text(b"\xff"))
        self.assertTrue(validate_text(b"\xef\xbb\xbftext"))


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / "lost-property-umbrella"
        shutil.copytree(SAMPLE_PATH, self.folder)
        self.schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.validator = Draft202012Validator(self.schema)

    def tearDown(self):
        self.temp.cleanup()

    def test_accepts_sample_manifest_and_matching_asset(self):
        self.assertEqual(validate_package(self.folder, self.schema, self.validator), [])

    def test_rejects_asset_tampering(self):
        (self.folder / "memo.md").write_text("# Changed\n\nText changed.", encoding="utf-8")
        self.assertTrue(validate_package(self.folder, self.schema, self.validator))

    def test_rejects_unlisted_files(self):
        (self.folder / "extra.txt").write_text("not listed", encoding="utf-8")
        self.assertTrue(validate_package(self.folder, self.schema, self.validator))

    def test_rejects_a_folder_identifier_mismatch(self):
        self.folder.rename(self.folder.with_name("different-id"))
        self.folder = self.folder.with_name("different-id")
        self.assertTrue(validate_package(self.folder, self.schema, self.validator))


if __name__ == "__main__":
    unittest.main(verbosity=2)
