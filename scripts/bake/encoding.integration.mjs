import {test} from 'node:test';
import {verifyRoundtrip} from './codec.mjs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {webpArgs} from './webp.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));

test('actual Blender PNG and WebP round trip preserve the irradiance transfer',async()=>{
 const dir=path.join(root,'.bake-cache/codec');await mkdir(dir,{recursive:true});
 for(const [command,args] of [[process.env.BLENDER??'/Applications/Blender.app/Contents/MacOS/Blender',['-b','--factory-startup','--python-exit-code','1','--python','scripts/bake/encode.py','--',dir]],['cwebp',webpArgs(path.join(dir,'roundtrip.png'),path.join(dir,'roundtrip.webp'))]]){
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,(result.stdout??'')+(result.stderr??''));
 }
 const meta=JSON.parse(await readFile(path.join(dir,'roundtrip.json'),'utf8'));
 const png='data:image/png;base64,'+(await readFile(path.join(dir,'roundtrip.png'))).toString('base64');
 const webp='data:image/webp;base64,'+(await readFile(path.join(dir,'roundtrip.webp'))).toString('base64');
 await verifyRoundtrip({...meta,png,webp});
 if(process.env.UPDATE_BAKE_CODEC==='1') {
  const encoderHash=createHash('sha256').update(await readFile(new URL('./encode.py',import.meta.url))).digest('hex');
  const codecHash=createHash('sha256').update(await readFile(new URL('./webp.mjs',import.meta.url))).digest('hex');
  await writeFile(new URL('./fixtures/codec.json',import.meta.url),JSON.stringify({...meta,encoderHash,codecHash,png,webp},null,2)+'\n');
 }
});
