import type { Vec3 } from '../environment/layout.ts';
import type { LightConeSpec } from './data.ts';
import type { VisibleCone } from './cones.ts';

/**
 * A lamp that may carry a cone. A space lists its lamps (position, and the way the shaft points);
 * the stack draws the nearest few. `kind` names the cone spec in the profile (`sconce`,
 * `desk-lamp`, `window`, ...); a lamp whose kind the profile has no spec for is ignored.
 */
export interface AtmosphereLamp {
  readonly id: string;
  readonly kind: string;
  readonly position: Vec3;
  /** Direction the shaft points; need not be unit length. */
  readonly direction: Vec3;
}

/** Past this distance from the eye a cone is dropped: the fog has taken it, and it costs pixels. */
export const CONE_CULL_DISTANCE = 26;

function normalise(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * The cones to draw this frame: the lamps nearest the eye that have a spec, at most `maxVisible`,
 * nearest first, none beyond the cull distance. Pure, so it can be tested without a renderer.
 */
export function chooseCones(
  lamps: readonly AtmosphereLamp[],
  specs: readonly LightConeSpec[],
  eye: Vec3,
  maxVisible: number,
): VisibleCone[] {
  const byKind = new Map(specs.map((spec) => [spec.lamp, spec]));
  const candidates: { lamp: AtmosphereLamp; spec: LightConeSpec; distance: number }[] = [];
  for (const lamp of lamps) {
    const spec = byKind.get(lamp.kind);
    if (!spec) continue;
    const distance = Math.hypot(lamp.position[0] - eye[0], lamp.position[1] - eye[1], lamp.position[2] - eye[2]);
    if (distance > CONE_CULL_DISTANCE) continue;
    candidates.push({ lamp, spec, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, Math.max(0, maxVisible)).map(({ lamp, spec }) => ({ apex: lamp.position, axis: normalise(lamp.direction), spec }));
}
