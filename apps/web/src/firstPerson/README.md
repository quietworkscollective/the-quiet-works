# First-person controller

Walking, turning, looking and assisted travel for a first-person view, with no knowledge of any
room. The Corridor uses it now; the Certification Office adopts it next. Everything a room
supplies is data: where one may stand, and where one starts.

Movement numbers are the ones in `timing.ts` (`SPINE_TIMING`, `WALK_EASING`) and ADR 0001:
walk 1.1 m/s, assisted glide 0.8 m/s, 300 ms to accelerate, 180 ms to stop, turning 75 deg/s,
pitch within 25 deg, and no head bob, roll or sprint. A room does not retune them.

## Conventions

- Metres and degrees. The floor is the (x, z) plane; the eye height is the caller's (the
  controller never sees y).
- **Yaw 0 looks toward -z and grows clockwise seen from above**: +90 faces +x. Positive pitch is up.
  Yaw is unlimited (it keeps counting past 360); wrap it with `wrapYaw` for display.
- `pose` is a live object the controller mutates in place. Read it each frame; never write to it.

## The three layers

| File | What it is | Needs |
|---|---|---|
| `controller.ts` | The state machine: `createFirstPerson(config)` returns a `FirstPerson`. Advanced by `step(dtMs)`. | nothing (pure) |
| `bindings.ts` | DOM input: keys, wheel, drag-to-look, the vertical swipe. `bindInput(options)` | a surface element |
| `three.ts` | `applyPose`, `lensFor`, `lookScale`, `floorPoint`, `wrapYaw` | three.js |
| `dissolve.ts` | A 120 ms dissolve between two views, for reduced motion | a canvas and an overlay canvas |
| `bounds.ts`, `polygon.ts`, `walkable.ts`, `easing.ts` | Walkable ground as rectangles or as a polygon (and the one interface over both); the CSS cubic-bezier | nothing |
| `stage.ts` | The stage contract (ADR 0007): forward axis, visible half-arc, soft edge, walkable polygon; the yaw limit and its easing | nothing |

The controller is deterministic given its inputs and the `dtMs` it is stepped with, so a room
can test its walk against a fake clock (see `controller.test.ts`).

## Using it

```ts
import { createFirstPerson } from '../firstPerson/controller.ts';

const view = createFirstPerson({
  start: { x: 0, z: 3, yawDeg: 0, pitchDeg: 0 },
  // Where the visitor may stand. A union of rectangles; margins from the walls are already
  // taken off. A room is one rectangle; a room that opens into another is two that overlap.
  // (Or give a `stage` instead: see "A stage" below.)
  bounds: [{ minX: -3.9, maxX: 3.9, minZ: -3.7, maxZ: 3.7 }],
  // Optional. Slow to a stop over this distance before a boundary, per axis (0 is a hard stop).
  softStopM: { x: 0.3, z: 0.6 },
  // Optional. Waypoints for a glide whose straight line would cut a corner of the ground.
  gates: [],
  reducedMotion: false,
  // Optional. Called just before an instant change of view, to capture the outgoing frame.
  beforeCut: () => dissolve.capture(),
});

// In the frame loop (demand-driven: only while `step` returns true, or an input arrived):
const moving = view.step(dtMs);
applyPose(camera, view.pose, EYE_HEIGHT);
if (moving) invalidate();
```

### A room stage (ADR 0007)

A room that shows no more than 180 degrees gives the controller a `Stage` in place of `bounds`:

```ts
const view = createFirstPerson({
  start,
  stage: {
    forwardYawDeg: 0,        // the axis the space is looked at along (0 is -z)
    visibleHalfArcDeg: 90,   // half of what may be seen, at most 90
    softEdgeDeg: 20,         // optional; turning eases to nothing over the last 20 degrees
    walkable: [{ x: -2.15, z: 9.8 }, ... ],   // a simple polygon on the floor, either winding
  },
});
view.setLens(horizontalFovDeg(camera.fov, camera.aspect)); // whenever the viewport changes
```

The controller then keeps the picture's edge, not the view direction, inside the half-arc:
`yawLimit = visibleHalfArc - horizontalFov / 2` (about 54.5 degrees on a 16:10 screen, 51.6 on 16:9,
75 on a portrait phone), re-derived on every `setLens`. Turning by pointer, touch or key is scaled
by a smoothstep to nothing over the last `softEdgeDeg` before the limit (no snap, no bounce back,
the same under reduced motion); a cut, `setPose` or a glide's framing target is held inside the
limit; a view left past a new limit (the screen narrowed) eases back over about a tenth of a second.
`yawLimitDeg` reports it. Without a stage the yaw is unlimited, as before.

