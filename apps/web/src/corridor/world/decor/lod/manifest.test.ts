import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from './manifest.json';
import { DECOR_DRAW_CALLS, DECOR_MODEL_IDS, DECOR_TRIANGLES } from '../budget.ts';

describe('corridor dressing copies', () => {
  it('keeps the scanned set inside its measured geometry budget', () => {
    expect(DECOR_TRIANGLES).toBeLessThanOrEqual(12_000);
    expect(DECOR_DRAW_CALLS).toBeLessThanOrEqual(32);
  });

  it('records each source, licence and generated model hash', () => {
    expect(Object.keys(manifest.models).sort()).toEqual([...DECOR_MODEL_IDS].sort());
    for (const id of DECOR_MODEL_IDS) {
      const model = manifest.models[id];
      expect(['CC0-1.0', 'CC-BY-4.0']).toContain(model.licence);
      expect(model.copyright.length).toBeGreaterThan(10);
      expect(model.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      const file = readFileSync(new URL(`./${id}.glb`, import.meta.url));
      expect(file.byteLength, id).toBe(model.bytes);
      expect(createHash('sha256').update(file).digest('hex'), id).toBe(model.sha256);
    }
  });
});
