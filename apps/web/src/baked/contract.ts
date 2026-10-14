import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type BakeMaterial = MeshLambertMaterial | MeshStandardMaterial;

export interface BakeLight {
  type: string;
  position: number[];
  colour: number[];
  intensity: number;
  distance: number;
  decay: number;
  power?: number;
  direction?: number[];
  angle?: number;
  penumbra?: number;
}
export interface BakeManifest {
  version: 1;
  space: 'corridor' | 'office';
  hash: string;
  materialHash?: string;
  baselineHash?: string;
  meshes: string[];
  lights: BakeLight[];
  atlases: { file: string; width: number; height: number; scale: number; encoding?: 'srgb-scale'; bytes: number }[];
}

const numbers = (values: ArrayLike<number>): string => Array.from(values, n => Math.round(n * 1e5)).join(',');

/** Canonical triangles survive exporter reordering; all original attributes participate. */
function* signatureChunks(g: BufferGeometry): Generator<void, string> {
  const attributes = Object.keys(g.attributes).filter(k => k !== 'uv1').sort();
  const cached = new Map<number, string>();
  const vertex = (i: number): string => {
    const previous = cached.get(i);
    if (previous !== undefined) return previous;
    const value = attributes.map(key => {
    const a = g.getAttribute(key);
    return `${key}:${numbers(Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c)))}`;
  }).join(';');
    cached.set(i, value);
    return value;
  };
  const index = g.index;
  const count = index?.count ?? g.getAttribute('position').count;
  const triangles: string[] = [];
  for (let i = 0; i < count; i += 3) {
    if (i > 0 && i % 6000 === 0) yield;
    const corners = [0, 1, 2].map(c => vertex(index?.getX(i + c) ?? i + c));
    triangles.push([0, 1, 2].map(c => [...corners.slice(c), ...corners.slice(0,c)].join('|')).sort()[0] ?? '');
  }
  return triangles.sort().join('\n');
}

export function geometrySignature(g: BufferGeometry): string {
  const chunks = signatureChunks(g);
  for (;;) {
    const next = chunks.next();
    if (next.done) return next.value;
  }
}

async function progressiveSignature(g: BufferGeometry): Promise<string> {
  const chunks = signatureChunks(g);
  for (;;) {
    const next = chunks.next();
    if (next.done) return next.value;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

export async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function isStatic(mesh: Mesh): boolean {
  for (let o: Object3D | null = mesh; o; o = o.parent) {
    if (o.userData['bake'] === 'dynamic' || !o.visible) return false;
  }
  return !Array.isArray(mesh.material) && (mesh.material instanceof MeshStandardMaterial || mesh.material instanceof MeshLambertMaterial) && !mesh.material.transparent && mesh.material.visible;
}

/** Flatten instances in local space, preserving tint, for one baked draw per source mesh. */
export function sourceGeometry(mesh: Mesh): BufferGeometry {
  if (!(mesh instanceof InstancedMesh)) return mesh.geometry.clone();
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    const part = mesh.geometry.clone();
    transformGeometry(part, matrix);
    const colour = part.getAttribute('color');
    if (mesh.instanceColor) {
      if (!colour) {
        const base = mesh.geometry.getAttribute('position').clone();
        for (let v = 0; v < base.count; v++) base.setXYZ(v, 1, 1, 1);
        part.setAttribute('color', base);
      }
      const target = part.getAttribute('color');
      for (let v = 0; v < target.count; v++) target.setXYZ(v,
        target.getX(v) * mesh.instanceColor.getX(i),
        target.getY(v) * mesh.instanceColor.getY(i),
        target.getZ(v) * mesh.instanceColor.getZ(i));
    }
    parts.push(part);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Cannot flatten inconsistent instance attributes');
  return merged;
}

/** Preserve coordinates and face orientation across arbitrary affine transforms. */
export function transformGeometry(geometry: BufferGeometry, matrix: Matrix4): void {
  for (const key of ['position', 'normal']) {
    const attribute = geometry.getAttribute(key);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(i,c);
    geometry.setAttribute(key, new Float32BufferAttribute(values, attribute.itemSize));
  }
  geometry.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    if (!geometry.index) geometry.setIndex(Array.from({length:geometry.getAttribute('position').count},(_,i)=>i));
    const index = geometry.index;
    if (!index) throw new Error('Missing reflected geometry index');
    for (let i=0;i<index.count;i+=3) {
      const second=index.getX(i+1); index.setX(i+1,index.getX(i+2)); index.setX(i+2,second);
    }
  }
}

async function textureSignature(material: BakeMaterial, sourceInputsHash?: string): Promise<string> {
  const results: string[] = [];
  for (const texture of [material.map, material.emissiveMap]) {
    if (!texture) { results.push('none'); continue; }
    if (texture.matrixAutoUpdate) texture.updateMatrix();
    results.push(JSON.stringify({ matrix: numbers(texture.matrix.elements), channel: texture.channel,
      colourSpace: texture.colorSpace, wrapS: texture.wrapS, wrapT: texture.wrapT,
      flipY: texture.flipY, minFilter: texture.minFilter, magFilter: texture.magFilter }));
    const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
    if (!image) { results.push(texture.name); continue; }
    if (!sourceInputsHash) throw new Error('Missing source inputs for textured bake material');
    results.push(JSON.stringify({ sourceInputsHash, width: image.width ?? image.naturalWidth ?? 0,
      height: image.height ?? image.naturalHeight ?? 0 }));
  }
  return results.join(':');
}

export async function materialSignature(m: BakeMaterial, sourceInputsHash?: string): Promise<string> {
  const metalness = m instanceof MeshStandardMaterial ? m.metalness : 0;
  const roughness = m instanceof MeshStandardMaterial ? m.roughness : 1;
  return digest(`${await textureSignature(m, sourceInputsHash)}\n${numbers([m.color.r,m.color.g,m.color.b,metalness,roughness,m.emissive.r,m.emissive.g,m.emissive.b,m.emissiveIntensity])}`);
}

export async function meshId(mesh: Mesh, geometry: BufferGeometry): Promise<string> {
  return digest(`${await progressiveSignature(geometry)}\n${numbers(mesh.matrixWorld.elements)}`);
}

export function assertFresh(expected: string, actual: string): void {
  if (expected !== actual) throw new Error('Stale bake: runtime static geometry or lighting changed; run pnpm bake');
}

/** Blender radiant power for a point emitter; three intensity is candela. */
export function pointPower(intensity: number): number { return intensity * 4 * Math.PI; }
export function spotPower(intensity: number): number { return intensity * Math.PI; }
export function analyticIntensity(peak: number, soft: number, distance = 2): number {
  return peak / (1 + (distance / soft) ** 2) * distance ** 2;
}
