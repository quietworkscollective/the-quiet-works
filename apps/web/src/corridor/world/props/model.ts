import type { PropId, PropMotion } from '../../props.ts';
import type { Assembly, PartSpec } from './parts.ts';
import type { PropPlacement } from './placement.ts';
import type { AmbientDrive, PoseSet } from './motion.ts';

export type { PartSpec };

/**
 * Which way an action is running. The interaction lane runs one timeline per activation: `action`
 * rises 0 to 1, holds at 1 (no frames are drawn), then falls 1 to 0, and the fall must read as the
 * natural close or reset. Most poses are a pure function of `action` alone, so the fall is the rise
 * run backwards (a drawer shuts, a chess piece goes back). The few that must not run backwards (a
 * drop of water falls, it does not climb; a ball turns once, it does not unwind) read the phase,
 * which the rig infers from whether `action` last went up or down.
 */
export type Phase = 'rising' | 'falling';

/**
 * What a prop does, apart from what it looks like: its moving parts (named, each with the point it
 * turns about) and how they sit for a given motion. Hit areas, the ivory fitting's glow, the
 * drafted labels and the ambient touches all hang off this, never off the geometry.
 */
export interface PropBehaviour {
  id: PropId;
  /** The moving parts, by name, with their pivots in prop-local space (see placement.ts). */
  parts(placement: PropPlacement): readonly PartSpec[];
  /**
   * Part poses for a motion, in the prop's own axes, keyed by part name. `reducedMotion` asks for
   * the gentlest honest version of the action (the lane then moves `action` only between 0 and 1,
   * with nothing in between).
   */
  pose(motion: PropMotion, ambient: AmbientDrive, reducedMotion: boolean, phase: Phase): PoseSet;
}

/**
 * What a prop looks like, built procedurally into the shared assembly: geometry in the prop's local
 * frame, each moving part attached with `Assembly.part(name)`, the ivory fitting wrapped in
 * `Assembly.ivory`. A visual may be swapped for another (a real model's meshes ingested with
 * `Assembly.mesh`) without touching the behaviour: see visuals.ts.
 */
export interface PropVisual {
  build(a: Assembly, placement: PropPlacement): void;
}

/** A prop: its behaviour and its default, procedural, visual. */
export interface PropModel extends PropBehaviour, PropVisual {}
