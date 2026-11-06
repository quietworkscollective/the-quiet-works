# ADR 0015 — Tomorrow Engine stage set

- **Status:** proposed for maintainer approval.
- **Date:** 17 October 2026.
- **Applies to:** the Tomorrow Engine chamber stage, its existing corridor door, and its baked room assets.
- **Depends on:** ADR 0001 (corridor spine), ADR 0007 (stage-set spaces), ADR 0008 (baked indirect light), ADR 0013 (Apartment stage-set implementation).

## Context

Tomorrow Engine needs a self-contained, authored half-stage that can be inspected from several accessible stations, uses baked diffuse light, and remains usable through its text controls if WebGL is unavailable. Its existing corridor door and the shared door interaction already define the threshold contract.

## Decision

- Register the chamber behind the existing steel-insertion door family. Open the route in development for authored review; keep `releaseOpen` false so production presents the sealed door and does not load chamber code.
- Build the stage from committed Blender source under `scripts/blender/rooms/tomorrow-engine/`. Keep the envelope, opening edge, floor and room objects in one self-contained model with named action targets and separately named moving parts.
- Keep the existing door shell behind the cameras; the engine frontage is the only visitor-facing set. The landing is structural foreground, not a navigable polygon.
- Use four fixed inspection stations—Winding control, Date display, Carriage and Service hatch—with the approved desktop and phone camera positions and vertical fields of view. The visible sector is 60 degrees inside the 180-degree stage; visitors do not walk, orbit or yaw.
- Keep the fixed station cameras at the approved coordinates: Winding control `(0,1.35,1)→(0,1.25,4.2)` / phone `(0,1.35,0.4)→(0,1.25,4.2)`; Date display `(0,1.3,2.4)→(0,1.3,4.3)` / phone `(0,1.3,1.8)→(0,1.3,4.3)`; Carriage `(0,0.95,2.6)→(0,0.95,4.2)` / phone `(0,0.95,2)→(0,0.95,4.2)`; Service hatch `(0.55,1.05,2.3)→(0.55,1.05,4.3)` / phone `(0.55,1.05,1.6)→(0.55,1.05,4.3)`.
- Keep baked diffuse lighting in a separate bake space. Moving parts are excluded from receivers; the room bake must use the same committed-source and runtime-geometry freshness checks as existing rooms.
- Use a near-black `#100c08` background with zero hemisphere fill and three supported practical fixtures. Bake the warm pools; do not add doorway fill, broad point lights, dust or floating props.
- Keep every object action available through named DOM controls, keyboard and touch, captions and text fallback. Honor mute, reduced motion and the existing WebGL failure path. Every visible mesh has a named action target; the physical door shell has none.
- Keep the authored chain and optional fittings in the shared `unheld.v1` store as script version 6 state. Findings remain title-only in the room archive; the Office comparison reads the existing `office-expired-approval` finding without writing an Office duplicate.
- Remove the corridor door's `DO NOT STOP` stencil and `PLANT 02 · 1928` code plate. Keep the steel-insertion family and a permanently visible Leave control.
- Keep the provenance review status pending founder review. Text inside the chamber remains subject to editorial review before release.

## Consequences

- `tomorrow-engine` becomes an authored-only chamber and bake space. It remains sealed in production until the release flag is approved.
- Model, stage, light or authored copy changes require a Tomorrow Engine bake and review. The door inscription removal requires a corridor bake as well.
- The stage adapter is room-local until the shared Stage contract is available; it uses the same authored frames on restore and has no walk bounds or camera-yaw state.
