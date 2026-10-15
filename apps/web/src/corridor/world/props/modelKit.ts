import { Matrix4, type BufferGeometry, type CanvasTexture, type Material, type Mesh, type Object3D } from 'three';
import type { Vec3 } from '../math.ts';
import { context2d, createCanvas, makeTexture } from '../textures/canvas.ts';
import { modelUv, planModelAtlas, type ModelAtlasPlan, type ModelUv } from './modelAtlasLayout.ts';
import type { Assembly, Tint } from './parts.ts';

/**
 * The ready-made models the props are built from, as data. A model (a Blender-built original or a
 * scanned one) is a few meshes under named nodes, in metres with +Y up and the origin at the
 * centre of its floor footprint, and one textured material (base colour, and a packed
 * occlusion/roughness/metalness map). The props take its meshes into the shared assembly, so a
 * model costs triangles but not draw calls, and repack every model's textures into one atlas of
 * each kind, so the models between them cost one material.
 *
 * A model that cannot be loaded is simply missing from the kit; the prop that wanted it builds its
 * procedural version instead, so a failed load never takes a prop away.
 */

/** One mesh of a model: its geometry and where it sits in the model's own space. */
export interface KitMesh {
  /** The mesh node's name in the model (`bail_1`, `metal_toolbox_handle`): what a prop selects parts by. */
  name: string;
  /** The names of the nodes above it, from the model's root down (`metal_toolbox_lid` for a lid's handle). */
  ancestors: readonly string[];
  geometry: BufferGeometry;
  /** The mesh's node transform relative to the model's root. */
  matrix: Matrix4;
}

export interface KitModel {
  id: string;
  meshes: readonly KitMesh[];
  triangles: number;
  /** Where the model's texture sits on the atlas: fitted over every UV the model's meshes carry. */
  uv: ModelUv;
  /** Axis-aligned size of everything in the model, in its own space. */
  size: Vec3;
  /** Lowest point of the model: 0 for a model standing on a floor. */
  floor: number;
}

export interface ModelTextures {
  base: CanvasTexture;
  /** Occlusion in R, roughness in G, metalness in B; null in the lite tier, which lights without them. */
  orm: CanvasTexture | null;
}

export interface PropModelKit {
  get(id: string): KitModel | undefined;
  readonly ids: readonly string[];
  /** Ids that were asked for and could not be loaded. */
  readonly missing: readonly string[];
  readonly textures: ModelTextures | null;
  /** Total triangles of every mesh in the kit (what taking all of it would cost). */
  readonly triangles: number;
  dispose(): void;
}

/** A decoded model, held for as long as it is needed. */
export interface ModelHandle {
  object: Object3D;
  release(): void;
}
/** Decodes a model by id (see modelSources.ts). */
export type ModelSource = (id: string) => Promise<ModelHandle>;

type ImageLike = CanvasImageSource & { width: number; height: number };

export interface Extracted {
  id: string;
  meshes: KitMesh[];
  base: ImageLike | null;
  orm: ImageLike | null;
  /** The model's material says it is not metal (cloth, rubber): its packed map's metalness is drawn as zero. */
  nonMetal: boolean;
}

/** Everything the props need from a decoded model: copies of its geometry, and its two texture images. */
export function extractModel(id: string, root: Object3D): Extracted {
  root.updateMatrixWorld(true);
  const meshes: KitMesh[] = [];
  let material: Material | null = null;
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const ancestors: string[] = [];
    for (let up = mesh.parent; up && up !== root.parent; up = up.parent) ancestors.unshift(up.name);
    meshes.push({ name: mesh.name, ancestors, geometry: mesh.geometry.clone(), matrix: mesh.matrixWorld.clone() });
    const m = mesh.material;
    if (material === null && !Array.isArray(m)) material = m;
  });
  if (meshes.length === 0) throw new Error(`model ${id} has no meshes`);
  const m = material as { map?: { image?: ImageLike } | null; roughnessMap?: { image?: ImageLike } | null; metalness?: number } | null;
  return {
    id,
    meshes,
    base: m?.map?.image ?? null,
    orm: m?.roughnessMap?.image ?? null,
    nonMetal: (m?.metalness ?? 1) === 0,
  };
}

