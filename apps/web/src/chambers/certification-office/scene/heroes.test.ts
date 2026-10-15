import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { readGlb } from '../../../assets/glbInfo.ts';
import { HERO_MOVING } from './heroRig.ts';
import manifest from './heroes/manifest.json';

it('records the measured shipping meshes, licensed source scripts and decoder-free textures', () => {
 for (const entry of manifest) {
  const file=entry.id.replace('office-hero-','');
  const bytes=readFileSync(new URL(`./heroes/${file}.glb.gz`,import.meta.url));
  const unpacked=gunzipSync(bytes);
  const canonical=readFileSync(new URL(`./heroes/${file}.glb`,import.meta.url));
  expect(unpacked.equals(canonical), 'packaging must preserve every model and texture byte').toBe(true);
  const actual=readGlb(unpacked);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  expect(actual.triangles).toBe(entry.triangles);expect(actual.drawCalls).toBe(entry.drawCalls);
  expect(bytes.length).toBe(entry.compressedBytes);
  expect(actual.images.every(image=>image.mimeType==='image/webp')).toBe(true);
  expect(actual.json.extensionsRequired?.every(name=>['KHR_mesh_quantization','EXT_texture_webp'].includes(name)) ?? true).toBe(true);
  expect(entry.licence).toBe('CC-BY-4.0');
  expect(readFileSync(new URL(`../../../../../../${entry.licenceFile}`,import.meta.url),'utf8')).toContain('Creative Commons');
  expect(readFileSync(new URL(`../../../../../../${entry.source}`,import.meta.url),'utf8')).toContain('bpy');
  const nodes=actual.json.nodes as Array<{name?:string;translation?:number[]}>;
  for (const name of HERO_MOVING[file] ?? []) expect(nodes.some(node=>node.name===name),`${file}: ${name}`).toBe(true);
  if(file==='press')expect(nodes.find(node=>node.name==='stamp')?.translation?.[1]).toBeCloseTo(.0115+.065,5);
 }
});
it('preserves near archive craft while reducing the distant bay geometry',()=>{
 const near=manifest.find(entry=>entry.id==='office-hero-archive-bay')!;
 const far=manifest.find(entry=>entry.id==='office-hero-archive-bay-distant')!;
 expect(far.triangles).toBeLessThan(near.triangles*.3);
 far.dimensions.forEach((value,i)=>expect(value).toBeCloseTo(near.dimensions[i]!,2));
});
