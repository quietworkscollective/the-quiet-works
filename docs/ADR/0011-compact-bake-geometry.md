# ADR 0009 — Compact baked geometry for the corridor startup budget

- **Status:** proposed, 15 October 2026. Maintainer approval requested in the stream report.
- **Supersedes:** the geometry-precision sentence in ADR 0008 while this proposal is under review.

## Context

The initial corridor download includes the compressed receiver geometry needed to bind its baked lightmap. Adding the scanned corridor furnishings raised that initial graph above the 3 MB first-visit ceiling, even though the model textures and renderable models themselves load after the visitor starts the walk-in.

The existing split step also encountered tiled `TEXCOORD_0` values outside the glTF unit range. Quantizing those values directly skips them, so the output must retain their per-mesh range and restore it before the geometry is bound.

## Decision proposed

Use 12-bit position, 8-bit normal, 16-bit texture coordinate and 8-bit colour quantization for baked glTF geometry. Pack out-of-range `TEXCOORD_0` values to normalized 16-bit values and store the original `[minU, maxU, minV, maxV]` in node extras. Restore that range before cloning the receiver geometry. Keep the glTF quantization extension as the only required geometry extension; the browser continues to use its built-in decoder and makes no fetch.

The unit guard limits position-bound error to 13 mm over a 100 m span and normal angular error to 0.015 radians. A split/restore test separately checks tiled UV error below 0.00013. The baked scene fingerprint remains based on source geometry, materials and lights, independent of this storage encoding.

The corridor's real-model dressing stays out of the first interaction's model payload. The bake manifest records those static receiver IDs in `lazyMeshes`; the bake generator places their one-mesh GLBs behind a second dynamic import. The landing binds only required architecture receivers and does not fetch or parse the deferred geometry. Once dressing has mounted, the scene loads those chunks and rebinds with an exact full receiver set. The full manifest geometry and lighting fingerprint is checked on both bindings, every currently mounted receiver must be fingerprinted, and no absent receiver is accepted unless the manifest lists it as lazy. The post-load binding disallows omissions.

## Consequences

- Re-encoded geometry is smaller while retaining the existing lightmap, draw-call and triangle budgets.
- Runtime and build code must continue to agree on the `tqwUv0Range` extra until the format is intentionally migrated.
- Runtime and build code must agree on the `lazyMeshes` list and its separate dynamically imported geometry chunks; it is limited to the corridor's deferred dressing, and a full bind is required after those models mount.
- A failure of the error guards, a change to this metadata or another encoding change requires maintainer review and updated measurements.
- Roll back the encoding, runtime restoration and generated geometry together; keep the source scene and lightmap manifest consistent.
