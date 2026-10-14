# look: the shared finishing stack

Every space (the landing, the corridor, the Office, the rooms after it) is finished the same way:
a contact shadow, air you can see (shafts of light, dust, a warm haze), bloom on lamp glass, one
tone map, a gentle warm grade, a trace of vignette and grain, over a generated environment. This
folder holds that look. A space tunes its own **profile** and never touches the stack.

Art consult 6 ranks the causes of a flat room: light that does not describe the structure, then flat
value structure, then weak material response. Baked light, textures and set dressing are other
lanes' work. The stack is deliberately restrained, and it is built around what the founder asked
of every frame (the founder's references, 14 October 2026):

- Every pool of light has a visible source, and falls in a shaped patch rather than an even wash.
- Layered darkness with a hero corner. Deep shadow keeps a faint colour and is never flat black.
- A warm key. A cold-dominant frame reads as creepy, so warmth leads everywhere.
- Air you can see: dust in the light only, slight bloom on lamp cores, a faint warm haze that lifts
  the deep shadows.
- Soft lens character: a very light vignette and grain. No chromatic aberration.

The renderer is `WebGLRenderer` for now (`docs/ADR/0006-look-and-renderer.md`); the stack is built
on `postprocessing` (pmndrs) and `n8ao`. Everything that touches the renderer lives in `stack/`,
`atmosphere/` and `effects/`, so a later renderer has one place to change.

## What is here

| Path | What it is |
|---|---|
| `LookStack.tsx` | The tag a space puts inside its `<Canvas>`. Takes over the final render from `useFrame(…, 1)` and never asks for a frame. |
| `render.ts` | `renderWithLook(gl, scene, camera)`: what a space's own capture (the dissolve) calls instead of `gl.render`, so the captured frame is finished too. |
| `profiles.ts`, `ranges.ts` | `CORRIDOR_LOOK`, `LANDING_LOOK`, `OFFICE_LOOK`: every number a space tunes, and the ranges they are held to by a test. |
| `tier.ts` | Which tier a visitor gets and the plan it runs: stages, the effects merged into the finish pass, the sample count. Pure decisions on numbers. |
| `stack/driver.ts` | The `EffectComposer` pipeline: scene pass, contact shadow, atmosphere, one finish pass. `stack/inspect.ts` counts the GPU objects it owns. |
| `grade.ts`, `lut.ts` | The grade as one function, and the 16 cubed table sampled from it. |
| `effects/` | Vignette and grain, as `postprocessing` effects, each with a TypeScript twin of its shader. |
| `atmosphere/` | The air: `data.ts` (numbers), `heightFog.ts`, `cones.ts` (shafts, with an optional frame), `dust.ts`, `lightPatch.ts` (the light a shaft lays on surfaces), `lamps.ts` (which lamps carry a shaft), `pass.ts`. |
| `environment/` | The generated environment: `layout.ts` (the patches, as data), `build.ts` (PMREM), `useLookEnvironment.ts`. |
| `colour.ts` | sRGB, colour temperature, Lab and a colour difference. No renderer. |

## The pipeline

Desktop, in order, one scene pass and no second one:

1. **Scene.** `RenderPass`, into a half-float target with MSAA (4 samples; 2 on a phone or a very
   large canvas), with the renderer's own tone mapping switched off for as long as the stack is
   mounted. It is restored on unmount and held off again before every frame, so a frame is mapped
   exactly once.
2. **Contact shadow.** N8AO, half resolution, the `Low` preset, radius and intensity from the
   profile, tinted warm so a crease is a darker warm and not a grey. Opaque geometry only.
3. **Atmosphere.** The shafts (one instanced draw) and the dust (one points draw), additive,
   faded against the scene's depth so nothing cuts a line across a wall.
4. **Finish.** One `EffectPass` merging, in this order: *light patch*, *height fog*, *bloom*, *tone
   mapping*, *grade LUT*, *vignette*, *grain*, then dither. The HDR effects come first (the light a
   shaft lays on surfaces before the fog veils it), tone mapping once, and the display-referred
   ones after it.

| Tier | When | What runs |
|---|---|---|
| `lite` | A software renderer (`?quality=low`, or detected). | Nothing. The world renders exactly as it does without the stack, gets no environment, and never downloads the stack's code (the pipeline is a lazily imported chunk). |
| `mobile` | A coarse pointer and a short viewport side under 900 CSS px. | Scene, then one finish pass: tone mapping, the grade (at the profile's `mobileIntensity`), dither. No contact shadow, air, vignette or grain. Bloom only if a space asks for it, at reduced resolution. |
| `desktop` | Everything else. | All of the above. |

The stack draws only when the renderer's own loop does (`frameloop="demand"` still decides). It owns
no timer, listener or animation frame; the grain's seed and the haze and dust drift advance by one
step only on a frame that is being drawn. Under reduced motion the grain is off and nothing drifts.

## Profiles

A profile is a plain object; nothing in it is a class or a pass. A space imports its profile, may
override numbers for its own room, and hands it to `<LookStack profile={…}>`. A changed profile is
applied in place and asks for one frame. The ranges in `ranges.ts` bound every number; a space that
has to leave one changes it there, with the reason (the bloom threshold's floor is the example).

| Setting | Range | Notes |
|---|---|---|
| Contact shadow | radius 0.15 to 0.30 m, intensity 0.30 to 0.45 | N8AO's `intensity` is the exponent on the occlusion. |
| Bloom | strength 0.12 to 0.20, radius 0.15 to 0.25, HDR threshold 1.05 to 1.8 | Only lamp glass and lit glazing cross the threshold (sconce glass reads 1.2 to 1.3 in HDR; no lit surface reaches 1). The gain from strength to the library's `intensity` is `BLOOM_GAIN`, about half of UnrealBloom's energy at the same numbers. |
| Grade | intensity 0.25 to 0.40; `mobileIntensity` 0.25 to 0.80 | 0 is the identity. The phone has no air to lift a dark room's deepest shadows, so a dark room (the Office) asks for more there (0.7); the already-lifted rooms keep their desktop number. |
| Vignette | at most 6% of light lost in the corners | Never on the landing, whose hero already darkens its edges. |
| Grain | 0.03 to 0.04 | Desktop only. Frozen between authorised frames; off under reduced motion. |
| Exposure | 1.0 with ACES | Fixed. The light is repaired before the exposure is ever raised. |
| Environment | intensity 0.08 to 0.25 | A fill and a reflection, never the background. |

## The grade

`grade.ts` is the single definition, a function on display-referred colour that `lut.ts` samples into
a 16 cubed table; the profile's intensity mixes the result into the frame.

- Shadows are **lifted** and lean **warm**, and keep a little more of the colour they had, so the
  dark reads as evening shade in an old room: never crushed black, never a drained cold grey.
  Black itself becomes a warm dark brown.
- A cool shadow (the Office's teal) is lifted but not turned toward brown, so the quieter cool fill
  survives next to the warm key. The generated environment adds a dim near-neutral window patch for
  the same reason.
- Nothing above the shadow knee (luma 0.4) moves, so bone paper, the Office teal and every lit
  colour pass through untouched.

## The air

`atmosphere/data.ts` holds the numbers for each space.

- **Three value bands in the darkness.** Deep, mid and penumbra, each a warm tint, none of them
  crushed. `darknessShares` and `hasLayeredDarkness` measure a captured frame against them: the
  deepest band has to exist but may not fill the frame, the other two have to be present, and
  crushed black has to be rare.
- **Height-fog layers**, warm (a floor mist, a broad haze, smoke under the ceiling), plus a **far
  glow** that lifts the far end of a space into a warm legible distance. Evaluated where the scene is
  shaded from the depth: no draw call. A 10 m view at eye height is veiled by roughly 5 to 10%.
  The phone and lite tiers have no depth-based air, so on those the far end of a space is whatever
  the scene's own distance fog is: that colour has to be warm too (`corridor/layout.ts`, `fog.colour`).
- **Shafts.** A faked shaft under each lamp: an additive, soft-edged cone with a static noise
  breakup, no shadow map and no ray march. A shaft can carry a **frame** (`gobo`: columns, rows,
  bar, softness), which gives it a rectangular section with bars cut across it, as a mullioned
  window does. The one density function (`coneDensity`) is shared by the shell, the dust and the
  surface light below, in TypeScript and in GLSL.
- **Surface light** (`lightPatch.ts`). The shaft is laid on the surfaces it reaches: the window's
  panes across a desk top and the floor, the desk lamp's pool with a firm edge at the shade's rim.
  An effect on the HDR frame rebuilds each pixel's world position from depth, asks the density
  function whether the point is in a shaft, and adds a share of what the surface shows plus a floor
  of its own, so a dark desk still catches a bar. A surface turned away from the lamp takes a small
  share, from the depth's own derivatives (no normal buffer), with a silhouette fallback. The four
  strongest shafts are used. A shaft with `patch: 0` does none of it; the corridor's sconces do not,
  because the scene already lights its walls with them.
- **Slow haze.** The density of the air varies in patches a few metres across and drifts at about
  2 cm a second, only while another frame is being drawn.
- **Dust.** A thousand or so motes, a pixel or two across, visible only inside a shaft. One points
  draw. Under reduced motion they hold still.

The air adds at most two draw calls to a scene. The surface light, the fog, the bloom, the grade, the
vignette and the grain are one fullscreen pass.

## Budget

Whole-stack ceilings from the ruling: 4 ms on a desktop, 1.5 ms on a phone. The stack's own draws
(the contact shadow, the shafts and dust, the finish pass's bloom levels) are fullscreen or
two-draw work and are counted apart from the scene's ceilings (125 draw calls and 210k triangles in
the corridor's richest view, ADR 0004); the scene pass draws exactly what a direct render draws. GPU
milliseconds cannot be measured on a software rasteriser, so none are claimed here; the report
gives the draw counts, the pass count and the render-target memory, which can be.

## How a space wires it in

```tsx
import { LookStack, OFFICE_LOOK, type AtmosphereLamp } from '../look/index.ts';

// Module-level, so a parent re-render never hands the stack a new array.
const LAMPS: readonly AtmosphereLamp[] = [
  { id: 'desk-lamp', kind: 'desk-lamp', position: [-2.3, 1.4, 4.28], direction: [1.3, -0.57, -0.28] },
];

// Inside the <Canvas>, after the scene and the camera rig:
<LookStack profile={OFFICE_LOOK} reducedMotion={reducedMotion} lamps={LAMPS} />
```

A lamp's `kind` names the shaft in the profile's `atmosphere.cones.specs`; a lamp with no matching
spec is ignored. A space that captures its own frame (the dissolve) calls `renderWithLook(gl, scene,
camera)` instead of `gl.render`; with no stack mounted that is a plain render. In development
`window.__tqwLook` exposes the running driver and a `redraw()`, for capture scripts.

## Deliberately absent

- A downloaded environment image. The environment is generated.
- **Chromatic aberration**, screen-space reflections, global illumination, temporal anti-aliasing,
  motion blur, depth of field. Each costs more than it adds here, fights the stillness, or (chromatic
  aberration) is a look the founder ruled out.
- Shadow maps and ray-marched volumetrics. The shafts are faked.
- Grain or haze that animates on its own. Nothing in the stack schedules a frame.
- Any effect on the lite tier.
