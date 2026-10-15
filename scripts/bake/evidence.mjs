import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium,devices}=require('@playwright/test');
const out=process.env.TQW_BAKE_EVIDENCE;
if(!out)throw new Error('Set TQW_BAKE_EVIDENCE to the evidence directory');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const records=[];
try{
 for(const [device,options] of [['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],['pixel7',devices['Pixel 7']]]){
  if(process.env.TQW_BAKE_DEVICE && device!==process.env.TQW_BAKE_DEVICE)continue;
  for(const space of (process.env.TQW_BAKE_SPACE?[process.env.TQW_BAKE_SPACE]:['corridor','office'])){
   for(const state of ['before','after']){
    const page=await browser.newPage({...options,reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:5181/${space==='office'?'certification-office':''}?quality=high${state==='before'?'&bake=off':''}`);
    await page.waitForFunction(s=>s==='corridor'?!!window.__tqwA1:!!window.__tqwScene,space,{timeout:180000});
    const sceneReadyAt=performance.now();
    if(space==='corridor'){await page.locator('.tqw-landing__enter').click();await page.waitForFunction(()=>document.querySelector('.tqw-site')?.getAttribute('data-spine')==='corridor');}
    if(state==='after')await page.waitForFunction(s=>document.querySelector(`canvas[data-baked="${s}"]`),space,{timeout:180000});
    const enteredBoundAfterSceneMs=performance.now()-sceneReadyAt;
    if(space==='office')await page.waitForFunction(()=>{const el=document.querySelector('.tqw-app');return el && el.getAttribute('data-memo')!=='hidden';},null,{timeout:60000});
    await page.waitForTimeout(1300);
    await page.evaluate(s=>s==='corridor'?window.__tqwA1.freeze():window.__tqwFreeze(),space);
    for(const [view,pose] of space==='corridor'?[['handover',[0,1.62,.2,0,0,60]],['middle',[0,1.62,-10.4,0,0,60]]]:[['threshold',[0,1.62,.8,188.02,-4.58]],['desk',[-1,1.62,2.9,180,-25]],['archive',[-2.25,1.62,6.7,180,0]]]){
     const counters=await page.evaluate(({space,pose})=>{
      if(space==='corridor')return window.__tqwA1.setCam(...pose);
      const cam=window.__tqwCamera,gl=window.__tqwGl,scene=window.__tqwScene;
      cam.position.set(...pose.slice(0,3));cam.rotation.order='YXZ';cam.rotation.set(pose[4]*Math.PI/180,pose[3]*Math.PI/180,0);cam.fov=48;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
      gl.info.reset();gl.render(scene,cam);
      let lights=0;scene.traverse(o=>{if(o.isLight)lights++;});
      return{calls:gl.info.render.calls,triangles:gl.info.render.triangles,lights,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures};
     },{space,pose});
     await page.screenshot({path:`${out}/${device}-${space}-${view}-${state}.png`});
     const bakedTextureBytes=await page.evaluate(space=>{const scene=space==='corridor'?window.__tqwA1.scene:window.__tqwScene;const maps=new Set();scene.traverse(o=>{if(o.isMesh && o.visible && o.material.lightMap)maps.add(o.material.lightMap);});return [...maps].reduce((sum,t)=>sum+t.image.width*t.image.height*4,0);},space);
     const matching=await page.evaluate(space=>{const cam=space==='corridor'?window.__tqwA1.camera:window.__tqwCamera;const scene=space==='corridor'?window.__tqwA1.scene:window.__tqwScene;const lights=[];scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,position:o.getWorldPosition(o.position.clone()).toArray(),target:o.target?.getWorldPosition(o.target.position.clone()).toArray(),colour:o.color.toArray(),intensity:o.intensity});});const el=document.querySelector(space==='office'?'.tqw-app':'.tqw-site');return {camera:{position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),fov:cam.fov,aspect:cam.aspect},sceneState:space==='office'?Object.fromEntries(['station','phase','memo','shadow','stamps','pressing','object'].map(key=>[key,el.dataset[key]])):{phase:el.dataset.spine},directLights:lights};},space);
     records.push({device,space,view,state,counters,bakedTextureBytes,enteredBoundAfterSceneMs,errors,...matching});
    }
    await page.close();
   }
  }
 }
 for(const after of records.filter(r=>r.state==='after')){const before=records.find(r=>r.state==='before'&&r.device===after.device&&r.space===after.space&&r.view===after.view);for(const field of ['camera','sceneState','directLights'])assert.deepEqual(after[field],before[field],field+' differs for '+after.device+' '+after.space+' '+after.view);assert.deepEqual(after.errors,[]);assert.deepEqual(before.errors,[]);}
}finally{await browser.close();await writeFile(`${out}/frames.json`,JSON.stringify(records,null,2));}
