/**
 * Guards for the original hero props: the manifest must describe the files exactly, every named moving
 * node must exist, and every file must stay inside its caps. Everything is measured from the .glb files
 * themselves (see glb.ts), never from the scripts that made them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGlb } from './glb';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..', '..');

interface Entry {
  id: string;
  title: string;
  file: string;
  source: string;
  licence: string;
  copyright: string;
  tier: 'small' | 'hero';
  triangleCap: number;
  triangles: number;
  textureBytes: number;
  compressedBytes: number;
  sha256: string;
  dimensions: { x: number; y: number; z: number };
  movingNodes: string[];
  emissiveNodes: string[];
  previews: string[];
}

const manifest = JSON.parse(readFileSync(join(HERE, 'original.json'), 'utf8')) as { props: Entry[] };

/** Caps from the brief: at most 3k triangles for a small prop, 15k for a hero piece; 1.5 MB a file. */
const TRIANGLE_CAPS = { small: 3000, hero: 15000 };
const FILE_CAP_BYTES = 1_500_000;
/** Decoders that need WebAssembly are not allowed by the site's security policy. */
const ALLOWED_REQUIRED_EXTENSIONS = new Set(['EXT_texture_webp', 'KHR_mesh_quantization']);
const SIZE_TOLERANCE = 0.0015;

function measure(entry: Entry) {
  return readGlb(new Uint8Array(readFileSync(join(HERE, entry.file))));
}

describe('original props manifest', () => {
  it('lights the lamp: its shade underside and bulb are the glowing nodes', () => {
    const lamp = manifest.props.find((p) => p.id === 'banker-lamp');
    expect(lamp, 'the banker lamp should be in the manifest').toBeDefined();
    expect([...(lamp?.emissiveNodes ?? [])].sort()).toEqual(['bulb', 'shade_glow']);
    expect(lamp?.movingNodes).toContain('pull_chain');
  });

  it('lists every .glb in the folder, and only those', () => {
    const onDisk = readdirSync(HERE).filter((f) => f.endsWith('.glb')).sort();
    const listed = manifest.props.map((p) => p.file).sort();
    expect(listed).toEqual(onDisk);
    expect(new Set(manifest.props.map((p) => p.id)).size).toBe(manifest.props.length);
  });

  describe.each(manifest.props.map((p) => [p.id, p] as const))('%s', (_id, entry) => {
    const stats = measure(entry);

    it('matches the triangle count in the file', () => {
      expect(entry.triangles).toBe(stats.triangles);
    });

    it('matches the byte sizes of the file and of its textures', () => {
      expect(entry.compressedBytes).toBe(stats.fileBytes);
      expect(entry.textureBytes).toBe(stats.textureBytes);
    });

    it('matches the checksum recorded for the file', () => {
      const digest = createHash('sha256').update(readFileSync(join(HERE, entry.file))).digest('hex');
      expect(entry.sha256).toBe(digest);
    });

    it('matches the real-world size measured from the vertices', () => {
      expect(Math.abs(entry.dimensions.x - stats.size.x)).toBeLessThanOrEqual(SIZE_TOLERANCE);
      expect(Math.abs(entry.dimensions.y - stats.size.y)).toBeLessThanOrEqual(SIZE_TOLERANCE);
      expect(Math.abs(entry.dimensions.z - stats.size.z)).toBeLessThanOrEqual(SIZE_TOLERANCE);
    });

    it('stands on the floor at the centre of its footprint, +Y up', () => {
      expect(Math.abs(stats.min.y)).toBeLessThanOrEqual(0.004);
      expect(Math.abs((stats.min.x + stats.max.x) / 2)).toBeLessThanOrEqual(0.03);
      expect(Math.abs((stats.min.z + stats.max.z) / 2)).toBeLessThanOrEqual(0.03);
    });

    it('has every moving node it names, as a node of its own', () => {
      for (const name of entry.movingNodes) {
        expect(stats.nodeNames, `${entry.id} should contain a node named "${name}"`).toContain(name);
      }
      expect(new Set(entry.movingNodes).size).toBe(entry.movingNodes.length);
    });

    it('names exactly the nodes that glow, each as a node of its own', () => {
      expect([...entry.emissiveNodes].sort()).toEqual([...stats.emissiveNodeNames].sort());
      for (const name of entry.emissiveNodes) expect(stats.nodeNames).toContain(name);
    });

    it('is within its triangle cap and the file cap', () => {
      expect(entry.triangleCap).toBe(TRIANGLE_CAPS[entry.tier]);
      expect(stats.triangles).toBeLessThanOrEqual(TRIANGLE_CAPS[entry.tier]);
      expect(stats.fileBytes).toBeLessThanOrEqual(FILE_CAP_BYTES);
    });

    it('needs no WebAssembly decoder and carries WebP textures', () => {
      for (const ext of stats.extensionsRequired) expect(ALLOWED_REQUIRED_EXTENSIONS.has(ext), `${ext} is not allowed`).toBe(true);
      expect(stats.imageTypes.length).toBeGreaterThan(0);
      for (const type of stats.imageTypes) expect(type).toBe('image/webp');
    });

    it('is licensed CC BY 4.0 as original work, with a source script and previews that exist', () => {
      expect(entry.licence).toBe('CC-BY-4.0');
      expect(entry.copyright).toContain('Asiri Dalugoda');
      expect(existsSync(join(REPO, entry.source))).toBe(true);
      expect(entry.previews.length).toBeGreaterThan(0);
      for (const preview of entry.previews) expect(existsSync(join(HERE, preview))).toBe(true);
    });
  });
});

