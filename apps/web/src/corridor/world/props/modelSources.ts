import { disposeResources } from '../../../assets/dispose.ts';
import { bytesFromDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import type { ModelHandle, ModelSource } from './modelKit.ts';

/**
 * Where the props get their models: a local slot. The asset library's catalogue loads any model
 * by id, but its registry names every model in the library, and importing it would make the build
 * emit all of them (the whole library, several megabytes) into `dist`. The props use a dozen, so
 * each is imported here by its own path, as a lazily loaded module whose bytes are a data: URL
 * (the same route the catalogue takes, so nothing is fetched: the site's policy is
 * `connect-src 'none'`).
 *
 * The files are `./lod/<id>.glb`: copies of the library's models made to the size the corridor can
 * use (about a third of the triangles, textures at the atlas cell's size), built by `lod/build.mjs`
 * from the originals, which are untouched. When the originals join the catalogue and the library's
 * registry is imported by the spaces anyway, `propModelSource` could load them through it, at their
 * full size, if the props' budget ever grows.
 */

export const PROP_MODEL_IDS = [
  // Modelled in Blender for the project (CC BY 4.0).
  'trophy-cup-tall',
  'trophy-cup-squat',
  'trophy-shield',
  'trophy-plinth-small',
  'cricket-bat',
  'cricket-stumps',
  'cricket-ball',
  'scorebook',
  // Ready-made, from the asset library (CC0).
  'toolbox-metal',
  'glove-work',
  'watering-can',
] as const;
export type PropModelId = (typeof PROP_MODEL_IDS)[number];

const LOADERS: Readonly<Record<PropModelId, () => Promise<string>>> = {
  'trophy-cup-tall': async () => (await import('./lod/trophy-cup-tall.glb?url&inline')).default,
  'trophy-cup-squat': async () => (await import('./lod/trophy-cup-squat.glb?url&inline')).default,
  'trophy-shield': async () => (await import('./lod/trophy-shield.glb?url&inline')).default,
  'trophy-plinth-small': async () => (await import('./lod/trophy-plinth-small.glb?url&inline')).default,
  'cricket-bat': async () => (await import('./lod/cricket-bat.glb?url&inline')).default,
  'cricket-stumps': async () => (await import('./lod/cricket-stumps.glb?url&inline')).default,
  'cricket-ball': async () => (await import('./lod/cricket-ball.glb?url&inline')).default,
  scorebook: async () => (await import('./lod/scorebook.glb?url&inline')).default,
  'toolbox-metal': async () => (await import('./lod/toolbox-metal.glb?url&inline')).default,
  'glove-work': async () => (await import('./lod/glove-work.glb?url&inline')).default,
  'watering-can': async () => (await import('./lod/watering-can.glb?url&inline')).default,
};

/** Decode one model from its module. The handle's release frees the decoded scene. */
export const propModelSource: ModelSource = async (id): Promise<ModelHandle> => {
  const load = (LOADERS as Record<string, (() => Promise<string>) | undefined>)[id];
  if (!load) throw new Error(`no local model "${id}"`);
  const scene = await decodeGlb(bytesFromDataUrl(await load()));
  return {
    object: scene,
    release() {
      disposeResources(scene);
    },
  };
};
