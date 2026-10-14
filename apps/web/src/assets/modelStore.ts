// A reference-counted store of decoded models. One decoded scene per id; every user gets a clone
// that shares its geometry, materials and textures; when the last user releases, every GPU handle
// is disposed and the next acquire decodes afresh.
import type { Group, Object3D } from 'three';
import { modelLoader } from './catalogue.ts';
import { disposeResources } from './dispose.ts';
import { bytesFromDataUrl, decodeGlb } from './gltf.ts';

export interface ModelHandle {
  /** A clone of the model: metres, +Y up, origin at floor-centre. Add it to a scene. */
  readonly object: Object3D;
  /** Detaches the clone; the last release across all handles disposes the shared GPU resources. */
  release(): void;
}

interface Entry {
  refs: number;
  ready: Promise<Group>;
}

export interface ModelStore {
  acquire(id: string): Promise<ModelHandle>;
  /** Ids currently holding decoded resources (for tests and leak checks). */
  readonly liveIds: () => string[];
}

export function createModelStore(decode: (id: string) => Promise<Group>): ModelStore {
  const records = new Map<string, Entry>();

  return {
    liveIds: () => [...records.keys()],
    async acquire(id) {
      let record = records.get(id);
      if (!record) {
        record = { refs: 0, ready: decode(id) };
        records.set(id, record);
      }
      // Counted before the first await, so a release racing the decode cannot dispose early.
      record.refs += 1;
      const current = record;
      let source: Group;
      try {
        source = await current.ready;
      } catch (error) {
        current.refs -= 1;
        if (current.refs === 0 && records.get(id) === current) records.delete(id);
        throw error;
      }
      const object = source.clone(true);
      let released = false;
      return {
        object,
        release() {
          if (released) return;
          released = true;
          object.removeFromParent();
          current.refs -= 1;
          if (current.refs === 0) {
            if (records.get(id) === current) records.delete(id);
            disposeResources(source);
          }
        },
      };
    },
  };
}

async function decodeFromCatalogue(id: string): Promise<Group> {
  const dataUrl = await modelLoader(id)();
  return decodeGlb(bytesFromDataUrl(dataUrl));
}

/** The shared store every space draws from. */
export const models: ModelStore = createModelStore(decodeFromCatalogue);

/** Loads a model by catalogue id. Call `release()` when the space unmounts. */
export function loadModel(id: string): Promise<ModelHandle> {
  return models.acquire(id);
}
