# ADR 0014 — Core browser checks and visible extended diagnostics

- **Status:** proposed under the maintainer's two-tier CI ruling; split requires maintainer review.
- **Relates to:** ADR 0003 (site structure), ADR 0007 (stage limits), PUBLIC_RELEASE.md.

## Decision

The required `checks` status depends on unit/build gates, the critical smoke matrix and all twelve core browser shards. Core is the
default for every current and future spec that the production configuration does not exclude. It
covers the production release contracts for both Annex rooms (The Exchange and The Outline Room,
`annex-release.spec.ts`), accessibility, privacy, audio consent, room interaction and rendering
warnings. It rejects any unsuccessful dependency. Production excludes suites that need authored room access or measurement probes.
`office-budget.spec.ts` runs in required authored smoke, alongside the non-extended full-tier cases.
`exchange.spec.ts` and `apartment.spec.ts` run in visible, non-blocking authored extended shards
while sealed. The selection evaluates the app's production release flags: releasing either room
moves its suite into required authored core shards automatically. Full-tier's `@extended` cases
run in the authored extended selection as well. Dry-run coverage guards execute the workflow's
actual Playwright selections and require all four suites to appear in the appropriate tier.

Explicit `@extended` metadata selects corridor camera trajectory, sampling and frame-count
diagnostics, including authored full-tier paths. Those tests still run on every pull request in four visible extended jobs, with every
failure written to the job summary. A failure alone never justifies moving a test out of core.
Assertions retain their intent in either tier. The subsequent corridor-camera ruling includes
camera movement and timing cases with mixed input/door assertions in the extended tier;
independent core routing, focus, audio-consent and accessibility contracts remain required.
Twelve core shards reuse one production build after fail-fast smoke, reducing repeated compilation
and the observed 57-minute GitHub workload. An additional authored fixture preserves full-tier
coverage without opening production Annex doors. Documentation/copy-only PRs may skip browsers
only after explicit classification; other skips, failures and cancellations fail the gate. CI-only test and state-wait
budgets allow cold software rendering to finish without changing expected behaviour; see
PUBLIC_RELEASE.md for the budgets and the 15 newly tagged camera contracts. Playwright retries a
failed test once, on CI only (`retries: process.env.CI ? 1 : 0` in `apps/web/playwright.config.ts`
and `apps/web/playwright.dev.config.ts`); a test that passes on the retry is reported as flaky.

## Consequences and review

Software-rendered camera sampling can be investigated without making the shipping status depend
on its throughput. Extended failures remain work to classify and repair, with isolated load proof
before assigning a timing-only cause. Device/performance and editorial review remain release gates.
Pinned actions, discarded checkout credentials, read-only permissions and workflow concurrency
remain unchanged. Restoring one required browser tier is a reversible workflow/metadata change.
