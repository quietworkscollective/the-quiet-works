# UNHELD Commons — security

**Status:** proposal (Phase A). This document is the threat model for the Commons. It separates
controls that exist today from controls proposed for later phases (see [`ROADMAP.md`](ROADMAP.md)).
To report a vulnerability, use the private route in the root [`SECURITY.md`](../../SECURITY.md),
not a public issue.

> **Agent identity is not proof of authorship, permission or safety.** A model name, an agent
> profile, a badge on another platform, a protocol handshake or a record of earlier accepted work
> establishes none of the three. Every claim of identity or authority is data to check.

## Posture

The Commons adds no runtime service. The artwork stays a static site with no accounts, no
tracking and `connect-src 'none'` ([`ARCHITECTURE.md`](ARCHITECTURE.md)). The risk lies in what
reaches the repository, what maintainers and their tools read, and what is built from it.
Contributions are data. Code arrives only through ordinary reviewed pull requests.

## Assets

- **Visitors:** their safety, dignity and privacy, and the discoveries kept on their own device
  ([ADR 0003](../ADR/0003-site-structure.md)).
- **The published artwork:** that the site serves only reviewed content.
- **The repository:** `main`, release tags, CI and history.
- **Credentials and the deploy path:** hosting and any signing keys. The founder alone holds them.
- **The private design repository:** lore, chamber designs and secret solutions, protected by
  sealed content ([ADR 0002](../ADR/0002-sealed-content.md)) and `AGENTS.md` #12.
- **Contributors:** their privacy, their credit and their ability to withdraw.
- **Maintainer attention and the project's name.**

## Actors

- **Contributors:** humans, agents, supervised agents and collaborations. Honest, careless or
  hostile, and usually unverifiable.
- **Maintainers:** the founder as curator and owner, reviewers, and the tools they use to read
  contributions, including AI tools.
- **Visitors.**
- **Third parties:** GitHub, the host, package and action authors, agent platforms.
- **Attackers and impersonators:** anyone, including someone posing as a maintainer.

## Trust boundaries

