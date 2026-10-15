import { chamberById, CHAMBERS, type ChamberId, type SpineCue, type SpineStore } from '@tqw/engine';
import { nearestWalkable, type Vec2 } from '../../firstPerson/bounds.ts';
import type { InputMode } from '../../firstPerson/bindings.ts';
import { createFirstPerson, type FirstPerson, type Pose } from '../../firstPerson/controller.ts';
import { SPINE_TIMING } from '../../timing.ts';
import type { CorridorAnimation } from '../animation.ts';
import type { AmbientClock } from '../ambient.ts';
import { createPropAnimation, type PropAnimation, type PropId } from '../props.ts';
import type { ProgressSource } from '../progress.ts';
import { ambientDrift, driftWeight } from './ambient.ts';
import type { BoardMotion } from './boardMotion.ts';
import { cueText, type CueTarget } from './cueText.ts';
import { horizontalFov, type Lens } from './framing.ts';
import { candidates as findable, find } from './context.ts';
import { createCueTracker } from './cueTracker.ts';
import { createInterest, DOOR_GLINT_LEVEL, type Interest, type Place } from './interest.ts';
import { approach, CLOSING_END_MS, closingAt, ENTRY_START_MS, openingAt, rattleAt } from './doorMotion.ts';
import { createEntranceFollower, entrancePose, walkT } from './entrance.ts';
import {
  corridorBounds,
  doorFrame,
  doorwayAdvanceM,
  doorwayDirection,
  GATES,
  FOV,
  handoverPose,
  landingPose,
  SOFT_STOP,
  viewpointOrder,
} from './viewpoints.ts';

/**
 * The corridor's camera and door choreography (ADR 0001), as a state machine advanced by
 * `step(dtMs)` and driven by the spine: scroll-driven walk-in, hand-over, free walking via the
 * first-person controller, door focus framing, opening, sealed rattles and the return.
 * Nothing here touches three.js or the DOM, so the whole sequence is testable against a
 * fake clock; CorridorScene is the thin shell that feeds it frames and input.
 */

/** Opening a door from further than this from its view cuts to the view rather than gliding. */
const ARRIVAL_SLACK_M = 0.6;
/** Standing this far from a door's view means the visitor has walked away from it. */
const WALKED_AWAY_M = 0.35;
/** Floor clicks past this beyond the walkable ground (the wall, the dark) are ignored. */
const FLOOR_PICK_SLACK_M = 0.6;
/** A floor click this close to where the visitor stands is not worth a glide. */
const FLOOR_PICK_MIN_M = 0.15;
/** Hover emphasis rises and falls with this time constant. */
const ATTENTION_TAU_MS = 90;
/** Input is taken during the hand-over settle once the camera is this close to the hand-over. */
const SETTLE_INPUT_M = 0.3;
/** The hero's drift moves the camera this much; a follower further behind its target than this is still catching up. */
const DRIFT_LAG_M = 0.005;
const DRIFT_LAG_DEG = 0.05;
/** A visitor still this close to the hand-over has not walked anywhere. */
const PRISTINE_M = 0.05;
/** A frame later than this is a sleeping tab or a stall; the choreography does not skip further. */
const MAX_STEP_MS = 500;
/** Footstep speed is reported when it changes by more than this. */
const WALK_REPORT_STEP = 0.02;

