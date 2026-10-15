# Office stage variants

These twenty-three models are smaller runtime variants of the pinned asset library. `manifest.json` records each source id, source and output checksum, licence, dimensions, triangles, draws and texture memory. Original prop sources remain in `scripts/blender/props/`; the CC0 sources and their authors remain in `apps/web/src/assets/THIRD_PARTY.md`. Original works are © 2026 Asiri Dalugoda, CC BY 4.0. These variants adapt texture resolution and geometry packing.

Rebuild with the existing pinned glTF-Transform CLI, without adding a dependency:

```
pnpm exec gltf-transform optimize <manifest source> <variant.glb> --compress quantize --texture-compress webp --texture-size 256
```

For the distant archive's cardboard box, add `--simplify-ratio .15 --simplify-error .02`; for its worn bookcase, add `--simplify-ratio .2 --simplify-error .02`. There is no Draco, meshopt or KTX2 decoder at runtime. The variants use neutral catalogue ids and the shared reference-counted loader. A placement retains its source catalogue id; `stageModelId` selects the runtime variant. This keeps catalogue registration in the asset lane independent of Office behavior.

The desk, clock and small library props use the same command at `--texture-size 512`; the original props and archive variants use 256. Joining compatible primitives preserves appearance while reducing the number of draws.
