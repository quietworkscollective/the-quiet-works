# UNHELD Commons — roadmap

**Status:** proposal. The authorized discoverability work prepares Phase C files and a manifest
preflight. Phase B has not passed its entry gate, and no phase is complete until its evidence is
reviewed and the founder approves the gate. Gates are evidence, not dates; numeric thresholds are
proposals.

## Phase A — Documentation and design

- **Deliverables:** the six Commons documents (dossier, guidelines, specification,
  [architecture](ARCHITECTURE.md), [security model](SECURITY.md) and this roadmap); the schema, one
  example and the negative fixtures; pointers in `AGENTS.md` and `CONTRIBUTING.md`.
- **Entry:** the founder's directive of 14 October 2026.
- **Exit:** an independent review is recorded; the example validates and every fixture is
  rejected for its rule ([`examples/invalid/`](examples/invalid/)). Decisions 1 to 4 were taken on
  14 October 2026; only the annex is open.
- **Out of scope:** any backend, API, account system, production ingestion, change to the running
  artwork, or deployment.

## Phase B — GitHub-native contributions: a text-only pilot

- **Deliverables:**
  - `commons/` with a maintainer-written `catalogue.json`, and engine support for corridor
    alcoves, including the machine-made mark;
  - the package validator in read-only CI, with an exact changed-path allowlist: a contribution pull
    request changes files only under one `commons/<id>/`, with no symlinks and every resolved path
    inside it; anything else takes the ordinary code-review path;
  - the text subset, and an engine renderer that never emits contributed text as HTML;
  - a reviewer environment with no credentials, no network and no write tools, where contributed
    text is never placed in instruction position;
  - intake controls: at most 10 open contributions, a maintainer pause, and
    a standard message closing new pull requests while paused or full.
- **Preflight now present:** a read-only CI validator checks the reference sample and any
  `commons/<id>/` packages against the schema, text-only pilot scope, safe paths, hashes and text
  subset. This does not complete Phase B: the catalogue, exact changed-path gate, reviewer
  environment, intake limits, independent review, and rollback rehearsal remain outstanding.
- **Entry:** Phase A exit; the repository public with the controls in
  [`docs/PUBLIC_RELEASE.md`](../PUBLIC_RELEASE.md) applied; a private conduct contact in
  `CODE_OF_CONDUCT.md`; reviewers named.
- **Exit:**
  - the validator rejects everything outside the pilot: any tier but 1, any category but memo,
    reflection, poem and environmental-story, any asset role but `text`, any placement but
    `corridor-alcove` (then `reading-room` when it opens), any interaction but `read`;
  - it also rejects text-subset violations, path escapes, symlinks and duplicate paths;
  - each rule has a fixture (the pilot ones listed in [`CONTRIBUTION_SPEC.md`](CONTRIBUTION_SPEC.md))
    shown failing before it counts as a guard;
  - a test shows contributed text cannot change a reviewer agent's instructions, credentials or
    tools;
  - one contribution has travelled from pull request to release, with a removal and rollback
    rehearsed, and the pause and the cap have been exercised;
  - the validator, renderer and CI path have had independent security review.
- **Second placement:** the reading room, built by the core team under its own ADR, opens after
  the pilot's exit. It is not a contributor deliverable.
- **Out of scope:** audio, images, models and every Tier 2 interaction; hidden messages, secrets
  and sealed contributions (until a private intake is approved); testimony; accounts; hosted
  services; adapters.

## Phase C — Agent discovery

- **Prepared deliverables:** per-route HTML fallbacks and metadata; `robots.txt`, `sitemap.xml`,
  `llms.txt`, `llms-full.txt`, route Markdown pages, `skill.md`, and an Agents page; public GitHub
  proposal/manifest templates; a read-only CI preflight. The ordinary wildcard robots group allows
  compliant crawlers and blocks no site path. That preference does not grant a licence or settle
  training rights.
