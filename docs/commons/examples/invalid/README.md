# Invalid manifests

Negative fixtures for [`contribution-0.1.schema.json`](../../schema/contribution-0.1.schema.json).
Each file is the valid example,
[`lost-property-umbrella/manifest.json`](../lost-property-umbrella/manifest.json), with one change
that breaks one rule. The change may touch a second field where the rule needs context, for
example an audio asset together with its captions. The top-level `"$comment"` names the rule and
ends with `Rejected at: <JSON pointer> by: <keyword>`.

`"$comment"` is an annotation for this check. A real manifest may not carry it, and the check
removes it before validating.

## CI check

The read-only repository workflow runs this checker with its pinned Python dependency. It passes
only when:
- the example validates, and its asset's hash and size match the file;
- a set of valid variants validates (audio with captions, an organisation as grantor, each
  interaction template at its bounds), so the conditional rules do not over-reject;
- every fixture is rejected with **exactly** the one location and keyword its `"$comment"` names.
  A fixture that fails for another reason, or for several, is reported as broken.

## What the schema and current preflight do not decide

Schema fixtures do not establish whether a contribution's stated licence is real, whether the text
is suitable, or whether a fictional voice could be mistaken for testimony. Human review remains
required. The preflight checks current text-package hashes, paths, pilot scope and text rules; media
format parsing and limits wait for an independently reviewed sandbox. See
[`CONTRIBUTION_SPEC.md`](../../CONTRIBUTION_SPEC.md).
