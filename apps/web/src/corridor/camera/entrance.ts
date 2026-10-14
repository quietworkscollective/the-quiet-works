import { clamp01, cubicBezier } from '../../firstPerson/easing.ts';
import { SITE_SCROLL, WALK_EASING } from '../../timing.ts';
import { ENTRANCE_KEYS } from '../layout.ts';

/**
 * The landing walk-in: camera z along the axis as a function of scroll progress. The keys in
 * `ENTRANCE_KEYS` are hit exactly; between them the path is a monotone cubic (Fritsch-Carlson),
 * so the walk never overshoots a key and its speed has no corners where one beat hands over to
 * the next, which scroll-driven motion otherwise makes obvious.
 */
export interface Key {
  t: number;
  z: number;
}

export function createEntrancePath(keys: readonly Key[] = ENTRANCE_KEYS): (t: number) => number {
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
    delta.push((b.z - a.z) / (b.t - a.t || 1));
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
    if (t <= first.t) return first.z;
    if (t >= last.t) return last.z;
    let k = 0;
    while (k < n - 2 && t > (keys[k + 1] as Key).t) k += 1;
    const a = keys[k] as Key;
    const b = keys[k + 1] as Key;
    const hk = h[k] as number;
    const s = (t - a.t) / hk;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * a.z +
      (s3 - 2 * s2 + s) * hk * (m[k] as number) +
      (-2 * s3 + 3 * s2) * b.z +
      (s3 - s2) * hk * (m[k + 1] as number)
    );
  };
}

export const entranceZ = createEntrancePath();

/**
 * Where on the authored walk-in (0 at the first frame, 1 at the hand-over) the page's scroll
 * progress puts the camera. The hand-over is reached at `SITE_SCROLL.handoverAt` of the run,
 * behind the full smoke veil, and the camera holds there while the veil clears.
 */
export function walkT(progress: number, handoverAt: number = SITE_SCROLL.handoverAt): number {
  return Math.min(1, Math.max(0, progress / handoverAt));
}

/**
 * Exponential smoothing of the scroll-driven position: 95% of any change is made within
 * `smoothingMs` (ADR 0001: at most 120 ms, and no automatic travel, so it never runs on).
 */
export interface EntranceFollower {
  readonly z: number;
  /** Moves toward `targetZ`; returns the new z. */
  step(dtMs: number, targetZ: number): number;
  /** Jumps to `z` (first frame, or a change of mode). */
  reset(z: number): void;
  settled(targetZ: number): boolean;
}

/** Closer than this to its target, the follower is there. */
const SNAP_M = 0.002;

export function createEntranceFollower(smoothingMs: number, initialZ: number): EntranceFollower {
  // 1 - exp(-3) = 95%: three time constants fit in the smoothing window.
  const tau = smoothingMs / 3;
  let z = initialZ;
  return {
    get z() {
      return z;
    },
    step(dtMs, targetZ) {
      z += (targetZ - z) * (1 - Math.exp(-dtMs / tau));
      // Within 2 mm is the target: the tail of an exponential would otherwise take half a second.
      if (Math.abs(targetZ - z) < SNAP_M) z = targetZ;
      return z;
    },
    reset(next) {
      z = next;
    },
    settled(targetZ) {
      return z === targetZ;
    },
  };
}

/**
 * The settle beat: the last tenth of the walk-in, progress 0.90 to 1.00. In portrait the view
 * turns toward the open door over it (`HANDOVER_PORTRAIT_TURN_DEG`), so the one lit door is in
 * the narrow lens when free walking begins.
 */
export const SETTLE_BEAT_FROM = 0.9;

const settleEase = cubicBezier(WALK_EASING);

/**
 * Yaw in degrees along the walk-in: 0 until the settle beat, then `turnDeg` toward +x (the
 * visitor's right) eased with the walk easing, reaching exactly `turnDeg` at progress 1. A
 * landscape screen passes 0 and never turns. Reverse scrolling turns back.
 */
export function entranceYaw(progress: number, turnDeg: number): number {
  if (turnDeg === 0) return 0;
  return turnDeg * settleEase(clamp01((progress - SETTLE_BEAT_FROM) / (1 - SETTLE_BEAT_FROM)));
}
