// Test support: the few browser pieces the texture loaders touch, so a model with embedded images
// can be decoded in Node. `fetch` and `createImageBitmap` are replaced with recorders so a test can
// say which of the two paths a loader took.
import { vi } from 'vitest';

/** An <img> stand-in: setting `src` fires `load` on the next microtask, as a decoded image would. */
export class FakeImage extends EventTarget {
  crossOrigin = '';
  width = 1024;
  height = 1024;
  private source = '';
  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    queueMicrotask(() => this.dispatchEvent(new Event('load')));
  }
}

export interface DomStub {
  readonly images: FakeImage[];
  readonly fetchCalls: string[];
  readonly bitmapCalls: number[];
  restore(): void;
}

/**
 * Installs the stubs. With `bitmaps: true` a `createImageBitmap` exists, which is what makes
 * GLTFLoader pick ImageBitmapLoader by default (as every current browser does).
 */
export function installDomStub(options: { bitmaps: boolean }): DomStub {
  const images: FakeImage[] = [];
  const fetchCalls: string[] = [];
  const bitmapCalls: number[] = [];
  vi.stubGlobal('self', globalThis); // GLTFLoader reads self.URL
  vi.stubGlobal('document', {
    createElementNS: () => {
      const image = new FakeImage();
      images.push(image);
      return image;
    },
  });
  vi.stubGlobal('fetch', async (input: unknown) => {
    fetchCalls.push(String(input));
    throw new Error('fetch is forbidden: the site\'s policy is connect-src \'none\'');
  });
  if (options.bitmaps) {
    vi.stubGlobal('createImageBitmap', async () => {
      bitmapCalls.push(1);
      return { width: 1024, height: 1024, close() {} };
    });
  }
  return {
    images,
    fetchCalls,
    bitmapCalls,
    restore: () => vi.unstubAllGlobals(),
  };
}
