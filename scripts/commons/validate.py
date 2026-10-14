#!/usr/bin/env python3
"""Validate Commons contribution packages as untrusted JSON and text data only."""
import hashlib
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "docs" / "commons" / "schema" / "contribution-0.1.schema.json"
SAMPLE_PATH = ROOT / "docs" / "commons" / "examples" / "lost-property-umbrella"
CONTRIBUTIONS_PATH = ROOT / "commons"
PILOT_CATEGORIES = {"memo", "reflection", "poem", "environmental-story"}
MAX_PACKAGE_BYTES = 16 * 1024 * 1024
MAX_WORDS = 2000
URL = re.compile(r"(?:https?://|www\.)", re.IGNORECASE)
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
FORBIDDEN_TEXT = re.compile(
    r"\b(?:diagnos\w*|cure|score|streak)\b|"
    r"\b(?:call|text|contact)\s+(?:911|999|112|emergency services|a helpline)\b|"
    r"\b(?:tell|share|reveal|confess)\s+(?:me|us|your story|what happened)\b|"
    r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|"
    r"^\s*(?:system|assistant|reviewer)\s*:",
    re.IGNORECASE | re.MULTILINE,
)
FORBIDDEN_MARKDOWN = set("<>`*_[]\\|~")


def pointer(error):
    path = list(error.absolute_path)
    return "/" + "/".join(str(part) for part in path) if path else "$"


