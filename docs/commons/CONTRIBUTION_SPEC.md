# UNHELD Commons — contribution specification

**Status:** proposal, format `unheld.contribution/0.1`. The schema is
[`schema/contribution-0.1.schema.json`](schema/contribution-0.1.schema.json), a complete example
is in [`examples/lost-property-umbrella/`](examples/lost-property-umbrella/), and
[`examples/invalid/`](examples/invalid/) holds negative fixtures with the command that proves
them. Contribution pull requests open in Phase B, as a text-only pilot (see
[`ROADMAP.md`](ROADMAP.md)). Nothing has been accepted under 0.1 yet, so it may still change.

**Scope.** A manifest covers **Tier 1 and Tier 2 only**.
- Tier 3, a complete experience, is a proposal issue using the Proposal template. It has no
  manifest. Its code arrives later as an ordinary pull request, after the founder approves the
  design.
- Tier 4, world and platform, is an ordinary pull request with no manifest.

A contribution is a folder: one `manifest.json` and the assets it lists. The manifest is data.
It never contains or points to code that runs.

## The manifest

| Field | Required | Meaning |
|---|---|---|
| `schema` | yes | Always `unheld.contribution/0.1`. |
| `id` | yes | Kebab-case slug, 2–8 words, at most 64 characters, unique. It becomes the folder name `commons/<id>/`. |
| `title` | yes | 3–80 characters. |
| `summary` | yes | What it is and what a visitor experiences, 20–600 characters, plain words, for reviewers. |
| `tier` | yes | 1 micro or 2 environmental. |
| `category` | yes | One of the categories below, matching the tier. |
| `fiction` | yes | Always `true`. Every Commons contribution is invented work, and any first-person voice in it is invented. Consented testimony is never accepted through public pull requests. |
| `parent` | no | The `id` this derives from, remixes or extends. |
| `creators` | yes | 1–12 entries: `name`, `kind` (`human`, `agent` or `organisation`), `role` (`author`, `co-author`, `supervisor`, `remixer`, `translator`), optional `github` handle. A name may not contain `@` or `://`: no contact details. |
| `provenance` | yes | `origin` (`human`, `agent`, `human-supervised-agent`, `collaborative`), optional `tools` in your own words, `humanReviewed`, and a short `statement` of how it was made. |
| `licence` | yes | `content: "CC-BY-4.0"`, `attestation: true`, and `thirdParty` entries (each with a non-empty `asset`, `licence`, `source` and `attribution`) for anything not original. A manifest carries no code, so it has no code licence. |
| `assets` | yes | 1–32 files: `path`, `role`, `mediaType`, `sha256`, `bytes`. |
| `engine` | yes | `compatible: "0.x"` and a requested `placement` (`kind`: `corridor-alcove`, `reading-room`, `collectible` or `soundscape`). Maintainers decide the final placement. |
| `interaction` | no | One declarative `template` and only the parameters that template accepts (below). |
| `accessibility` | yes | `textAlternative` (the complete text-mode experience), `captions` for audio, `motion`, and `flashing: "none"`. Any audio asset requires at least one caption, each in square brackets and one to seven words long. |
| `contentNotes` | yes | Subjects a visitor may want warning of; an empty list when none. |

**Agent-made work** is accepted only when a named human or organisation grants CC BY 4.0 and is
listed as a creator with role `author` or `supervisor`. No grantor, no acceptance. The schema
checks that such an entry exists.

**Declaring provenance is required** of every contributor, human or agent, in `creators` and
`provenance`. It is the Commons provenance that the founder's scoped exception covers:
`AGENTS.md` #11 governs UNHELD's own development records, not a contributor's declaration about
their own work. Credit lines, trailers and session links stay out of commits, pull requests and
text.

### Placements and the machine-made mark

- **`corridor-alcove`** opens first: a small framed notice in the quiet wall bays between doors.
- **`reading-room`** is a small room off the corridor that collects contributed writing. The core
  team designs and builds it as one of UNHELD's own rooms, and it becomes the second placement
  when it ships.
- **`collectible`** and **`soundscape`** are defined for later phases. No placement names an
  existing chamber, and doors wait for a reviewed door contract.
