import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { nameplateRotation } from './nameplate.ts';
import { officeAssetSlot } from './assetSlots.ts';
import { EYE_HEIGHT, VIEWPOINTS } from './navigation.ts';

it('keeps the inscription physically out of sight at every standing station until the reveal', () => {
  const mesh = new Mesh(new PlaneGeometry(1, .28), new MeshBasicMaterial());
  mesh.position.fromArray(officeAssetSlot('officer-nameplate').position);
  const ray = new Raycaster();
  for (const reveal of [0, 1]) {
    mesh.rotation.set(...nameplateRotation(reveal)); mesh.updateMatrixWorld(true);
    for (const pose of Object.values(VIEWPOINTS)) {
      const eye = new Vector3(pose.x, EYE_HEIGHT, pose.z);
      ray.set(eye, mesh.position.clone().sub(eye).normalize());
      expect(ray.intersectObject(mesh).length > 0, `reveal ${reveal}, station ${pose.x},${pose.z}`).toBe(reveal > 0);
    }
  }
  mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
});
