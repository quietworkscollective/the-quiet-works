import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {splitGeometry} from './split.mjs';
for(const componentType of [5126,5122,5121])test('packs quantized '+componentType+' mesh accessor without shared storage or unrelated nodes',async()=>{
 const dir=new URL('../../.bake-cache/split-test-'+componentType+'/',import.meta.url);await mkdir(dir,{recursive:true});
 const data=Buffer.alloc(144);for(let i=0;i<6;i++)for(let c=0;c<3;c++)data.writeFloatLE(i*3+c,(i*6+c)*4);
 const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{translation:[1,2,3],children:[1,2]},{mesh:0,extras:{bakeId:'first'}},{mesh:1,extras:{bakeId:'second',bakeLazy:true}}],meshes:[{primitives:[{attributes:{POSITION:0}}]},{primitives:[{attributes:{POSITION:1}}]}],accessors:[{bufferView:0,byteOffset:0,componentType,normalized:componentType!==5126,count:3,type:'VEC3'},{bufferView:0,byteOffset:72,componentType,normalized:componentType!==5126,count:3,type:'VEC3'}],bufferViews:[{buffer:0,byteLength:144,byteStride:24}],buffers:[{byteLength:144}]};
 const json=Buffer.from(JSON.stringify(document));const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+data.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);const bin=Buffer.alloc(8);bin.writeUInt32LE(data.length,0);bin.writeUInt32LE(0x004e4942,4);const input=new URL('source.glb',dir);await writeFile(input,Buffer.concat([header,padded,bin,data]));
 const files=await splitGeometry(input,dir.pathname,'corridor');assert.equal(files.length,2);
 assert.deepEqual(files.map(file=>file.lazy),[false,true]);
 for(const [index,entry] of files.entries()){
  const inline=JSON.parse(await readFile(new URL(entry.file,dir),'utf8'));const glb=gunzipSync(Buffer.from(inline.split(',')[1],'base64'));const jsonSize=glb.readUInt32LE(12);const result=JSON.parse(glb.subarray(20,20+jsonSize));
  const bytes={5126:4,5122:2,5121:1}[componentType], stride=Math.ceil(bytes*3/4)*4;
  assert.equal(result.buffers[0].byteLength,stride*3,'unrelated interleaved storage copied');
  if(stride!==bytes*3)assert.equal(result.bufferViews[0].byteStride,stride);
  assert.equal(result.nodes.length,2,'unrelated nodes copied');
  assert.deepEqual(result.nodes[0].translation,[1,2,3]);assert.deepEqual(result.nodes[0].children,[1]);
  assert.equal(result.nodes[1].extras.bakeId,index?'second':'first');
  const binary=glb.subarray(28+jsonSize);for(let row=0;row<3;row++)assert.deepEqual(binary.subarray(row*stride,row*stride+bytes*3),data.subarray(index*72+row*24,index*72+row*24+bytes*3));
 }
});

test('packs TEXCOORD_0 into normalized 16-bit values with a reversible per-mesh range',async()=>{
 const dir=new URL('../../.bake-cache/split-test-uv0/',import.meta.url);await mkdir(dir,{recursive:true});
 const sourceUv=[-12.25,2.5,6.75,-4,0,12.25];const data=Buffer.alloc(sourceUv.length*4);sourceUv.forEach((value,i)=>data.writeFloatLE(value,i*4));
 const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,extras:{bakeId:'uv0'}}],meshes:[{primitives:[{attributes:{TEXCOORD_0:0}}]}],accessors:[{bufferView:0,byteOffset:0,componentType:5126,count:3,type:'VEC2'}],bufferViews:[{buffer:0,byteLength:data.length}],buffers:[{byteLength:data.length}]};
 const json=Buffer.from(JSON.stringify(document));const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+data.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);const bin=Buffer.alloc(8);bin.writeUInt32LE(data.length,0);bin.writeUInt32LE(0x004e4942,4);const input=new URL('source.glb',dir);await writeFile(input,Buffer.concat([header,padded,bin,data]));
 const [entry]=await splitGeometry(input,dir.pathname,'corridor');assert.ok(entry);const inline=JSON.parse(await readFile(new URL(entry.file,dir),'utf8'));const glb=gunzipSync(Buffer.from(inline.split(',')[1],'base64'));const jsonSize=glb.readUInt32LE(12);const result=JSON.parse(glb.subarray(20,20+jsonSize));
 const accessor=result.accessors[0];assert.equal(accessor.componentType,5123);assert.equal(accessor.normalized,true);assert.deepEqual(result.nodes[0].extras.tqwUv0Range,[-12.25,6.75,-4,12.25]);
 const view=result.bufferViews[accessor.bufferView];const binary=glb.subarray(28+jsonSize);for(let i=0;i<sourceUv.length;i++){const component=i%2;const min=component===0?-12.25:-4;const max=component===0?6.75:12.25;const packed=binary.readUInt16LE(view.byteOffset+i*2)/65535;const restored=min+packed*(max-min);assert.ok(Math.abs(restored-sourceUv[i])<0.00013,`UV ${i} decoded ${restored}, expected ${sourceUv[i]}`);}
});