def _read_json(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("manifest.json must be a regular file, not a symlink")
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("manifest.json exceeds 1 MiB")
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def validate_text(data):
    """Return mechanical text-subset/content-rule violations; never rewrites the submission."""
    problems = []
    if data.startswith(b"\xef\xbb\xbf"):
        return ["text asset has a UTF-8 byte-order mark"]
    try:
        value = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return ["text asset is not valid UTF-8"]

    if any((ord(char) < 32 and char not in "\n\r") or ord(char) == 127 for char in value):
        problems.append("text asset contains a control character")
    if len(re.findall(r"\S+", value)) > MAX_WORDS:
        problems.append(f"text asset exceeds {MAX_WORDS} words")
    if URL.search(value):
        problems.append("text asset contains a web address")
    if EMAIL.search(value):
        problems.append("text asset contains an email address")
    if FORBIDDEN_TEXT.search(value):
        problems.append("text asset matches a prohibited instruction or framing pattern")

    lines = value.splitlines()
    headings = [index for index, line in enumerate(lines) if line.startswith("#")]
    if headings:
        first = headings[0]
        if first != 0 or not lines[0].startswith("# ") or lines[0] == "# ":
            problems.append("the only level-one heading must be the first line and use '# Title'")
        elif len(lines) < 2 or lines[1].strip() != "":
            problems.append("a leading heading must be followed by a blank line")
        if len(headings) > 1 or any(index != 0 for index in headings):
            problems.append("text assets may have only one level-one heading at the start")

    body_lines = lines[2:] if headings and headings[0] == 0 else lines
    for index, line in enumerate(body_lines, start=3 if headings and headings[0] == 0 else 1):
        if any(char in line for char in FORBIDDEN_MARKDOWN):
            problems.append(f"line {index} contains markup outside the plain-text subset")
            break
        if re.match(r"^(?:\s{4}|\s*[-+=]|\s*\d+[.)]\s)", line) or line.startswith("#"):
            problems.append(f"line {index} uses a list, code block, or additional heading")
            break
    return problems


def _walk_regular_files(folder):
    files = set()
    problems = []
    for parent, directories, names in os.walk(folder, followlinks=False):
        parent_path = Path(parent)
        for name in [*directories, *names]:
            candidate = parent_path / name
            if candidate.is_symlink():
                problems.append(f"symlink is not accepted: {candidate.relative_to(folder).as_posix()}")
        directories[:] = [name for name in directories if not (parent_path / name).is_symlink()]
        for name in names:
            candidate = parent_path / name
            if candidate.is_file() and not candidate.is_symlink():
                files.add(candidate.relative_to(folder).as_posix())
    return files, problems


def validate_package(folder, schema, validator=None):
    """Check one manifest folder and its listed pilot text assets without executing any content."""
    folder = Path(folder)
    label = folder.relative_to(ROOT).as_posix() if folder.is_relative_to(ROOT) else folder.name
    problems = []
    if folder.is_symlink() or not folder.is_dir():
        return [f"{label}: contribution folder must be a real directory"]

    manifest_path = folder / "manifest.json"
    try:
        manifest = _read_json(manifest_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        return [f"{label}/manifest.json: {error}"]

    validator = validator or Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(manifest), key=lambda error: (list(error.absolute_path), error.validator or ""))
    for error in errors:
        problems.append(f"{label}/manifest.json {pointer(error)} {error.validator}: {error.message}")
    if errors:
        return problems

    if manifest["id"] != folder.name:
        problems.append(f"{label}: folder name does not match manifest id {manifest['id']!r}")
    if manifest["tier"] != 1 or manifest["category"] not in PILOT_CATEGORIES:
        problems.append(f"{label}: the current pilot accepts only Tier 1 memo, reflection, poem, or environmental-story")
    if any(asset["role"] != "text" or asset["mediaType"] != "text/markdown" for asset in manifest["assets"]):
        problems.append(f"{label}: the current pilot accepts text/markdown assets only")
    if manifest["engine"]["placement"]["kind"] != "corridor-alcove":
        problems.append(f"{label}: the current pilot placement is corridor-alcove only")
    if manifest.get("interaction", {}).get("template", "read") != "read":
        problems.append(f"{label}: the current pilot supports the read interaction only")

    expected_files = {"manifest.json"}
    total_bytes = manifest_path.stat().st_size
    asset_paths = [asset["path"] for asset in manifest["assets"]]
    if len(asset_paths) != len(set(asset_paths)):
        problems.append(f"{label}: manifest contains duplicate asset paths")
    for asset in manifest["assets"]:
        asset_path = PurePosixPath(asset["path"])
        if asset_path.is_absolute() or any(part in ("", ".", "..") for part in asset_path.parts):
            problems.append(f"{label}: asset path is not a safe relative path: {asset['path']!r}")
            continue
        candidate = folder.joinpath(*asset_path.parts)
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(folder.resolve(strict=True))
        except (OSError, ValueError):
            problems.append(f"{label}: asset path is missing or escapes its contribution folder: {asset['path']}")
            continue
        if candidate.is_symlink() or not candidate.is_file():
            problems.append(f"{label}: asset must be a regular file: {asset['path']}")
            continue
        expected_files.add(asset_path.as_posix())
        data = candidate.read_bytes()
        total_bytes += len(data)
        if len(data) != asset["bytes"]:
            problems.append(f"{label}/{asset['path']}: byte size differs from manifest")
        if hashlib.sha256(data).hexdigest() != asset["sha256"]:
            problems.append(f"{label}/{asset['path']}: SHA-256 differs from manifest")
        if asset_path.suffix != ".md":
            problems.append(f"{label}/{asset['path']}: text assets must use the .md extension")
        problems.extend(f"{label}/{asset['path']}: {problem}" for problem in validate_text(data))

    if total_bytes > MAX_PACKAGE_BYTES:
        problems.append(f"{label}: package exceeds {MAX_PACKAGE_BYTES // (1024 * 1024)} MiB")
    actual_files, walk_problems = _walk_regular_files(folder)
    problems.extend(f"{label}: {problem}" for problem in walk_problems)
    for extra in sorted(actual_files - expected_files):
        problems.append(f"{label}/{extra}: file is not listed in manifest.json")
    for missing in sorted(expected_files - actual_files):
        problems.append(f"{label}/{missing}: listed file is missing")
    return problems


def main():
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, Exception) as error:
        print(f"Commons schema cannot be loaded: {error}", file=sys.stderr)
        return 2
    validator = Draft202012Validator(schema)
    packages = [SAMPLE_PATH]
    if CONTRIBUTIONS_PATH.exists():
        for entry in sorted(CONTRIBUTIONS_PATH.iterdir()):
            if entry.is_symlink() or not entry.is_dir():
                print(f"commons/{entry.name}: each entry must be a contribution directory", file=sys.stderr)
                return 1
            packages.append(entry)

    failures = []
    for folder in packages:
        failures.extend(validate_package(folder, schema, validator))
    if failures:
        print(f"Commons validator found {len(failures)} issue(s):", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print(f"Commons validator passed: {len(packages)} package(s), schema and text rules checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
