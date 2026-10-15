import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Matrix4, Texture } from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { extractModel, fitMatrix, loadModelKit, paintModelAtlas, placeModel, type AtlasCtx, type ModelSource, type PropModelKit } from './modelKit.ts';
import { MODEL_ATLAS, MODEL_EDGE, modelUv, planModelAtlas } from './modelAtlasLayout.ts';
import { PROP_MODEL_IDS } from './modelSources.ts';
import { beginDom, endDom, fileSource, loadTestKit, modelFile, recordingDeps, type AtlasLog } from '../../../test-support/modelTestkit.ts';
import { Assembly, CHANNELS } from './parts.ts';
import { buildProps } from './build.ts';
import { placementOf } from './placement.ts';

const LOD = JSON.parse(readFileSync(new URL('./lod/lod.json', import.meta.url), 'utf8')) as {
  models: Record<string, { sha256: string; bytes: number; triangles: number; dimensions: readonly [number, number, number] }>;
};

let kit: PropModelKit;
let log: AtlasLog;
beforeAll(async () => {
  beginDom();
  log = { canvases: [] };
  kit = await loadTestKit({ log });
});
afterAll(() => {
  kit.dispose();
  endDom();
});

describe('the ready-made models the props are built from', () => {
  it('loads every one of them from the files the app ships', () => {
    expect([...kit.ids].sort()).toEqual([...PROP_MODEL_IDS].sort());
    expect(kit.missing).toEqual([]);
  });

  it('ships the exact LOD files recorded in the manifest', () => {
    for (const id of PROP_MODEL_IDS) {
      const entry = LOD.models[id];
      expect(entry, id).toBeDefined();
      if (!entry) continue;
      const bytes = readFileSync(fileURLToPath(modelFile(id)));
      expect(bytes.byteLength, `${id} bytes`).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), `${id} sha256`).toBe(entry.sha256);
      expect(kit.get(id)?.triangles, `${id} triangles`).toBe(entry.triangles);
    }
  });

  it('measures each at the size its build manifest records, standing on its floor', () => {
    for (const id of PROP_MODEL_IDS) {
      const m = kit.get(id);
      const expected = LOD.models[id]?.dimensions;
      expect(m, id).toBeDefined();
      if (!m || !expected) continue;
      for (let k = 0; k < 3; k += 1) expect(Math.abs((m.size[k] ?? 0) - (expected[k] ?? 0)), `${id} axis ${k}`).toBeLessThan(0.001);
      expect(Math.abs(m.floor), `${id} floor`).toBeLessThan(0.004);
    }
  });

  it('keeps every UV inside its texture, so a cell of an atlas holds all of it', () => {
    for (const id of PROP_MODEL_IDS) {
      for (const mesh of kit.get(id)?.meshes ?? []) {
        const uv = mesh.geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i += 1) {
          expect(uv.getX(i), `${id} ${mesh.name} u`).toBeGreaterThanOrEqual(0);
          expect(uv.getX(i), `${id} ${mesh.name} u`).toBeLessThanOrEqual(1);
          expect(uv.getY(i), `${id} ${mesh.name} v`).toBeGreaterThanOrEqual(0);
          expect(uv.getY(i), `${id} ${mesh.name} v`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('names the parts the props select by, as the files do', () => {
    const names = (id: string) => (kit.get(id)?.meshes ?? []).map((m) => m.name);
    expect(names('toolbox-metal')).toEqual(expect.arrayContaining(['metal_toolbox', 'metal_toolbox_tray', 'metal_toolbox_handle', 'metal_toolbox_handle_latch_l', 'metal_toolbox_handle_latch_r', 'Cylinder015']));
    // The lid is a node, not a mesh: its shell, handle and latches are the meshes under it.
    const lid = (kit.get('toolbox-metal')?.meshes ?? []).filter((m) => m.ancestors.includes('metal_toolbox_lid')).map((m) => m.name);
    expect(lid.sort()).toEqual(['Cylinder015', 'metal_toolbox_handle', 'metal_toolbox_handle_latch_l', 'metal_toolbox_handle_latch_r']);
    expect(names('cricket-stumps')).toEqual(expect.arrayContaining(['stumps', 'bail_1', 'bail_2']));
    expect(names('scorebook')).toEqual(expect.arrayContaining(['book', 'cover']));
  });

  it('counts what each costs in triangles, within the library\'s own caps', () => {
    for (const id of PROP_MODEL_IDS) {
      const m = kit.get(id);
      expect(m?.triangles, id).toBeGreaterThan(0);
      expect(m?.triangles ?? 0, id).toBeLessThanOrEqual(id === 'trophy-cup-tall' || id === 'cricket-bat' ? 15000 : 3000);
    }
  });
});

describe('the models\' one atlas', () => {
  it('gives every model a cell inside the atlas, apart from every other by the gutter', () => {
    const plan = planModelAtlas(PROP_MODEL_IDS);
    const ids = Object.keys(plan.cells);
    expect(ids.sort()).toEqual([...PROP_MODEL_IDS].sort());
    for (const id of ids) {
      const c = plan.cells[id];
      expect(c).toBeDefined();
      if (!c) continue;
      expect(c.w, id).toBe(MODEL_EDGE[id] ?? 256);
      expect(c.x).toBeGreaterThanOrEqual(plan.gutter);
      expect(c.y).toBeGreaterThanOrEqual(plan.gutter);
      expect(c.x + c.w).toBeLessThanOrEqual(MODEL_ATLAS.width - plan.gutter);
      expect(c.y + c.h).toBeLessThanOrEqual(MODEL_ATLAS.height - plan.gutter);
    }
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const ra = plan.cells[a];
        const rb = plan.cells[b];
        if (!ra || !rb) continue;
        const apartX = ra.x + ra.w + plan.gutter <= rb.x || rb.x + rb.w + plan.gutter <= ra.x;
        const apartY = ra.y + ra.h + plan.gutter <= rb.y || rb.y + rb.h + plan.gutter <= ra.y;
        expect(apartX || apartY, `${a} and ${b} are apart`).toBe(true);
      }
    }
  });

  it('draws two canvases of the plan\'s size in the full tier, one model image at a time, and one in the lite tier', async () => {
    const plan = planModelAtlas(PROP_MODEL_IDS);
    expect(log.canvases.length).toBe(2);
    for (const c of log.canvases) expect([c.width, c.height]).toEqual([plan.width, plan.height]);
    // Each image is drawn twice (bled into the gutter, then exactly into its cell).
    for (const c of log.canvases) expect(c.draws).toBe(PROP_MODEL_IDS.length * 2);
    const liteLog: AtlasLog = { canvases: [] };
    const lite = await loadTestKit({ lite: true, log: liteLog });
    expect(liteLog.canvases.length).toBe(1);
    expect(lite.textures?.orm).toBeNull();
    lite.dispose();
  });

  it('fits a model\'s UVs into its cell and no further', () => {
    const m = kit.get('trophy-cup-squat');
    expect(m).toBeDefined();
    if (!m) return;
    const a = new Assembly();
    a.begin(placementOf('trophy-cabinet'), []);
    placeModel(a, m, { at: [0, 1, 0.2] });
    const uv = a.channels.model.bucket.uv;
    expect(uv.length).toBeGreaterThan(0);
    const [u0, v0, u1, v1] = m.uv;
    for (let i = 0; i < uv.length; i += 2) {
      expect(uv[i] ?? 0).toBeGreaterThanOrEqual(u0);
      expect(uv[i] ?? 0).toBeLessThanOrEqual(u1);
      expect(uv[i + 1] ?? 0).toBeGreaterThanOrEqual(v0);
      expect(uv[i + 1] ?? 0).toBeLessThanOrEqual(v1);
    }
  });

  it('paints the gutter from the cell\'s own border, then the cell, and zeroes the packed map\'s metalness for cloth only', () => {
    const calls: { kind: string; args: number[] }[] = [];
    const ctx = {
      clearRect: (...args: number[]) => calls.push({ kind: 'clear', args }),
      drawImage: (_image: unknown, ...args: number[]) => calls.push({ kind: 'draw', args }),
      getImageData: (...args: number[]) => {
        calls.push({ kind: 'read', args });
        return { data: new Uint8ClampedArray(4 * 4).fill(200) };
      },
      putImageData: (_data: unknown, ...args: number[]) => calls.push({ kind: 'write', args }),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    } as unknown as AtlasCtx;
    const plan = planModelAtlas(['cricket-bat', 'glove-work']);
    const image = { width: 1024, height: 1024 } as never;
    paintModelAtlas(ctx, plan, [
      { id: 'cricket-bat', image },
      { id: 'glove-work', image, blueZero: true },
    ]);
    const bat = plan.cells['cricket-bat'];
    const glove = plan.cells['glove-work'];
    expect(bat && glove).toBeTruthy();
    if (!bat || !glove) return;
    const draws = calls.filter((c) => c.kind === 'draw').map((c) => c.args);
    // The two bled draws come first (a little larger than the cell), then the exact ones.
    expect(draws[0]).toEqual([bat.x - (plan.gutter - 2), bat.y - (plan.gutter - 2), bat.w + 2 * (plan.gutter - 2), bat.h + 2 * (plan.gutter - 2)]);
    expect(draws[2]).toEqual([bat.x, bat.y, bat.w, bat.h]);
    expect(draws[3]).toEqual([glove.x, glove.y, glove.w, glove.h]);
    // Only the glove's cell is read back and rewritten.
    expect(calls.filter((c) => c.kind === 'read').length).toBe(1);
    expect(calls.filter((c) => c.kind === 'write').length).toBe(1);
    expect(ctx.imageSmoothingQuality).toBe('high');
  });

  it('knows which model is not metal: the glove, from its material, and nothing else', async () => {
    const cloth = new Set<string>();
    for (const id of PROP_MODEL_IDS) {
      const handle = await fileSource(id);
      if (extractModel(id, handle.object).nonMetal) cloth.add(id);
    }
    expect([...cloth]).toEqual(['glove-work']);
  });
});

describe('a model that cannot be loaded', () => {
  it('is reported missing and the others still load', async () => {
    const source: ModelSource = (id) => (id === 'cricket-ball' ? Promise.reject(new Error('no such model')) : fileSource(id));
    const k = await loadModelKit(['cricket-ball', 'scorebook'], source, { lite: false, anisotropy: 1, deps: recordingDeps() });
    expect(k.missing).toEqual(['cricket-ball']);
    expect(k.get('scorebook')).toBeDefined();
    expect(k.get('cricket-ball')).toBeUndefined();
    k.dispose();
  });

  it('leaves no texture and no atlas when none of them load', async () => {
    const k = await loadModelKit(['scorebook'], () => Promise.reject(new Error('offline')), { lite: false, anisotropy: 1, deps: recordingDeps() });
    expect(k.ids).toEqual([]);
    expect(k.textures).toBeNull();
    expect(k.missing).toEqual(['scorebook']);
  });
});

describe('releasing the kit', () => {
  it('frees its textures and its geometry, and is safe to do twice', async () => {
    const k = await loadTestKit({ ids: ['scorebook'] });
    const textures = k.textures;
    const base = vi.spyOn(textures?.base ?? new Texture(), 'dispose');
    const orm = vi.spyOn(textures?.orm ?? new Texture(), 'dispose');
    const geometry = vi.spyOn(k.get('scorebook')?.meshes[0]?.geometry ?? new Texture(), 'dispose');
    k.dispose();
    k.dispose();
    expect(base).toHaveBeenCalledTimes(1);
    expect(orm).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(k.get('scorebook')).toBeUndefined();
  });
});

describe('placing a model', () => {
  it('turns, then moves: yaw about the vertical, a lean about x, then the scale and the position', () => {
    const m = new Matrix4().copy(fitMatrix({ at: [1, 2, 3], yaw: Math.PI / 2, scale: 2 }));
    // A point 1 m along the model's +z lands 2 m along the prop's +x (quarter turn, doubled) from the origin.
    const p = { x: 0, y: 0, z: 1 };
    const e = m.elements;
    const world = [(e[0] ?? 0) * p.x + (e[4] ?? 0) * p.y + (e[8] ?? 0) * p.z + (e[12] ?? 0), (e[1] ?? 0) * p.x + (e[5] ?? 0) * p.y + (e[9] ?? 0) * p.z + (e[13] ?? 0), (e[2] ?? 0) * p.x + (e[6] ?? 0) * p.y + (e[10] ?? 0) * p.z + (e[14] ?? 0)];
    expect(world[0]).toBeCloseTo(3, 6);
    expect(world[1]).toBeCloseTo(2, 6);
    expect(world[2]).toBeCloseTo(3, 6);
  });

  it('takes only the meshes it is asked for, by node name, and follows the current bone', () => {
    const m = kit.get('cricket-stumps');
    expect(m).toBeDefined();
    if (!m) return;
    const a = new Assembly();
    a.begin(placementOf('cricket-bat'), [{ name: 'bails', pivot: [0, 0.7, 0] }]);
    const bone = a.part('bails');
    a.on(bone, () => {
      expect(placeModel(a, m, { at: [0, 0, 0.1] }, { only: (m) => m.name.startsWith('bail_') })).toBe(2);
    });
    expect(placeModel(a, m, { at: [0, 0, 0.1] }, { only: (m) => m.name === 'stumps' })).toBe(1);
    const owner = a.channels.model;
    expect(owner.bone.filter((b) => b === bone).length).toBeGreaterThan(0);
    expect(owner.bone.filter((b) => b === 0).length).toBeGreaterThan(0);
    expect(a.channels.model.bucket.triangleCount).toBe(m.triangles);
  });

  it('maps a cell to UVs from the top of the image', () => {
    expect(modelUv({ x: 512, y: 256, w: 256, h: 128 }, { width: 2048, height: 1024 })).toEqual([0.25, 0.25, 0.375, 0.375]);
  });
});

describe('the complete props assembly with models', () => {
  it('keeps the modelled props under 25,000 triangles and within eight shared channels', () => {
    const assembly = buildProps({}, kit);
    const procedural = buildProps({});
    const used = CHANNELS.filter((channel) => assembly.channels[channel].bucket.triangleCount > 0);
    expect(assembly.triangles, JSON.stringify({ modeled: [...assembly.trianglesBy], procedural: [...procedural.trianglesBy] })).toBeLessThanOrEqual(25_000);
    expect(used.length).toBeLessThanOrEqual(8);
  });
});
