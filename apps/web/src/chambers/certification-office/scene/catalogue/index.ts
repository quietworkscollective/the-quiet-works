import { unpackOfficeModel } from '../packedModel.ts';
import '../heroes/index.ts';
import { getEntry, registerAssetSource } from '../../../../assets/index.ts';
import type { CatalogueEntry } from '../../../../assets/types.ts';
import manifest from './manifest.json';

// Stage variants preserve source identity while sharing the reference-counted catalogue loader.
const entries: readonly CatalogueEntry[] = manifest as unknown as CatalogueEntry[];
const loaders: Record<string, () => Promise<string>> = {
  'office-stage-banker-lamp': async () => unpackOfficeModel((await import('./banker-lamp.glb.gz?url&inline')).default),
  'office-stage-book-row-60': async () => unpackOfficeModel((await import('./book-row-60.glb.gz?url&inline')).default),
  'office-stage-book-row-90': async () => unpackOfficeModel((await import('./book-row-90.glb.gz?url&inline')).default),
  'office-stage-box-file-a': async () => unpackOfficeModel((await import('./box-file-a.glb.gz?url&inline')).default),
  'office-stage-box-file-b': async () => unpackOfficeModel((await import('./box-file-b.glb.gz?url&inline')).default),
  'office-stage-clock-wall': async () => unpackOfficeModel((await import('./clock-wall.glb.gz?url&inline')).default),
  'office-stage-column-radiator-10': async () => unpackOfficeModel((await import('./column-radiator-10.glb.gz?url&inline')).default),
  'office-stage-filing-cabinet-4': async () => unpackOfficeModel((await import('./filing-cabinet-4.glb.gz?url&inline')).default),
  'office-stage-ledger-a': async () => unpackOfficeModel((await import('./ledger-a.glb.gz?url&inline')).default),
  'office-stage-ledger-b': async () => unpackOfficeModel((await import('./ledger-b.glb.gz?url&inline')).default),
  'office-stage-ledger-binders': async () => unpackOfficeModel((await import('./ledger-binders.glb.gz?url&inline')).default),
  'office-stage-ledger-c': async () => unpackOfficeModel((await import('./ledger-c.glb.gz?url&inline')).default),
  'office-stage-notepads': async () => unpackOfficeModel((await import('./notepads.glb.gz?url&inline')).default),
  'office-stage-plant-succulent': async () => unpackOfficeModel((await import('./plant-succulent.glb.gz?url&inline')).default),
  'office-stage-rotary-telephone': async () => unpackOfficeModel((await import('./rotary-telephone.glb.gz?url&inline')).default),
  'office-stage-service-bell': async () => unpackOfficeModel((await import('./service-bell.glb.gz?url&inline')).default),
  'office-stage-stamp-rack': async () => unpackOfficeModel((await import('./stamp-rack.glb.gz?url&inline')).default),
  'office-stage-stapler-teal': async () => unpackOfficeModel((await import('./stapler-teal.glb.gz?url&inline')).default),
  'office-stage-stationery-set': async () => unpackOfficeModel((await import('./stationery-set.glb.gz?url&inline')).default),
  'office-stage-typewriter': async () => unpackOfficeModel((await import('./typewriter.glb.gz?url&inline')).default),
};
const missing = entries.filter(entry => !getEntry(entry.id));
if (missing.length) registerAssetSource({ entries: missing, modelLoaders: loaders });
export const stageModelId = (id: string): string => loaders['office-stage-' + id] ? 'office-stage-' + id : id;
export const OFFICE_STAGE_VARIANTS = manifest;
