import {readFile} from 'node:fs/promises';
/** Compare the actual browser-decoded atlas against its pre-compression transfer bytes. */
export async function measureEncoding(browser, png, webp, scale) {
  const sources = await Promise.all([png,webp].map(async (file,i)=>`data:image/${i?'webp':'png'};base64,${(await readFile(file)).toString('base64')}`));
  const page=await browser.newPage();
  try {
    return await page.evaluate(async ({sources,scale})=>{
      const pixels=[];let width=0,height=0;
      for(const src of sources){const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;width=image.width;height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);pixels.push(ctx.getImageData(0,0,canvas.width,canvas.height).data);}
      const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
      let maxSteps=0,maxError=0,darkMaxError=0,sumError=0,changed=0,count=0,blackAltered=0;
      const histogram={};
      for(let i=0;i<pixels[0].length;i++){if(i%4===3)continue;const a=pixels[0][i],b=pixels[1][i],steps=Math.abs(a-b),error=Math.abs(linear(a/255)-linear(b/255))*scale;histogram[steps]=(histogram[steps]??0)+1;maxSteps=Math.max(maxSteps,steps);maxError=Math.max(maxError,error);if(a<=32)darkMaxError=Math.max(darkMaxError,error);if(a===0&&b!==0)blackAltered++;sumError+=error;changed+=Number(steps>0);count++;}
      let protectedCornerMax=0;for(let y=height-2;y<height;y++)for(let x=0;x<2;x++)for(let c=0;c<3;c++)protectedCornerMax=Math.max(protectedCornerMax,pixels[1][(y*width+x)*4+c]);
      return {protectedCornerMax,blackAltered,maxSteps,maxIrradianceError:maxError,darkMaxIrradianceError:darkMaxError,meanIrradianceError:sumError/count,changedFraction:changed/count,histogram,scale};
    },{sources,scale});
  }finally{await page.close();}
}
