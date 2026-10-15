# ADR 0013 — The Apartment core stage set

- **Status:** proposed for maintainer approval.
- **Date:** 15 October 2026.
- **Applies to:** the core Apartment chamber, its existing corridor door, and its baked room asset.
- **Depends on:** ADR 0001 (corridor spine), ADR 0007 (stage-set spaces), ADR 0008 (baked indirect light).

## Context

The Apartment is a core chamber behind an existing corridor door. It needs a self-contained Blender-authored room, a bounded first-person view, baked diffuse light, and an accessible path that remains usable when WebGL is unavailable. The existing stage-set and bake contracts cover the rendering approach, but they do not register this chamber or its model and lightmap inputs.

## Decision

- Register `/apartment` as an authored core chamber behind its existing door. Its registry release flag remains off until founder approval: development builds open it, while production presents a sealed “not yet open” door and loads no room code. When approved, the door waits for the chamber's first ready 3D frame or its text fallback before opening.
- Build the room from committed Blender source under `scripts/blender/rooms/apartment/`. Export one optimised, compressed glTF model with separately named interaction nodes; use WebP textures and the existing quantisation path.
- Keep the hero corner legible at the threshold through the window–table–kettle triangle: a subdued cool window source, a visible warm kitchen practical and tight pools on the kettle and both cups, with low broad fill and layered warm shadow.
- Give matte putty plaster, muted painted timber, dark walnut and olive woven upholstery separate albedo, roughness and normal response. Keep the sofa seams, compressed loose cushion and folded throw readable in those light pools.
- Register Apartment as a bake space using one 2048×2048 indirect-light atlas. Source freshness includes the Blender source, the production chamber modules, and the committed model.
- Use a room-local stage adapter until the shared controller exposes the ADR 0007 `Stage` contract. Derive the yaw limit from the viewport field of view so the visible horizontal arc stays within 180 degrees, and reject movement beyond the walkable polygon and its furniture clearances.
- Keep each graphical action available through the room's DOM action list and text mode. Preserve captions, keyboard access, reduced motion, and the existing WebGL failure fallback.

## Consequences

- `apartment` becomes a supported bake-manifest space and a lazy room asset; its model and lightmap are checked by the existing build and asset gates.
- Geometry, materials, lights, or texture changes require the Apartment bake to be refreshed. Shared bake inputs still require the established room freshness checks.
- The stage adapter is temporary; migration to the shared `Stage` contract must preserve the same view and walk limits.
- Public chamber registration and bake-manifest changes require maintainer review before integration; the production release flag changes only after founder approval.