- **Entry:** Phase B exit; at least ten submissions reviewed, with recorded reasons, and no rule
  changes.
- **Exit:** the files are static and pass the build gates with the CSP unchanged; every sitemap,
  Markdown and skills link resolves; route HTML matches the text-mode descriptions; the files
  grant nothing. The work prepared for TQW-007 is not evidence that this entry or exit gate passed.
- **Out of scope:** any service, agent registry or identity scheme.

## Phase D — Agent interoperability

- **Deliverables:** optional read-only adapters (an MCP server, an A2A agent card) exposing the
  documents, schema and validator; one write tool that only opens a draft for human review; an
  update to [`SECURITY.md`](SECURITY.md) covering adapters.
- **Entry:** Phase C exit; recorded demand the pull request route does not meet; independent
  security review of the adapter design.
- **Exit:** no adapter holds a credential that can merge, tag or deploy; tests for prompt
  injection, forged identity and replay each shown failing against a deliberately weakened
  adapter; the pull request route works unchanged without them.
- **Out of scope:** treating capability as authorisation, remote execution, hosted compute.

## Phase E — Living creative ecosystem

- **Deliverables:** audio, images, models and Tier 2 interactions with their reviewed templates;
  remixing with recorded relationships; release snapshots and a migration route; collaborative
  installations; signed releases, if approved; the visitor memory capsule (a separate,
  visitor-held export); the annex, if ruled in.
- **Entry:** Phase C exit (D is optional), and for media and Tier 2 specifically, a **media
  sandbox** specified and independently reviewed: no network, low privilege, limits on CPU,
  memory and time, and header checks before any decode; review capacity for the added checks. The
  founder may bring media forward of C and D on the same gate.
- **Exit:** per feature, an ADR and the founder's approval. For the phase as a whole, the
  monument rebuilds from the repository alone, with no platform service, in a rehearsed restore.
- **Out of scope:** central visitor profiles, unreviewed publishing, distributed execution, and
  dependence on one model, vendor or protocol.

## Deferred discovery convention

An earlier `/.well-known/unheld-agent.json` sketch remains a proposed UNHELD-only convention and
is not published or read. This roadmap now treats static `llms.txt`, route Markdown, `skill.md`,
and the public Agents page as the discovery surface. No registry or standard agent card is claimed.

## Founder decisions

Repeated unchanged from [`ARCHITECTURE.md`](ARCHITECTURE.md), which is the source.

**Decided on 14 October 2026:**

1. **Provenance: a scoped exception.** AGENTS.md #11 governs UNHELD's own development records.
   Contribution manifests declare their provenance. In the artwork visitors see creator names,
   and an agent-made piece carries a small machine-made mark, so machine-made work never passes
   as human (AGENTS.md #2).
2. **Secrets stay closed.** Hidden messages, secrets and sealed contributions are not accepted,
   and not requested in public issues or pull requests, until a separate private intake is
   designed and approved.
3. **Rights in machine-made work.** Agent-made work is accepted only when a named human or
   organisation grants CC BY 4.0 and is listed as a creator with role `supervisor` or `author`.
   No grantor, no acceptance.
4. **Placement: the corridor and a reading room.** The Phase B pilot opens with corridor alcoves:
   small framed notices in the quiet wall bays between doors. A reading room, a small room off the
   corridor that collects contributed writing, is designed and built by the core team as one of
   UNHELD's own rooms, and becomes the second placement.

**Still open:**

5. **The annex** for agent-perspective works: should one open, and when? Until ruled, none is
   accepted.
6. **Crawler use policy:** the current wildcard `Allow: /` preference welcomes compliant search
   and agent crawlers, including crawlers that may use content for training. Decide whether to
   publish Content Signals or crawler-specific training restrictions; crawl preference is not a
   licence grant.
7. **GitHub review label:** create `commons:human-review` in repository settings so the room
   proposal form can apply it. The repository files cannot create hosted labels, and CI remains
   read-only.
