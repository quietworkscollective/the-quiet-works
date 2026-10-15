import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { OFFICE_BUDGET } from './budget.ts';
import { budget } from '../../../assets/index.ts';
import { readGlb } from '../../../assets/glbInfo.ts';
import { OFFICE_ASSET_SLOTS, officeAssetSlot } from './assetSlots.ts';
import { furnitureBatches } from './furnitureGeometry.ts';
import { OFFICE_STAGE_VARIANTS, stageModelId } from './catalogue/index.ts';

it('preserves source provenance and measures every stage variant from its shipped bytes', () => {
 for(const entry of OFFICE_STAGE_VARIANTS) {
  const bytes=readFileSync(new URL(`./catalogue/${entry.sourceId}.glb.gz`,import.meta.url));
  const source=readFileSync(new URL(`../../../../../../${entry.source}`,import.meta.url));
  expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sourceSha256);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  const unpacked=gunzipSync(bytes);
  const canonical=readFileSync(new URL(`./catalogue/${entry.sourceId}.glb`,import.meta.url));
  expect(unpacked.equals(canonical), 'packaging must preserve every model and texture byte').toBe(true);
  const actual=readGlb(unpacked);
  expect(actual.triangles).toBe(entry.triangles);expect(actual.drawCalls).toBe(entry.drawCalls);
  expect(bytes.byteLength).toBe(entry.compressedBytes);
  expect(['CC0-1.0','CC-BY-4.0']).toContain(entry.licence);
 }

});
it('batches repeated catalogue primitives while retaining placement transforms and independent fittings', () => {
 const material=new MeshStandardMaterial(),geometry=new BoxGeometry(),model=new Mesh(geometry,material);
 const source=officeAssetSlot('banker-lamp');
 const placed=[source,{...source,id:'second',position:[2,0,3] as const}];
 const result=furnitureBatches(placed,new Map([[stageModelId('banker-lamp'),model]]),stageModelId);
 expect(result).toHaveLength(1);expect(result[0]?.matrices).toHaveLength(2);
 expect(new Vector3().setFromMatrixPosition(result[0]!.matrices[0]!)).toEqual(new Vector3(...source.position));
 expect(new Vector3().setFromMatrixPosition(result[0]!.matrices[1]!)).toEqual(new Vector3(2,0,3));
 expect(result[0]?.fittings).toContain('lamp');expect(result[0]?.material).toBe(material);
 expect(model.position).toEqual(new Vector3());geometry.dispose();material.dispose();
});

it('batches fitting faces without hiding hit proxies or changing their discovery identities', async () => {
 const {Group,MeshBasicMaterial,Raycaster}=await import('three');
 const {batchFittings}=await import('./batchFittings.ts');
 const root=new Group(),fitting=new Group(),material=new MeshBasicMaterial(),geometry=new BoxGeometry();
 fitting.userData={officeObjectId:'drawer'};root.add(fitting);
 const first=new Mesh(geometry,material),second=new Mesh(geometry,material);second.position.x=2;fitting.add(first,second);
 const hitMaterial=new MeshBasicMaterial({transparent:true,opacity:0});hitMaterial.visible=false;
 const proxy=new Mesh(geometry,hitMaterial);root.add(proxy);
 const off=batchFittings(root),batch=root.getObjectByName('office-batched-fittings');
 expect(batch?.children).toHaveLength(1);expect(first.visible).toBe(false);expect(proxy.visible).toBe(true);
 expect(batch?.children[0]?.userData['officeObjectIds']).toEqual(['drawer']);
 const ray=new Raycaster(new Vector3(0,0,3),new Vector3(0,0,-1));expect(ray.intersectObject(proxy).length).toBeGreaterThan(0);
 off();expect(first.visible).toBe(true);expect(root.getObjectByName('office-batched-fittings')).toBeUndefined();
 geometry.dispose();material.dispose();hitMaterial.dispose();
});

it('keeps the actual selected lazy model and scan set inside its allocation', () => {
 const plan=budget([...OFFICE_ASSET_SLOTS.flatMap(s=>s.catalogueId?[stageModelId(s.catalogueId)]:[]),'concrete','linoleum','enamel-steel','brass']);
 expect(plan.missing).toEqual([]);expect(plan.downloadBytes).toBeLessThanOrEqual(OFFICE_BUDGET.lazyBytes);
 expect(plan.triangles).toBeLessThanOrEqual(OFFICE_BUDGET.triangles);
});

it('includes every installed Office library model in the production loader selection', () => {
 const installations = JSON.parse(readFileSync(new URL('../../../assets/installed-models.json', import.meta.url), 'utf8')) as Record<string,string[]>;
 for (const slot of OFFICE_ASSET_SLOTS) {
  if (!slot.catalogueId || slot.catalogueId.startsWith('office-hero-') || stageModelId(slot.catalogueId) !== slot.catalogueId) continue;
  expect(installations['certification-office'], `production must load ${slot.catalogueId}`).toContain(slot.catalogueId);
 }
});
