/** Repack the room's passive variants. Runtime pivots come from placement data, not mesh centroids. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGlb } from '../../../../apps/web/src/assets/glbInfo.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const directory=join(root,'apps/web/src/chambers/certification-office/scene/catalogue');
const need=createRequire(join(realpathSync(join(root,'node_modules/@gltf-transform/cli')),'package.json'));
const {NodeIO}=need('@gltf-transform/core'),{ALL_EXTENSIONS}=need('@gltf-transform/extensions');
const {quantize,dedup,prune,weld,simplify}=need('@gltf-transform/functions');
const { MeshoptSimplifier } = await import('file://'+need.resolve('meshoptimizer'));
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
for(const entry of manifest){
 const file=join(directory,entry.sourceId+'.glb'), doc=await io.readBinary(new Uint8Array(readFileSync(file)));
 const triangles = doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives()).reduce((sum,primitive)=>sum+(primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount())/3,0);
 const cap = entry.sourceId === 'ledger-binders' ? 1800 : ['typewriter','rotary-telephone','column-radiator-10'].includes(entry.sourceId) ? 4000 : triangles;
 const ratio = Math.min(1,cap/triangles);
 if (ratio < 1) await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio,error:.003,lockBorder:false}));
 await doc.transform(dedup(),prune(),weld(),quantize({quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14}));
 const bytes=await io.writeBinary(doc);writeFileSync(file,bytes);
 const actual=readGlb(bytes);Object.assign(entry,{sha256:createHash('sha256').update(bytes).digest('hex'),triangles:actual.triangles,drawCalls:actual.drawCalls,compressedBytes:bytes.length,textureBytes:actual.textureBytes,dimensions:actual.max.map((n,i)=>n-actual.min[i])});
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packed',manifest.length,'variants;',manifest.reduce((sum,e)=>sum+e.compressedBytes,0),'bytes');

const far=await io.readBinary(new Uint8Array(readFileSync(join(root,'apps/web/src/chambers/certification-office/scene/heroes/archive-bay.glb'))));
await far.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.24,error:.002,lockBorder:false}),prune(),quantize({quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14}));
writeFileSync(join(root,'apps/web/src/chambers/certification-office/scene/heroes/archive-bay-distant.glb'),await io.writeBinary(far));
