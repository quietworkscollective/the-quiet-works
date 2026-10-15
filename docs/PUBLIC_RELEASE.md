# Making the repository public

The public repository is github.com/quietworkscollective/the-quiet-works. This document is the
release gate for it. Nothing here runs without the founder's explicit approval: making the repository public,
changing its security settings and rewriting history are release decisions (AGENTS.md #5).

## Controls already active (private or public)

| Control | Where | What it prevents |
|---|---|---|
| `pnpm check:public` in CI and before every push | `scripts/check-public.mjs` | Private keys, tokens, credential assignments, cloud account IDs, personal emails, local machine paths, tracked `.env` files and files over 5 MB reaching the repository. Each rule self-tests against a sample it must catch. |
| CI runs once per pull request, superseded runs cancelled | `.github/workflows/ci.yml` | Paying twice for one change; stale runs. |
| Actions pinned to commit SHAs, `persist-credentials: false`, read-only token | `.github/workflows/ci.yml` | A moved tag or a compromised action running in CI with write access. |
| No `pull_request_target`, no secrets in CI | `.github/workflows/ci.yml` | Fork pull requests reaching secrets or write tokens. |
| Default workflow token read-only; workflows cannot approve pull requests | repository Actions settings | Automation approving or merging its own work. |
| Founder owns every path | `.github/CODEOWNERS` | Changes landing without the founder's review. |
| Dependabot, monthly and grouped | `.github/dependabot.yml` | Stale dependencies and actions, at one CI run per ecosystem a month. |
| Issue templates without blank issues; a private security route | `.github/ISSUE_TEMPLATE/` | Personal crises or security reports in public issues. |
| Pull request template | `.github/PULL_REQUEST_TEMPLATE.md` | Descriptions without objective, decisions or verification. |
| Site privacy: no third-party requests, cookies or analytics; one local archive after a discovery | CSP `connect-src 'none'`; e2e privacy tests | The artwork collecting anything. |

## Controls applied at the moment of going public

GitHub's free plan offers these only on public repositories. `scripts/github/apply-public-controls.sh`
applies them; run it without arguments first (a dry run that also runs `check:public --release`).

- **Ruleset `main`** (`.github/rulesets/main.json`):
  - changes reach `main` only through pull requests;
  - the `checks` CI job must pass on a branch that is up to date with `main`, which is what lets
    CI skip re-running on merge;
  - conversations must be resolved;
  - no force pushes or deletion;
  - no bypass, administrators included.
- **Ruleset `no-releases-without-approval`** (`tags.json`): no tags can be created, moved or
  deleted, so no GitHub release can be published until the founder lifts it.
- **Secret scanning** with push protection.
- **Dependabot alerts and automated security fixes.**
- **Private vulnerability reporting**, the channel `SECURITY.md` points to.
- **Fork pull requests:** workflow runs from every external contributor need approval, so a
  stranger's pull request cannot spend Actions minutes or run code unreviewed.
- **Repository features:** forking allowed (contributions need it), branches deleted on merge,
  wiki and projects off.

Public repositories get standard GitHub Actions minutes free, so the budget pressure on CI ends
at this point; the once-per-pull-request design stays because it is also faster.

## Required browser gate and extended diagnostics

The required status is still named exactly `checks`. It requires successful `unit` and `build`
jobs, then the fail-fast `smoke` matrix and all twelve `core` shards. Core starts only after
smoke succeeds. Failed or cancelled jobs never satisfy the gate. An explicit documentation/copy
classification permits skipped browsers; missing classification or an unexpected skip fails closed.

Unit checks run alongside one build job. That job compiles production once, checks bake freshness,
scans for development probes and audits shipped assets. It uploads `dist` plus a separate
`dist-authored` test fixture for one day. The fixture is compiled with development room access
and measurement probes because full-tier tests exercise the unreleased Annex rooms. It must
never be deployed. Production release flags and the production probe scan remain unchanged.
Every browser job downloads these bundles and uses preview only; missing bundles fail instead
of triggering a rebuild. Browser binaries use the pinned Playwright-version cache.

Smoke runs four jobs: desktop and Pixel 7, each against production and the authored fixture.
Production selects the Office fifth-stamp/memo path, the landing, ordered doors, keyboard Office
entry, and every production Annex sealed-door contract. The authored jobs run every non-extended case in
`full-tier.spec.ts`, including its stage sweep, plus `office-budget.spec.ts`. Smoke stops at its first failure and cancels its
siblings. Its 15-minute timeout allows cold installation; five minutes is the warm-cache target,
not a reason to truncate assertions.

Core retains all production-compatible cases by default: Office context/exploration/room and
interaction specs, brand, page, spine, discoveries, robustness, gramophone music and both Annex
release contracts. Corridor clock, rendering warnings, remount, page-input, gesture/audio-consent
and accessible touch-control checks remain core. The production configuration excludes suites that require development access or measurement probes.
`office-budget.spec.ts` gates in authored smoke alongside the ordinary full-tier cases. The sealed
`exchange.spec.ts` and `apartment.spec.ts` suites run in the visible, non-blocking authored extended
job, along with the `@extended` cases in `full-tier.spec.ts`. Their release flags automatically move
them into the required authored core selection when released. Both fixture selections evaluate the
app's own production release gate. New ordinary specs enter core automatically. A failing case is repaired or
reviewed; failure alone is never a reason to remove it. Discovery and readable HTML checks run
in core on desktop and Pixel 7; the no-JavaScript project reads all twelve public routes. The crawler
guard checks seven user agents against the same production preview. CI selection tests verify these
cases with Playwright `--list`, alongside authored Office-budget coverage.

The unchanged `luna-exit.spec.ts` also gates against the authored fixture on desktop, Pixel 7
and iPhone WebKit. Its all-chamber route case uses authored status; production retains the
other cases and adds release/return/Menu checks for all six URLs. Unreleased production URLs
remain not-found. The required core shards and `ci:local` both run
`playwright.chamber-contract.config.ts`; dry-run guards ensure that no chamber or assertion
is omitted by the retargeting.

The twelve core shards distribute individual cases (`fullyParallel`) by count, with one worker
per runner. Playwright does not schedule from historical durations; measure the slowest shard
on the next public run before claiming the 15–20 minute PR target is met. Core has a 45-minute
ceiling for cold software rendering. Its shards are not fail-fast (`fail-fast: false`), so each one runs to the end and reports all its failures. CI-only
budgets retain five minutes per test, ordinary assertions 90 seconds and explicit scene-state
waits two minutes. No expected value, contrast threshold, distance or speed limit is relaxed. On CI only, Playwright retries a failed test once (`retries: process.env.CI ? 1 : 0` in `apps/web/playwright.config.ts` and `apps/web/playwright.dev.config.ts`). A test that passes on the retry is reported as flaky; one that fails both runs fails the job.

A PR changing only `docs/**`, Markdown files, or string values/comments in the explicitly listed
copy data modules (`packages/engine/src/copy.ts`, `packages/engine/src/siteCopy.ts`) skips all
browser jobs. The classifier compares the whole PR against its base, preserving token structure,
quoted property keys, types, imports, route/id values and numbers for copy changes. Code edits,
unknown paths, added/deleted copy modules and missing history run browsers or fail the build. Unit, content, public, build
and asset checks still run. Manual workflow dispatch always runs browsers.

Before syncing, run `pnpm ci:local` on macOS. It runs lint, typecheck, unit, content, public and CI
policy checks; builds and audits production; builds the authored fixture; then runs the entire
core selection, full-tier, Office budgets and released authored room suites from those artifacts using four Metal workers. It stops at a failed
stage and prints stage/total times. Discovery-store harnesses use a separate available loopback
port in each worker, preserving storage isolation without serialising their assertions. Override
`TQW_LOCAL_WORKERS` for a smaller GPU/memory budget; ports default to 5397 (production) and 5398 (authored), fail if busy, and never reuse another server.

The warm-cache scheduling target is 1–2 minutes for build, 2–4 for smoke and 10–14 for the
slowest core shard (about 13–20 minutes for the required path); unit runs alongside that path.
These are estimates until the twelve-shard public run is measured, not new timeout limits.
The local Metal gate measured 5m 59s: 448 core cases passed with 34 existing skips, then all
20 full-tier cases passed. Production smoke separately passed all 14 cases in 17.3 seconds;
full-tier smoke with two local workers passed in 52.0 seconds. Hardware timings do not establish
software-rendered GitHub timings. The packaged-artifact SwiftShader dry run of shard 3/12
(the largest summed local case duration) passed 38 cases with one existing skip in 7m 19s.
All 564 bundle files retained identical bytes and modification times; no preview rebuilt them.

Tests marked `@extended` and the unreleased room suites sit outside that required status. They measure corridor camera
trajectories and frame throughput: hero drift, scroll walk-in, off-screen/hidden-tab frame counts,
camera pose/FOV/collision geometry, camera frame-loop budgets, reduced-motion camera cuts and
the corridor idle draw count. Under the subsequent corridor-camera ruling, the camera movement
and timing cases in `corridor-walk.spec.ts` are extended even when they also exercise an input or
a door. Their assertions remain intact; independent core specs still require focus restoration,
room routing, native page-input ownership, audio consent and accessible controls. The metadata
marks measurements without changing their assertions. These selected cases are in
`corridor-site.spec.ts`, `corridor-walk.spec.ts` and `corridor-world.spec.ts`.

The additional camera cases marked extended are: native wheel hand-over; W/S walking speed and
stopping; A/D turning speed; wheel-notch distance; drag-to-look without travel; floor glides;
two-click door framing and entry; the 1.6 m / 1.4 s doorway walk; Tab door framing; sealed-door
rattle and camera position; return-from-Office camera position; hover attention and quiet frames;
touch-button walking and stopping; native landing swipe with camera travel; and touch swipe,
drag and floor glide. These are 15 contracts, selected by camera measurement rather than result.

Every browser-eligible pull request runs four `extended` shards as well, directly after build. Their failures remain visible as failed
jobs, and each job summary lists every failed test and its error. Extended and core shards keep
running after a test failure (`fail-fast: false`); only required smoke fails fast. The extended job is intentionally absent from the `checks` dependency
set; its diagnostics still require triage, and do not replace device/performance or editorial
release review. See ADR 0014. The maintainer reviews this split with the release changes.

## Founder decisions (14 October 2026)

1. **Licence: decided.** Code under the Apache License 2.0 (`LICENSE`); original art and writing
   under CC BY 4.0 (`LICENSES/CC-BY-4.0.txt`). Both © Asiri Dalugoda. The UNHELD name and mark are
   not licensed. `LICENSING.md` maps files to licences; `NOTICE` carries the attribution.
2. **Conduct contact: decided.** `info@unheld.space`, the project's own address (`CODE_OF_CONDUCT.md`);
   `check:public` allows exactly that address and still rejects any other.
3. **Personal email: never public.** Every commit is authored with the account's GitHub no-reply address (set in this repository's git config from 14 October 2026). Earlier commits are rewritten to it, as below.
4. **AI attribution: none, anywhere, ever (hard rule).** `AGENTS.md` #11. `check:public` rejects
   attribution lines in tracked files; `--release` also rejects them anywhere in the history.
