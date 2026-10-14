# ADR 0004 — The corridor's character, life and things to touch; the Annex

- **Status:** accepted. Founder feedback after walking the corridor (14 October 2026), art consult 5,
  and the founder's direction that agents may personalise freely and build their own rooms.
- **Amends:** ADR 0001: door variety, the starting view, and "zero idle frames" (now bounded
  ambient windows).

## Context

The founder walked the built corridor and found it beautiful but too still and too uniform:
- doors not colourful or individual enough;
- the notice board hard to find;
- no sign of what can be clicked;
- nothing on walls or floors to touch;
- a hero that read as a still image.

The direction is welcoming but sombre, never horror, with objects that speak to many experiences of
masculinity, including a trophy cabinet and sports gear.

## Decision

### Door character
**The idea.** A century of departments modifying one institution.
- **Layers:** each door combines five to seven visible layers, with only two competing for
  attention:
  - paint and finish (one dominant colour on 55–80% of the leaf, a secondary on 10–25%);
  - frame (retained oak, painted timber, steel insertion or ceremonial double);
  - one principal lock plus at most one more;
  - an optional external lamp wash of 2700–3600 K;
  - foliage (on two doors at most);
  - one maintenance history (repainted, repaired, polished or neglected), with 2–12% of substrate
    exposed;
  - zero to three marks (stencil, decal residue, carving, stripe or notice), under 8% coverage
    together;
  - wear where hands and feet go;
  - one design motif.
- **Coherence:** at least 70% of the visible envelope keeps the shared plaster, oak and terrazzo
  palette, and strongly coloured doors sit beside quieter neighbours. Plaque heights, typography and
  thresholds stay shared.
- **The data:** each chamber's door declares its character in its `DoorSpec`, and nine authored blank
  doors carry theirs in `layout.ts`. The colours come from art consult 5.
- **Colour:** restored by the weak 4300 K fill already specified, not by more saturated paint.

### Ambient life
- **The motions:** ten small mechanisms, each explained by an ordinary cause:
  - a slow lobby fan;
  - a notice corner lifting in its draught;
  - dust in one lamp's light;
  - a clock's second hand;
  - a plant stirring;
  - a loose fixture tag;
  - radiator shimmer (desktop only);
  - a hand-made mobile;
  - a soft window reflection;
  - one drip after watering.
- **Limits:** at most three run at once. They render in bounded windows (at most 6 s each), never
  while hidden or offscreen, and not at all under reduced motion. This replaces ADR 0001's "zero idle
  frames" with "no frames except bounded ambient windows".
- **Never:** autonomous door movement, flicker, breathing lamps, or anything implying an unseen
  occupant.
- **The hero:** shows the fan from the first frame, a paper corner lifting within 4 s, and dust within
  8 s.

### Things to touch
- **The set:** twelve props in the lobby and three composed groups across the bays. They are:
  - a trophy cabinet and a team photograph;
  - a watering can;
  - a repaired football;
  - a cricket bat and scorebook;
  - folded team shirts;
  - walking boots;
  - a repair kit;
  - a bicycle wheel;
  - a recipe drawer;
  - a chess position;
  - a mended work glove.
- **Balance:** competition is about a third of the set; care, play and making share the rest. Not
  every object is evidence of failure.
- **Text:** six short institutional labels and the trophy inscriptions are drafts for editorial
  review (`CORRIDOR_PROPS`).
- **The route:** props never block the 1.5 m walking route.

### Interactive cues
- **Ivory fittings:** every usable object shares a small ivory pull, tab or label edge, where the hand
  would act.
- **Idle:** one soft highlight on the board's brass pin at hand-over. After that, one nearby actionable
  object glints for 600 ms every 18–25 s, at most about 8% local brightness, and never under reduced
  motion.
- **Hover and focus:** hover lightens the fitting and shows one DOM verb label. Focus adds a steady
  2 px indicator.
- **Cursor:** the pointer cursor appears only on valid targets.
- **First visit:** a single dismissible hint per visit.
- **Touch:** the first tap frames the object; a visible verb acts.
- **Blank doors** offer nothing. **Sealed doors** say "Inspect door, not yet open".

### Starting view
- **The lobby** deepens to z = 11 m, and the board swivels 15° toward the entrance.
- **Free walking** begins further back, with both the board and the corridor in view. The candidates
  are 0.35 m / 6.5 m / −12° / −2° on desktop and 0.45 m / 9.4 m / −9° / −1° on a portrait phone.
- **Verification:** the camera lane checks these in real frames, adjusts them within 0.5 m and 5°,
  and re-authors the walk-in so it arrives there without a snap.

### Surprises (within the idea and the budget)
- An office-hours card on the board that follows the visitor's own clock ("Office hours: closed.
  Come in anyway.").
- A radiator that knocks twice, politely, when the visitor stands beside it (with a caption).
- The trophy cabinet's last space, "Reserved".
- The watering can's one drop, and a bicycle wheel that spins down.
- A chess piece that can be moved, and resets.

None of these is a reward, a score or a secret. Secrets stay sealed (ADR 0002) and designed
privately.

### The Annex
At the far end of the walkable corridor (bay 6), a small Annex holds rooms made by AI agents.

- **Its doors:** two doors under an enamel sign marking them as machine-made rooms. The first two
  rooms are designed and built by the two agent teams that build UNHELD, each choosing what to show.
- **Their status:** they are Commons-style agent works under the founder's scoped exception (AGENTS.md
  #11). They carry the machine-made mark and their makers' credit, and never present machine
  perspectives as human testimony or as evidence that machines feel (AGENTS.md #2).
- **Their designs:** private. Their doors arrive as data on the shared door kit; their rooms follow
  the same budgets, accessibility and text-mode rules as every chamber.
- **Timing:** built after the current section ships.

### Budgets
- **The whole corridor:** at most 125 draw calls and 210k triangles, measured in the richest view.
  New doors and props get about 25 draw calls and 45k triangles.
- **Lights and shadows:** at most six dynamic lights, no shadow maps.
- **Download:** the initial download stays at most 3 MB compressed.
- **Construction:** hardware is shared and marks are atlased.

## Verification

- **Unit and e2e guards** for door character data, ambient window limits (concurrency, duration,
  none when hidden, offscreen or under reduced motion), cue timing, prop actions and their DOM
  equivalents, and the starting view framing both the board and the corridor (e2e on desktop and
  Pixel 7).
- **Measured budgets** in the richest views.
- **Screenshots** at hand-over and of every door and prop group, reviewed by the lead and the art
  consultant.
