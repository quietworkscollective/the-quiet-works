# ADR 0014 — Deterministic CI and local GPU release attestation

- **Status:** implementation of the founder's 16 October 2026 two-lane ruling. Activating the additional GitHub ruleset requires separate founder approval.
- **Relates to:** ADR 0003 (site structure), ADR 0007 (stage limits), PUBLIC_RELEASE.md.

## Decision

The required GitHub status remains `checks`. It depends only on `deterministic`, which runs
`pnpm ci:fast` on every pull request and on demand. Failed, cancelled, skipped or missing
deterministic coverage fails the status. Software-GL outcomes cannot satisfy or prevent it.

The deterministic lane runs lint, typecheck, a production build, all three packages' unit tests,
bake and asset-budget unit guards, Commons validation, CI-script tests, content/public checks,
bake freshness and the shipped-asset audit. Unit and Node test-file concurrency is bounded at
two workers; this preserves assertions and timeouts while limiting competing DOM environments.
The build includes the production probe scan and
sealed-room text check. Browser coverage uses the committed `@fast` selection on desktop and
Pixel 7, plus all twelve no-JavaScript routes. The seven-user-agent crawler guard runs the same
`check-crawl.mjs` script used by `pnpm check:crawl` against the production preview.

A case qualifies as `@fast` only when neither its body nor setup/helpers wait for a canvas,
frames, a camera pose or bake readiness. The selection includes reading pages, HTTP metadata,
sealed-route guards, menu/footer navigation, archive DOM/import/export/forget contracts and
CSP/console checks. Existing assertions are preserved. Dry-run and helper-inspection guards
verify the selection. The fast Playwright configuration always uses SwiftShader with zero
retries; it never inherits Metal or CI's rendering timeouts.

All rendering-dependent suites remain in `.github/workflows/browser-software.yml`, named
`browser (software GL)`. It runs on pull requests, nightly on the default `main` branch, and on
demand. Core, full-tier and extended jobs retain their assertions and report failures visibly;
these jobs are informational and have no dependency path to `checks`. One production build
and one separate authored fixture serve the software jobs. The authored fixture never ships.

Production release guards still require every unreleased direct URL to be not-found. The
unchanged authored chamber contracts still check all six authored rooms on desktop, Pixel 7
and iPhone WebKit. They run in the software workflow and the local GPU gate, with independent
production route/Menu coverage retained. Release flags still move authored room suites between
core and extended selections. Office budgets remain in the full-tier selection locally and in
software GL. No test is deleted or weakened to obtain deterministic CI.

## Local GPU gate

`pnpm ci:attest owner/repository commit-sha` runs `pnpm ci:local` on a clean macOS tree with
Metal. It requires the target commit's tree to match the tested tree, runs all existing local
GPU gate stages with retries disabled, and checks the clean tree and HEAD again afterward.
Only complete success posts the `local-gpu-suite` commit status through `gh api`; its
description includes the full tree hash and GPU/total timings. Failed commands, changed trees,
missing stages or failed status writes exit nonzero. `--dry-run` runs the same suite and emits
the attestation without writing to GitHub. It defaults to the public repository and local HEAD.

The sync operator runs the dry run before a public candidate push. GitHub can accept a status
only after the target commit exists in that repository; once it does, run the posting command
before merging to `main`. Separate histories are supported when their tree hashes match.
Credentials stay in the operator's existing `gh` authentication and never enter project files.

## Consequences and rollback

GitHub's required path no longer measures software-rendered frame throughput. Rendering
failures remain visible diagnostics and require triage; the clean-tree Metal status carries the
local GPU release gate. Hardware timings do not establish hosted-runner timings. Device,
performance and editorial review remain release requirements.

The additional ruleset payload is prepared in `.github/rulesets/local-gpu-suite.json`; this
change does not activate it or modify GitHub settings. The existing required `checks` rule stays
in place. Activation instructions and the exact API call are in PUBLIC_RELEASE.md. Reverting
the workflow/configuration change restores the previous lane selection; the maintainer must
coordinate any separately approved ruleset rollback. Pinned actions, read-only workflow tokens,
discarded checkout credentials and fork security remain in place.
