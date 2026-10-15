import { useEffect, useLayoutEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Material, Mesh, Texture } from 'three';
import type { Group, Object3D } from 'three';
import { createGlbLoader, bytesFromPackedDataUrl } from '../../assets/gltf.ts';
import modelUrl from '../../assets/outline-door.glb.gz?url&inline';

interface Props {
  leafRef(side: 'left' | 'right', node: Object3D | null): void;
  onReady(): void;
}

function dispose(root: Group): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function OutlineDoorModel({ leafRef, onReady }: Props) {
  const invalidate = useThree((state) => state.invalidate);
  const [model, setModel] = useState<Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Group | null = null;
    void bytesFromPackedDataUrl(modelUrl)
      .then((bytes) => createGlbLoader().parseAsync(bytes, ''))
      .then((gltf) => {
        const left = gltf.scene.getObjectByName('OutlineDoorLeafLeft');
        const right = gltf.scene.getObjectByName('OutlineDoorLeafRight');
        if (!left || !right) throw new Error('Outline Room door needs separate left and right sliding leaves');
        left.userData['bake'] = 'dynamic';
        right.userData['bake'] = 'dynamic';
        loaded = gltf.scene;
        if (cancelled) {
          dispose(gltf.scene);
          return;
        }
        setModel(gltf.scene);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Outline Room door model failed to load', error);
      });
    return () => {
      cancelled = true;
      if (loaded) dispose(loaded);
      leafRef('left', null);
      leafRef('right', null);
    };
  }, [leafRef]);

  useLayoutEffect(() => {
    if (!model) return;
    const left = model.getObjectByName('OutlineDoorLeafLeft');
    const right = model.getObjectByName('OutlineDoorLeafRight');
    if (!left || !right) throw new Error('Outline Room door needs separate left and right sliding leaves');
    left.userData['closedX'] = left.position.x;
    right.userData['closedX'] = right.position.x;
    leafRef('left', left);
    leafRef('right', right);
    onReady();
    invalidate();
  }, [model, leafRef, onReady, invalidate]);

  return model ? <primitive object={model} /> : null;
}