function measure(meshes: readonly KitMesh[]): { size: Vec3; floor: number; triangles: number } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const { geometry, matrix } of meshes) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    triangles += (index ? index.count : position.count) / 3;
    const e = matrix.elements;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const w = [
        (e[0] ?? 0) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0),
        (e[1] ?? 0) * x + (e[5] ?? 0) * y + (e[9] ?? 0) * z + (e[13] ?? 0),
        (e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 0) * z + (e[14] ?? 0),
      ];
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k] ?? 0, w[k] ?? 0);
        max[k] = Math.max(max[k] ?? 0, w[k] ?? 0);
      }
    }
  }
  return { size: [(max[0] ?? 0) - (min[0] ?? 0), (max[1] ?? 0) - (min[1] ?? 0), (max[2] ?? 0) - (min[2] ?? 0)], floor: min[1] ?? 0, triangles };
}

/* ------------------------------------------------------------------------------------------ */
/* The atlas                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** The part of a 2D context the atlas painter uses, so a test can run it without a canvas. */
export type AtlasCtx = Pick<CanvasRenderingContext2D, 'clearRect' | 'drawImage' | 'getImageData' | 'putImageData' | 'imageSmoothingQuality' | 'imageSmoothingEnabled'>;

export interface AtlasEntry {
  id: string;
  image: ImageLike | null;
  /** Draw this cell's blue channel as zero (a packed map for a model that is not metal). */
  blueZero?: boolean;
}

/**
 * Draw each model's image into its cell: the whole image stretched a little over the cell first
 * (so the gutter carries the cell's own border), then exactly into the cell.
 */