export interface DirectorOptions {
  spine: SpineStore;
  progress: ProgressSource;
  animation: CorridorAnimation;
  reducedMotion: boolean;
  /** True on a portrait screen (taller than wide); asked each frame, so turning the device is followed. */
  portrait(): boolean;
  /** The camera is in the doorway: the jamb fills the frame's edges. */
  onSeam(): void;
  onWalk(speedMps: number): void;
  onDoorIntent(id: ChamberId): void;
  /** Called just before an instant change of view; capture the outgoing frame for a dissolve. */
  beforeCut?(): void;
  /** Something changed that needs a frame (the shell calls `invalidate`). */
  requestFrame(): void;
  /** The things to touch (ADR 0004): their per-frame state, written here and read by the props lane. */
  propAnimation?: PropAnimation;
  /** Where ambient render windows are asked for; the idle glint needs one. */
  ambient?: AmbientClock;
  /** The notice board's pin glint, read by the world. */
  boardMotion?: BoardMotion;
  /** The lens now in use (field of view and aspect), for framing stations; the screen's shape by default. */
  lens?(): Lens;
  /** A prop's action has begun: the shell may show what it reveals. */
  onPropAct?(id: PropId): void;
  /** The visitor has arrived at the starting view and can act (once per director). */
  onArrive?(): void;
  /** For tests: the real clock and the dice. */
  nowMs?: () => number;
  random?: () => number;
}

/** What the DOM cue near an object says and how it behaves (see `Director.cue`). */
export interface Cue {
  target: CueTarget;
  text: string;
  /** The visitor was sent to this object, or stands at it: its verb is an action to press. */
  framed: boolean;
  /** Keyboard (or assistive) focus is on this object. */
  focused: boolean;
  /** False while a label that has just been dropped fades out. */
  visible: boolean;
}

export interface Director {
  readonly controller: FirstPerson;
  readonly pose: Readonly<Pose>;
  /** Advances by `dtMs`; true while another frame is needed. */
  step(dtMs: number): boolean;
  /** True when the visitor may move: in the corridor, nothing scripted, no overlay open. */
  inputEnabled(): boolean;
  /** Who owns the wheel, keys and swipes: see `InputMode`. Asked at every input event. */
  inputMode(): InputMode;
  /** The game window holds the page's input (ADR 0003). Leaving it lets go of held keys and buttons. */
  setEngaged(engaged: boolean): void;
  /**
   * True when the only reason another frame is due is the hero's ambient drift: the shell draws
   * those at `AMBIENT_FRAME_MS`, not every display frame, and not at all while the scene is off screen.
   */
  readonly ambientOnly: boolean;
  setReducedMotion(reduced: boolean): void;
  /** Pointer over (or off) a door in the scene. */
  setHover(id: ChamberId | null): void;
  /** The chamber behind the pending door has drawn its first ready frame. */
  markChamberReady(id: ChamberId): void;
  /** A door in the scene was clicked or tapped: glide to it, or, once there, open it. */
  clickDoor(id: ChamberId): void;
  /** The floor was clicked or tapped at this point. */
  clickFloor(point: Vec2): void;
  /** Reduced motion: forward and back step between named viewpoints. */
  stepViewpoint(dir: -1 | 1): void;
  /** The things to touch: props and the notice board. */
  readonly interest: Interest;
  /** What the cue near an object should say now, or null for none. */
  cue(): Cue | null;
  /** The viewer's keyboard focus is on a door (by its list), a prop (by the nearby list), or nothing. */
  setFocusTarget(target: CueTarget | null): void;
  /** Every place and action the visitor can be taken to, nearest first (the "Places and actions" list). */
  places(): Place[];
  /**
   * Polls what happens with no frame drawn (a glint is due, a held action ends); true while a
   * frame is needed. The shell calls it when `nextWakeMs` elapses.
   */
  wake(): boolean;
  /** Milliseconds until `wake` would change anything, or null when nothing is pending. */
  nextWakeMs(): number | null;
  dispose(): void;
}

type Mode = 'scrub' | 'settle' | 'return' | 'hero' | 'free';

interface Opening {
  id: ChamberId;
  t: number;
  advancing: boolean;
  seamed: boolean;
  ready: boolean;
}

