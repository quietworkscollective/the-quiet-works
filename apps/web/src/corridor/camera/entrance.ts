import { lerp } from '../../firstPerson/easing.ts';
import type { Pose } from '../../firstPerson/controller.ts';
import { SITE_SCROLL } from '../../timing.ts';
import { handoverPose, landingPose } from './viewpoints.ts';

/**
 * The landing walk-in: how far the camera is along its way from the hero's first frame to the
 * starting view, as a function of scroll progress. The keys in `ENTRANCE_KEYS` are hit exactly;
 * between them the path is a monotone cubic (Fritsch-Carlson), so the walk never overshoots a key
 * and its speed has no corners where one beat hands over to the next, which scroll-driven motion
 * otherwise makes obvious.
 */
export interface Key {
  t: number;
  s: number;
}

export const WALK_IN_KEYS: readonly Key[] = [
  { t: 0, s: 0 },
  { t: 0.16, s: 0.04 },
  { t: 0.4, s: 0.34 },
  { t: 0.64, s: 0.64 },
  { t: 0.9, s: 1 },
  { t: 1, s: 1 },
];

export function createEntrancePath(keys: readonly Key[] = WALK_IN_KEYS): (t: number) => number {
  const n = keys.length;
  if (n === 0) return () => 0;
  const first = keys[0] as Key;
  const last = keys[n - 1] as Key;
  const h: number[] = [];
  const delta: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const a = keys[k] as Key;
    const b = keys[k + 1] as Key;
    h.push(b.t - a.t);
    delta.push((b.s - a.s) / (b.t - a.t || 1));
  }
  const m: number[] = new Array<number>(n).fill(0);
  if (n > 1) {
    for (let k = 1; k < n - 1; k += 1) {
      const d0 = delta[k - 1] as number;
      const d1 = delta[k] as number;
      if (d0 * d1 <= 0) {
        m[k] = 0;
      } else {
        const w1 = 2 * (h[k] as number) + (h[k - 1] as number);
        const w2 = (h[k] as number) + 2 * (h[k - 1] as number);
        m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
      }
    }
    // Ends: a one-sided estimate that keeps the shape (no overshoot of the end segment).
    const end = (h0: number, h1: number, d0: number, d1: number): number => {
      let value = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (Math.sign(value) !== Math.sign(d0)) value = 0;
      else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(value) > 3 * Math.abs(d0)) value = 3 * d0;
      return value;
    };
    if (n > 2) {
      m[0] = end(h[0] as number, h[1] as number, delta[0] as number, delta[1] as number);
      m[n - 1] = end(h[n - 2] as number, h[n - 3] as number, delta[n - 2] as number, delta[n - 3] as number);
    } else {
      m[0] = delta[0] as number;
      m[1] = delta[0] as number;
    }
  }

  return (t) => {
    if (t <= first.t) return first.s;
    if (t >= last.t) return last.s;
    let k = 0;
    while (k < n - 2 && t > (keys[k + 1] as Key).t) k += 1;
    const a = keys[k] as Key;
    const b = keys[k + 1] as Key;
    const hk = h[k] as number;
    const s = (t - a.t) / hk;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * a.s +
      (s3 - 2 * s2 + s) * hk * (m[k] as number) +
      (-2 * s3 + 3 * s2) * b.s +
      (s3 - s2) * hk * (m[k + 1] as number)
    );
  };
}

/** The fraction of the way from the hero to the starting view at walk-in progress `t`. */
export const entranceProgress = createEntrancePath();

/** The desktop camera depth along the walk-in, retained for legacy site choreography assertions. */
export const entranceZ = (t: number): number => landingPose(false).z + (handoverPose(false).z - landingPose(false).z) * entranceProgress(t);

/**
 * The camera at walk-in progress `t` (0 at the first frame, 1 at the hand-over): the hero's pose
 * moved `entranceProgress(t)` of the way to the starting view, in position, heading and pitch alike.
 * The screen's shape picks the pair, so a phone's walk-in ends at the phone's starting view. At
 * `t = 1` this is exactly `handoverPose`, which is what makes the hand-over a continuation of the
 * walk-in and not a cut.
 */
export function entrancePose(t: number, portrait: boolean): Pose {
  const from = landingPose(portrait);
  const to = handoverPose(portrait);
  const s = entranceProgress(t);
  if (s <= 0) return from;
  if (s >= 1) return to;
  return {
    x: lerp(from.x, to.x, s),
    z: lerp(from.z, to.z, s),
    yawDeg: lerp(from.yawDeg, to.yawDeg, s),
    pitchDeg: lerp(from.pitchDeg, to.pitchDeg, s),
  };
}

/**
 * Where on the authored walk-in (0 at the first frame, 1 at the hand-over) the page's scroll
 * progress puts the camera. The hand-over is reached at `SITE_SCROLL.handoverAt` of the run,
 * behind the full smoke veil, and the camera holds there while the veil clears.
 */
export function walkT(progress: number, handoverAt: number = SITE_SCROLL.handoverAt): number {
  return Math.min(1, Math.max(0, progress / handoverAt));
}

/**
 * Exponential smoothing of the scroll-driven pose: 95% of any change is made within
 * `smoothingMs` (ADR 0001: at most 120 ms, and no automatic travel, so it never runs on). One
 * follower per pose component; the name is the first one it served, the camera's z.
 */
export interface EntranceFollower {
  readonly z: number;
  /** Moves toward `target`; returns the new value. */
  step(dtMs: number, target: number): number;
  /** Jumps to `value` (first frame, or a change of mode). */
  reset(value: number): void;
  settled(target: number): boolean;
}

/** Closer than this to its target, the follower is there. */
const SNAP = 0.002;

export function createEntranceFollower(smoothingMs: number, initial: number): EntranceFollower {
  // 1 - exp(-3) = 95%: three time constants fit in the smoothing window.
  const tau = smoothingMs / 3;
  let value = initial;
  return {
    get z() {
      return value;
    },
    step(dtMs, target) {
      value += (target - value) * (1 - Math.exp(-dtMs / tau));
      // Within 2 mm (or 0.002 degrees) is the target: the tail of an exponential would otherwise take half a second.
      if (Math.abs(target - value) < SNAP) value = target;
      return value;
    },
    reset(next) {
      value = next;
    },
    settled(target) {
      return value === target;
    },
  };
}
