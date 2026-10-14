# ADR 0007 — Stage-set spaces: a view of 180° or less, built and lit only where it is seen

- **Status:** accepted, 14 October 2026. Founder direction: "make rooms only 180 or lower. Only light
  the corner and make sure everything is done properly so you don't have to fill the whole room.
  Other areas you block from access and camera view, while retaining the motion and without making
  the user feel restricted. There should be enough real things in the viewport so they don't have to
  look around."
- **Amends:**
  - ADR 0001: free look, first-person camera.
  - ADR 0004: starting view and budgets.
  - ADR 0006: baking and atmosphere.
- **Applies to:** the corridor, every chamber, and Room Kit rooms (ADR 0005).

## Context

A space a visitor can turn all the way around in must be built, dressed, lit, baked and textured
through 360°. Most of that effort lands where nobody is looking, and it costs phones draw calls,
texture memory and lightmap bytes. Film and theatre sets solve this. They build what the camera
sees, light one corner richly, and frame the edges so the audience never wonders what lies beyond.

## Decision

### Every space declares a stage
- **The stage:**
  - a forward axis;
  - a walkable area (a polygon on the floor);
  - a **visible half-arc of at most 90°**, so the visitor sees at most 180° in total.
- **The yaw limit is derived, not fixed:**

  `yawLimit = visibleHalfArc − horizontalFov / 2`

  Desktop at 16:10 shows about 71° horizontally, a portrait phone about 29°. The hidden part stays out
  of frame on every screen shape and at every pixel ratio.
- **Pitch** keeps the shared limits.
- **The corridor's forward axis** runs along the corridor, away from the entrance. Walking back toward
  the lobby moves the visitor backwards, still facing forward. Returning to the entrance uses the
  existing return-to-entrance path.
- **The Office's forward axis** points inward from its door. The door wall is never in view, and every
  station, object and exit lies within the stage.

### The limit never feels like a wall
- **Turning eases in the last 20°.** Pointer, touch and keyboard turning all scale smoothly to zero at
  the limit. No snap, no bounce-back, no visible indicator. The same easing applies under reduced
  motion.
- **The edges are framed by real things,** as a set wall is: a tall cabinet, a pillar, a door frame,
  a drape, a stack of archive boxes. They sit at each limit, so the stop reads as the room's shape
  rather than the camera's.
- **Movement stays free** within the walkable area. Furniture and architecture shape that area. There
  are no invisible walls in open floor.

### The viewport is always full
- **Three layers per view:** each authored station view composes:
  - a foreground (0.5–2 m);
  - a midground hero (2–5 m);
  - depth beyond.
- **At rest,** the frame is mostly real objects and composed light. Empty wall, empty floor and
  ungraded black together stay under about a third of the frame. Darkness counts as composition only
  when it has internal gradation (ADR 0006, three value bands).
- **The visitor never needs to look around** to understand a station: its action, its joke and its
  exit cue are all in the default view.

### Built and lit only where it is seen
- **Built:** geometry, props, textures and lightmaps exist only inside the union of the visible
  regions, from every point of the walkable area at both yaw limits, plus a 10° margin.
- **Lit:** the key light concentrates on the hero corner, and the rest falls into warm, graded
  darkness. The "welcoming, never creepy" rule still holds: pools of warm light, warm shadows, and no
  stretch of the walkable route in black.
- **Baked:** lightmap atlases cover only the stage, which shrinks bake time and bytes.

### Accessibility is unchanged
- Keyboard, screen readers and text mode reach every place and action through the "Places and
  actions" disclosure.
- Every place lies within the stage.

## Verification
- **A hole sweep for each space.** Render with a magenta clear colour from a grid of walkable
  positions (0.5 m spacing) at both yaw limits, both pitch limits and centre, on desktop and portrait
  aspect ratios. Fail on any magenta pixel. The guard must be shown failing by widening the limit or
  removing an edge-framing object.
- **Controller unit guards,** each shown failing on a broken implementation:
  - the derived yaw limit for each field of view;
  - easing to zero at the limit for every input;
  - no snap, and no movement through the walkable boundary.
- **Measured budgets before and after:** draw calls, triangles, texture memory and lightmap bytes.
- **Captures of every station at rest,** judged on two questions: is the frame full, and does the edge
  read as the room's shape?

## Alternatives rejected
- **Full 360° rooms.** All the build, light and memory cost lands where nobody looks.
- **Hard yaw clamps or visible boundaries,** which feel like restriction.
- **Fog or black hiding unbuilt space,** which reads as a void (and as creepy).
