import { SPINE_TIMING, WALK_EASING } from '../timing.ts';
import type { Bounds, Vec2 } from './bounds.ts';
import { clamp, cubicBezier, integrate01, lerp, smoothstep01, type Bezier, type EasingFn } from './easing.ts';
import { DEFAULT_SOFT_EDGE_DEG, edgeScale, yawLimitDeg, yawRelative, type Stage } from './stage.ts';
import { polygonWalkable, rectWalkable, type Walkable } from './walkable.ts';

/**
 * A chamber-agnostic first-person controller: pose, walking, turning, looking, assisted glides
 * and soft stops, as a pure state machine advanced by `step(dtMs)`. It knows nothing about
 * three.js, the DOM or any room; bounds and the start pose arrive as data (see README.md).
 *
 * Conventions: metres and degrees; the eye height is the caller's. Yaw 0 looks toward -z and
 * grows clockwise seen from above, so +90 faces +x (the visitor's right). Pitch is positive up.
 */
export interface Pose {
  x: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

export interface GlideTarget {
  x: number;
  z: number;
  /** Omitted: the view direction is left alone (no forced turn). */
  yawDeg?: number;
  pitchDeg?: number;
}

export interface Tuning {
  /** Walking speed with a key or button held. */
  walkMps: number;
  /** Assisted travel (glides). */
  glideMps: number;
  accelerateMs: number;
  stopMs: number;
  /** Turning with keys. */
  turnDegPerS: number;
  pitchLimitDeg: number;
  easing: Bezier;
  /** Wheel and swipe travel: metres per pixel of scroll, and the most that may be banked. */
  nudge: { metresPerPx: number; maxPendingM: number };
  glide: {
    /** Length of the closing deceleration of a glide. */
    settleMs: number;
    /** The fastest the view may turn on its own during a glide. */
    turnDegPerS: number;
    /** The last turn of a glide, framing the destination, is at most this much over this long. */
    framingMs: number;
    framingMaxDeg: number;
  };
}

export const DEFAULT_TUNING: Tuning = {
  walkMps: SPINE_TIMING.walkMps,
  glideMps: SPINE_TIMING.glideMps,
  accelerateMs: SPINE_TIMING.accelerateMs,
  stopMs: SPINE_TIMING.stopMs,
  turnDegPerS: SPINE_TIMING.turnDegPerS,
  pitchLimitDeg: 25,
  easing: WALK_EASING,
  nudge: { metresPerPx: 0.35 / 100, maxPendingM: 1 },
  glide: {
    settleMs: 1200,
    turnDegPerS: 60,
    framingMs: SPINE_TIMING.focusFramingMs,
    framingMaxDeg: SPINE_TIMING.focusMaxDeg,
  },
};

export interface FirstPersonConfig {
  start: Pose;
  /**
   * Where the visitor may stand, as a union of rectangles. The start pose and every glide target
   * must be inside. Give this or a `stage`.
   */
  bounds?: Bounds;
  /**
   * The space's stage (ADR 0007): a walkable polygon in place of `bounds`, and a limit on the yaw
   * so that no more than 180 degrees of the space is ever in view. Without one the view turns freely.
   */
  stage?: Stage;
  /**
   * Waypoints for glides whose straight line would leave the bounds (a doorway between two
   * rooms). The nearest one that makes both legs walkable is used.
   */
  gates?: readonly Vec2[];
  /**
   * Walking slows to a stop over this distance before a boundary, per axis. 0 is a hard stop.
   * Sliding along a wall is only slowed by the wall-facing part of the motion.
   */
  softStopM?: { x: number; z: number };
  tuning?: Partial<Omit<Tuning, 'nudge' | 'glide'>> & {
    nudge?: Partial<Tuning['nudge']>;
    glide?: Partial<Tuning['glide']>;
  };
  reducedMotion?: boolean;
  /**
   * Called just before an instant change of view, so the caller can capture the outgoing frame
   * for a dissolve.
   */
  beforeCut?(): void;
}

export interface GlideOptions {
  /** Turn the view to `target.yawDeg` with a final framing move (default). False: turn only on the way. */
  frame?: boolean;
  /** Replaces the tuned assisted speed. */
  speedMps?: number;
  onDone?(): void;
}

export interface AdvanceOptions {
  pitchDeg?: number;
  onDone?(): void;
}

export type Hold = -1 | 0 | 1;

export interface FirstPerson {
  /** The live pose. Read-only for callers; mutated by `step`. */
  readonly pose: Readonly<Pose>;
  /** Ground speed over the last step, m/s (0 when still). */
  readonly speed: number;
  readonly gliding: boolean;
  /**
   * How far either side of the stage's forward axis the view direction may turn on the current
   * screen, in degrees (Infinity without a stage). Derived from the lens: `visibleHalfArc - hfov / 2`.
   */
  readonly yawLimitDeg: number;
  /**
   * Tells the controller the screen's horizontal field of view (call it before the first frame and
   * whenever the viewport changes). The yaw limit follows; a view now past it eases back inside,
   * with no snap. Until it is called the field of view is taken as nothing, so the limit is the
   * whole half-arc: a stage whose screen is not yet known does not clamp early.
   */
  setLens(horizontalFovDeg: number): void;
  /** True while another `step` is needed; false means the view is at rest and no frame is due. */
  readonly active: boolean;
  /** Advances by `dtMs` (clamped to 50 ms so a stalled tab never lurches). Returns `active`. */
  step(dtMs: number): boolean;

