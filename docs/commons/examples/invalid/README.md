# Invalid manifests

Negative fixtures for [`contribution-0.1.schema.json`](../../schema/contribution-0.1.schema.json).
Each file is the valid example,
[`lost-property-umbrella/manifest.json`](../lost-property-umbrella/manifest.json), with one change
that breaks one rule. The change may touch a second field where the rule needs context, for
example an audio asset together with its captions. The top-level `"$comment"` names the rule and
ends with `Rejected at: <JSON pointer> by: <keyword>`.

`"$comment"` is an annotation for this check. A real manifest may not carry it, and the check
removes it before validating.

## Prove it

This is a Phase A check, not part of CI. It needs Python 3 and the `jsonschema` package.

```sh
pip install jsonschema
python3 -I docs/commons/examples/invalid/check.py
```

It exits 0 only when:
- the example validates, and its asset's hash and size match the file;
- a set of valid variants validates (audio with captions, an organisation as grantor, each
  interaction template at its bounds), so the conditional rules do not over-reject;
- every fixture is rejected with **exactly** the one location and keyword its `"$comment"` names.
  A fixture that fails for another reason, or for several, is reported as broken.

## What the schema cannot check

These stay with the package validator ([`CONTRIBUTION_SPEC.md`](../../CONTRIBUTION_SPEC.md)) and
have no fixture here:
- duplicate asset paths;
- file existence, SHA-256 and byte size;
- media type read from the bytes, and media budgets;
- the text subset and the content rules;
- `revealAt` not exceeding `stops`;
- path containment, symlinks and the one-folder pull request rule;
- the Phase B pilot allowlist (tier 1, four text categories, the `text` role, `corridor-alcove`,
  the `read` template). The schema is wider on purpose; the pilot fixtures are listed in the
  specification and built with the validator.
