import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allEntries, allSlots, budget, entriesWithTag, getEntry, getModel, getSurface, registerAssetSource } from './catalogue.ts';
import { readGlb, webpSize } from './glbInfo.ts';
import { BUDGET_BYTES, FILE_CAP_BYTES, LIBRARY_CAP_BYTES, TRIANGLE_CAP } from './policy.ts';
import type { ModelEntry, SurfaceEntry } from './types.ts';

const dir = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const bytes = (relative: string): Uint8Array => new Uint8Array(readFileSync(dir(relative)));
const mipmapped = (width: number, height: number): number => Math.round(width * height * 4 * (4 / 3));

const models = allEntries().filter((e): e is ModelEntry => e.kind === 'model');
const surfaces = allEntries().filter((e): e is SurfaceEntry => e.kind === 'surface');

describe('catalogue numbers match the shipped files', () => {
  it('has models and surfaces', () => {
    expect(models.length).toBeGreaterThan(0);
    expect(surfaces.length).toBeGreaterThan(0);
  });

  it.each(models.map((m) => [m.id, m] as const))('model %s: triangles, draw calls, size and bytes are the file\'s own', (id, entry) => {
    const file = bytes(`./models/${id}.glb`);
    const info = readGlb(file);
    expect(entry.compressedBytes).toBe(file.byteLength);
    expect(entry.triangles).toBe(info.triangles);
    expect(entry.drawCalls).toBe(info.drawCalls);
    expect(entry.textureBytes).toBe(info.textureBytes);
    expect(entry.textureMemoryBytes).toBe(info.images.reduce((sum, image) => sum + mipmapped(image.width, image.height), 0));
    const size = [0, 1, 2].map((i) => (info.max[i] ?? 0) - (info.min[i] ?? 0));
    entry.dimensions.forEach((value, i) => expect(Math.abs(value - (size[i] ?? NaN))).toBeLessThan(0.002));
  });

  it.each(models.map((m) => [m.id, m] as const))('model %s: origin is floor-centre, in metres', (id) => {
    const info = readGlb(bytes(`./models/${id}.glb`));
    const [minX, minY, minZ] = info.min;
    const [maxX, , maxZ] = info.max;
    expect(Math.abs(minY)).toBeLessThan(0.002);
    expect(Math.abs((minX + maxX) / 2)).toBeLessThan(0.002);
    expect(Math.abs((minZ + maxZ) / 2)).toBeLessThan(0.002);
  });

  it.each(models.map((m) => [m.id, m] as const))('model %s: within its tier\'s triangle cap, WebP and quantised, no wasm codecs', (id, entry) => {
    const info = readGlb(bytes(`./models/${id}.glb`));
    expect(info.triangles).toBeLessThanOrEqual(TRIANGLE_CAP[entry.tier]);
    for (const image of info.images) {
      expect(image.mimeType).toBe('image/webp');
      expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(2048);
    }
    const used = info.json.extensionsUsed ?? [];
    expect(used).toContain('KHR_mesh_quantization');
    for (const forbidden of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) expect(used).not.toContain(forbidden);
    expect(info.json.extensionsRequired ?? []).not.toContain('EXT_meshopt_compression');
  });

  it.each(surfaces.map((s) => [s.id, s] as const))('surface %s: map files, sizes and density are the files\' own', (id, entry) => {
    const albedo = bytes(`./surfaces/${id}-albedo.webp`);
    let total = albedo.byteLength;
    let memory = mipmapped(webpSize(albedo).width, webpSize(albedo).height);
    expect(entry.texelsPerMetre).toBe(Math.round(webpSize(albedo).width / entry.tileMetres));
    for (const map of ['normal', 'orm'] as const) {
      if (!entry.maps[map]) {
        expect(() => statSync(dir(`./surfaces/${id}-${map}.webp`))).toThrow();
        continue;
      }
      const file = bytes(`./surfaces/${id}-${map}.webp`);
      total += file.byteLength;
      memory += mipmapped(webpSize(file).width, webpSize(file).height);
    }
    expect(entry.compressedBytes).toBe(total);
    expect(entry.textureBytes).toBe(total);
    expect(entry.textureMemoryBytes).toBe(memory);
    expect(readdirSync(dir('./surfaces')).filter((file) => file.startsWith(`${id}-`)).sort()).toEqual(['albedo', ...(entry.maps.normal ? ['normal'] : []), ...(entry.maps.orm ? ['orm'] : [])].map((map) => `${id}-${map}.webp`).sort());
  });
});