  /** Walk forward (+1) or back (-1) while held. `source` keeps a key and a button from cancelling each other. */
  hold(source: string, dir: Hold): void;
  /** Turn right (+1) or left (-1) while held. */
  turn(source: string, dir: Hold): void;
  /** Wheel or swipe: walk this many metres forward (negative: back) through the walk easing. */
  nudge(metres: number): void;
  /** Look by an angle. Never moves the camera. */
  look(dYawDeg: number, dPitchDeg: number): void;

  /** Assisted travel to a point, optionally ending with the view framed on `yawDeg`. */
  glideTo(target: GlideTarget, options?: GlideOptions): void;
  /**
   * Scripted travel along a direction, ignoring bounds and input, ending at rest after exactly
   * `durationMs`. The view holds its direction; pitch eases to `pitchDeg` if given.
   */
  advance(direction: Vec2, metres: number, durationMs: number, options?: AdvanceOptions): void;
  /** Stops an assisted glide; its speed carries on into ordinary walking and decays. */
  cancelGlide(): void;
  /** Instant change of view (calls `beforeCut`). */
  cutTo(target: GlideTarget): void;
  /** Sets the pose with no ceremony and no `beforeCut` (for scripted scrubbing). Stops all motion. */
  setPose(pose: Partial<Pose>): void;
  /** While locked, every input method is ignored. Scripted motion is unaffected. */
  lock(locked: boolean): void;
  /**
   * Lets go of every held key and button and any banked wheel or swipe distance, as when the
   * visitor leaves the window. Movement in progress eases to a stop; a glide carries on.
   */
  releaseInput(): void;
  setReducedMotion(reduced: boolean): void;
  readonly reducedMotion: boolean;
}

/** A speed or angular velocity that eases between targets, never jumping. */
class Ramp {
  value = 0;
  private from = 0;
  private to = 0;
  private t = 1;
  private duration = 1;

  constructor(private readonly ease: EasingFn) {}

  retarget(to: number, durationMs: number): void {
    if (to === this.to) return;
    this.from = this.value;
    this.to = to;
    this.t = 0;
    this.duration = Math.max(1e-3, durationMs / 1000);
  }

  step(dt: number): void {
    if (this.t >= this.duration) {
      this.value = this.to;
      return;
    }
    this.t = Math.min(this.duration, this.t + dt);
    this.value = this.from + (this.to - this.from) * this.ease(this.t / this.duration);
  }

  get settled(): boolean {
    return this.t >= this.duration && this.value === this.to;
  }

