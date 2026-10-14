import {
  BufferGeometry,
  FloatType,
  HalfFloatType,
  Material,
  RGBAFormat,
  RedFormat,
  RGFormat,
  Texture,
  UnsignedByteType,
  WebGLRenderTarget,
  type TextureDataType,
} from 'three';

/** Anything that holds GPU memory once a renderer has seen it and that three can free with `dispose()`. */
export type GpuObject = Texture | WebGLRenderTarget | Material | BufferGeometry;

const isGpuObject = (value: unknown): value is GpuObject =>
  value instanceof Texture || value instanceof WebGLRenderTarget || value instanceof Material || value instanceof BufferGeometry;

/** A texture that is a render target's own: it has no dispose of its own to wait for. */
const isTargetTexture = (value: GpuObject): boolean => value instanceof Texture && (value as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture === true;

/**
 * Every GPU-holding object reachable from `root` through own properties, arrays, maps and sets,
 * to a bounded depth. The stack's passes keep their targets, textures and materials in a dozen
 * different places (some of them inside helper objects the libraries do not dispose), so the
 * disposal guard walks them instead of trusting a list that could fall behind.
 */
export function collectGpuObjects(root: unknown, maxDepth = 6): Set<GpuObject> {
  const found = new Set<GpuObject>();
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): void => {
    if (value === null || typeof value !== 'object' || depth > maxDepth) return;
    if (seen.has(value)) return;
    seen.add(value);
    if (isGpuObject(value)) {
      if (isTargetTexture(value)) return;
      // A render target's own textures and depth texture are freed with it: three frees them when
      // the target's dispose event reaches the renderer, and they emit none of their own. So the
      // target is what must be disposed, and the textures it owns are not collected separately.
      found.add(value);
      if (value instanceof Material) {
        for (const uniform of Object.values((value as { uniforms?: Record<string, { value: unknown }> }).uniforms ?? {})) visit(uniform.value, depth + 1);
      }
      return;
    }
    if (value instanceof Map) {
      for (const item of value.values()) visit(item, depth + 1);
      return;
    }
    if (Array.isArray(value) || value instanceof Set) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    // Skip the renderer and other big hosts that are not ours to free.
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    if (name === 'WebGLRenderer' || name === 'Window' || name === 'HTMLCanvasElement') return;
    for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key], depth + 1);
  };
  visit(root, 0);
  return found;
}

function bytesPerPixel(type: TextureDataType, format: number): number {
  const channels = format === RGBAFormat ? 4 : format === RGFormat ? 2 : format === RedFormat ? 1 : 4;
  const each = type === FloatType ? 4 : type === HalfFloatType ? 2 : type === UnsignedByteType ? 1 : 4;
  return channels * each;
}

/**
 * An estimate, in bytes, of the memory a render target holds: its colour textures, the
 * multisampled colour and depth renderbuffers if it has samples, and its depth texture. Three
 * does not report this, so it is computed from the sizes and formats, and it is an estimate:
 * drivers pad and compress.
 */
export function estimateTargetBytes(target: WebGLRenderTarget): number {
  const pixels = target.width * target.height;
  let bytes = 0;
  for (const texture of target.textures) bytes += pixels * bytesPerPixel(texture.type, texture.format);
  const samples = target.samples;
  const colour = target.textures[0];
  if (samples > 0 && colour) bytes += pixels * bytesPerPixel(colour.type, colour.format) * samples;
  if (target.depthBuffer) bytes += pixels * 4 * Math.max(1, samples);
  if (target.depthTexture) bytes += pixels * 4;
  return bytes;
}

export function estimateObjectsBytes(objects: Iterable<GpuObject>): number {
  let total = 0;
  for (const object of objects) if (object instanceof WebGLRenderTarget) total += estimateTargetBytes(object);
  return total;
}
