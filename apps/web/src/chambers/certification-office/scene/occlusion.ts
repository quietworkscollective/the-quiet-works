import { Mesh, type Object3D, type Raycaster, type Scene } from 'three';
/** Invisible targets and the fitting's own casing cannot occlude its label. */
export function fittingOccluded(ray: Raycaster, scene: Scene, id: string, metres: number): boolean {
  ray.far = Math.max(0, metres - .015);
  return ray.intersectObjects(scene.children, true).some(hit => {
    let owned = false;
    for (let owner: Object3D | null = hit.object; owner; owner = owner.parent) {
      if (!owner.visible) return false;
      const ids = owner.userData['officeObjectIds'];
      if (owner.userData['officeObjectId'] === id || (Array.isArray(ids) && ids.includes(id))) owned = true;
    }
    if (owned || !(hit.object instanceof Mesh)) return false;
    const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
    return materials.some(material => material.visible && material.colorWrite && material.opacity > .9);
  });
}