describe('the GLB reader', () => {
  /** A hand-built binary: two triangles on one node, translated and scaled, with a child node. */
  function fixture(): Uint8Array {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const pad = (n: number) => (n + 3) & ~3;
    const posBytes = new Uint8Array(positions.buffer);
    const idxBytes = new Uint8Array(indices.buffer);
    const binLength = pad(posBytes.length) + pad(idxBytes.length);
    const bin = new Uint8Array(binLength);
    bin.set(posBytes, 0);
    bin.set(idxBytes, pad(posBytes.length));
    const json = {
      asset: { version: '2.0', generator: 'test', copyright: 'test copyright' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'root', translation: [0, 0.5, 0], children: [1, 2] },
        { name: 'panel', mesh: 0, scale: [2, 3, 1], translation: [1, 0, 0] },
        { name: 'empty child' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
        { buffer: 0, byteOffset: pad(posBytes.length), byteLength: idxBytes.length },
      ],
      buffers: [{ byteLength: binLength }],
    };
    const jsonText = new TextEncoder().encode(JSON.stringify(json));
    const jsonPadded = new Uint8Array(pad(jsonText.length)).fill(0x20);
    jsonPadded.set(jsonText);
    const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonPadded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    out.set(jsonPadded, 20);
    const binAt = 20 + jsonPadded.length;
    view.setUint32(binAt, bin.length, true);
    view.setUint32(binAt + 4, 0x004e4942, true);
    out.set(bin, binAt + 8);
    return out;
  }

  it('reads triangles, names, bounds and metadata from a known file', () => {
    const stats = readGlb(fixture());
    expect(stats.triangles).toBe(2);
    expect(stats.nodeNames).toEqual(['root', 'panel', 'empty child']);
    expect(stats.meshNodes).toBe(1);
    // the unit square scaled (2, 3, 1), moved by (1, 0.5, 0)
    expect(stats.min).toEqual({ x: 1, y: 0.5, z: 0 });
    expect(stats.max).toEqual({ x: 3, y: 3.5, z: 0 });
    expect(stats.size).toEqual({ x: 2, y: 3, z: 0 });
    expect(stats.copyright).toBe('test copyright');
    expect(stats.textureBytes).toBe(0);
  });

  it('rejects data that is not a glTF binary', () => {
    expect(() => readGlb(new Uint8Array(32))).toThrow(/magic/);
  });
});
