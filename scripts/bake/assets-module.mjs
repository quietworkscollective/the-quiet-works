/** Source for a bake module: initial receivers stay static and dressing receivers stay dynamic. */
export function assetsModuleSource({ space, geometryFiles, atlasFiles }) {
  const initial = geometryFiles.filter(entry => !entry.lazy);
  const lazy = geometryFiles.filter(entry => entry.lazy);
  const imports = [
    ...initial.map((entry, index) => `import geometry${index} from './${entry.file}';`),
    `import manifest from './${space}.manifest.json';`,
    ...atlasFiles.map((file, index) => `import image${index} from './${file}';`),
    `import type { BakeAssets } from '../runtime.ts';`,
  ];
  const lazyLoader = lazy.length
    ? `const loadLazyGeometry = async () => Promise.all([${lazy.map(entry => `import('./${entry.file}').then(module => module.default)`).join(', ')}]);`
    : '';
  const deferred = lazy.length ? ', loadLazyGeometry' : '';
  return `${imports.join('\n')}\n${lazyLoader}\nexport default { geometry: [${initial.map((_, index) => `geometry${index}`).join(', ')}]${deferred}, manifest, images: [${atlasFiles.map((_, index) => `image${index}`).join(', ')}] } as BakeAssets;\n`;
}
