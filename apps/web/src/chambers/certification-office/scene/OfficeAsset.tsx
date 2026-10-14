import type { ReactNode } from 'react';
import type { Object3D } from 'three';
import { officeAssetPose } from './assetSlots.ts';

/** A geometry-only mount. Hit targets and state handlers belong outside this mount.
 * Catalogue instances are per placement; the licensed-asset loader owns their disposal.
 */
export function OfficeAsset({ id, children, model, fittings = [] }: { id: string; children: ReactNode; model?: Object3D | null; fittings?: readonly string[] }) {
  return <group {...officeAssetPose(id)} dispose={null} userData={{officeObjectIds:fittings}}>
    {model ? <primitive object={model} /> : children}
  </group>;
}
