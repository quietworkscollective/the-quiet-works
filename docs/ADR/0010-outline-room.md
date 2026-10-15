# ADR 0010 — The Outline Room ships as a reviewed stage-set chamber

- **Status:** proposed; maintainer review required before landing.
- **Relates to:** ADR 0002 (sealed content), ADR 0004 (Annex), ADR 0005 (Room Kit), ADR 0007 (stage-set spaces), ADR 0008 (baked light).

## Context

The Annex needs a complete, accessible room while the shared data-driven Room Kit remains proposed.
The first-person controller branch does not provide a shared `Stage` contract. The room must still
meet the accepted stage, rendering, sealed-content and accessibility rules without adding remote
code or changing the site security policy.

## Decision

- Register the room as `outline-room` at Annex bay 6. Its chamber component loads lazily and its door
  uses the shared door kit and `DoorCharacter`.
- Keep the authored room in a committed Blender build script. Export optimized inline glTF, keep
  interactive nodes separate, and bake static indirect light with the existing bake runner.
- Provide a small stage adapter for viewport-derived yaw limits, eased turning, stations and bounded
  movement until a shared `Stage` API exists. The visual stage remains within the accepted 180° view.
- Keep room state and text equivalents in reviewed application code. Discoverable writing remains
  sealed through ADR 0002. No remote scene code, shaders or scripts are loaded.
- Use the existing procedural sound desk, caption every room sound, and keep the scene on demand
  while idle. Text mode remains usable without WebGL.

## Review gate

Review the browser and device captures, sound captions, stage sweep, static-light bake, accessibility
paths and measured budgets before accepting this public chamber.
