/**
 * Footstep cadence: when each step lands, from the walking speed the camera reports. Pure
 * arithmetic on the audio clock, no nodes, so the rate, the stop and the variation are testable
 * without a graph.
 *
 * Steps follow distance, not a metronome: the phase of the stride advances at `speed / stride`,
 * so easing in and out of a walk stretches the gaps the way a body does, and a glide at
 * 0.8 m/s is slower rather than quieter. Steps are committed a short lookahead before they land
 * and can be withdrawn, so stopping silences the steps that have not sounded yet and never cuts
 * one that has.
 */
import { SPINE_TIMING } from '../timing.ts';

/** The brief: about 1.6 steps a second at the walking pace of 1.1 m/s. */
export const STEPS_PER_S_AT_WALK = 1.6;
export const STRIDE_M = SPINE_TIMING.walkMps / STEPS_PER_S_AT_WALK;

/** Below this the camera is settling, not walking. */
const MIN_SPEED = 0.12;
const MAX_SPEED = 1.6;
/** A walk starts most of the way through a stride, so the first foot falls within about 0.25 s. */
const START_PHASE = 0.8;
/** No two steps closer than this, whatever the jitter does. */
const MIN_GAP_S = 0.22;
const JITTER_S = 0.01;
/** A step this far behind the audio clock is dropped, not played late in a rush. */
const STALL_S = 0.15;
const MIN_AHEAD_S = 0.004;
/** A step this close to sounding is left to finish when the walk stops. */
export const WITHDRAW_AFTER_S = 0.03;

export interface Step {
  readonly id: number;
  /** Audio-clock time of the heel strike. */
  readonly at: number;
  /** 0 left, 1 right; they alternate. */
  readonly foot: 0 | 1;
  /** About 0.78 at a crawl to 1 at the walking pace: a quicker stride lands a little harder. */
  readonly weight: number;
}

export class Cadence {
  private speed = 0;
  /** Fraction of the current stride completed at `phaseAt`. */
  private phase = 0;
  private phaseAt = 0;
  private foot: 0 | 1 = 0;
  private nextId = 1;
  private lastAt = Number.NEGATIVE_INFINITY;
  private committed: Step[] = [];

  constructor(private readonly rand: () => number) {}

  get walking(): boolean {
    return this.speed > 0;
  }

  /**
   * The speed in m/s as of audio time `now`. 0, or anything under the settling threshold, is
   * standing, and then the ids of steps to withdraw are returned (see `stop`).
   */
  setSpeed(now: number, mps: number): number[] {
    const next = !Number.isFinite(mps) || mps < MIN_SPEED ? 0 : Math.min(mps, MAX_SPEED);
    if (next === this.speed) return [];
    if (next === 0) return this.stop(now);
    if (this.speed > 0) this.advance(now);
    else {
      this.phase = START_PHASE;
      this.phaseAt = now;
    }
    this.speed = next;
    return [];
  }

  /** Steps to schedule now: those that land within `lookahead` seconds and have not been issued. */
  due(now: number, lookahead: number): Step[] {
    this.committed = this.committed.filter((step) => step.at > now - 1);
    if (this.speed === 0) return [];
    const issued: Step[] = [];
    // A long lookahead against a fast cadence could hold two; four is a hard ceiling.
    for (let guard = 0; guard < 4; guard += 1) {
      this.advance(now);
      const reachAt = this.phaseAt + ((1 - this.phase) * STRIDE_M) / this.speed;
      if (reachAt > now + lookahead) break;
      if (reachAt < now - STALL_S) {
        // The main thread stalled; do not catch up with a burst of steps.
        this.phase = 0;
        this.phaseAt = now;
        continue;
      }
      const jitter = (this.rand() * 2 - 1) * JITTER_S;
      const at = Math.max(reachAt + jitter, now + MIN_AHEAD_S, this.lastAt + MIN_GAP_S);
      const step: Step = {
        id: this.nextId,
        at,
        foot: this.foot,
        weight: 0.78 + 0.22 * Math.min(1.25, this.speed / SPINE_TIMING.walkMps),
      };
      this.nextId += 1;
      this.foot = this.foot === 0 ? 1 : 0;
      this.lastAt = at;
      this.phase = 0;
      this.phaseAt = Math.max(reachAt, at);
      this.committed.push(step);
      issued.push(step);
    }
    return issued;
  }

  /**
   * Stand still at `now`. Returns the ids of committed steps that have not yet sounded and
   * should be withdrawn; a step already underway, or about to start, is left to finish.
   */
  stop(now: number): number[] {
    this.speed = 0;
    this.phase = 0;
    const withdrawn = this.committed.filter((step) => step.at > now + WITHDRAW_AFTER_S).map((step) => step.id);
    this.committed = this.committed.filter((step) => step.at <= now + WITHDRAW_AFTER_S);
    return withdrawn;
  }

  private advance(now: number): void {
    // A committed step may still lie ahead; the stride is only integrated once it has passed.
    if (this.speed === 0 || now <= this.phaseAt) return;
    this.phase += (this.speed * (now - this.phaseAt)) / STRIDE_M;
    this.phaseAt = now;
  }
}