export function paintModelAtlas(ctx: AtlasCtx, plan: ModelAtlasPlan, entries: readonly AtlasEntry[]): void {
  ctx.clearRect(0, 0, plan.width, plan.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const bleed = plan.gutter - 2;
  const drawn = entries.filter((e) => e.image !== null && plan.cells[e.id]);
  for (const { id, image } of drawn) {
    const c = plan.cells[id];
    if (c && image) ctx.drawImage(image, c.x - bleed, c.y - bleed, c.w + 2 * bleed, c.h + 2 * bleed);
  }
  for (const { id, image } of drawn) {
    const c = plan.cells[id];
    if (c && image) ctx.drawImage(image, c.x, c.y, c.w, c.h);
  }
  for (const { id, blueZero } of drawn) {
    const c = plan.cells[id];
    if (!c || !blueZero) continue;
    const x = c.x - bleed;
    const y = c.y - bleed;
    const w = c.w + 2 * bleed;
    const h = c.h + 2 * bleed;
    const data = ctx.getImageData(x, y, w, h);
    for (let i = 2; i < data.data.length; i += 4) data.data[i] = 0;
    ctx.putImageData(data, x, y);
  }
}

export interface KitDeps {
  createCanvas(width: number, height: number): HTMLCanvasElement;
  context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D;
  makeTexture(canvas: HTMLCanvasElement, options: { colorData: boolean; anisotropy: number }): CanvasTexture;
}

const browserDeps: KitDeps = { createCanvas, context2d, makeTexture };

export interface BuildKitOptions {
  /** The lite tier lights with Lambert and needs only the base colour. */
  lite: boolean;
  anisotropy: number;
  /** Ids asked for, so those that did not load can be reported. */
  asked?: readonly string[];
  deps?: KitDeps;
}

/** Plan the atlas, paint it and fit every model into it. */
export function buildKit(extracted: readonly Extracted[], options: BuildKitOptions): PropModelKit {
  const deps = options.deps ?? browserDeps;
  const plan = planModelAtlas(extracted.map((e) => e.id));
  const models = new Map<string, KitModel>();
  for (const e of extracted) {
    const cell = plan.cells[e.id];
    if (!cell) throw new Error(`no atlas cell for ${e.id}`);
    const { size, floor, triangles } = measure(e.meshes);
    models.set(e.id, { id: e.id, meshes: e.meshes, triangles, uv: modelUv(cell, plan), size, floor });
  }

  let textures: ModelTextures | null = null;
  if (extracted.length > 0) {
    const texture = (entries: readonly AtlasEntry[], colorData: boolean): CanvasTexture => {
      const canvas = deps.createCanvas(plan.width, plan.height);
      paintModelAtlas(deps.context2d(canvas), plan, entries);
      const t = deps.makeTexture(canvas, { colorData, anisotropy: options.anisotropy });
      // The models' UVs are glTF's, v down from the top of the image: the atlas must not flip.
      t.flipY = false;
      t.needsUpdate = true;
      return t;
    };
    textures = {
      base: texture(extracted.map((e) => ({ id: e.id, image: e.base })), true),
      orm: options.lite ? null : texture(extracted.map((e) => ({ id: e.id, image: e.orm, blueZero: e.nonMetal })), false),
    };
  }

  const ids = [...models.keys()];
  const asked = options.asked ?? ids;
  let disposed = false;
  return {
    get: (id) => models.get(id),
    ids,
    missing: asked.filter((id) => !models.has(id)),
    textures,
    triangles: [...models.values()].reduce((n, m) => n + m.triangles, 0),
    dispose() {
      if (disposed) return;
      disposed = true;
      textures?.base.dispose();
      textures?.orm?.dispose();
      for (const m of models.values()) for (const mesh of m.meshes) mesh.geometry.dispose();
      models.clear();
    },
  };
}

/**
 * Load the models, copy out what the props need, release the decoded scenes at once (their
 * textures were never uploaded; the copies are all that stays) and build the kit. A model that
 * fails to load is left out and reported in `missing`.
 */
export async function loadModelKit(ids: readonly string[], source: ModelSource, options: Omit<BuildKitOptions, 'asked'>): Promise<PropModelKit> {
  const results = await Promise.all(
    ids.map(async (id): Promise<Extracted | null> => {
      try {
        const handle = await source(id);
        try {
          return extractModel(id, handle.object);
        } finally {
          handle.release();
        }
      } catch {
        return null;
      }
    }),
  );
  return buildKit(
    results.filter((r): r is Extracted => r !== null),
    { ...options, asked: ids },
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Putting a model into a prop                                                                 */
/* ------------------------------------------------------------------------------------------ */

export interface Fit {
  /** Prop-local position of the model's origin (floor-centre): where it stands. */
  at: Vec3;
  /** Uniform scale. */
  scale?: number;
  /** Turn about the vertical axis, applied before the move. */
  yaw?: number;
  /** Lean about the prop's x axis, applied before the yaw (a book standing up against a wall). */
  lean?: number;
  /** Turn about the model's own vertical axis before anything else (a book turned in its plane). */
  spin?: number;
  /** A change made in the model's own space before all of that (a lid closed about its hinge). */
  pre?: Matrix4;
}

/** The matrix that places a model in prop-local space: `pre`, scale, spin, lean, yaw, then move. */
export function fitMatrix(fit: Fit): Matrix4 {
  const s = fit.scale ?? 1;
  const m = new Matrix4().makeTranslation(fit.at[0], fit.at[1], fit.at[2]);
  if (fit.yaw) m.multiply(new Matrix4().makeRotationY(fit.yaw));
  if (fit.lean) m.multiply(new Matrix4().makeRotationX(fit.lean));
  if (fit.spin) m.multiply(new Matrix4().makeRotationY(fit.spin));
  m.multiply(new Matrix4().makeScale(s, s, s));
  return fit.pre ? m.multiply(fit.pre) : m;
}

/**
 * Add a model's meshes to the assembly's model channel, following the current bone. `only` picks
 * meshes by their node's name or an ancestor's (the lid of a toolbox is the meshes under its lid
 * node; the bails of a set of stumps are two meshes named for them).
 * Returns how many meshes were taken.
 */
export function placeModel(a: Assembly, model: KitModel, fit: Fit, select: { only?: (mesh: KitMesh) => boolean; tint?: Tint } = {}): number {
  const place = fitMatrix(fit);
  let taken = 0;
  for (const mesh of model.meshes) {
    if (select.only && !select.only(mesh)) continue;
    a.mesh('model', mesh.geometry, place.clone().multiply(mesh.matrix), select.tint, model.uv);
    taken += 1;
  }
  return taken;
}
