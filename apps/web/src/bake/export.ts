import { Mesh, MeshLambertMaterial, MeshStandardMaterial, Scene } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { digest, isStatic, materialSignature, meshId, sourceGeometry, transformGeometry, type BakeManifest, type BakeMaterial } from '../baked/contract.ts';
import { sceneLights } from '../baked/lights.ts';

function bakeMaterial(mesh: Mesh): BakeMaterial | null {
  if (Array.isArray(mesh.material)) return null;
  return mesh.material instanceof MeshStandardMaterial || mesh.material instanceof MeshLambertMaterial ? mesh.material : null;
}

export async function exportSpace(scene: Scene, space: BakeManifest['space'], sourceInputsHash?: string) {
  scene.updateMatrixWorld(true);
  const exported = new Scene();
  const meshes: Mesh[] = [];
  const occluders: Mesh[] = [];
  scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    const material = bakeMaterial(o);
    if (isStatic(o) && material) meshes.push(o);
    else if (material && !material.transparent && material.visible) {
      for (let ancestor = o.parent; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
      if (o.visible) occluders.push(o);
    }
  });
  const lights = sceneLights(scene, space, true);
  const staticLights = sceneLights(scene, space);
  // Clone the complete handover synchronously: later timer changes cannot mix poses.
  for (const mesh of [...meshes,...occluders]) {
    const copy = new Mesh(sourceGeometry(mesh), (bakeMaterial(mesh) as BakeMaterial).clone());
    copy.userData['bakeRole'] = occluders.includes(mesh) ? 'occluder' : 'receiver';
    copy.matrix.copy(mesh.matrixWorld);
    copy.matrixWorld.copy(mesh.matrixWorld);
    copy.matrixAutoUpdate = false;
    exported.add(copy);
  }
  const ids: string[] = [];
  const reflectance: string[] = [];
  const baseline: string[] = [];
  try {
    for (const copy of exported.children as Mesh[]) {
      const occluder = copy.userData['bakeRole'] === 'occluder';
      const id = await meshId(copy, copy.geometry);
      if (!occluder && ids.includes(id)) throw new Error(`Duplicate static mesh ${id}`);
      if (!occluder) ids.push(id);
      const material = copy.material as BakeMaterial;
      (occluder ? baseline : reflectance).push(id+':'+await materialSignature(material, sourceInputsHash));
      material.lightMap = null; material.aoMap = null; material.envMap = null;
      if ('normalMap' in material) material.normalMap = null;
      if ('bumpMap' in material) material.bumpMap = null;
      material.color.setRGB(Math.min(1, material.color.r), Math.min(1, material.color.g), Math.min(1, material.color.b));
      material.vertexColors = copy.geometry.hasAttribute('color');
      copy.name = `${occluder ? 'occluder' : 'bake'}_${id}`;
      copy.userData['bakeId'] = id;
      // Blender object transforms decompose shear. Put the complete affine pose into vertices.
      transformGeometry(copy.geometry, copy.matrix);
      copy.matrix.identity(); copy.matrixWorld.identity();
    }
    const hash = await digest(JSON.stringify({ meshes: [...ids].sort(), lights: staticLights }));
    const manifest: BakeManifest = { version: 1, space, hash, materialHash: await digest(reflectance.sort().join('\n')), baselineHash: await digest(JSON.stringify({ occluders: baseline.sort(), lights })), meshes: ids.sort(), lights, atlases: [] };
    const glb = await new GLTFExporter().parseAsync(exported, { binary: true, onlyVisible: true });
    if (!(glb instanceof ArrayBuffer)) throw new Error('Expected binary glTF');
    // Small chunks avoid overflowing the call stack on the corridor's merged geometry.
    let binary = '';
    const bytes = new Uint8Array(glb);
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { manifest, glb: btoa(binary) };
  } finally {
    for (const mesh of exported.children as Mesh[]) { mesh.geometry.dispose(); (mesh.material as BakeMaterial).dispose(); }
  }
}