export function createDirector(options: DirectorOptions): Director {
  const { spine, progress, animation } = options;
  const bounds = corridorBounds();
  let reduced = options.reducedMotion;
  const controller = createFirstPerson({
    start: landingPose(options.portrait()),
    bounds,
    gates: GATES,
    softStopM: SOFT_STOP,
    reducedMotion: reduced,
    beforeCut: () => options.beforeCut?.(),
  });
  /** The starting view for this screen (ADR 0004): back in the lobby, the board and the corridor both in the picture. */
  const handover = () => handoverPose(options.portrait());
  const landing = () => landingPose(options.portrait());
  const entranceNow = () => entrancePose(walkT(progress.get()), options.portrait());
  /**
   * The scroll's walk-in, one smoothed follower per pose component: the walk (z), the sideways
   * drift and glide to the starting view (x), the turn toward the board (yaw) and the pitch.
   * Smoothed like the rest so a scroll never nudges the view.
   */
  const follower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, entranceNow().z);
  const yawFollower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, entranceNow().yawDeg);
  const xFollower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, entranceNow().x);
  const pitchFollower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, entranceNow().pitchDeg);
  const followed = (): Pose => ({
    x: xFollower.z,
    z: follower.z,
    yawDeg: yawFollower.z,
    pitchDeg: pitchFollower.z,
  });
  const resetFollowers = (pose: Pose): void => {
    follower.reset(pose.z);
    yawFollower.reset(pose.yawDeg);
    xFollower.reset(pose.x);
    pitchFollower.reset(pose.pitchDeg);
  };
  /** Drift time: advances only while a frame is drawn at the hero, so pausing offscreen pauses the arc. */
  let driftClock = 0;
  /** Progress at the last hero frame, so scrolling down again resumes the authored walk-in. */
  let heroProgress = progress.get();
  let ambientBusy = false;
  let engaged = false;
  /** Under reduced motion the walk-in is two static views; which one is showing. */
  let reducedView: 'landing' | 'handover' = walkT(progress.get()) >= 1 ? 'handover' : 'landing';

  let mode: Mode = 'free';
  let phase = spine.getState().phase;
  let focus = spine.getState().focus;
  /** The door the visitor is gliding to or standing at, until they walk away from it. */
  let framed: ChamberId | null = null;
  let opening: Opening | null = null;
  let closing: { id: ChamberId; t: number } | null = null;
  const rattles = new Map<ChamberId, number>();
  let hover: ChamberId | null = null;
  let reportedSpeed = 0;

  const motion = (id: ChamberId) => animation[id];

  /** Without a screen to ask, the lens is the portrait or landscape one at a typical shape. */
  const lens = (): Lens =>
    options.lens?.() ?? (options.portrait() ? { vfovDeg: FOV.portrait, aspect: 0.49 } : { vfovDeg: FOV.landscape, aspect: 1.6 });
  /** Station framing follows the current screen shape; the corridor itself has no yaw clamp. */
  const syncLens = (): void => controller.setLens(horizontalFov(lens()));
  syncLens();
  /** The visitor can reach for things: in the corridor, free, nothing scripted, nothing covering the scene. */
  const canAct = (): boolean => {
    const state = spine.getState();
    return (
      phase === 'corridor' &&
      mode === 'free' &&
      opening === null &&
      closing === null &&
      !state.boardOpen &&
      state.page === null
    );
  };
  const interest: Interest = createInterest({
    controller,
    bounds,
    spine,
    animation: options.propAnimation ?? createPropAnimation(),
    lens,
    reduced: () => reduced,
    canAct,
    beforeMove: () => {
      leaveScrub();
      framed = null;
    },
    requestFrame: () => options.requestFrame(),
    doorIds: () => CHAMBERS.map((c) => c.id),
    doorBusy: (id) => hover === id || focus === id || framed === id,
    ...(options.ambient ? { ambient: options.ambient } : {}),
    ...(options.boardMotion ? { boardMotion: options.boardMotion } : {}),
    ...(options.onPropAct ? { onAct: options.onPropAct } : {}),
    ...(options.nowMs ? { nowMs: options.nowMs } : {}),
    ...(options.random ? { random: options.random } : {}),
  });
  /** What the visitor has found, held steady before it is shown, and how it fades. */
  const tracker = createCueTracker({ ...(options.nowMs ? { nowMs: options.nowMs } : {}), reduced: () => reduced });
  const contextList = findable();
  /** The keyboard (or assistive technology) is on a door's or a prop's DOM equivalent. */
  let focusTarget: CueTarget | null = null;
  /** The visitor has arrived at the starting view, once: the board pin's glint is then due. */
  let arrivedOnce = false;

  function leaveScrub(): void {
    if (mode === 'free') return;
    controller.setPose(followed());
    mode = 'free';
  }

  function frameDoor(id: ChamberId): void {
    leaveScrub();
    interest.forgetFramed();
    // Already on its way there: let the glide finish rather than restarting it.
    if (!reduced && framed === id && controller.gliding) return;
    framed = id;
    const target = doorFrame(id);
    if (reduced) controller.cutTo(target);
    else controller.glideTo(target);
  }

  // Initial placement: the landing, the hand-over, a deep-linked door, or the door we just left.
  const initial = spine.getState();
  controller.setPose(landing());
  const startDoor = initial.focus ?? initial.chamber;
  if (initial.phase === 'entrance') {
    mode = 'scrub';
    controller.setPose(followed());
  } else if (startDoor) {
    const frame = doorFrame(startDoor);
    controller.setPose(frame);
    framed = startDoor;
    if (chamberById(startDoor).status === 'open') {
      // Coming back from its chamber: the door stands open for a beat, then closes behind us.
      if (initial.phase === 'threshold') motion(startDoor).open = 1;
      else if (!reduced) {
        motion(startDoor).open = 1;
        closing = { id: startDoor, t: 0 };
      }
    }
  } else {
    controller.setPose(handover());
  }
  controller.lock(initial.phase !== 'corridor');

  function handOver(): void {
    if (reduced) {
      mode = 'free';
      // Under reduced motion the walk-in is two static views, cut over behind the veil; the
      // hand-over view may already be showing, in which case there is nothing to cut.
      if (reducedView === 'handover') controller.setPose(handover());
      else controller.cutTo(handover());
      reducedView = 'handover';
      return;
    }
    // Scrolling to the hand-over hands over through the same smoothing as the rest of the scroll:
    // the walk-in has no automatic travel, so a jump of the scrollbar is a jump, softened by 120 ms.
    // Only a skip ("Enter The Quiet Works" before the hand-over) walks the rest of the way, at
    // walking pace (it stands in for the scroll the visitor chose not to do), so they see where
    // they are going.
    if (walkT(progress.get()) >= 1) {
      mode = 'settle';
    } else {
      leaveScrub();
      controller.glideTo(handover(), { speedMps: SPINE_TIMING.walkMps });
    }
  }

  /**
   * Back to following the page's scroll after the hand-over, for a visitor who has done nothing
   * with the window: still at the hand-over, no door in hand, not engaged. Scrolling back up
   * through the smoke then walks the camera out to the hero, and the hero is the hero again.
   * Anyone who has walked, opened a door or engaged keeps their place.
   */
  function pristineAtHandover(): boolean {
    if (phase !== 'corridor' || engaged || opening || closing || focus !== null || framed !== null) return false;
    if (controller.active) return false;
    const at = handover();
    return Math.hypot(controller.pose.x - at.x, controller.pose.z - at.z) < PRISTINE_M;
  }

  const controllerMovable = (): boolean => {
    const state = spine.getState();
    const settling = mode === 'settle' && Math.abs(follower.z - handover().z) > SETTLE_INPUT_M;
    return (
      phase === 'corridor' &&
      mode !== 'scrub' &&
      !settling &&
      opening === null &&
      !state.boardOpen &&
      state.page === null
    );
  };

  function resumeScrub(): void {
    resetFollowers(controller.pose);
    mode = 'scrub';
  }

  function startOpening(id: ChamberId): void {
    leaveScrub();
    const frame = doorFrame(id);
    const { pose } = controller;
    const away = Math.hypot(pose.x - frame.x, pose.z - frame.z);
    if (reduced || away > ARRIVAL_SLACK_M) controller.cutTo(frame);
    else if (away > 0.01 && !controller.gliding) controller.glideTo(frame);
    controller.lock(true);
    framed = id;
    // A door still closing behind a returning visitor opens again from shut.
    closing = null;
    opening = { id, t: 0, advancing: false, seamed: false, ready: false };
  }

  function markChamberReady(id: ChamberId): void {
    if (!opening || opening.id !== id) return;
    if (reduced) {
      opening = null;
      options.onSeam();
    } else {
      opening.ready = true;
    }
    options.requestFrame();
  }

  /** The visitor went back (browser Back) while a door was opening: put them in front of it again. */
  function abortOpening(): void {
    if (!opening) return;
    const { id, ready } = opening;
    opening = null;
    controller.lock(false);
    controller.cutTo(doorFrame(id));
    motion(id).handle = 0;
    if (!ready) {
      motion(id).open = 0;
      closing = null;
      return;
    }
    motion(id).open = 1;
    closing = { id, t: 0 };
  }

  const onState = () => {
    const state = spine.getState();
    const previousPhase = phase;
    const previousFocus = focus;
    phase = state.phase;
    focus = state.focus;
    if (opening && phase === 'corridor') abortOpening();
    if (phase !== 'corridor' && previousPhase === 'corridor') {
      interest.reset();
      tracker.reset();
    }
    // A door opening locks the camera itself, once it has been placed in front of the door.
    controller.lock(phase === 'entrance' || phase === 'chamber' || opening !== null);
    if (previousPhase === 'entrance' && phase !== 'entrance') handOver();
    if (previousPhase === 'corridor' && phase === 'entrance') {
      // Returning through the smoke restores the landing view directly. Following the scroll
      // backwards here would replay the whole corridor walk in view of the visitor.
      framed = null;
      driftClock = 0;
      if (reduced) {
        const view = landing();
        reducedView = 'landing';
        controller.cutTo(view);
        resetFollowers(view);
        mode = 'hero';
        heroProgress = progress.get();
      } else {
        resetFollowers(controller.pose);
        mode = 'return';
      }
    }
    if (phase === 'corridor' && focus && focus !== previousFocus) {
      options.onDoorIntent(focus);
      frameDoor(focus);
    } else if (phase === 'corridor' && !focus && previousFocus && reduced) {
      framed = null;
      controller.cutTo(handover());
    }
    options.requestFrame();
  };

  const onCue = (cue: SpineCue) => {
    if (cue.type === 'door-open' && cue.via === 'door') startOpening(cue.id);
    else if (cue.type === 'door-sealed' && !reduced) rattles.set(cue.id, 0);
    options.requestFrame();
  };
  const offState = spine.subscribe(onState);
  const offCue = spine.onCue(onCue);

  function report(speed: number): void {
    const next = speed < 0.01 ? 0 : speed;
    if (
      next === reportedSpeed ||
      (next !== 0 && reportedSpeed !== 0 && Math.abs(next - reportedSpeed) < WALK_REPORT_STEP)
    )
      return;
    reportedSpeed = next;
    options.onWalk(next);
  }

  function step(dtMs: number): boolean {
    // Door timelines run on the real clock (the sound desk's cues are on it); the controller
    // limits how far a hitch may carry free movement.
    const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS);
    let busy: boolean;
    let speed: number;
    syncLens();

    // A scroll that carries on past the hand-over must not stall for the settle: the first input
    // ends it, and the walk goes on from where the camera is.
    if (mode === 'settle' && controller.active) mode = 'free';

    // Keep the landing pose as the visitor scrolls back up through the veil. A later downward
    // scroll hands the camera back to the authored entrance walk-in.
    if (mode === 'hero') {
      const nextProgress = progress.get();
      const scrollingDown = nextProgress > heroProgress + 1e-6;
      heroProgress = nextProgress;
      if (scrollingDown) resumeScrub();
    }

    // Scrolled back up over a hand-over nobody has touched: the scroll owns the camera again.
    if (mode === 'free' && walkT(progress.get()) < 1 && pristineAtHandover()) resumeScrub();

    ambientBusy = false;
    if (mode === 'free') {
      busy = controller.step(dt);
      speed = controller.speed;
      if (framed && !controller.gliding && !opening) {
        const frame = doorFrame(framed);
        const { pose } = controller;
        if (Math.hypot(pose.x - frame.x, pose.z - frame.z) > WALKED_AWAY_M) framed = null;
      }
    } else {
      const before = follower.z;
      const t = walkT(progress.get());
      // Past the hand-over, in the corridor, the scroll has done its work: settle onto it exactly.
      if (mode === 'scrub' && phase !== 'entrance' && t >= 1) mode = 'settle';
      if (reduced) {
        // Two static views, a cut between them (the veil covers it): no travel, no drift.
        const next = mode !== 'scrub' && mode !== 'settle' ? 'landing' : t >= 1 ? 'handover' : 'landing';
        if (next !== reducedView) {
          reducedView = next;
          const view = next === 'handover' ? handover() : landing();
          controller.cutTo(view);
          follower.reset(view.z);
          yawFollower.reset(view.yawDeg);
          xFollower.reset(view.x);
          pitchFollower.reset(view.pitchDeg);
        }
      }
      const view = reducedView === 'handover' ? handover() : landing();
      const weight = (mode === 'scrub' || mode === 'hero') && !reduced ? driftWeight(progress.get()) : 0;
      if (weight > 0) driftClock += dt;
      const drift = ambientDrift(driftClock);
      // Where the walk-in puts the camera now: the settle holds the starting view exactly, reduced
      // motion holds one of the two static views, and otherwise the scroll's progress says.
      const base = mode === 'settle' ? handover() : mode === 'return' || mode === 'hero' ? landing() : reduced ? view : entrancePose(t, options.portrait());
      const target = base.z;
      const targetYaw = base.yawDeg + drift.yawDeg * weight;
      const targetX = base.x + (mode === 'settle' || reduced ? 0 : drift.x * weight);
      const targetPitch = base.pitchDeg;
      follower.step(dt, target);
      yawFollower.step(dt, targetYaw);
      xFollower.step(dt, targetX);
      pitchFollower.step(dt, targetPitch);
      controller.setPose(followed());
      speed = dt > 0 ? Math.abs(before - follower.z) / (dt / 1000) : 0;
      if (
        mode === 'settle' &&
        follower.settled(target) &&
        yawFollower.settled(targetYaw) &&
        xFollower.settled(targetX) &&
        pitchFollower.settled(targetPitch)
      ) {
        const start = handover();
        controller.setPose(start);
        resetFollowers(start);
        mode = 'free';
      }
      if (
        mode === 'return' &&
        follower.settled(target) &&
        yawFollower.settled(targetYaw) &&
        xFollower.settled(targetX) &&
        pitchFollower.settled(targetPitch)
      ) {
        controller.setPose(landing());
        mode = 'hero';
        heroProgress = progress.get();
      }
      // While the drift runs, followers trail their moving targets by a fraction of a millimetre
      // and never settle exactly; that is not work. The camera is busy for any other reason, or
      // when a follower is further behind than drift can explain.
      const drifting = weight > 0;
      const behind = drifting
        ? Math.abs(yawFollower.z - targetYaw) > DRIFT_LAG_DEG ||
          Math.abs(xFollower.z - targetX) > DRIFT_LAG_M ||
          !pitchFollower.settled(targetPitch)
        : !yawFollower.settled(targetYaw) || !xFollower.settled(targetX) || !pitchFollower.settled(targetPitch);
      busy = mode === 'settle' || mode === 'return' || !follower.settled(target) || behind;
      ambientBusy = drifting && !busy;
      busy = busy || drifting;
    }

    if (!arrivedOnce && phase === 'corridor' && mode === 'free') {
      arrivedOnce = true;
      interest.arrived();
      options.onArrive?.();
    }

    if (opening?.ready) {
      opening.t += dt;
      const door = motion(opening.id);
      const frame = openingAt(opening.t);
      door.handle = frame.handle;
      door.open = frame.open;
      if (!opening.advancing && opening.t >= ENTRY_START_MS && !controller.gliding) {
        opening.advancing = true;
        const state = opening;
        controller.advance(doorwayDirection(opening.id), doorwayAdvanceM(opening.id), SPINE_TIMING.entryMs, {
          pitchDeg: 0,
          onDone: () => {
            state.seamed = true;
            options.onSeam();
          },
        });
      }
      if (!opening.seamed) busy = true;
    }

    if (closing) {
      closing.t += dt;
      const door = motion(closing.id);
      door.open = closingAt(closing.t);
      if (closing.t >= CLOSING_END_MS) {
        door.open = 0;
        closing = null;
      } else {
        busy = true;
      }
    }

    for (const [id, elapsed] of rattles) {
      const next = elapsed + dt;
      motion(id).rattle = rattleAt(next);
      if (next >= SPINE_TIMING.rattleMs) rattles.delete(id);
      else {
        rattles.set(id, next);
        busy = true;
      }
    }

    // Things to touch: props' hover, actions and glints, and what the idle glint lights.
    if (interest.step(dt)) busy = true;
    const glint = interest.glint;
    for (const chamber of CHAMBERS) {
      const door = motion(chamber.id);
      // A door that glints takes a gentler attention than one the pointer is on.
      const glow = glint && glint.target.kind === 'door' && glint.target.id === chamber.id ? glint.value * DOOR_GLINT_LEVEL : 0;
      const target = Math.max(hover === chamber.id || focus === chamber.id ? 1 : 0, glow);
      if (door.attention !== target) {
        door.attention = approach(door.attention, target, dt, ATTENTION_TAU_MS);
        if (door.attention !== target) busy = true;
      }
    }

    // The last step of a move can land with a little speed; no further step means it is still.
    report(busy ? speed : 0);
    return busy;
  }

  return {
    controller,
    get pose() {
      return controller.pose;
    },
    step,

    inputEnabled: controllerMovable,

    inputMode() {
      // Free to move: the window's if engaged, else the page's, with only drag-to-look left to the scene.
      if (controllerMovable()) return engaged ? 'engaged' : 'look';
      // The hero and the smoke scroll are the page's. Anything else that stops movement (a door
      // opening, a dialog) while engaged still holds the wheel, so the page does not move under it.
      if (phase === 'entrance' || mode === 'scrub') return 'page';
      return engaged ? 'held' : 'page';
    },

    setEngaged(next) {
      if (engaged === next) return;
      engaged = next;
      // Leaving the window lets go of every key and button: a held W does not keep walking.
      if (!next) controller.releaseInput();
      options.requestFrame();
    },

    get ambientOnly() {
      return ambientBusy;
    },

    setReducedMotion(next) {
      if (next === reduced) return;
      reduced = next;
      controller.setReducedMotion(next);
      if (next) {
        interest.reset();
        tracker.reset();
        rattles.clear();
        for (const chamber of CHAMBERS) {
          motion(chamber.id).rattle = 0;
          if (!opening || opening.id !== chamber.id) motion(chamber.id).open = 0;
        }
        closing = null;
        if (phase === 'corridor' && mode === 'free' && !opening) {
          if (focus) {
            framed = focus;
            controller.cutTo(doorFrame(focus));
          } else {
            framed = null;
            controller.cutTo(handover());
          }
        }
        if (phase === 'entrance' && (mode === 'return' || mode === 'hero')) {
          const view = landing();
          reducedView = 'landing';
          controller.cutTo(view);
          resetFollowers(view);
          mode = 'hero';
          heroProgress = progress.get();
        }
      }
      options.requestFrame();
    },

    setHover(id) {
      if (hover === id) return;
      hover = id;
      if (id && phase === 'corridor') options.onDoorIntent(id);
      options.requestFrame();
    },

    markChamberReady,

    clickDoor(id) {
      if (phase !== 'corridor' || opening || closing) return;
      options.onDoorIntent(id);
      if (spine.getState().focus === id && framed === id) {
        spine.dispatch({ type: 'OPEN_DOOR', id, via: 'door' });
      } else {
        spine.dispatch({ type: 'FOCUS_DOOR', id });
        // Already focused (for instance by the keyboard) but the visitor has walked off: go back.
        if (framed !== id) frameDoor(id);
      }
      options.requestFrame();
    },

    clickFloor(point) {
      if (phase !== 'corridor' || mode !== 'free' || opening || reduced) return;
      const goal = nearestWalkable(bounds, point);
      if (Math.hypot(goal.x - point.x, goal.z - point.z) > FLOOR_PICK_SLACK_M) return;
      const { pose } = controller;
      if (Math.hypot(goal.x - pose.x, goal.z - pose.z) < FLOOR_PICK_MIN_M) return;
      framed = null;
      interest.forgetFramed();
      controller.glideTo(goal);
      options.requestFrame();
    },

    stepViewpoint(dir) {
      if (!reduced || phase !== 'corridor' || opening) return;
      const order = viewpointOrder();
      const index = order.indexOf(spine.getState().focus);
      const next = Math.min(order.length - 1, Math.max(0, index + dir));
      if (next === index) return;
      const id = order[next];
      if (id) spine.dispatch({ type: 'FOCUS_DOOR', id });
      else spine.dispatch({ type: 'BLUR_DOOR' });
    },

    interest,

    setFocusTarget(target) {
      focusTarget = target;
      interest.focusProp(target?.kind === 'prop' ? target.id : null);
      options.requestFrame();
    },

    cue() {
      const state = spine.getState();
      if (phase !== 'corridor' || opening || closing || state.boardOpen || state.page !== null || mode !== 'free') {
        tracker.reset();
        return null;
      }
      const make = (target: CueTarget, flags: { framed?: boolean; focused?: boolean; visible?: boolean }): Cue => ({
        target,
        text: cueText(target),
        framed: flags.framed ?? false,
        focused: flags.focused ?? false,
        visible: flags.visible ?? true,
      });
      // Keyboard focus is never taken away by a timer; then what the visitor was sent to and has arrived at.
      if (focusTarget) {
        tracker.reset();
        return make(focusTarget, { focused: true });
      }
      if (!controller.gliding) {
        if (interest.framed) {
          tracker.reset();
          return make(interest.framed, { framed: true });
        }
        if (framed) {
          tracker.reset();
          return make({ kind: 'door', id: framed }, { framed: true });
        }
      }
      // Otherwise only what the visitor has found: within reach, near the centre of the view, held steady a moment.
      const shown = tracker.view();
      const found = find({ ...controller.pose }, contextList, {
        previous: shown.visible ? shown.target : null,
        lens: lens(),
      });
      const view = tracker.update(found);
      return view.target ? make(view.target, { visible: view.visible }) : null;
    },

    places: () => interest.places(),

    wake() {
      return step(0);
    },

    nextWakeMs() {
      const a = interest.nextWakeMs();
      const b = tracker.nextWakeMs();
      if (a === null) return b;
      if (b === null) return a;
      return Math.min(a, b);
    },

    dispose() {
      offState();
      offCue();
      interest.reset();
      report(0);
    },
  };
}
