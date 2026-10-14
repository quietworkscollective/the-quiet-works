import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { bytesFromDataUrl } from '../../../assets/gltf.ts';
import { unpackOfficeModel } from './packedModel.ts';
import catalogue from './catalogue/manifest.json';
import heroes from './heroes/manifest.json';

it('delivers every packed Office asset to the existing GLB parser without changing any authored byte', async () => {
  for (const [directory, names] of [
    ['catalogue', catalogue.map(entry => entry.sourceId)],
    ['heroes', heroes.map(entry => entry.id.replace('office-hero-', ''))],
  ] as const) {
    for (const name of names) {
      const packed = readFileSync(new URL(`./${directory}/${name}.glb.gz`, import.meta.url));
      const canonical = readFileSync(new URL(`./${directory}/${name}.glb`, import.meta.url));
      const url = await unpackOfficeModel(`data:application/gzip;base64,${packed.toString('base64')}`);
      expect(Buffer.from(bytesFromDataUrl(url)).equals(canonical), `${directory}/${name}`).toBe(true);
    }
  }
});
