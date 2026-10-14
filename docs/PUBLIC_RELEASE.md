# Making the repository public

The repository is private until UNHELD goes live. This document is the gate between those two
states. Nothing here runs without the founder's explicit approval: making the repository public,
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

The required status is still named exactly `checks`. It means the `unit` job and every `core`
browser shard succeeded. It runs with `if: always()` and rejects failed, cancelled or skipped
dependencies. The four core shards cover desktop Chromium and Pixel 7 against the production
build, with the existing browser cache and a 90-minute job limit for software rendering and setup.
Cases are distributed individually across shards; each runner retains one sequential worker.
The limit leaves headroom above the previous slowest local shard of 52 minutes, including browser
installation and cold scene preparation; it does not increase any assertion's deadline.

Core includes every spec by default: full-tier rendering, Office budget/context/exploration/room
and interaction specs, brand, page, spine, discoveries, robustness, gramophone music, Exchange,
and the Outline Room cases in `full-tier.spec.ts`. Corridor clock, rendering warnings, remount,
pointer, page-input, gesture/audio-consent and accessible touch-control checks also remain core.
New ordinary specs enter this gate automatically. A failing spec is repaired or reviewed; failure
alone is never a reason to remove it from core.

Only tests marked `@extended` sit outside that required status. They measure corridor camera
trajectories and frame throughput: hero drift, scroll walk-in, off-screen/hidden-tab frame counts,
camera pose/FOV/collision geometry, camera frame-loop budgets, reduced-motion camera cuts and
the corridor idle draw count. Mixed cases that also check keyboard, pointer, touch, native scroll
ownership, door routing or settings controls remain required in core. The metadata marks
measurements without changing their assertions. These selected cases are in
`corridor-site.spec.ts`, `corridor-walk.spec.ts` and `corridor-world.spec.ts`.

Every pull request runs four `extended` shards as well. Their failures remain visible as failed
jobs, and each job summary lists every failed test and its error. Neither tier cancels its other
shards on a test failure. The extended job is intentionally absent from the `checks` dependency
set; its diagnostics still require triage, and do not replace device/performance or editorial
release review. See ADR 0011. The maintainer reviews this split with the release changes.

## Founder decisions (14 October 2026)

1. **Licence: decided.** Code under the Apache License 2.0 (`LICENSE`); original art and writing
   under CC BY 4.0 (`LICENSES/CC-BY-4.0.txt`). Both © Asiri Dalugoda. The UNHELD name and mark are
   not licensed. `LICENSING.md` maps files to licences; `NOTICE` carries the attribution.
2. **Conduct contact: decided.** `info@unheld.space`, the project's own address (`CODE_OF_CONDUCT.md`);
   `check:public` allows exactly that address and still rejects any other.
3. **Personal email: never public.** Every commit is authored with the GitHub no-reply address
   `22433736+asiridalugoda@users.noreply.github.com` (set in this repository's git config from
   14 October 2026). Earlier commits are rewritten to it, as below.
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