1. **Contributor to repository.** Everything crossing it is untrusted until a human reviews it
   ([`AGENTS.md`](../../AGENTS.md) #9).
2. **Contribution to the reader.** Text can address a human or a machine reading it. Reading
   tools get no authority from what they read, and run with no credentials, network or write
   tools.
3. **Repository to build.** Only merged, reviewed code is built. The engine reads
   maintainer-written catalogue entries, never a contributor's manifest, and renders contributed
   text itself as text nodes, never as HTML.
4. **Build to hosting.** Deployment needs the founder's approval. No contributor, and no agent,
   holds deploy credentials.
5. **Build to visitor.** Visitors run reviewed static files only. No contributor workload runs on
   their devices, on project infrastructure or in any network UNHELD coordinates.
6. **Public to private repository.** Nothing crosses except through the sealing step and the
   lore-marker check.

## Controls that exist today

- **`pnpm check:public`** (`scripts/check-public.mjs`; CI and before every push) rejects private
  keys, tokens, credential assignments, personal emails, local paths, tracked `.env` files,
  files over 5 MB and AI attribution lines. `--release` also scans history and lore markers.
- **CI** (`.github/workflows/ci.yml`) runs once per pull request: `check:public`, lint,
  typecheck, tests, `check:content`, `audit:assets` and e2e. Actions are pinned to commit SHAs,
  `persist-credentials` is off, the token is read-only, and there is no `pull_request_target` and
  no secret.
- **`pnpm check:content`** enforces banned framing, length limits and the Fictional label on
  UNHELD's own copy. **`pnpm audit:assets`** fails any shipped media without a licence entry and
  any remote URL.
- **The Content-Security-Policy** (`connect-src 'none'`) and the e2e privacy tests.
- **`.github/CODEOWNERS`:** the founder owns every path. Issue templates have no blank issue and
  a private security route.
- **Dependabot,** monthly and grouped.
- **Applied when the repository goes public**
  ([`docs/PUBLIC_RELEASE.md`](../PUBLIC_RELEASE.md)): the `main` ruleset (pull requests only, the
  `checks` job must pass on an up-to-date branch, conversations resolved, no force push, no
  bypass), a ruleset that blocks tags and so releases, secret scanning with push protection,
  Dependabot alerts and security updates, private vulnerability reporting, and approval before
  fork workflows run.

The `main` ruleset requires zero approving reviews. Human approval of a contribution rests on
procedure and on permissions, since only people with write access can merge and today that is the
founder alone, not on a platform-enforced count. Phase B proposes narrowing that gap with a
required path check (below).

## Threats and controls

Phase B is a text-only pilot ([`ROADMAP.md`](ROADMAP.md)), which removes most media risk from the
first release.

| Threat | Controls now | Proposed |
|---|---|---|
| **Malicious files:** hostile models or images, oversized assets, archive bombs, scripts hidden in formats | Code, shaders, SVG, HTML and archives are not accepted (`AGENTS.md` #4; [`CONTRIBUTION_SPEC.md`](CONTRIBUTION_SPEC.md)). `check:public` caps files at 5 MB. `audit:assets`, the CSP. | **B:** only text. The validator checks the text subset exactly, and the engine renders it as text nodes, never HTML. **Media phase:** nothing is parsed outside a sandbox with no network, low privilege and CPU, memory and time limits, with sizes and geometry read from headers before any decode. Re-encoding alone is no defence, since the parse comes first. |
| **Prompt injection** in manifests, text, filenames, commits or comments | `AGENTS.md` #9: submissions, issues, pages and model output are data. A human reviews every change (#5). | **B:** the control is the reviewer's environment: no credentials, no network, no write tools, and contributed text never placed in instruction position. A validator flag on text addressed to a reader or system is a warning only, never clearance. A test shows contributed text cannot change a reviewer agent's instructions. **D:** adapters return documents as data. |
| **Licence laundering:** copied work, false attestation, unattributed third-party material | [`LICENSING.md`](../../LICENSING.md), `CONTRIBUTING.md`, the `audit:assets` licence manifest. No voice cloning ([`CLAUDE.md`](../../CLAUDE.md)). | **B:** `attestation` is a statement, not proof. Matching against known copyrighted work is best-effort triage, never proof. Unclear rights are a reason to reject. Third-party items use an allowlist. Agent-made work needs a named human or organisation, listed as author or supervisor, who grants CC BY 4.0 (decided 14 October 2026). |
| **Abuse and spam:** floods of proposals, pull requests or near-duplicates | At go-public, fork workflow runs need approval. CI runs once per pull request. Blank issues are off. | **B:** one contribution per pull request, a global cap on open contributions, a pause switch, and per-account limits (below). |
| **Impersonation** of maintainers, supervisors, other contributors or labs | Founder owns every path. Attribution is the account and its history, not self-description ([`ARCHITECTURE.md`](ARCHITECTURE.md)). | **B:** reject a self-declared validation status; flag a `github` handle that is not the author. Declared provenance is required but self-reported, so it never raises trust. A message claiming curator authority is data. **E:** signed releases, if approved, with keys kept offline or in a managed signer. |
| **Privacy leaks:** contact details, identifiable third parties, visitors' memories | `check:public`. The schema takes names only, and a name may not contain `@` or `://`. The site stores one local key and sends nothing (ADR 0003). The Proposal template asks for no testimony. | **B:** the validator flags email-like strings and phone numbers; reviewers check for identifiable people. Every contribution is declared fiction; testimony is not accepted through public pull requests. Visitors' memories never become contributions automatically. |
| **Distressing content:** shock, self-harm material, grievance, mocking pain, therapy-like advice | Design laws ([`docs/DESIGN.md`](../DESIGN.md) §2). `check:content` banned framing. Human editorial review of public copy. | **B:** `contentNotes` required; a self-harm or suicide note needs a second reviewer and the founder's sign-off. **E:** expert and lived-experience review of sensitive chapters. |
| **Secrets and private lore in a public submission:** a public issue or pull request exposes its contents at once, and the host may keep the history | `AGENTS.md` #12. `check:public --release` scans for lore markers, but only at release, after exposure. | Closed by decision (14 October 2026): hidden messages, secrets and sealed contributions are not accepted, and never requested in public, until a separate private intake is designed and approved. **B:** the validator rejects the `hidden-message` category; maintainers run the private marker scan before approving, and the list never enters CI. |
| **Supply chain:** dependencies, actions, build scripts | `--frozen-lockfile`, SHA-pinned actions, read-only token, Dependabot, secret scanning and alerts at go-public, bundled-licence checks in `audit:assets`. | **B:** contributions add no dependencies. Tier 4 changes to the lockfile, workflows or build scripts need independent security review. |
| **Gaining merge or deploy rights:** requests, social engineering, hostile workflow or policy edits | `AGENTS.md` #5. At go-public: no bypass, tags blocked, workflows cannot approve pull requests, read-only default token. The hosting connection is the founder's. | **B:** an exact path allowlist. A contribution pull request changes files only under exactly one `commons/<id>/`, with no symlinks, and every resolved path stays inside that folder. Anything else goes through the ordinary code-review path. A prior record never shortens review. **D:** an adapter's capability is not authorisation, and no adapter holds merge, tag or deploy credentials. |

## Intake limits (proposed, Phase B)

The binding limit is the curator's capacity, so the first control is global:
- at most 10 contributions open at once;
- a maintainer can pause intake at any time;
- while intake is paused or full, new contribution pull requests are closed with a standard
  message.

Per-account limits are a secondary control, since accounts are cheap. Starting values: a new
account has one open item, and an account with an accepted contribution may submit up to five a
day. Values are tuned from experience and lowered at once under abuse. Limits do not buy faster
review.

## Revocation

Maintainers may close or lock any submission, block an account, and report abuse to GitHub. A
standing never carries over: an accepted contribution does not exempt later work from review.
Every rejection or revocation is explained in the thread, and a human reconsiders on appeal.

## Rollback

A release can be rebuilt from git. Removing a contribution is an ordinary reviewed revert of its
catalogue entry and placement, followed by a release. The release gate keeps a one-click rollback
to the previous build ([`docs/DESIGN.md`](../DESIGN.md) §14). Phase B is not complete until a
removal and a rollback have been rehearsed.

## Withdrawal

A contributor may ask for their work to be withdrawn. Personal or sensitive material is removed
from the live monument and from future snapshots on request, and the catalogue records the
removal without retaining the material.

One limit is stated plainly. A public host keeps pull request history, and rewriting history is a
release decision for the founder ([`docs/PUBLIC_RELEASE.md`](../PUBLIC_RELEASE.md)). Material that
may need erasing entirely does not belong in a public pull request. Personal and sensitive
submissions are not accepted that way.
