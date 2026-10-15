import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');

export async function verifyRoundtrip({source,scale,png,webp}) {
 const meta={source,scale};
 const browser=await chromium.launch();
 let pixels;
 try{
  const page=await browser.newPage();
  pixels=await page.evaluate(async sources=>{
   const result=[];
   for(const src of sources){const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const data=context.getImageData(0,0,image.width,1).data;result.push(Array.from({length:image.width},(_,i)=>data[i*4]));}
   return result;
  },[png,webp]);
 }finally{await browser.close();}
 assert.deepEqual(pixels[0],[0,0,2,10,18,44,110,182,248],'sRGB transfer differs from reference codes');
 assert.ok(pixels[1].every((v,i)=>Math.abs(v-pixels[0][i])<=2),'WebP exceeds two encoded steps');
 const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
 const errors=meta.source.map((expected,i)=>Math.abs(linear(pixels[1][i]/255)*meta.scale-expected));
 assert.ok(errors[2]<.0005,'Lowest readable bounce band lost');
 assert.ok(Math.max(...errors)<.034,'HDR roundtrip error exceeds one half encoded step');
 console.log('codec max irradiance error',Math.max(...errors),'dark-band error',errors[2]);
}
