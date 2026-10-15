# ADR 0008 — Static indirect light maps for the corridor and Office

- **Status:** accepted, 14 October 2026.

The corridor and Office need indirect diffuse illumination and contact occlusion without additional runtime light passes. A development-only scene export supplies the current runtime geometry and light metadata to Blender 5.2.2 LTS. Static is the default; moving ancestor groups carry `userData.bake = 'dynamic'`. Transparent and unlit meshes keep their existing renderer path.

Cycles bakes indirect diffuse without albedo or direct illumination. Irradiance divided by a recorded per-atlas maximum is encoded through the sRGB transfer curve in an 8-bit WebP. Standard sRGB texture decoding preserves dark bands. Standard material `lightMapIntensity` restores that maximum; the map uses sRGB colour space, single-level linear filtering, and UV channel 1. Authored material lightmap gains remain separate from the calibrated conversion. No decoding shader, fetch, WebAssembly or security-policy change is required. AO is evaluated separately and ships only if captures justify its memory and byte cost.

Baked geometry is parsed from an inline gzip-compressed glTF import, expanded through the browser's built-in DecompressionStream, with no texture references or external buffers. The live mesh retains its material, events and transform. Geometry IDs use the complete source geometry and world matrix, not Blender vertex ordering. A source-byte fingerprint verifies bake freshness before release; runtime geometry IDs remain separate. Atlas size and compressed-byte ceilings are enforced before assets are written.

Physical point-light conversion uses radiant power equal to intensity times 4π; spotlights require their angular falloff and directional lights require irradiance. The corridor's existing softened analytic lamps have no exact physical-unit equivalent: a documented reference-distance conversion is an approximation and must not be reported as calibrated physical equality.

Both full and lite tiers load and bind baked assets. The lite corridor keeps its cheaper Lambert shading while using its lightmap channel; it still bypasses the finishing stack. Every geometry, cloned material, image texture and loader-created material belongs to one mount and is disposed on unmount, including loads completing after cancellation. Pending assets leave the existing scene visible; replacement is atomic after all assets load.

The corridor atlas uses 1760×880 pixels to stay below the 400,000-byte WebP ceiling after the Annex doorways were installed, while preserving the enforced near-camera density floor of 16 texels/m. Chart allocation targets 24 texels/m near the camera; the rebaked manifest records measured density.

The corridor publishes visual readiness after its first completed baked draw, so initial texture upload and shader compilation cannot arrive after the world is reported idle. Camera telemetry starts after this readiness signal; camera input and movement remain unchanged. A loading failure retains the original scene as a usable fallback; `bake=off` is reserved for comparison captures.

Acceptance requires measured calibration, visual review on desktop and mobile emulation, atlas density and padding evidence, red/green regression guards, and unchanged or lower scene draw/light/triangle counts. Device performance remains a hardware release gate.

Moving meshes remain default-pose occluders/reflectors; moving lamps contribute baseline indirect light. Static runtime identity and the default-pose freshness fingerprint are separate, so interaction state never rejects an otherwise fresh bake. This baseline approximation and authored material gains require visual approval.


## Portable freshness amendment — 15 October 2026

Following the approved CI repair direction, release freshness uses the committed source-file fallback. `scripts/bake/inputs.mjs` declares the room and shared source scopes; `scripts/bake/README.md` documents the exact list rules, canonical framing and frozen font inputs. The manifest records `sourceHash`. Checks require an exact match and the expected atlas encoding, and fail if that field or an input is missing. Geometry, material numbers, canvas drawing instructions and imported image/model/font bytes participate through their authored sources. Rendered output, local time, locale and host paths do not. The gate runs in both tests and builds without browser startup. Existing geometry IDs and runtime rebinding are unchanged. Rollback must revert the gate and both manifests together.
