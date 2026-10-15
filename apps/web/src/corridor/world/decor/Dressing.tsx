import { useEffect, useMemo, useState } from 'react';
import type { Group, Object3D } from 'three';
import { bytesFromDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import { disposeResources } from '../../../assets/dispose.ts';
import { DECOR_LAYOUT, type DecorPlacement } from './layout.ts';
import type { CorridorDressingProps } from './types.ts';

type ModelId = 'bench' | 'plant' | 'clock' | 'frame' | 'radiator6' | 'radiator10' | 'banker-lamp';
type Models = Record<ModelId, Group>;

const SOURCES: readonly [ModelId, () => Promise<string>][] = [
  ['bench', async () => (await import('./lod/bench-painted-wood.glb?url&inline')).default],
  ['plant', async () => (await import('./lod/plant-large.glb?url&inline')).default],
  ['clock', async () => (await import('./lod/clock-wall.glb?url&inline')).default],
  ['frame', async () => (await import('./lod/frame-photo-white.glb?url&inline')).default],
  ['radiator6', async () => (await import('./lod/column-radiator-6.glb?url&inline')).default],
  ['radiator10', async () => (await import('./lod/column-radiator-10.glb?url&inline')).default],
  ['banker-lamp', async () => (await import('./lod/banker-lamp.glb?url&inline')).default],
];

async function loadModels(): Promise<Models> {
  const urls = await Promise.all(SOURCES.map(([, load]) => load()));
  const loaded: Partial<Models> = {};
  try {
    for (const [index, [id]] of SOURCES.entries()) {
      const url = urls[index];
      if (!url) throw new Error(`missing local corridor model ${id}`);
      loaded[id] = await decodeGlb(bytesFromDataUrl(url));
    }
  } catch (error) {
    for (const model of Object.values(loaded)) if (model) disposeResources(model);
    throw error;
  }
  return loaded as Models;
}

function place(root: Group, placement: DecorPlacement, name: string): Group {
  const instance = root.clone(true);
  instance.name = name;
  instance.position.set(...placement.position);
  instance.rotation.set(0, placement.yaw, 0);
  instance.scale.setScalar(placement.scale ?? 1);
  instance.updateMatrix();
  return instance;
}

function placements(models: Models): Object3D[] {
  return [
    place(models.bench, DECOR_LAYOUT.bench, 'decor-bench'),
    ...DECOR_LAYOUT.plants.map((item, index) => place(models.plant, item, `decor-plant-${index + 1}`)),
    place(models.clock, DECOR_LAYOUT.clock, 'decor-wall-clock'),
    place(models.frame, DECOR_LAYOUT.frame, 'decor-picture-frame'),
    ...DECOR_LAYOUT.radiators.map((item, index) => place(models[item.model], item, `decor-radiator-${index + 1}`)),
    place(models['banker-lamp'], DECOR_LAYOUT.bankerLamp, 'decor-banker-lamp'),
  ];
}

/** Scanned furniture and fixtures; loaded on the first walk-in gesture and included in the bake. */
export function CorridorDressing({ onReady }: CorridorDressingProps) {
  const [models, setModels] = useState<Models | null>(null);
  const objects = useMemo(() => (models ? placements(models) : []), [models]);

  useEffect(() => {
    let alive = true;
    let loaded: Models | null = null;
    void loadModels().then((next) => {
      if (!alive) {
        for (const model of Object.values(next)) disposeResources(model);
        return;
      }
      loaded = next;
      setModels(next);
    });
    return () => {
      alive = false;
      if (loaded) for (const model of Object.values(loaded)) disposeResources(model);
    };
  }, [onReady]);

  useEffect(() => {
    if (models) onReady();
  }, [models, onReady]);

  return (
    <group dispose={null} userData={{ bake: 'lazy' }}>
      {objects.map((object) => <primitive key={object.name} object={object} dispose={null} />)}
    </group>
  );
}
