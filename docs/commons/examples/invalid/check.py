#!/usr/bin/env python3
"""Phase A check for the Commons manifest schema (not part of CI).

Proves two things with the Python `jsonschema` package (Draft 2020-12):
  1. the valid example validates, and its asset's hash and size match the file; a few variants
     of it that exercise the conditional rules (audio with captions, an organisation as
     grantor, every template at its bounds) validate too;
  2. every fixture in this folder is rejected, and rejected for the rule it names.

Each fixture is the valid example with one change, plus a top-level "$comment" that names the
rule and ends with "Rejected at: <JSON pointer> by: <keyword>". "$comment" is an annotation for
this check: it is removed before validation (a real manifest may not carry it). A fixture passes
only when the schema reports exactly that one (location, keyword) pair, so a fixture that fails
for an unrelated reason, or for several reasons, is reported as broken.

Usage:  python3 -I docs/commons/examples/invalid/check.py [--schema PATH]
Needs:  pip install jsonschema
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
COMMONS = HERE.parent.parent
EXAMPLE_DIR = COMMONS / "examples" / "lost-property-umbrella"
EXPECT = re.compile(r"Rejected at: (\$|/\S*) by: (\w+)\.?$")


def pointer(error):
    path = list(error.absolute_path)
    return "/" + "/".join(str(p) for p in path) if path else "$"


def leaves(node, prefix=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from leaves(value, f"{prefix}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from leaves(value, f"{prefix}/{index}")
    else:
        yield prefix, node


def _soundscape(m):
    m.update(tier=2, category="soundscape")
    m["assets"][0].update(role="audio", path="room.ogg", mediaType="audio/ogg")
    m["accessibility"]["captions"] = ["[a kettle clicks off]"]
    m["engine"]["placement"] = {"kind": "soundscape"}
    m["interaction"] = {"template": "listen", "parameters": {"loop": True, "volume": 0.5}}


def _interaction(template, parameters=None):
    def apply(m):
        m["tier"], m["category"] = 2, "interactive-object"
        m["interaction"] = {"template": template}
        if parameters is not None:
            m["interaction"]["parameters"] = parameters

    return apply


def _organisation_grantor(m):
    m["creators"] = [
        {"name": "Example Agent", "kind": "agent", "role": "author"},
        {"name": "Example Studio", "kind": "organisation", "role": "supervisor"},
    ]


def _human_only(m):
    m["creators"] = [{"name": "Example Author", "kind": "human", "role": "author"}]
    m["provenance"]["origin"] = "human"


def _third_party(m):
    m["licence"]["thirdParty"] = [
        {"asset": "memo.md", "licence": "CC0-1.0", "source": "a public domain archive", "attribution": "Anonymous"}
    ]


def _seven_word_caption(m):
    _soundscape(m)
    m["accessibility"]["captions"] = ["[kettle clicks off, nobody comes home today]", "[ one  two ]"]


def _reading_room(m):
    m["engine"]["placement"] = {"kind": "reading-room"}


VALID_VARIANTS = [
    ("the reading room as the placement", _reading_room),
    ("Tier 2 soundscape with an audio asset and captions", _soundscape),
    ("captions of exactly seven words, and of two words with extra spaces", _seven_word_caption),
    ("an organisation as the named grantor of agent-made work", _organisation_grantor),
    ("human-only work with no agent", _human_only),
    ("a complete third-party entry", _third_party),
    ("read with empty parameters", _interaction("read", {})),
    ("inspect at its upper bound", _interaction("inspect", {"views": 6})),
    ("toggle with both labels", _interaction("toggle", {"labelOn": "open", "labelOff": "shut"})),
    ("rotate at its bounds", _interaction("rotate", {"stops": 12, "revealAt": 12})),
    ("wind at its upper bound", _interaction("wind", {"turnsToPeak": 12})),
    ("place at its upper bound", _interaction("place", {"slots": 6})),
    ("find at its lower bound", _interaction("find", {"waitSeconds": 5})),
    ("find at its upper bound", _interaction("find", {"waitSeconds": 120})),
]


def main(argv):
    schema_path = COMMONS / "schema" / "contribution-0.1.schema.json"
    if "--schema" in argv:
        schema_path = Path(argv[argv.index("--schema") + 1])
    schema = json.loads(schema_path.read_text())
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    failures = 0

    example = json.loads((EXAMPLE_DIR / "manifest.json").read_text())
    errors = sorted(validator.iter_errors(example), key=lambda e: list(e.absolute_path))
    if errors:
        failures += 1
        print("FAIL the example is rejected:")
        for e in errors:
            print(f"       {pointer(e)} {e.validator}: {e.message[:100]}")
    else:
        print("ok   example accepted: examples/lost-property-umbrella/manifest.json")
    for asset in example["assets"]:
        data = (EXAMPLE_DIR / asset["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != asset["sha256"] or len(data) != asset["bytes"]:
            failures += 1
            print(f"FAIL example asset {asset['path']} does not match its hash or size")
    base = dict(leaves(example))

    # Rules that only reject would be easy to get wrong in the other direction, so the
    # conditional rules also get variants that must be accepted.
    for label, mutate in VALID_VARIANTS:
        variant = copy.deepcopy(example)
        mutate(variant)
        errors = list(validator.iter_errors(variant))
        if errors:
            failures += 1
            print(f"FAIL accepted variant '{label}' was rejected: {pointer(errors[0])} {errors[0].validator}")
        else:
            print(f"ok   accepted variant: {label}")

    fixtures = sorted(HERE.glob("*.json"))
    if not fixtures:
        print("FAIL no fixtures found")
        failures += 1
    for path in fixtures:
        data = json.loads(path.read_text())
        comment = data.pop("$comment", None)
        match = EXPECT.search(comment or "")
        if not match:
            failures += 1
            print(f"FAIL {path.name}: missing a $comment ending in 'Rejected at: <pointer> by: <keyword>'")
            continue
        want = (match.group(1), match.group(2))
        found = {(pointer(e), e.validator) for e in validator.iter_errors(data)}
        mine = dict(leaves(data))
        changed = (base.keys() ^ mine.keys()) | {k for k in base.keys() & mine.keys() if base[k] != mine[k]}
        if found == {want}:
            print(f"ok   {path.name:<44} {want[0]} {want[1]}  ({len(changed)} leaf change(s))")
        else:
            failures += 1
            reason = "accepted" if not found else f"rejected for {sorted(found)}"
            print(f"FAIL {path.name}: expected exactly {want}, but it was {reason}")

    print(f"\n{len(fixtures)} fixtures, {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