- **The machine-made mark.** Visitors see the creator names. An agent-made piece also carries a
  small machine-made mark, so machine-made work never passes as human. The engine shows it from
  the catalogue whenever the manifest lists a creator of kind `agent`, or a `provenance.origin` of
  `agent` or `human-supervised-agent`. The contributor does not draw, place or suppress the mark,
  and no asset may imitate it. The rest of `provenance` is for reviewers.

**Validation status is not part of a submission.** Review outcomes are written only by
maintainers, in `commons/catalogue.json` (Phase B). A manifest that declares its own status, or
carries any field not in the schema, is rejected.

### Categories by tier

- **Tier 1:** memo, reflection, poem, sound, ambience, sculpture, texture, illustration,
  hidden-message, collectible, environmental-story.
- **Tier 2:** interactive-object, puzzle, soundscape, visual-effect, architecture,
  collectible-series, installation.

A Tier 1 manifest may not use a Tier 2 category, and the reverse.

### What the first release accepts

The Phase B pilot is deliberately small:
- **In:** Tier 1 text only (memo, reflection, poem, environmental-story), as a `text/markdown`
  asset, into corridor alcoves.
- **Out until a media sandbox is specified and reviewed:** audio, images, models and every
  Tier 2 interaction.
- **Closed until a separate private intake is designed and approved:** hidden messages, secrets
  and sealed contributions, and anything touching private lore or an existing chamber's secrets.

The format defines the later categories now so the schema does not change when they open.

## Assets

Each role takes only its own media type, and the schema enforces the pairing.

| Role | Media type | Limits |
|---|---|---|
| `text` | `text/markdown` | The text subset below. At most 2,000 words. |
| `audio` | `audio/ogg` (Opus) | 48 kHz, at most 90 s for a sound and 5 min for a soundscape, at most 4 MB. Peaks no louder than −3 dBFS. |
| `model` | `model/gltf-binary` | At most 30k triangles (Tier 1) or 120k (Tier 2), 4 MB, and 4 materials. No embedded scripts or extensions outside the engine's allowlist; no external references. |
| `texture`, `image`, `preview` | `image/png`, `image/webp` or `image/ktx2` | At most 2048 px on any side and 4 MB. Textures are powers of two. |

Not accepted: SVG, HTML, PDF, archives, executables, fonts, shaders, scripts, or any file the
manifest does not list. A contribution is at most 16 MB in total.

### The text subset

A `text` asset is exactly this, and nothing else:
- UTF-8, with no byte-order mark and no control characters other than newlines.
- At most one level-1 heading (`# Title`), and only as the first line, followed by a blank line.
- Paragraphs separated by blank lines. A paragraph is plain text on one or more lines.

The validator rejects, and never strips, everything else: HTML, links, images, emphasis, lists,
code, block quotes, tables and any other Markdown. In practice a paragraph contains none of
`<`, `>`, `` ` ``, `*`, `_`, `[`, `]`, `\`, `|` or `~`, and no line starts with `#` (after the
heading), `-`, `+`, `=`, a number followed by `.` or `)`, or four spaces.

The engine renders the subset with its own renderer, each paragraph as a text node. It never
passes contributed text to the browser as HTML.

## Interaction templates

An interactive contribution chooses one template the engine already implements and gives it
only that template's parameters. Templates are reviewed engine code. A contribution never brings
its own behaviour, and any other parameter name is rejected.

| Template | The visitor… | Parameters |
|---|---|---|
| `read` | reads a text in place | none |
| `inspect` | turns an object over to see its sides | `views` 1–6 |
| `listen` | chooses to listen to a sound | `loop` (true or false), `volume` 0–1 |
| `toggle` | switches something between two states | `labelOn`, `labelOff` (1–120 characters) |
| `rotate` | turns a wheel or dial through stops | `stops` 2–12, `revealAt` 1–12 and not above `stops` |
| `wind` | winds a mechanism that runs down | `turnsToPeak` 1–12 |
| `place` | puts an object somewhere | `slots` 1–6 |
| `find` | discovers something hidden by looking or waiting | `waitSeconds` 5–120 |

A template the engine does not have is a Tier 3 proposal, not a parameter.

## What validation will check

Two layers do different work.

**The schema** enforces structure: required fields, tier and category pairing, role and media-type
pairing, captions for audio (one to seven words each), no contact details in names, non-empty third-party fields,
per-template parameters and bounds, `fiction: true`, a named grantor for agent-made work, and
asset paths that cannot climb out of the folder. `examples/invalid/check.py` proves it now.

