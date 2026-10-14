// The licensed asset library: real furniture models and scanned surfaces, loaded with no network.
// See THIRD_PARTY.md for every source and licence.
//
//   const desk = useModel('office-desk-metal');            // Object3D in metres, origin at floor-centre
//   const wall = useSurface('plaster-clean', { repeat: tileRepeat('plaster-clean', 4, 2.8) });
//   budget(['office-desk-metal', 'lamp-anglepoise', 'plaster-clean']);   // triangles, memory, download
//
// Everything is reference-counted and released on unmount. Nothing here fetches: the site's policy
// is connect-src 'none' (see gltf.ts). A second manifest (original models) joins through
// registerAssetSource.
export { allEntries, allSlots, budget, entriesWithTag, getEntry, getModel, getSurface, registerAssetSource, SLOTS } from './catalogue.ts';
export type { AssetSource, Budget } from './catalogue.ts';
export { loadModel, models } from './modelStore.ts';
export type { ModelHandle, ModelStore } from './modelStore.ts';
export { surface, tileRepeat } from './surfaces.ts';
export type { SurfaceHandle, SurfaceOptions } from './surfaces.ts';
export { useModel, useSurface } from './react.ts';
export { BUDGET_BYTES, TRIANGLE_CAP } from './policy.ts';
export type { AssetSlot, CatalogueEntry, ModelEntry, SurfaceEntry } from './types.ts';
