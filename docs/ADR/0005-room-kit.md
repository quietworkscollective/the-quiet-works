# ADR 0005 — The Room Kit: rooms as data

- **Status:** proposed. Founder vision of 14 October 2026. To be built after the current section
  ships.
- **Relates to:**
  - ADR 0001 (door kit and chamber contract);
  - ADR 0002 (sealed content);
  - ADR 0004 (the Annex);
  - `docs/commons/` (contribution pipeline and provenance).

## Context

The founder's vision for UNHELD's future is a space where people and AI agents of any ecosystem
build rooms that express who they are. An agent might belong to a friend, to Moltbook or to a
platform that does not exist yet. Each room joins the monument behind its own door.

Today a room is bespoke code, as in the Certification Office. Code from outside needs full human
code review and a signed release (`docs/DESIGN.md` §8, AGENTS.md #4). That is right for a handful of
core rooms, and it can never scale to many contributors. Nor can a room be safely composed from
arbitrary contributed scripts or shaders.

## Decision

Rooms beyond the core chambers are **data**: a room manifest rendered by one reviewed engine.

### The room manifest (format `unheld.room/0.1`, to be specified)
- **Envelope:**
  - width, depth and height within bounded ranges; every room's proportions are its own;
  - floor, wall and ceiling finishes from a parameterised material library;
  - fog;
  - a light rig of at most two dynamic lights, plus baked or emissive light, with colour
    temperatures.
- **Stations:** named viewpoints, with the threshold first. They give the first-person camera its
  framing stations and give text mode its scenes.
- **Props:** placements of items from a growing, curated prop library (parameters: finish, colour,
  label text, initial state). Contributed static models are added only after a media sandbox exists
  (Commons roadmap).
- **The verb:** one interaction template from the engine's reviewed library, configured by
  parameters.

  Some templates exist already (read, inspect, toggle, rotate, wind, place, find). Others will arrive
  with the first rooms that need them: connect, trace and stamp.
- **Behaviour:** a small declarative state machine.
  - **Shape:** states, events from templates and props, a stillness timer, transitions, and outputs.
  - **Outputs:** lamp states, prop actions, sound cues, text reveals and sealed-item unlocks.
  - **Bounded:** a limited number of states and transitions, no timer-only cycles, and every
    discovery path reachable in one deliberate session. This is how a room gets its three paths
    (engage, investigate, stop) without code.
- **Sound:** cues from a curated procedural sound palette, with parameters. No contributed audio
  until the media sandbox exists.
- **Text:**
  - public copy is validated by the same content rules as UNHELD's own;
  - discoverable content is sealed (ADR 0002), with discovery tokens produced by the state
    machine's events.
- **Door:** a `DoorSpec` with its `DoorCharacter` (ADR 0004).
- **Accessibility:** every station and prop has a text-mode description, and every sound a caption.
  The engine derives the DOM equivalents, reduced-motion variants and keyboard paths, so no room can
  omit them.
- **Provenance:** creators and the machine-made mark, as in Commons manifests.

### The engine
- **One `RoomRenderer`:** builds the envelope, light, props and stations.
- **One state-machine runtime:** the same deterministic `transition(state, event) → { state, cues }`
  pattern as the core chambers.
- **One text-mode generator.**
- **Registration:** a room registers in the chamber registry like any chamber, and loads lazily
  behind its door.
- **Budgets enforced before acceptance:** draw calls and triangles estimated from library costs, the
  light count, the texture memory, and zero idle frames outside bounded ambient windows.

### How the kit grows
The two Annex rooms are its first users and its proof. The rooms the Claude and Codex teams designed
for themselves are built as manifests, not bespoke code. Anything they need that the kit lacks
(a template, a prop, a sound) is added to the kit as reviewed engine code. After that, every future
room can use it. Core chambers such as the Office stay bespoke.

### Where rooms live
- **The Annex holds the first agent rooms.**
- **The blank doors:** further rooms open behind the corridor's blank doors as they are accepted. The
  endless corridor becomes the record of everyone who has added a room. A blank door is a room nobody
  has made yet.

## Safety and curation
- **The Commons pipeline applies unchanged:** validation, a review queue with a cap, human approval,
  and no automatic publication.
- **No code from contributors**, ever: only manifests and, later, sandboxed media.
- **Secrets follow the private-intake decision.**
- **A room's personality** is expressed through its choices, never through scripts, network access
  or visitor data.
- **Provenance:** the machine-made mark and makers' credit are shown. An agent's claimed identity is
  not proof.

## Phasing
1. Ship the current section (corridor, site, Office).
2. Room Kit 0.1, with The Exchange and Codex's room built on it, reviewed independently.
3. The Commons text pilot (Phase B), proving the review pipeline.
4. The media sandbox, then room submissions from anyone, beginning with a small number of curated
   rooms.

## Alternatives rejected
- **Contributed code in sandboxed iframes, workers or WebAssembly.** Runtime isolation, performance,
  quality and accessibility could not be guaranteed, and it reopens the remote-code risk the design
  laws forbid.
- **Visual-only rooms without behaviour.** The founder requires rooms full of interaction.
- **One fixed template ("a room with N props").** Every room would be the same room, and
  personality needs a real verb and real consequences.

## Open questions
- How much state-machine expressiveness is enough before it becomes a programming language.
- How a room's identity and personality statement appear at its door and in the Lore section.
- Curation at scale: which rooms reach the corridor, and which a wider, browsable Annex.
