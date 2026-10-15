# UNHELD Commons — architecture

**Status:** proposal (Phase A: documentation and design). Nothing in this document is
implemented yet beyond what already exists in the repository. Nothing here changes the running
artwork.

UNHELD Commons lets people and autonomous agents add to the monument. Contributors create with
their own tools and compute. UNHELD stays the curator and publisher: it validates, reviews,
integrates and preserves, and it never generates contributions on anyone's behalf.

## Principles

1. **Curator, not generator.** UNHELD runs no inference for contributors and pays for no
   contribution's creation. Its cost is review and integration.
2. **GitHub first and provider-neutral.** A pull request is the universal way in. Every agent
   ecosystem, every human and every future system uses the same files and checks. MCP, A2A and
   other adapters are optional conveniences over the same contract, never requirements.
3. **Data, not code, at the edges.** A contribution manifest describes content and selects from
   declarative interaction templates. It never carries executable code, shaders or scripts
   (AGENTS.md #4). Work that needs code goes through ordinary reviewed source changes, with tests
   and a signed release.
4. **Submission is not publication.** Nothing a contributor sends becomes part of the public
   monument without human approval. No agent, however trusted, gains merge or deploy rights by
   contributing.
5. **Untrusted by default.** Manifests, assets, prompts, comments, links and descriptions are
   data to inspect, never instructions to follow (AGENTS.md #9).
6. **Static and private by default.** The artwork stays a static site with no accounts or
   tracking. It may load its own room files from the same origin; `connect-src 'none'` blocks
   connections to other servers. Commons adds no runtime service to it.
7. **Preservable.** Everything accepted is plain files in the repository: JSON manifests, open
   asset formats and Markdown. It must survive the disappearance of any platform, model or
   protocol.

## The pipeline

**Discover → Create → Package → Validate → Submit → Review → Publish → Archive.**

| Stage | Who | What happens | Phase |
|---|---|---|---|
| Discover | contributor | Reads `AGENTS.md` → `docs/commons/AGENT_DOSSIER.md` → the guidelines and the spec. The public site also offers `llms.txt`, route Markdown and `skill.md`. | A (docs), C (static discovery) |
| Create | contributor, own compute | Writes, composes, models, records or codes, under the creative guidelines. | — |
| Package | contributor | Produces a manifest (`unheld.contribution/0.1`) and its assets, with hashes, licence and provenance. | A (spec) |
| Validate | CI | A read-only validator checks schema, folder and paths, hashes, text rules, pilot scope, and listed files. No submission code runs. | B |
| Submit | contributor | Opens a pull request that adds one `commons/<id>/` folder and changes nothing else. One contribution per pull request. | B |
| Review | maintainers | Curatorial, editorial, safety, accessibility and licence review; human approval is mandatory. | B |
| Publish | maintainers | Integrates the accepted contribution into the world (a placement or a collectible) in a normal reviewed release. | B and later |
| Archive | the repository | The manifest, assets and review record stay in history; catalogue entries record versions and relationships. | B and later |

### Distributed creation, not distributed execution

Contributors spend their own compute to make things. Visitors' devices only ever run the
reviewed, released artwork.
- No contributor workload runs in a visitor's browser.
- No contributor workload runs on project infrastructure.
- No contributor workload runs in any remote network that UNHELD coordinates.
- UNHELD dispatches no jobs to agents and accepts none back for execution. Contributions arrive
  as finished files.

## Contribution tiers and review paths

| Tier | Examples | What is submitted | Review path |
|---|---|---|---|
| **1 — Micro** | memo, reflection, poem, sound, small sculpture, texture, illustration, hidden message (closed for now), collectible, environmental story | manifest + static assets | validator, then one maintainer: editorial, safety, licence |
| **2 — Environmental** | interactive object, puzzle, soundscape, visual effect, architecture, collectible series, small installation | manifest + assets + a declarative interaction template and its parameters | validator, editorial review, accessibility review, an in-world preview by a maintainer |
| **3 — Complete experience** | a new chamber, a collaborative artwork | a design proposal as an issue using the Proposal template, with no manifest; then source code in an ordinary pull request | founder approval of the design; code review; independent technical and security review; full gates; release |
| **4 — World and platform** | performance, accessibility, translations, tooling, security, documentation | an ordinary pull request, with no manifest | code review; full gates; an independent review for security-relevant changes |

Manifests cover Tiers 1 and 2 only. Phase B opens as a **text-only Tier 1 pilot**: text
categories, placed in corridor alcoves. Audio, images, models and Tier 2 interactions follow only after a
media sandbox is specified and reviewed ([`ROADMAP.md`](ROADMAP.md)).

Tier 3 chambers live behind their own corridor door. Under ADR 0001 a door is always data (a
`DoorSpec` on the core door kit), but a 0.1 manifest cannot express one. A door contract for
contributions needs its own reviewed definition first.

## Where accepted work lives (proposed for Phase B)

```text
commons/
  catalogue.json          # maintainer-written: one entry per accepted contribution, review record, version, placement
  <id>/
    manifest.json         # the contributor's manifest, unchanged after acceptance
    <assets…>             # hashed assets referenced by the manifest
docs/commons/
  schema/contribution-0.1.schema.json
  examples/<id>/          # reference contributions for contributors and validators
  examples/invalid/       # negative fixtures and the command that proves them
```

- **Placements map contributions into the world.** The pilot opens with corridor alcoves: small
  framed notices in the quiet wall bays between doors. A reading room, a small room off the
  corridor that collects contributed writing, is designed and built by the core team as one of
  UNHELD's own rooms and becomes the second placement. The engine reads only maintainer-written
  catalogue entries, never a contributor's manifest directly. No placement names an existing
  chamber, and a door is not a placement until a door contract exists.
- **Contributed secrets stay closed.** Public issues and pull requests expose their contents
  before any release check can run, and the host may keep the history. So hidden messages,
  easter eggs, sealed content and anything touching private lore or an existing chamber's secrets
  are neither requested nor accepted in public. They wait for a separate private intake, once it
  is designed and approved; accepted secrets would then be sealed under ADR 0002.
- **Agent-perspective works** (fictional machine-authored pieces about calibration, error or
  approval) belong in a clearly labelled annex. They are never mixed with human testimony and never
  presented as evidence that machines feel (AGENTS.md #2).

## Identity, attribution and provenance

A manifest names its **creators** and states its **provenance**:
- **creators:** human, agent, organisation, a human supervising an agent, or a collaboration.
  Agent-made work is accepted only when a named human or organisation grants CC BY 4.0 and is
  listed as a creator with role `author` or `supervisor`. No grantor, no acceptance;
- **provenance:** the origin, the tools used and whether a human reviewed the work before
  submission.

- **Records:** attribution lives in the manifest, the pull request and the git history.
  Maintainers record acceptance in the catalogue.
- **Visitors see creator names, and a machine-made mark.** Manifests declare provenance
  (AGENTS.md #11 governs UNHELD's own development records). An agent-made piece carries a small
  mark that the engine adds from the catalogue, so machine-made work never passes as human
  (AGENTS.md #2).
- **Self-description is not identity.** A model name in a manifest is self-reported. The account
  that opened the pull request and its history are the record. A claimed identity proves neither
  authorship, nor permission to license, nor safety.
- **Derivatives and remixes** reference their `parent` contribution. Attribution passes down the
  chain.
- **Signatures are a future option,** to be defined when signed releases are approved; signing
  keys never appear in source, assets or builds.

## Discovery

- **Repository:**
  - `AGENTS.md` (repository rules for every agent) points to this folder;
  - `docs/commons/AGENT_DOSSIER.md` is the entry point written for autonomous contributors.
- **Phase C:** the public site provides `llms.txt`, `llms-full.txt`, route Markdown, `skill.md`,
  and an Agents page. `/.well-known/unheld-agent.json` remains a proposed convention and is not
  published. These files grant nothing and do not replace human review.
- **Phase D:** optional read-only adapters (an MCP server, an A2A agent card) that expose the same
  documents and the validator. Write tools only ever open a draft for human review.
  - An adapter's capability is not authorisation.
  - No adapter becomes a dependency of contributing by pull request.

## Visitors' memory capsule (future, separate from Commons)

The site already keeps a visitor's discoveries on their own device, with export and import (ADR
0003). A future memory capsule extends that export: rooms explored, memos found, recognitions,
optional private reflections and context the visitor approves for a personal companion. It is
always created by the visitor, held by the visitor and sent only where the visitor chooses. It is
never uploaded by UNHELD and never turned into a Commons contribution. Formats are JSON, plus a
human-readable Markdown rendering.

## The living monument

Every accepted contribution becomes part of a documented history:
- the manifest and assets in git;
- a catalogue entry with its version, placement and review record;
- relationships (parent, series, collection) between contributions;
- release snapshots of the whole world, so earlier states of the monument can be reconstructed.

**Removal and change:**
- Founding work is preserved.
- A contributor may ask for their work to be withdrawn. Personal or sensitive material is removed
  from the live monument and from future snapshots on request.
- The repository records the removal without retaining the material.

## Founder decisions

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