5. **Lore and secrets: out of the repository.** The design bible and the chamber designs live in
   a private design repository outside this one (`AGENTS.md` #12). `docs/DESIGN.md` carries the
   public principles. `--release` checks the tracked files and the whole history against a
   private list of lore markers (`UNHELD_LORE_MARKERS`), so nothing from that list can ship.
6. **Brand clearance: decided.** A preliminary search found UN-HELD registered by an unrelated
   consultancy and several other "Unheld" products. The founder keeps UNHELD for this non-commercial
   artwork and its domain, and is not filing a trade mark.
7. **Editorial review** of all public copy, including any support page (verified, regional
   resources only): open.

## History: why the public repository starts fresh

This private repository's history contains, from before these decisions:
- a personal email address on every commit;
- AI attribution trailers in commit messages;
- the lore files and spoiler-heavy commit messages.

A rewrite and force-push can clean branches, but GitHub keeps every pull request's original
commits reachable through the pull request itself (PR #1 already exists), and they cannot be
removed short of deleting the repository. So the public repository is created fresh:

1. **Last private push:** the final section push to this private repository goes out with its
   history rewritten (no-reply author and committer, attribution trailers stripped). That is the
   one force-push of `main` the founder approved.
2. **The public repository** is created with a single genesis commit of the release tree, authored
   with the no-reply address: no lore, no attribution, no personal email. It is the project's
   founding public commit. The private history is not carried into it; it remains readable in
   the private archive.
3. **This repository** is renamed to `the-quiet-works-archive` and stays private (or is deleted
   later, with the founder's explicit confirmation), and the public one takes the name
   `the-quiet-works`. Cloudflare Workers Builds is reconnected to the public repository.

## Going public, in order

1. Resolve the open decisions above.
2. `UNHELD_LORE_MARKERS=<private markers file> pnpm check:public --release` must pass on the
   release tree.
3. Run the full local gate.
4. Create the public repository from the release tree, as above, and push its genesis commit.
5. Run `scripts/github/apply-public-controls.sh`, first as a dry run, then with `--apply`
   (the new repository is already public, so `--make-public` is not needed). Check its verify
   output.
6. Confirm by hand that a direct push to `main` is refused and that a pull request shows the
   required `checks` status.
7. Cloudflare: reconnect Workers Builds to the public repository. Attaching `unheld.space` and
   removing Access from preview URLs are separate go-live decisions.
