import { createContext } from 'react';
import type { Object3D } from 'three';
import type { PropId } from '../../props.ts';
import type { PropVisual, PartSpec } from './model.ts';
import type { PropPlacement } from './placement.ts';

/**
 * The seam between what a prop does and what it looks like. A prop's behaviour (its named moving
 * parts, its poses, its hit area, the glow of its ivory fitting, its labels and ambient touches)
 * never reads its geometry, so the geometry can be replaced by a real model without touching any of
 * that. There are two ways to replace it, per prop:
 *
 *  - a procedural visual: another `PropVisual` that builds into the shared assembly, and may take a
 *    loaded model's meshes in with `Assembly.mesh` (one draw call per material channel, shared with
 *    the other props, vertex-tinted);
 *  - an external visual: the model's own scene graph with its own textured materials, mounted by
 *    the rig, with the behaviour's poses applied to its part nodes. It costs the draw calls its
 *    materials cost, so it suits a hero prop better than all twelve.
 *
 * The provider is a React context so that whatever loads the models (the asset lane) can supply
 * them above the corridor without a change to the `CorridorProps` contract.
 */

/** A mounted external visual. */
export interface ExternalInstance {
  /** Added under the props' root, in world space. Static geometry lives here. */
  root: Object3D;
  /**
   * The node that carries a moving part. At rest it sits at the part's pivot in world space with no
   * rotation (the rig sets its position, quaternion and scale each time the part's pose changes), and
   * the part's meshes are its children, positioned relative to the pivot.
   */
  part(name: string): Object3D | undefined;
  /** Lighten the ivory fitting by `gain` (0 at rest, at most about 0.4): the glow cue for a model with its own materials. */
  setGlow?(gain: number): void;
  /** Free what the instance made. */
  dispose(): void;
}

/** Makes an external visual for a prop: the placement (prop-local to world) and the parts the behaviour names. */
export type ExternalFactory = (placement: PropPlacement, parts: readonly PartSpec[]) => ExternalInstance;

export interface PropVisuals {
  procedural?: Partial<Record<PropId, PropVisual>>;
  external?: Partial<Record<PropId, ExternalFactory>>;
}

/** Visuals to use instead of the procedural defaults; none unless a provider says. */
export const PropVisualsContext = createContext<PropVisuals>({});
