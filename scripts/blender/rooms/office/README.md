# Office model production

All units are metres, glTF Y-up. The room's placement module supplies world poses; the models supply
geometry and named motion pivots. Runtime inscriptions remain separate canvas overlays.

From the repository root, with the frozen dependencies and Blender installed:

```sh
node scripts/blender/rooms/office/mechanics/run.ts --work /tmp/office-mechanics --preview
node scripts/blender/rooms/office/architecture/run.ts --work /tmp/office-architecture --preview
node scripts/blender/rooms/office/pack-stage.mjs
node scripts/blender/rooms/office/register.ts
node scripts/blender/rooms/office/pack-downloads.mjs
pnpm bake office
```

The first two commands rebuild the seven original hero models. Private scratch holds source exports,
Blender files, uncompressed maps and optional previews. WebP maps and quantised normals/UVs ship in
plain glTF; no runtime decoder is required. Moving empties keep float positions and authored pivots.
The pack command caps passive background detail and derives the distant bay from the full bay.
Registration measures shipping bytes, geometry, textures and checksums. Licence: CC BY 4.0; author
and licence text are recorded in the local catalogue. Rollback: revert the model/binding changes and
restore the matching bake together.

The desk top is the apparatus datum: local Y=0, ground Y=-0.82. Its six drawers remain named nodes;
the Office's existing drawer action operates `drawer_right_1`. The press carriage travels 65 mm,
and its two spring morphs preserve wire thickness while compressing. The casing uses a 5 mm local bevel, measuring 8.5–14.5 mm after the deployed scale. The machine retains its
existing component transform and nonuniform scale. Hatch, display, receipt and paper openings share
the runtime layout. The board's fifth socket has no lamp.

`heroRig.ts` owns mutable instances and materials. Shared geometry/textures remain with the visit's
reference-counted asset handles. Moving descendants are excluded from both static baking and fitting
batching. Catalogue dressing retains its model-authored occlusion and live lighting, and contributes
to the room bake as an occluder rather than duplicating repeated geometry in the download. Invisible hit targets, accessible actions and discovery state remain independent of models.

The Office bake uses 128 samples with an indirect contribution clamp of 1 to suppress isolated
bright paths that otherwise consume an 8-bit atlas's range. The archive atlas is 1152 square;
measured density must still pass the existing 8 texels/m floor. Direct illumination remains live.

Download packaging uses native gzip decompression in memory. Canonical GLBs and all decoded image/geometry bytes are preserved; the local manifest measures the shipped gzip files. No fetch or decoder dependency is added.
