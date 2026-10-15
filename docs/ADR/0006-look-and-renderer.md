# ADR 0006 — The look: real assets, baked light, one finishing pass, and WebGL for now

- **Status:** accepted, 14 October 2026.
- **Founder direction** after walking the built Office and corridor:
  - "the room floor and the wider room look visually empty… too dull";
  - "get ready-made textures and ready-made furniture… don't try to reinvent the wheel… make it look
    like a real room";
  - "multiple layers of darkness and a little bit of smoke so it looks real";
  - "try using WebGL or WebGPU, investigate latest tech";
  - "let's get Blender and do it fully".
- **Amends:** `docs/DESIGN.md` §8, the stack table's 3D assets row, which allows Draco/meshopt and KTX2 textures. This ADR uses WebP textures and quantised geometry instead.

## Context

Every surface and object was procedural geometry with canvas-generated textures, lit by at most six
dynamic lights with no shadow maps and no post-processing. Art consult 6 diagnosed the dull read, in
order of impact:
1. light that does not connect objects (no bounce, no contact);
2. a flat value structure (one black);
3. weak material response and razor-sharp edges;
4. permanent controls competing with the scene;
5. empty floors and walls.

Two constraints shape every option:
- **The content security policy** (`connect-src 'none'`, no WebAssembly) forbids fetching files at
  runtime and forbids WebAssembly decoders.
- **Rendering on demand,** with zero frames while idle except bounded ambient windows (ADR 0004).

## Decision

### Renderer: WebGLRenderer for this section
Research on three r186 found:
- under `WebGPURenderer`, the corridor's and the Office's shader customisation never runs, and every
  `EffectComposer` pass is rejected as incompatible, on both of its backends;
- the effects it adds (screen-space GI, raymarched volumetrics, god rays, TRAA) either exceed a
  mid-range phone's budget or depend on temporal accumulation that on-demand rendering does not
  provide;
- bugs affecting Safari and many-light scenes are fixed only in r187;
- the test browsers' flags make it fall back to WebGL2 silently, so tests would not exercise the path
  most visitors get;
- about a quarter of visitors cannot use WebGPU, so a WebGL2 path is required regardless.

**Revisit at r187 or r188,** when all of these hold:
- the release contains the fixes;
- a two-day spike ports one slice to `WebGPURenderer` and matches or beats WebGL on three real phones
  (iOS, ARM or Qualcomm Android, Exynos);
- the founder sees an effect worth maintaining a second path for;
- CI runs a WebGPU backend with its own baseline.

Until then, keep migration cheap:
- custom shader code lives in one module per space;
- renderer-specific calls sit behind one small module;
- new atmosphere pieces prefer standard materials.

### Assets: licensed and original, not procedural only
- **Third-party:** CC0 first (Poly Haven, ambientCG). CC BY 4.0 only with the attribution recorded.
  Every asset is recorded in a manifest with source, author, licence and checksum.
- **Rejected:** non-commercial, no-derivatives, editorial or store licences; unclear provenance; and
  AI-generated 3D output, whose licence terms cannot support a CC BY release.
- **Gaps** (trophies, the service bell, radiators, a filing cabinet, the cricket set, ledgers) are
  modelled in Blender as original work under the project's CC BY 4.0. Each model's source is the
  script that builds it.
- **Pipeline:** files are optimised with glTF-Transform (WebP textures, quantised geometry), with no
  Draco, meshopt or KTX2, because their decoders are WebAssembly.
- **Loading:** models arrive as lazily imported modules parsed in place, and textures as images. The
  page never fetches, and the security policy is unchanged.

### Light: baked in Blender, direct light stays live
- **The bake:** Blender (5.2.2 LTS, headless, scripted) bakes each space's indirect diffuse light and
  ambient occlusion into lightmaps. The runtime's dynamic lights keep providing direct light and
  specular, so nothing is counted twice.
- **One command per space** (`pnpm bake <space>`). A staleness check fails when a space's static
  geometry no longer matches its bake.
- **Budgets:** corridor lightmaps at most 0.40 MB in the initial download; the Office's loaded with the
  Office.

### Finishing: one merged pass
- **The passes:** pmndrs `postprocessing` (Zlib) renders the scene once. Then:
  - N8AO (ISC) adds half-resolution ambient occlusion from that pass's depth, on the desktop tier
    only, without a second scene render;
  - one merged effect pass applies bloom (only lamp cores), ACES tone mapping exactly once, a grading
    LUT generated in code, vignette (never on the landing), grain (frozen between frames and off under
    reduced motion) and dither against banding in dark gradients.
- **Phones** get tone mapping, grade and dither. **Software renderers** bypass the stack entirely.
- **Budget:** fullscreen passes do not count against a scene's draw-call ceiling, which measures scene
  complexity, but the whole stack must fit 4 ms on desktop and 1.5 ms on a phone.

### Atmosphere: layered darkness and a little haze
- **Darkness** in each space keeps at least three value bands (lit route, dim recess, deep distance),
  never one flat black.
- **Haze:** soft additive lamp cones, slow haze cards, dust in light and height-fog layering add a
  little visible air.
- **Limits:** at most two draw calls per space. Motion only inside bounded ambient windows; none under
  reduced motion.

### Controls: contextual, not floating
No permanent panels over a scene.
- **When cues appear:** a verb appears when the visitor is within about 2.2 m of something and
  looking at it (25° half-angle). It fades in after 250 ms and fades out beyond 2.7 m or 35°.
- **What stays:** Back, Sound, one "Access & controls" button, and the phone's forward and back
  controls.
- **Keyboard and screen readers** reach every place and action through a "Places and actions"
  disclosure.

## Alternatives rejected
- **Migrating to WebGPURenderer now,** for the reasons above.
- **Fetching assets at runtime** by relaxing `connect-src`. Inline modules keep the stronger
  guarantee that the page makes no requests.
- **WebAssembly decoders** (Draco, meshopt, KTX2), which need `'wasm-unsafe-eval'`. WebP and quantised
  geometry are small enough.
- **Gaussian-splat worlds:** the smallest official room measured 7.7 MB, and splats offer no
  interaction.
- **AI-generated 3D for shipped assets,** for licensing reasons. It remains usable for blocking out and
  reference.

## Verification
- **Per lane:** red-then-green unit guards for:
  - manifest completeness and licences;
  - reference-counted disposal;
  - the no-fetch loader under the real policy (zero violations);
  - lightmap staleness;
  - light-unit calibration;
  - tone mapping applied once;
  - zero idle frames with the stack mounted;
  - tier contents.
- **Captures:** before and after on desktop and Pixel 7, of the landing, the corridor and the Office,
  judged against art consult 6 and the founder's bar.
