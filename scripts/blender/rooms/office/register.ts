/** Re-measure the seven shipping models and regenerate their local catalogue. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb } from '../../../../apps/web/src/assets/glbInfo.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const directory = `${root}/apps/web/src/chambers/certification-office/scene/heroes`;
const names = ['machine','press','desk','application-board','employee-window','certificate-sign','archive-bay','archive-bay-distant'];
const entries = names.map(name => {
  const bytes = readFileSync(`${directory}/${name}.glb`), stats = readGlb(bytes);
  return { id: `office-hero-${name}`, title: `Office ${name.replaceAll('-',' ')}`, kind: 'model', origin: 'original',
    licence: 'CC-BY-4.0', author: 'Asiri Dalugoda', licenceFile: 'LICENSES/CC-BY-4.0.txt',
    source: `scripts/blender/rooms/office/${['machine','press','desk'].includes(name)?'mechanics':'architecture'}/build.py`,
    sha256: createHash('sha256').update(bytes).digest('hex'), tags: ['office'], tier: 'hero',
    dimensions: stats.max.map((n,i) => n-stats.min[i]), triangles: stats.triangles, drawCalls: stats.drawCalls,
    compressedBytes: bytes.length, textureBytes: stats.textureBytes,
    textureMemoryBytes: Math.ceil(stats.images.reduce((sum,image) => sum+image.width*image.height*4*4/3,0)),
  };
});
writeFileSync(`${directory}/manifest.json`,JSON.stringify(entries,null,2)+'\n');
writeFileSync(`${directory}/index.ts`, `import { unpackOfficeModel } from '../packedModel.ts';\nimport { getEntry, registerAssetSource } from '../../../../assets/index.ts';\nimport type { CatalogueEntry } from '../../../../assets/types.ts';\nimport manifest from './manifest.json';\nconst loaders = {\n${names.map(name => `  'office-hero-${name}': async () => unpackOfficeModel((await import('./${name}.glb.gz?url&inline')).default),`).join('\n')}\n};\nconst entries = manifest.filter(entry => !getEntry(entry.id)) as unknown as CatalogueEntry[];\nif (entries.length) registerAssetSource({entries,modelLoaders:loaders});\nexport const OFFICE_HERO_MANIFEST = manifest;\n`);
console.log(`${entries.length} Office models: ${entries.reduce((n,e)=>n+e.compressedBytes,0)} bytes, ${entries.reduce((n,e)=>n+e.triangles,0)} triangles`);
