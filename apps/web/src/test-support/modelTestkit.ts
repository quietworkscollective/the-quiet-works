import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CanvasTexture } from 'three';
import { installDomStub, type DomStub } from '../assets/domStub.ts';
import { decodeGlb } from '../assets/gltf.ts';
import { loadModelKit, type KitDeps, type ModelHandle, type ModelSource, type PropModelKit } from '../corridor/world/props/modelKit.ts';
import { PROP_MODEL_IDS } from '../corridor/world/props/modelSources.ts';

/**
 * Test support for the ready-made models: decode the real files from disk in node (no browser, no
 * network), and build a kit whose atlas canvases are recorders. The files are the ones the app
 * ships, so a test that reads them says something about the real models.
 */

/** The props' copy of a model (see lod/build.mjs), or with `original` the library's. */
export function modelFile(id: string, original = false): URL {
  if (!original) return new URL(`../corridor/world/props/lod/${id}.glb`, import.meta.url);
  const ORIGINALS = new Set(['trophy-cup-tall', 'trophy-cup-squat', 'trophy-shield', 'trophy-plinth-small', 'trophy-plinth-empty', 'cricket-bat', 'cricket-stumps', 'cricket-ball', 'scorebook']);
  return new URL(`../assets/${ORIGINALS.has(id) ? 'original' : 'models'}/${id}.glb`, import.meta.url);
}

/** A source that decodes each model from its file. Needs the DOM stub installed (see `withDom`). */
export const fileSource: ModelSource = async (id): Promise<ModelHandle> => {
  const file = readFileSync(fileURLToPath(modelFile(id)));
  const scene = await decodeGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  return { object: scene, release: () => undefined };
};

export interface AtlasLog {
  canvases: { width: number; height: number; draws: number }[];
}

/** Canvas stand-ins: nothing is drawn, but every drawImage is counted. */
export function recordingDeps(log: AtlasLog = { canvases: [] }): KitDeps {
  return {
    createCanvas: (width, height) => {
      const canvas = { width, height, draws: 0 };
      log.canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    context2d: (canvas) => {
      const c = canvas as unknown as { draws: number };
      const data = { data: new Uint8ClampedArray(4 * 16 * 16) };
      return {
        clearRect: () => undefined,
        drawImage: () => {
          c.draws += 1;
        },
        getImageData: () => data,
        putImageData: () => undefined,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      } as unknown as CanvasRenderingContext2D;
    },
    makeTexture: (canvas) => new CanvasTexture(canvas as unknown as HTMLCanvasElement),
  };
}

let stub: DomStub | null = null;

/** Install the DOM stub the model decoder needs; undo with `endDom`. */
export function beginDom(): void {
  stub = installDomStub({ bitmaps: false });
}
export function endDom(): void {
  stub?.restore();
  stub = null;
}

/** The kit of every model the props use, decoded from disk. */
export function loadTestKit(options: { lite?: boolean; ids?: readonly string[]; source?: ModelSource; log?: AtlasLog } = {}): Promise<PropModelKit> {
  return loadModelKit(options.ids ?? PROP_MODEL_IDS, options.source ?? fileSource, { lite: options.lite ?? false, anisotropy: 1, deps: recordingDeps(options.log) });
}
