import { unpackOfficeModel } from '../packedModel.ts';
import { getEntry, registerAssetSource } from '../../../../assets/index.ts';
import type { CatalogueEntry } from '../../../../assets/types.ts';
import manifest from './manifest.json';
const loaders = {
  'office-hero-machine': async () => unpackOfficeModel((await import('./machine.glb.gz?url&inline')).default),
  'office-hero-press': async () => unpackOfficeModel((await import('./press.glb.gz?url&inline')).default),
  'office-hero-desk': async () => unpackOfficeModel((await import('./desk.glb.gz?url&inline')).default),
  'office-hero-application-board': async () => unpackOfficeModel((await import('./application-board.glb.gz?url&inline')).default),
  'office-hero-employee-window': async () => unpackOfficeModel((await import('./employee-window.glb.gz?url&inline')).default),
  'office-hero-certificate-sign': async () => unpackOfficeModel((await import('./certificate-sign.glb.gz?url&inline')).default),
  'office-hero-archive-bay': async () => unpackOfficeModel((await import('./archive-bay.glb.gz?url&inline')).default),
  'office-hero-archive-bay-distant': async () => unpackOfficeModel((await import('./archive-bay-distant.glb.gz?url&inline')).default),
};
const entries = manifest.filter(entry => !getEntry(entry.id)) as unknown as CatalogueEntry[];
if (entries.length) registerAssetSource({entries,modelLoaders:loaders});
export const OFFICE_HERO_MANIFEST = manifest;
