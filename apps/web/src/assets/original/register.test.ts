/**
 * The original props join the shared catalogue: every id in original.json resolves through the same
 * `loadModel` the licensed library uses, with no fetch and no ImageBitmap, budget() counts them, and
 * the catalogue's "original work" slots they satisfy are closed. Numbers are re-measured from the
 * files with the catalogue's own reader (../glbInfo.ts).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Mesh, MeshStandardMaterial } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { modelLoader } from '../catalogue.ts';
import { type DomStub, installDomStub } from '../domStub.ts';
import { readGlb } from '../glbInfo.ts';
import { allEntries, allSlots, budget, entriesWithTag, getModel, loadModel } from '../index.ts';
import { TRIANGLE_CAP } from '../policy.ts';
import manifest from './original.json';

interface Prop {
  id: string;
  movingNodes: string[];
  emissiveNodes: string[];
}

const props = manifest.props as Prop[];
/** Slots the catalogue keeps open for original work: three match an id exactly, three are asked for more loosely. */
const FILLED_SLOTS = ['rotary-telephone', 'typewriter', 'filing-cabinet', 'radiator-cast-iron', 'trophy-cup', 'cricket-bat'];
const file = (id: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`./${id}.glb`, import.meta.url))));
const mipmapped = (width: number, height: number): number => Math.round(width * height * 4 * (4 / 3));

let stub: DomStub | undefined;
afterEach(() => stub?.restore());

describe('original props in the catalogue', () => {
  it('registers every prop in original.json, once, as an original model under CC BY 4.0', () => {
    expect(allEntries().filter((entry) => entry.origin === 'original').length).toBe(props.length);
    for (const { id } of props) {
      const entry = getModel(id);
      expect(entry.origin).toBe('original');
      expect(entry.licence).toBe('CC-BY-4.0');
    }
    const ids = allEntries().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(props.map((p) => [p.id] as const))('%s: the catalogue states what its file says', (id) => {
    const entry = getModel(id);
    const bytes = file(id);
    const info = readGlb(bytes);
    expect(entry.compressedBytes).toBe(bytes.byteLength);
    expect(entry.triangles).toBe(info.triangles);
    expect(entry.drawCalls).toBe(info.drawCalls);
    expect(entry.textureBytes).toBe(info.textureBytes);
    expect(entry.textureMemoryBytes).toBe(info.images.reduce((sum, image) => sum + mipmapped(image.width, image.height), 0));
    const size = [0, 1, 2].map((i) => (info.max[i] ?? 0) - (info.min[i] ?? 0));
    entry.dimensions.forEach((value, i) => expect(Math.abs(value - (size[i] ?? Number.NaN))).toBeLessThan(0.002));
    expect(entry.triangles).toBeLessThanOrEqual(TRIANGLE_CAP[entry.tier]);
  });

  it.each(props.map((p) => [p.id] as const))('%s: has a lazy loader that yields a data: URL of a glTF binary', async (id) => {
    const url = await modelLoader(id)();
    expect(url.startsWith('data:')).toBe(true);
    const payload = atob(url.slice(url.indexOf(',') + 1, url.indexOf(',') + 9));
    expect(payload.slice(0, 4)).toBe('glTF');
  });

  describe.each(props.map((p) => [p.id, p] as const))('loadModel(%s)', (_id, prop) => {
    it('decodes with zero fetches and zero ImageBitmap calls, keeping its named nodes', async () => {
      stub = installDomStub({ bitmaps: true });
      const handle = await loadModel(prop.id);
      expect(stub.fetchCalls).toEqual([]);
      expect(stub.bitmapCalls).toEqual([]);
      expect(stub.images.length).toBeGreaterThan(0);
      let meshes = 0;
      handle.object.traverse((node) => {
        if ((node as Mesh).isMesh) meshes += 1;
      });
      expect(meshes).toBe(getModel(prop.id).drawCalls);
      for (const name of [...prop.movingNodes, ...prop.emissiveNodes]) {
        expect(handle.object.getObjectByName(name), `${prop.id} should have a node named "${name}"`).toBeDefined();
      }
      for (const name of prop.emissiveNodes) {
        const material = (handle.object.getObjectByName(name) as Mesh).material as MeshStandardMaterial;
        expect(material.emissive.getHex(), `${name} should glow`).not.toBe(0);
      }
      handle.release();
    });
  });

  it('is counted by budget(): triangles and draw calls per instance, download and texture memory once per id', () => {
    const lamp = getModel('banker-lamp');
    const globe = getModel('desk-globe');
    const total = budget(['banker-lamp', 'desk-globe', 'desk-globe']);
    expect(total.missing).toEqual([]);
    expect(total.triangles).toBe(lamp.triangles + 2 * globe.triangles);
    expect(total.drawCalls).toBe(lamp.drawCalls + 2 * globe.drawCalls);
    expect(total.downloadBytes).toBe(lamp.compressedBytes + globe.compressedBytes);
    expect(total.textureMemoryBytes).toBe(lamp.textureMemoryBytes + globe.textureMemoryBytes);
    expect(lamp.triangles).toBeGreaterThan(0);
  });

  it('adds up beside a library model in one plan', () => {
    const mixed = budget(['office-desk-metal', 'banker-lamp']);
    expect(mixed.missing).toEqual([]);
    expect(mixed.triangles).toBe(getModel('office-desk-metal').triangles + getModel('banker-lamp').triangles);
    expect(mixed.downloadBytes).toBe(getModel('office-desk-metal').compressedBytes + getModel('banker-lamp').compressedBytes);
  });

  it('closes every original-work slot these props fill and leaves the founder downloads open', () => {
    const open = allSlots();
    for (const id of FILLED_SLOTS) expect(open.map((slot) => slot.id)).not.toContain(id);
    expect(open.filter((slot) => slot.status === 'original-work')).toEqual([]);
    expect(open.map((slot) => slot.id)).toContain('coat-stand');
  });

  it('tags each prop for a place, and never with the tags that define the Office and corridor byte budgets', () => {
    for (const { id } of props) {
      const entry = getModel(id);
      expect(entry.tags.some((tag) => tag === 'office' || tag === 'corridor'), `${entry.id} needs a place tag`).toBe(true);
      expect(entry.tags).not.toContain('lazy-office');
      expect(entry.tags).not.toContain('initial-corridor');
    }
    const ids = new Set(props.map((prop) => prop.id));
    expect(entriesWithTag('lazy-office').filter((entry) => ids.has(entry.id))).toEqual([]);
    expect(entriesWithTag('sport').some((entry) => entry.id === 'cricket-bat')).toBe(true);
  });
});
