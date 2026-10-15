import { BufferGeometry, type Matrix4 } from 'three';
import { Bucket } from './builder.ts';

/**
 * One geometry bucket per shared material. The architecture, trim, groupings and every blank
 * door accumulate into these and are merged into a single mesh per material, which is what keeps
 * the whole corridor inside the draw-call budget.
 */
export type BucketKey =
  | 'plaster'
  | 'oak'
  | 'terrazzo'
  | 'terrazzoWalk'
  | 'brass'
  | 'paint'
  | 'enamel'
  | 'iron'
  | 'glass'
  | 'wired'
  | 'frosted'
  | 'reeded'
  | 'rubber'
  | 'plaque'
  | 'numeral'
  | 'art'
  | 'lettering'
  | 'felt'
  | 'pane'
  | 'glow'
  | 'lamp'
  | 'decal'
  | 'marks'
  | 'foliage';

export const BUCKET_KEYS: readonly BucketKey[] = [
  'plaster',
  'oak',
  'terrazzo',
  'terrazzoWalk',
  'brass',
  'paint',
  'enamel',
  'iron',
  'glass',
  'wired',
  'frosted',
  'reeded',
  'rubber',
  'plaque',
  'numeral',
  'art',
  'lettering',
  'felt',
  'pane',
  'glow',
  'lamp',
  'decal',
  'marks',
  'foliage',
];

/** Buckets drawn with blending: their triangle order is not touched. */
const BLENDED: ReadonlySet<BucketKey> = new Set<BucketKey>(['pane', 'glow', 'decal', 'wired', 'marks']);

export type Buckets = Record<BucketKey, Bucket>;

export function createBuckets(): Buckets {
  return Object.fromEntries(BUCKET_KEYS.map((k) => [k, new Bucket()])) as Buckets;
}

/** Append every bucket of `from` into `into`, transformed by `matrix`. */
export function mergeBuckets(into: Buckets, from: Buckets, matrix: Matrix4): void {
  for (const key of BUCKET_KEYS) if (from[key].triangleCount > 0) into[key].append(from[key], matrix);
}

/**
 * Build something in its own local space (a door opening, a fixture) and append it, transformed,
 * to the world buckets.
 */
export function placeLocal(world: Buckets, matrix: Matrix4, build: (local: Buckets) => void): void {
  const local = createBuckets();
  build(local);
  mergeBuckets(world, local, matrix);
}

export function bucketGeometries(buckets: Buckets): Partial<Record<BucketKey, BufferGeometry>> {
  const out: Partial<Record<BucketKey, BufferGeometry>> = {};
  for (const key of BUCKET_KEYS) {
    if (buckets[key].triangleCount === 0) continue;
    // Opaque layers are ordered near to far for early depth rejection; blended layers draw in
    // the order their render order and transparency sorting give them.
    if (!BLENDED.has(key)) buckets[key].sortNearToFar();
    out[key] = buckets[key].toGeometry();
  }
  return out;
}

export function triangleTotal(buckets: Buckets): number {
  return BUCKET_KEYS.reduce((n, k) => n + buckets[k].triangleCount, 0);
}