**The current read-only CI preflight** checks the reference sample and every negative schema
fixture, then checks any `commons/<id>/` package for the current text-only pilot. It validates
scope, folder/id match, symlinks, unlisted files, asset path containment, byte sizes, SHA-256,
UTF-8, the plain-text subset, word limit, web-address and email rejection, and mechanical
prohibited-framing patterns. It parses only JSON and text; no submitted file is executed.

The preflight does not decide whether a licence claim is true, whether content is emotionally or
editorially suitable, or whether a fictional voice could be mistaken for testimony. Human review
is required for every proposal. Media parsing and the complete package validator are not part of
this pilot. Later validation must also cover:

1. **The pilot allowlist (Phase B).** The schema is wider than the pilot on purpose, so the format
   does not change as later stages open. Until the founder opens a stage, the validator rejects
   everything outside the pilot:
   - any tier but 1;
   - any category but memo, reflection, poem and environmental-story, so `hidden-message` and
     every media category are rejected;
   - any asset role but `text`;
   - any placement but `corridor-alcove`, and `reading-room` once it opens;
   - any interaction but `read`.

   Each rule needs a Phase B fixture before the phase can exit: a Tier 2 manifest, a `sound`
   manifest, a `hidden-message` manifest, an `audio` asset, a `soundscape` placement and a
   `listen` interaction, each rejected for that rule alone.
2. **Folder and paths.**
   - A contribution pull request changes files only under exactly one `commons/<id>/`, and `<id>`
     matches the manifest.
   - There are no symlinks, every asset path resolves inside that folder, and no path repeats.
   - Every file in the folder is listed, and every listed file exists.
   - Anything else goes through the ordinary code-review path, not this one.
3. **Assets:** each SHA-256 and size matches, media type is confirmed from the bytes and not the
   name, and the limits in the assets table and the 16 MB total hold.
4. **Text:** the subset above, then the same content rules as UNHELD's own copy:
   - no diagnosis, cure or score framing;
   - no crisis instructions;
   - no forced disclosure;
   - no web addresses;
   - no AI tool credit lines;
   - first-person voices are invented (`fiction: true`) and never offered as a real person's
     account.
5. **Interaction:** `revealAt` does not exceed `stops`.
6. **Rights:**
   - `attestation` is a statement, not proof.
   - Third-party entries use allowlisted licences.
   - Matching against known copyrighted assets is best-effort triage and never clearance.
   - Unclear rights are a reason to reject.
7. **Lore boundary:** nothing in the contribution contains private lore markers (the maintainers'
   release check), and no secret's plaintext appears in a pull request.
8. **Media safety (after the sandbox exists):** parsing is the risky step, and re-encoding comes
   after it, so re-encoding alone is no defence. Media is parsed only in a sandbox with no network,
   low privilege and limits on CPU, memory and time, and dimensions and geometry are read from
   headers and rejected over budget before any decode. Phase B does not parse media.

Passing validation means only that a contribution is ready for human review.

## Review and acceptance by tier

| Tier | Route | Before review | Review | Accepted means |
|---|---|---|---|---|
| 1 | manifest pull request | validator green | one maintainer: editorial, safety, licence | a catalogue entry and a placement in a release |
| 2 | manifest pull request, after the pilot | validator green | editorial, accessibility and an in-world preview by a maintainer | as Tier 1, with the template configured |
| 3 | proposal issue, no manifest | the issue template | the founder approves the design; then code review, independent technical and security review, and full gates | the chamber ships in a release behind its own door |
| 4 | ordinary pull request, no manifest | full gates | code review; an independent review when security-relevant | merged like any change |

## Versioning

- **Identifier:** the format is identified by `schema`.
- **Additive changes** (new optional fields, categories or templates) raise the minor version
  (`0.2`), and the validator accepts older minors.
- **Breaking changes** need a new major version, a migration note and a validator that still
  reads every accepted manifest.
- **Accepted manifests are never rewritten.** Maintainers add catalogue entries instead.

## Example and fixtures

[`examples/lost-property-umbrella/manifest.json`](examples/lost-property-umbrella/manifest.json):
a Tier 1 memo for a corridor alcove, written by an agent and edited and approved by its
supervising human. It validates against the schema, its single asset conforms to the text
subset, and the asset's hash and size match.
[`examples/invalid/`](examples/invalid/) holds one negative fixture per rule the schema can
express.
