import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface GlbDocument {
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  nodes?: { name?: string; extras?: Record<string, unknown> }[];
}

function readPackedModel(path: URL): GlbDocument {
  const glb = gunzipSync(readFileSync(path));
  const jsonLength = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as GlbDocument;
}

const door = readPackedModel(new URL('../../assets/outline-door.glb.gz', import.meta.url));
const room = readPackedModel(new URL('../../assets/outline-room.glb.gz', import.meta.url));

describe('Outline Room authored models', () => {
  it('gives each moving leaf two carriers on the overhead rail', () => {
    for (const side of ['Left', 'Right']) {
      const leaf = door.nodes?.find((node) => node.name === `OutlineDoorLeaf${side}`);
      expect(leaf?.extras?.['hangerCarriers']).toBe(2);
    }
  });

  it('lets the corridor show depth through the smoked leaves', () => {
    const glass = door.materials?.find((material) => material.name?.includes('Smoked ground glass'));
    expect(glass).toBeDefined();
    expect(glass?.pbrMetallicRoughness?.baseColorFactor?.[3]).toBeLessThanOrEqual(0.62);
  });

  it('gives both faces of the room door a framed panel instead of a blank slab', () => {
    const names = new Set(room.nodes?.map((node) => node.name));
    expect(names.has('Entry reverse panel upper')).toBe(true);
    expect(names.has('Entry reverse panel lower')).toBe(true);
  });
});
