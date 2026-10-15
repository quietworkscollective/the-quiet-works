# ADR 0011 — Core browser checks and visible corridor diagnostics

- **Status:** proposed under the maintainer's two-tier CI ruling; split requires maintainer review.
- **Relates to:** ADR 0003 (site structure), ADR 0007 (stage limits), PUBLIC_RELEASE.md.

## Decision

The required `checks` status depends on unit gates and all six core browser shards. Core is the
default for every current and future spec, including both Annex rooms, accessibility, privacy,
audio consent, room interaction and rendering warnings. It rejects any unsuccessful dependency.

Explicit `@extended` metadata selects only corridor camera trajectory, sampling and frame-count
diagnostics. Those tests still run on every pull request in four visible extended jobs, with every
failure written to the job summary. A failure alone never justifies moving a test out of core.
Assertions retain their intent in either tier. The subsequent corridor-camera ruling includes
camera movement and timing cases with mixed input/door assertions in the extended tier;
independent core routing, focus, audio-consent and accessibility contracts remain required.
Six core shards reduce the observed 57-minute GitHub workload. CI-only test and state-wait
budgets allow cold software rendering to finish without changing expected behaviour; see
PUBLIC_RELEASE.md for the budgets and the 15 newly tagged camera contracts.

## Consequences and review

Software-rendered camera sampling can be investigated without making the shipping status depend
on its throughput. Extended failures remain work to classify and repair, with isolated load proof
before assigning a timing-only cause. Device/performance and editorial review remain release gates.
Pinned actions, discarded checkout credentials, read-only permissions and workflow concurrency
remain unchanged. Restoring one required browser tier is a reversible workflow/metadata change.