  reset(value = 0): void {
    this.value = value;
    this.from = value;
    this.to = value;
    this.t = 1;
  }
}

interface Glide {
  /** Waypoints from the start; `cum[i]` is the path length up to point i. */
  path: Vec2[];
  cum: number[];
  total: number;
  travelled: number;
  speed: number;
  cruise: number;
  /** Eases the speed from where the glide began up to `cruise`. */
  ramp: Ramp;
  /** Closing deceleration, once started: `from` is the distance already travelled. */
  brake: { elapsed: number; duration: number; startSpeed: number; from: number } | null;
  settleMs: number;
  /** Planned view change; null for scripted advances, which hold the view. */
  view: {
    yawFrom: number;
    yawMain: number;
    yawFrame: number;
    /** Where the turn ends: the target's own yaw when it is a plain turn to it, so the landing is exact. */
    yawTo: number;
    pitchFrom: number;
    pitchTo: number;
    yawOffset: number;
    pitchOffset: number;
    frameElapsed: number;
  } | null;
  /** The visitor looked or turned: the plan for the view is dropped, travel carries on. */
  viewFree: boolean;
  scripted: boolean;
  onDone: (() => void) | undefined;
}

/** A glide never paces faster than its length over this, nor slower than MIN_GLIDE_MPS. */
const SHORT_MOVE_SECONDS = 0.8;
const MIN_GLIDE_MPS = 0.12;
/** Scripted advances start and stop a little faster than a glide so the cruise stays near walking pace. */
const ADVANCE_ACCEL_MS = 250;
const ADVANCE_SETTLE_MS = 400;
/** A view left past a new yaw limit comes back inside with this time constant. */
const EXCESS_TAU_S = 0.12;
const MAX_FREE_STEP_MS = 50;
const MAX_SCRIPTED_STEP_MS = 400;
const SUBSTEP_MS = 25;
const DEG = Math.PI / 180;
const wrap180 = (deg: number): number => {
  const w = ((((deg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};
const moveToward = (value: number, goal: number, maxDelta: number): number =>
  Math.abs(goal - value) <= maxDelta ? goal : value + Math.sign(goal - value) * maxDelta;

export function createFirstPerson(config: FirstPersonConfig): FirstPerson {
  const tuning: Tuning = {
    ...DEFAULT_TUNING,
    ...config.tuning,
    nudge: { ...DEFAULT_TUNING.nudge, ...config.tuning?.nudge },
    glide: { ...DEFAULT_TUNING.glide, ...config.tuning?.glide },
  };
  const ease = cubicBezier(tuning.easing);
  /** Distance covered while stopping from speed v over t seconds is v * t * STOP_FRACTION. */
  const STOP_FRACTION = 1 - integrate01(ease);
  const STOP_TABLE_STEPS = 512;
  const stopTable = new Float64Array(STOP_TABLE_STEPS + 1);
  for (let i = 1; i <= STOP_TABLE_STEPS; i += 1) {
    const u0 = (i - 1) / STOP_TABLE_STEPS;
    const u1 = i / STOP_TABLE_STEPS;
    stopTable[i] = (stopTable[i - 1] ?? 0) + (1 - ease((u0 + u1) / 2)) * (u1 - u0);
  }
  /** ∫₀ᵘ (1 - ease), the fraction of a braking distance covered by braking progress u. */
  const stopProgress = (u: number): number => {
    const f = clamp(u, 0, 1) * STOP_TABLE_STEPS;
    const i = Math.min(STOP_TABLE_STEPS - 1, Math.floor(f));
    return lerp(stopTable[i] ?? 0, stopTable[i + 1] ?? 0, f - i);
  };

  const soft = config.softStopM ?? { x: 0, z: 0 };
  if (!config.stage && !config.bounds) throw new Error('createFirstPerson needs bounds or a stage');
  const ground: Walkable = config.stage ? polygonWalkable(config.stage.walkable) : rectWalkable(config.bounds ?? []);
  const stage = config.stage ?? null;
  /** The screen's horizontal field of view: the yaw limit is derived from it. */
  let hfov = 0;
  const softEdge = stage?.softEdgeDeg ?? DEFAULT_SOFT_EDGE_DEG;
  const yawLimit = (): number => (stage ? yawLimitDeg(stage, hfov) : Number.POSITIVE_INFINITY);
  /** Brings an absolute yaw inside the stage's limit (continuously: a yaw past it goes to the limit it is nearest). */
  const clampYaw = (yaw: number): number => {
    if (!stage) return yaw;
    const rel = yawRelative(stage, yaw);
    const limit = yawLimit();
    if (Math.abs(rel) <= limit) return yaw;
    return yaw + (Math.sign(rel) * limit - rel);
  };
  /** How far the view is past the stage's limit, in degrees (0 when inside it, or without a stage). */
  const yawExcess = (): number => (stage ? Math.max(0, Math.abs(yawRelative(stage, pose.yawDeg)) - yawLimit()) : 0);
  /**
   * Turns the view by `deltaDeg`, scaled smoothly to nothing over the last `softEdge` degrees before
   * the limit (smoothstep), in steps of at most a degree so a big turn is eased through the zone too.
   */
  const turnBy = (deltaDeg: number): void => {
    if (!stage) {
      pose.yawDeg += deltaDeg;
      return;
    }
    const limit = yawLimit();
    let left = deltaDeg;
    while (Math.abs(left) > 1e-9) {
      const step = Math.sign(left) * Math.min(1, Math.abs(left));
      const rel = yawRelative(stage, pose.yawDeg);
      const scale = edgeScale(rel, step, limit, softEdge);
      if (scale === 0) break;
      pose.yawDeg += step * scale;
      left -= step;
      // A turn that was inside the limit never ends outside it (a stage with no soft edge is a hard
      // stop). A view already outside it (the screen narrowed) is left to ease back; it is never clamped here.
      if (Math.abs(rel) <= limit && Math.abs(yawRelative(stage, pose.yawDeg)) > limit) {
        pose.yawDeg = clampYaw(pose.yawDeg);
        break;
      }
    }
  };
  const pose: Pose = { ...config.start };
  const fwd = new Ramp(ease);
  const turnRamp = new Ramp(ease);
  const holds = new Map<string, Hold>();
  const turns = new Map<string, Hold>();
  let pending = 0;
  let glide: Glide | null = null;
  let locked = false;
  let reduced = config.reducedMotion ?? false;
  let speed = 0;
  /** Ground velocity of the last step, to carry across mode changes. */
  const velocity: Vec2 = { x: 0, z: 0 };

  const sumHolds = (m: Map<string, Hold>): number => {
    let sum = 0;
    for (const v of m.values()) sum += v;
    return clamp(sum, -1, 1);
  };

  const rampMs = (from: number, to: number): number => {
    if (from * to < 0) return tuning.stopMs + tuning.accelerateMs;
    return Math.abs(to) > Math.abs(from) ? tuning.accelerateMs : tuning.stopMs;
  };

  const forward = (): Vec2 => ({ x: Math.sin(pose.yawDeg * DEG), z: -Math.cos(pose.yawDeg * DEG) });

  /**
   * Fraction of full speed allowed toward a boundary `run` metres away. Speed falls as the
   * two-thirds power of the distance left, which is a cubic ease-out in time: the slowing is
   * felt from the start of the zone, grows gently, and the camera arrives at rest in finite time.
   */
  const allowed = (run: number, distance: number): number => {
    if (run <= 0.002) return 0;
    if (distance <= 0) return 1;
    return Math.pow(clamp(run / distance, 0, 1), 2 / 3);
  };

  const setView = (target: { yawDeg?: number | undefined; pitchDeg?: number | undefined }) => {
    if (target.yawDeg !== undefined) pose.yawDeg = clampYaw(target.yawDeg);
    if (target.pitchDeg !== undefined)
      pose.pitchDeg = clamp(target.pitchDeg, -tuning.pitchLimitDeg, tuning.pitchLimitDeg);
  };

  const stopAll = () => {
    fwd.reset();
    turnRamp.reset();
    pending = 0;
    glide = null;
    speed = 0;
    velocity.x = 0;
    velocity.z = 0;
  };

  function cutTo(target: GlideTarget): void {
    config.beforeCut?.();
    stopAll();
    pose.x = target.x;
    pose.z = target.z;
    setView(target);
  }

  function pathPoint(g: Glide, s: number): Vec2 {
    const last = g.path.length - 1;
    if (s >= g.total) return g.path[last] ?? { x: pose.x, z: pose.z };
    for (let i = 1; i <= last; i += 1) {
      const end = g.cum[i] ?? 0;
      if (s <= end) {
        const a = g.path[i - 1] as Vec2;
        const b = g.path[i] as Vec2;
        const begin = g.cum[i - 1] ?? 0;
        const t = end > begin ? (s - begin) / (end - begin) : 1;
        return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
      }
    }
    return g.path[last] as Vec2;
  }

  function pathDirection(g: Glide, s: number): Vec2 {
    const last = g.path.length - 1;
    for (let i = 1; i <= last; i += 1) {
      if (s <= (g.cum[i] ?? 0) || i === last) {
        const a = g.path[i - 1] as Vec2;
        const b = g.path[i] as Vec2;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        return len > 0 ? { x: (b.x - a.x) / len, z: (b.z - a.z) / len } : { x: 0, z: 0 };
      }
    }
    return { x: 0, z: 0 };
  }

  function buildPath(from: Vec2, to: Vec2): Vec2[] {
    if (ground.segmentInside(from, to)) return [from, to];
    let best: Vec2[] | null = null;
    let bestLength = Infinity;
    for (const gate of config.gates ?? []) {
      if (!ground.segmentInside(from, gate) || !ground.segmentInside(gate, to)) continue;
      const length = Math.hypot(gate.x - from.x, gate.z - from.z) + Math.hypot(to.x - gate.x, to.z - gate.z);
      if (length < bestLength) {
        bestLength = length;
        best = [from, gate, to];
      }
    }
    return best ?? [from, to];
  }

  function startGlide(
    path: Vec2[],
    init: Pick<Glide, 'cruise' | 'scripted' | 'onDone' | 'settleMs'> & { view: Glide['view']; accelMs: number },
  ): void {
    const cum = [0];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1] as Vec2;
      const b = path[i] as Vec2;
      cum.push((cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const ramp = new Ramp(ease);
    const first = path.length > 1 ? (path[1] as Vec2) : (path[0] as Vec2);
    const start = path[0] as Vec2;
    const len = Math.hypot(first.x - start.x, first.z - start.z);
    // Carry the speed we already have along the new direction, so retargeting never jerks.
    const carried =
      len > 0 && !init.scripted
        ? Math.max(0, (velocity.x * (first.x - start.x) + velocity.z * (first.z - start.z)) / len)
        : 0;
    ramp.reset(Math.min(carried, init.cruise));
    ramp.retarget(init.cruise, init.accelMs);
    fwd.reset();
    turnRamp.reset();
    pending = 0;
    glide = {
      path,
      cum,
      total: cum[cum.length - 1] ?? 0,
      travelled: 0,
      speed: ramp.value,
      cruise: init.cruise,
      ramp,
      brake: null,
      settleMs: init.settleMs,
      view: init.view,
      viewFree: false,
      scripted: init.scripted,
      onDone: init.onDone,
    };
  }

  function glideTo(target: GlideTarget, options: GlideOptions = {}): void {
    if (locked) return;
    if (reduced) {
      cutTo(target);
      options.onDone?.();
      return;
    }
    const goal = ground.nearest(target);
    const from = { x: pose.x, z: pose.z };
    const path = buildPath(from, goal);
    let view: Glide['view'] = null;
    const wantsView = target.yawDeg !== undefined || target.pitchDeg !== undefined;
    if (wantsView) {
      // The way round to the framed heading, kept inside the stage's limit (a glide never frames a view
      // beyond it). Where nothing is limited the glide lands on exactly the heading it was given.
      const around = target.yawDeg === undefined ? undefined : pose.yawDeg + wrap180(target.yawDeg - pose.yawDeg);
      const goalYaw = around === undefined ? undefined : clampYaw(around);
      const delta = goalYaw !== undefined ? goalYaw - pose.yawDeg : 0;
      const framing =
        options.frame === false ? 0 : clamp(delta, -tuning.glide.framingMaxDeg, tuning.glide.framingMaxDeg);
      const exact = target.yawDeg !== undefined && goalYaw !== undefined && Math.abs(goalYaw - target.yawDeg) < 1e-9;
      view = {
        yawFrom: pose.yawDeg,
        yawMain: delta - framing,
        yawFrame: framing,
        yawTo: exact ? (target.yawDeg as number) : (goalYaw ?? pose.yawDeg),
        pitchFrom: pose.pitchDeg,
        pitchTo: clamp(target.pitchDeg ?? pose.pitchDeg, -tuning.pitchLimitDeg, tuning.pitchLimitDeg),
        yawOffset: 0,
        pitchOffset: 0,
        frameElapsed: -1,
      };
    }
    // A short move must not launch at the full assisted speed and stop dead: its pace scales
    // with its length, so even a step takes the better part of a second.
    let length = 0;
    for (let i = 1; i < path.length; i += 1) {
      length += Math.hypot(
        (path[i] as Vec2).x - (path[i - 1] as Vec2).x,
        (path[i] as Vec2).z - (path[i - 1] as Vec2).z,
      );
    }
    const cruise = clamp(length / SHORT_MOVE_SECONDS, MIN_GLIDE_MPS, options.speedMps ?? tuning.glideMps);
    startGlide(path, {
      cruise,
      scripted: false,
      onDone: options.onDone,
      settleMs: tuning.glide.settleMs,
      accelMs: tuning.accelerateMs,
      view,
    });
  }

  function advance(direction: Vec2, metres: number, durationMs: number, options: AdvanceOptions = {}): void {
    const len = Math.hypot(direction.x, direction.z) || 1;
    const end = { x: pose.x + (direction.x / len) * metres, z: pose.z + (direction.z / len) * metres };
    // Ramps shape the ends of the move; the cruise speed is whatever makes the whole take durationMs.
    const accelMs = Math.min(ADVANCE_ACCEL_MS, durationMs * 0.2);
    const settleMs = Math.min(ADVANCE_SETTLE_MS, durationMs * 0.3);
    // Distance = cruise * (T - accel * (1 - ∫ease) - settle * (1 - ∫(1 - ease))).
    const effective = (durationMs - accelMs * STOP_FRACTION - settleMs * (1 - STOP_FRACTION)) / 1000;
    const cruise = Math.abs(metres) / (effective > 0 ? effective : durationMs / 1000);
    // A view plan with nothing to frame: only the pitch moves, and the framing stage is already done.
    const view: Glide['view'] =
      options.pitchDeg === undefined
        ? null
        : {
            yawFrom: pose.yawDeg,
            yawMain: 0,
            yawFrame: 0,
            yawTo: pose.yawDeg,
            pitchFrom: pose.pitchDeg,
            pitchTo: clamp(options.pitchDeg, -tuning.pitchLimitDeg, tuning.pitchLimitDeg),
            yawOffset: 0,
            pitchOffset: 0,
            frameElapsed: tuning.glide.framingMs,
          };
    startGlide([{ x: pose.x, z: pose.z }, end], {
      cruise,
      scripted: true,
      onDone: options.onDone,
      settleMs,
      accelMs,
      view,
    });
  }

  function cancelGlide(): void {
    if (!glide) return;
    const f = forward();
    fwd.reset(velocity.x * f.x + velocity.z * f.z);
    glide = null;
  }

  function finishGlide(g: Glide): void {
    const end = g.path[g.path.length - 1] as Vec2;
    pose.x = end.x;
    pose.z = end.z;
    if (g.view && !g.viewFree) {
      pose.yawDeg = g.view.yawTo;
      pose.pitchDeg = g.view.pitchTo;
    }
    glide = null;
    fwd.reset();
    speed = 0;
    velocity.x = 0;
    velocity.z = 0;
    g.onDone?.();
  }

  function stepGlide(g: Glide, dt: number): void {
    const before = { x: pose.x, z: pose.z };
    // Travel: ease up to cruise, then close with a deceleration that lands exactly.
    if (g.brake) {
      g.brake.elapsed = Math.min(g.brake.duration, g.brake.elapsed + dt);
      const u = g.brake.elapsed / g.brake.duration;
      g.speed = g.brake.startSpeed * (1 - ease(u));
      g.travelled = g.brake.from + g.brake.startSpeed * g.brake.duration * stopProgress(u);
    } else {
      g.ramp.step(dt);
      g.speed = g.ramp.value;
      g.travelled = Math.min(g.total, g.travelled + g.speed * dt);
      const remaining = g.total - g.travelled;
      if (remaining <= 1e-4) {
        g.travelled = g.total;
      } else if (g.speed > 1e-3 && remaining <= g.speed * (g.settleMs / 1000) * STOP_FRACTION) {
        g.brake = {
          elapsed: 0,
          duration: remaining / (g.speed * STOP_FRACTION),
          startSpeed: g.speed,
          from: g.travelled,
        };
      }
    }
    if (g.brake && g.brake.elapsed >= g.brake.duration) g.travelled = g.total;
    const p = pathPoint(g, g.travelled);
    pose.x = p.x;
    pose.z = p.z;
    const dir = pathDirection(g, g.travelled);
    velocity.x = dir.x * g.speed;
    velocity.z = dir.z * g.speed;

    // View: follow the travel progress, rate-limited; frame the destination at the very end.
    let viewDone = true;
    const view = g.view;
    if (view && !g.viewFree) {
      const progress = g.total > 0 ? g.travelled / g.total : 1;
      const mainDone = Math.abs(view.yawOffset - view.yawMain) < 0.25;
      const brakingLeftMs = g.brake ? (g.brake.duration - g.brake.elapsed) * 1000 : Infinity;
      const arrived = g.travelled >= g.total;
      if (view.frameElapsed < 0 && mainDone && (arrived || brakingLeftMs <= tuning.glide.framingMs))
        view.frameElapsed = 0;
      else if (view.frameElapsed >= 0)
        view.frameElapsed = Math.min(tuning.glide.framingMs, view.frameElapsed + dt * 1000);
      const framed = view.frameElapsed >= 0 ? ease(view.frameElapsed / tuning.glide.framingMs) : 0;
      const yawGoal = view.yawMain * smoothstep01(progress) + view.yawFrame * framed;
      const pitchGoal = (view.pitchTo - view.pitchFrom) * smoothstep01(progress);
      const maxTurn = tuning.glide.turnDegPerS * dt;
      view.yawOffset = moveToward(view.yawOffset, yawGoal, maxTurn);
      view.pitchOffset = moveToward(view.pitchOffset, pitchGoal, maxTurn * 0.7);
      pose.yawDeg = view.yawFrom + view.yawOffset;
      pose.pitchDeg = view.pitchFrom + view.pitchOffset;
      viewDone =
        view.frameElapsed >= tuning.glide.framingMs &&
        Math.abs(view.yawOffset - (view.yawMain + view.yawFrame)) < 1e-6 &&
        Math.abs(view.pitchOffset - (view.pitchTo - view.pitchFrom)) < 1e-6;
    }

    speed = dt > 0 ? Math.hypot(pose.x - before.x, pose.z - before.z) / dt : 0;
    if (g.travelled >= g.total && viewDone) finishGlide(g);
  }

  function stepFree(dt: number): void {
    // Intent: keys and buttons set the target speed; wheel and swipe bank metres to cover.
    const keys = sumHolds(holds) * tuning.walkMps;
    let wheel = 0;
    if (pending !== 0) {
      const stopping = Math.abs(fwd.value) * (tuning.stopMs / 1000) * STOP_FRACTION;
      const braking = Math.sign(fwd.value) === Math.sign(pending) && Math.abs(pending) <= stopping;
      wheel = braking ? 0 : Math.sign(pending) * tuning.walkMps;
    }
    const target = clamp(keys + wheel, -tuning.walkMps, tuning.walkMps);
    fwd.retarget(target, rampMs(fwd.value, target));
    fwd.step(dt);

    const f = forward();
    const here = { x: pose.x, z: pose.z };
    const vx = fwd.value * f.x;
    const vz = fwd.value * f.z;
    let dx = vx * dt;
    let dz = vz * dt;
    if (dx !== 0) {
      const e = ground.extent(here, 'x');
      dx *= allowed(dx > 0 ? e.hi - here.x : here.x - e.lo, soft.x);
    }
    if (dz !== 0) {
      const e = ground.extent(here, 'z');
      dz *= allowed(dz > 0 ? e.hi - here.z : here.z - e.lo, soft.z);
    }
    const next = ground.slide(here, { x: dx, z: dz });
    pose.x = next.x;
    pose.z = next.z;
    const moved = { x: next.x - here.x, z: next.z - here.z };
    speed = dt > 0 ? Math.hypot(moved.x, moved.z) / dt : 0;
    velocity.x = dt > 0 ? moved.x / dt : 0;
    velocity.z = dt > 0 ? moved.z / dt : 0;

    if (pending !== 0) {
      const along = moved.x * f.x + moved.z * f.z;
      const left = pending - along;
      pending = Math.sign(left) === Math.sign(pending) ? left : 0;
      // Blocked by a boundary, or a remainder too small to be worth a frame: let it go.
      if (Math.abs(pending) < 0.015 && Math.abs(fwd.value) < 0.05) pending = 0;
      if (Math.abs(fwd.value) > 0.05 && Math.abs(along) < 1e-6) pending = 0;
    }
  }

  function advanceBy(dt: number): void {
    // Key turning works in every mode; a turn during a glide takes the view away from its plan.
    const turning = sumHolds(turns) * tuning.turnDegPerS;
    turnRamp.retarget(turning, rampMs(turnRamp.value, turning));
    turnRamp.step(dt);
    if (turnRamp.value !== 0 && glide?.view) glide.viewFree = true;
    turnBy(turnRamp.value * dt);
    if (glide) stepGlide(glide, dt);
    else stepFree(dt);
    // A screen that turned (a phone laid on its side) can leave the view past its new limit: ease
    // back inside over about a tenth of a second, never snapping.
    if (stage) {
      const excess = yawExcess();
      if (excess > 0) {
        const back = excess < 0.01 ? excess : excess * (1 - Math.exp(-dt / EXCESS_TAU_S));
        pose.yawDeg -= Math.sign(yawRelative(stage, pose.yawDeg)) * back;
        if (glide?.view) glide.viewFree = true;
      }
    }
  }

  const controller: FirstPerson = {
    get pose() {
      return pose;
    },
    get speed() {
      return speed;
    },
    get gliding() {
      return glide !== null;
    },
    get active() {
      return (
        glide !== null ||
        sumHolds(holds) !== 0 ||
        sumHolds(turns) !== 0 ||
        !fwd.settled ||
        !turnRamp.settled ||
        pending !== 0 ||
        yawExcess() > 1e-6
      );
    },
    get reducedMotion() {
      return reduced;
    },
    get yawLimitDeg() {
      return yawLimit();
    },
    setLens(horizontalFovDeg) {
      hfov = Math.max(0, horizontalFovDeg);
    },

    step(dtMs) {
      // A stalled frame must not lurch a walk, so free movement never advances more than 50 ms at
      // once. A scripted move (through a door) is on a schedule shared with sound, so it keeps
      // pace with the clock through a longer hitch. Either way the work is done in small steps.
      let remaining = clamp(dtMs, 0, glide?.scripted ? MAX_SCRIPTED_STEP_MS : MAX_FREE_STEP_MS);
      while (remaining > 0) {
        const slice = Math.min(remaining, SUBSTEP_MS);
        advanceBy(slice / 1000);
        remaining -= slice;
      }
      return controller.active;
    },

    hold(source, dir) {
      if (locked || reduced) return;
      if (dir === 0) holds.delete(source);
      else {
        holds.set(source, dir);
        cancelGlide();
      }
    },

    turn(source, dir) {
      if (locked || reduced) return;
      if (dir === 0) turns.delete(source);
      else {
        turns.set(source, dir);
        if (glide?.view) glide.viewFree = true;
      }
    },

    nudge(metres) {
      if (locked || reduced || metres === 0) return;
      cancelGlide();
      const next = pending + metres;
      // Reversing cancels what was banked: the visitor who scrolls back wants to go back now.
      pending = Math.sign(metres) !== Math.sign(pending) && pending !== 0 ? metres : next;
      pending = clamp(pending, -tuning.nudge.maxPendingM, tuning.nudge.maxPendingM);
    },

    look(dYawDeg, dPitchDeg) {
      if (locked) return;
      turnBy(dYawDeg);
      pose.pitchDeg = clamp(pose.pitchDeg + dPitchDeg, -tuning.pitchLimitDeg, tuning.pitchLimitDeg);
      if (glide?.view) glide.viewFree = true;
    },

    glideTo,
    advance,
    cancelGlide,
    cutTo,

    setPose(next) {
      stopAll();
      if (next.x !== undefined) pose.x = next.x;
      if (next.z !== undefined) pose.z = next.z;
      setView(next);
    },

    releaseInput() {
      holds.clear();
      turns.clear();
      pending = 0;
    },

    lock(value) {
      locked = value;
      if (value) {
        holds.clear();
        turns.clear();
        pending = 0;
      }
    },

    setReducedMotion(value) {
      reduced = value;
      if (value) {
        holds.clear();
        turns.clear();
        stopAll();
      }
    },
  };

  if (!ground.contains({ x: pose.x, z: pose.z })) {
    const p = ground.nearest({ x: pose.x, z: pose.z });
    pose.x = p.x;
    pose.z = p.z;
  }
  return controller;
}
