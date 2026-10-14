import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** Independent inline GLBs keep every tracked binary below the public-file limit. */
export async function splitGeometry(input, directory, space) {
  const source = await readFile(input);
  const jsonLength = source.readUInt32LE(12);
  const document = JSON.parse(source.subarray(20,20+jsonLength).toString());
  const binary = source.subarray(28+jsonLength);
  const files = [];
  for (let meshIndex = 0; meshIndex < document.meshes.length; meshIndex++) {
    const mesh = structuredClone(document.meshes[meshIndex]);
    const accessors = [], views = [], chunks = [];
    const mappedAccessors = new Map();
    let length = 0;
    const copyAccessor = (old, vertex = false) => {
      if (mappedAccessors.has(old)) return mappedAccessors.get(old);
      const accessor = structuredClone(document.accessors[old]);
      if (accessor.sparse) throw new Error('Sparse baked accessors are unsupported');
      const view = document.bufferViews[accessor.bufferView];
      const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type];
      const bytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[accessor.componentType];
      if (!components || !bytes) throw new Error('Unsupported baked accessor');
      const itemBytes = components * bytes;
      const stride = vertex ? Math.ceil(itemBytes / 4) * 4 : itemBytes;
      const data = Buffer.alloc(accessor.count * stride);
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let i=0;i<accessor.count;i++) binary.copy(data,i*stride,offset+i*(view.byteStride??itemBytes),offset+i*(view.byteStride??itemBytes)+itemBytes);
      const padding = Buffer.alloc((4-data.length%4)%4);
      accessor.bufferView=views.length; accessor.byteOffset=0;
      views.push({buffer:0,byteOffset:length,byteLength:data.length,target:vertex?34962:34963,...(stride!==itemBytes?{byteStride:stride}:{})});
      chunks.push(data,padding); length += data.length+padding.length;
      mappedAccessors.set(old,accessors.length); accessors.push(accessor);
      return accessors.length-1;
    };
    for (const primitive of mesh.primitives) {
      primitive.attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([k,v])=>[k,copyAccessor(v,true)]));
      if (primitive.indices!==undefined) primitive.indices=copyAccessor(primitive.indices);
    }
    const parents = new Map();
    document.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>parents.set(child,i)));
    const included = new Set();
    document.nodes.forEach((node,i)=>{if(node.mesh===meshIndex)for(let current=i;current!==undefined;current=parents.get(current))included.add(current);});
    const nodeIndices=[...included].sort((a,b)=>a-b);
    const remap=new Map(nodeIndices.map((old,i)=>[old,i]));
    const nodes=nodeIndices.map(old=>{
      const copy=structuredClone(document.nodes[old]);
      if(copy.mesh===meshIndex) copy.mesh=0; else delete copy.mesh;
      if(copy.children)copy.children=copy.children.filter(child=>included.has(child)).map(child=>remap.get(child));
      return copy;
    });
    const scenes=document.scenes.map(scene=>({...scene,nodes:scene.nodes.filter(node=>included.has(node)).map(node=>remap.get(node))}));
    const next={...document,scenes,nodes,meshes:[mesh],accessors,bufferViews:views,buffers:[{byteLength:length}]};
    const json=Buffer.from(JSON.stringify(next));
    const jsonPadding=Buffer.alloc((4-json.length%4)%4,32);
    const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPadding.length+length,8);header.writeUInt32LE(json.length+jsonPadding.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(length,0);binaryHeader.writeUInt32LE(0x004e4942,4);
    const result=Buffer.concat([header,json,jsonPadding,binaryHeader,...chunks]);
    if(result.length>5*1024*1024) throw new Error('Baked mesh exceeds public file limit');
    const file=`${space}-geometry-${meshIndex}.json`;
    const inline='data:application/gzip;base64,'+gzipSync(result,{level:9}).toString('base64');
    await writeFile(path.join(directory,file),JSON.stringify(inline)+'\n');files.push(file);
  }
  return files;
}