describe('size policy', () => {
  const files = [...models.map((m) => `./models/${m.id}.glb`), ...surfaces.flatMap((s) => ['albedo', 'normal', 'orm'].filter((m) => s.maps[m as 'normal' | 'orm'] || m === 'albedo').map((m) => `./surfaces/${s.id}-${m}.webp`))];

  it('keeps every file under check:public\'s 5 MB limit', () => {
    for (const file of files) expect(statSync(dir(file)).size, file).toBeLessThan(FILE_CAP_BYTES);
  });

  it('keeps the committed library under 15 MB', () => {
    const total = files.reduce((sum, file) => sum + statSync(dir(file)).size, 0);
    expect(total).toBeLessThan(LIBRARY_CAP_BYTES);
  });

  it('holds the corridor\'s shared surfaces to the 0.95 MB initial allocation', () => {
    const set = entriesWithTag('initial-corridor');
    expect(set.length).toBeGreaterThan(0);
    for (const entry of set) expect(entry.kind).toBe('surface');
    expect(budget(set.map((e) => e.id)).downloadBytes).toBeLessThanOrEqual(BUDGET_BYTES.corridorSurfaces);
  });

  it('holds the Office\'s lazy set to 3 MB', () => {
    const set = entriesWithTag('lazy-office');
    expect(set.length).toBeGreaterThan(0);
    expect(budget(set.map((e) => e.id)).downloadBytes).toBeLessThanOrEqual(BUDGET_BYTES.officeLazy);
  });
});

describe('lookups and budget', () => {
  it('finds entries by id and by tag, and says what a missing id is', () => {
    const model = models[0];
    expect(model).toBeDefined();
    if (!model) return;
    expect(getEntry(model.id)).toBe(model);
    expect(getModel(model.id)).toBe(model);
    expect(() => getSurface(model.id)).toThrow(/no surface/);
    expect(() => getModel('no-such-thing')).toThrow(/no model/);
    for (const tag of model.tags) expect(entriesWithTag(tag)).toContain(model);
  });

  it('sums triangles per instance but downloads and texture memory once per id', () => {
    const model = models[0];
    if (!model) return;
    const one = budget([model.id]);
    const three = budget([model.id, model.id, model.id]);
    expect(three.triangles).toBe(one.triangles * 3);
    expect(three.drawCalls).toBe(one.drawCalls * 3);
    expect(three.downloadBytes).toBe(one.downloadBytes);
    expect(three.textureMemoryBytes).toBe(one.textureMemoryBytes);
    expect(budget(['absent-id', model.id]).missing).toEqual(['absent-id']);
  });

  it('takes a second manifest source, rejects a duplicate id, and closes the matching slot', () => {
    const slot = allSlots()[0];
    expect(slot).toBeDefined();
    if (!slot) return;
    const entry: ModelEntry = { id: slot.id, kind: 'model', title: 'Test piece', origin: 'original', licence: 'CC-BY-4.0', tags: ['test'], textureBytes: 0, textureMemoryBytes: 0, compressedBytes: 1, tier: 'prop', dimensions: [1, 1, 1], triangles: 10, drawCalls: 1 };
    const before = allSlots().length;
    registerAssetSource({ entries: [entry] });
    expect(getEntry(slot.id)).toBe(entry);
    expect(allSlots().length).toBe(before - 1);
    expect(() => registerAssetSource({ entries: [entry] })).toThrow(/already in the catalogue/);
  });
});