Movement is clamped to the polygon by sliding along the edge it meets (the soft stop measures the
distance to the polygon's edge); a visitor who is off the floor (a scripted walk that ends in a
doorway) is left where they are. Scripted views (a door's frame, a framing station) must be
chosen inside the limit by the space: the controller will not turn a glide past it, so a view
beyond it would simply be framed short.

### `FirstPerson`

| Member | Meaning |
|---|---|
| `pose` | `{ x, z, yawDeg, pitchDeg }`, live. |
| `speed` | Ground speed over the last step, m/s; 0 when still. Feed it to footsteps. |
| `active` / `step(dtMs)` | `step` advances and returns `active` (free movement never advances more than 50 ms at once, so a stalled frame cannot lurch a walk; a scripted `advance` keeps pace with the clock through a hitch up to 400 ms): true while another frame is needed. When false the view is at rest and no frame should be drawn. |
| `hold(source, dir)` | Walk forward (+1) or back (-1) while held. `source` ('key', 'button') lets two inputs hold at once without cancelling. |
| `turn(source, dir)` | Turn right (+1) or left (-1) while held. |
| `nudge(metres)` | Wheel or swipe: walk this far, through the same easing. A notch of about 0.35 m. Banks at most about 1 m, and a reversal drops what was banked. |
| `look(dYaw, dPitch)` | Look. Never moves the camera. With a stage, eases to nothing at the yaw limit. |
| `setLens(horizontalFovDeg)` / `yawLimitDeg` | With a stage: tell the controller the screen's horizontal field of view; the limit it derives (Infinity without a stage). |
| `glideTo(target, opts?)` | Assisted travel at 0.8 m/s to `{ x, z, yawDeg?, pitchDeg? }`. The view turns on the way, rate-limited, and the last turn (at most 12 deg over 350 ms) frames the destination. Omit `yawDeg` to leave the view alone. `opts.onDone` fires once on arrival. |
| `advance(dir, metres, ms, opts?)` | Scripted travel along a direction in exactly `ms`, ignoring bounds and input, ending at rest. For walking through a doorway. |
| `cancelGlide()` | Hands a glide back to the visitor; its speed carries on into walking and decays. |
| `cutTo(target)` / `setPose(p)` | Instant change of view (`cutTo` calls `beforeCut`; `setPose` is silent and stops all motion). |
| `lock(bool)` | While locked, input methods are ignored; scripted motion is not. |
| `releaseInput()` | Lets go of every held key and button and any banked wheel or swipe distance (the visitor left the window). Movement eases to a stop; a glide carries on. |
| `setReducedMotion(bool)` | See below. |

### Behaviour worth knowing

- **Walking** accelerates over `accelerateMs` and stops over `stopMs`, each shaped by `WALK_EASING`:
  quick to respond, soft to settle. Speed is continuous across every change (a reversal eases
  through zero; a new glide starts at the speed the old one had).
- **Bounds.** The visitor never leaves the ground. Walking into a wall slides along it. At a
  boundary with `softStopM` the speed falls as the two-thirds power of the distance left, so the
  camera slows from the start of the zone and arrives at rest in finite time (about three seconds
  at walking pace over 1.2 m).
- **Looking never walks.** `look` only changes yaw and pitch. A look during a glide takes the
  view from the glide (it does not snap back); the travel finishes.
- **Glides** are interrupted by any walking input (`hold`, `nudge`). A glide's cruise is capped
  by its length so a short step is a slow drift, not a lurch.
- **Reduced motion** (`reducedMotion: true`): no walking, turning, nudging or gliding. `glideTo`
  becomes `cutTo` and calls `onDone` at once. Looking by dragging still works (direct
  manipulation, nothing automatic). The caller offers named viewpoints instead; `bindInput`
  reports forward and back presses as `onStep(dir)` for that.

### `bindInput(options)`

Binds, to a surface element and the window: W/S and the arrows walk, A/D and the arrows turn
(by physical key, so WASD works on any layout), the wheel and a vertical touch swipe walk
(`metresPerPx` of travel per pixel), and a drag looks. Dragging "grabs the world": it follows the
pointer. Pointer capture only starts once a drag begins, so a plain click still reaches what is
under the pointer; ask `wasDrag()` before treating a click as a selection.

**Who owns the input** is the host's call, asked at every event with `mode()`:

| Mode | Wheel and keys | Dragging | Key presses |
|---|---|---|---|
| `page` | the page's: never `preventDefault`ed, never taken | nothing | not gestures |
| `look` | the page's | looks. A finger that goes up or down is left to the browser to scroll the page | not gestures |
| `engaged` | the window's: walk, turn, and the page does not scroll | looks; a finger up or down walks | gestures |
| `held` | the wheel is swallowed (the page must not move under a scripted move) and nothing else is taken | nothing | gestures |

For a page that scrolls over the surface, give it `touch-action: pan-y` while resting and `none`
while engaged. A finger waits `dragThresholdPx.touch` (12 by default) before its axis is chosen;
the choice is final for that gesture, and so is the mode it began in: engaging or leaving part-way
through a drag changes nothing about it.

It reports `onGesture()` for scene clicks and taps, and for deliberate key presses while engaged.
Keys operating page controls (buttons, links, disclosures, fields, dialogs, and controls marked
`data-fp-ignore`) do not unlock audio; scrolling never does. Movement keys are ignored in text
fields and dialogs. Mark a control drawn over the surface with `data-fp-ignore` so pointer drags
and audio gestures do not start there; movement keys remain available to the scene on those
controls.

### `applyPose`, `lensFor`, `lookScale`, `floorPoint`

`applyPose(camera, pose, eyeHeight)` sets position and rotation (yaw about y, then pitch, no
roll). `lensFor(w, h, { landscape, portrait })` picks the vertical FOV. `lookScale(w, h, fov)`
gives degrees per pixel so a drag across the picture spans the field of view. `floorPoint`
turns a pointer position into a point on the floor, for click-to-walk.

## What the Corridor adds on top

`corridor/camera/director.ts` drives this controller from the spine: the landing walk-in,
door focus framing, door opening, the return. A chamber adopting the controller writes its own
director (its stations, its exits) against the same API; nothing in `firstPerson/` changes.
