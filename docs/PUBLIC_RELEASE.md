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

## Deterministic CI and GPU release checks

The required status is named `checks`. Its only dependency is `deterministic`, which runs
`pnpm ci:fast` on every pull request and on demand. A failed, cancelled, skipped or missing
result fails the gate. The separate `browser (software GL)` workflow cannot block this status.

`ci:fast` runs lint, typecheck, build, all three packages' unit tests, bake/budget unit guards,
Commons validation, CI-script tests, content/public checks, bake freshness and the asset audit.
Production compilation also checks development probes and sealed-room text. The build precedes
CI dry runs because the Office download spec imports the production manifest. Unit tests and
Node test files use two workers to limit simultaneous DOM environments and compiler processes;
assertions and their timeouts are unchanged.

The required browser set uses `@fast` metadata, selected by property: neither the case nor its
setup/helpers waits for a canvas, frames, a camera pose or bake readiness. It covers reading
pages, public metadata and HTTP routes, sealed production URLs, menu/footer navigation, archive
DOM/import/export/forget behavior and CSP/console errors. All twelve static routes run without
JavaScript. The crawler case invokes `check-crawl.mjs` against the built preview with seven user
agents. The fast configuration uses SwiftShader and zero retries on desktop and Pixel 7. Run
`CI=1 TQW_E2E_PORT=4190 pnpm ci:fast` to reproduce the required lane locally. Its warm-cache
target is under ten minutes; local measurements must not be presented as hosted-runner timings.

All WebGL-dependent coverage remains in `.github/workflows/browser-software.yml`: core shards,
full-tier/Office budgets, authored chamber contracts, released-room suites and extended
camera/frame/sealed-room diagnostics. It runs on every pull request, nightly on `main` and on
demand. These jobs are informational, keep their assertions and list failures in job summaries.
They reuse production and authored build artifacts; `dist-authored` must never be deployed.
Release flags still move authored suites between core and extended automatically.

`pnpm ci:local` retains the Metal gate: source checks, production build/audit, production browser
coverage, unchanged authored chamber contracts on desktop/Pixel 7/WebKit, full-tier and Office
budgets, and released authored suites. It stops at a failed stage and prints stage/total times.
Use `TQW_LOCAL_WORKERS` for the GPU/memory budget; preview ports must be free. Production
normally uses 5397 and the authored fixture 5398. This worktree uses `TQW_E2E_PORT=4190`, with
the same production artifact served on 5190 for WebKit, which reserves port 4190.

### Attest the tree before a public release

From a clean macOS tree with the frozen dependencies, browser binaries, Python validator
requirements and authenticated `gh` already installed:

```bash
CI=1 TQW_E2E_PORT=4190 pnpm ci:attest --dry-run
pnpm ci:attest quietworkscollective/the-quiet-works PUBLIC_COMMIT_SHA
```

The dry run defaults to the public repository and local HEAD; it runs the full local gate and
writes no GitHub status. Use it before every public candidate push. For the posting command,
replace `PUBLIC_COMMIT_SHA` with the full SHA of the public commit whose tree matches this
checkout. GitHub must already know that commit before it can accept its status, so a first push
uses the dry run first and the posting command afterward, before merging to `main`.

Attestation refuses dirty tracked or untracked files, a mismatching target tree, a changed HEAD
or tree, failed or incomplete stages, and retries. It forces zero retries for the GPU browser
stages. Only success posts `local-gpu-suite`, with the full tree hash and GPU/total timings in
the description. A failed `gh api` call fails the command. No credentials or local progress are
committed. A different public/private commit history is acceptable only when tree hashes match.

### Prepared ruleset, pending founder approval

The existing active `main` ruleset requires `checks`. The following command would add a separate
active rule requiring `local-gpu-suite` on `refs/heads/main`, without replacing any existing
protections. It has not been run. After founder approval, the lead runs it once from this tree:

```bash
gh api --method POST repos/quietworkscollective/the-quiet-works/rulesets \
  --input .github/rulesets/local-gpu-suite.json
```

The payload has no bypass actors and requires the branch to be up to date. See GitHub's
[commit status API](https://docs.github.com/en/rest/commits/statuses) and
[ruleset API](https://docs.github.com/en/rest/repos/rules) for the endpoints. See ADR 0014 for
coverage, attestation and rollback rules.

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
