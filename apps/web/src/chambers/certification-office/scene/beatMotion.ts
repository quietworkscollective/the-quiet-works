import { Vector3, type Object3D } from 'three';
export { beatAt, beatDuration, beatKind, pressAt, impression, SPILL_STEPS } from '../../../../../../packages/engine/src/office/beats.ts';
export type { ImpressionPosition } from '../../../../../../packages/engine/src/office/beats.ts';

export function windowTarget(desk: Object3D, world: readonly [number, number, number]): Vector3 {
  desk.updateWorldMatrix(true, false);
  return desk.worldToLocal(new Vector3(...world));
}

/** Shared crease endpoints keep the accordion continuous even as it feeds over the edge. */
export function poseFoldPanel(panel: Object3D, index: number, folds: number, drape: number, origin: Vector3): void {
  let y = origin.y;
  let z = origin.z - 0.25;
  for (let i = 0; i <= index; i += 1) {
    const angle = i >= 4 ? drape / 0.32 : (i % 2 ? 0.16 : -0.16);
    const dy = -0.18 * Math.sin(angle);
    const dz = 0.18 * Math.cos(angle);
    const amount = Math.max(0, Math.min(1, folds - i));
    if (i === index) {
      panel.position.set(origin.x, y + dy * amount / 2, z + dz * amount / 2);
      panel.rotation.x = angle;
      panel.scale.z = amount;
    }
    y += dy;
    z += dz;
  }
}
