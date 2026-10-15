import { CHAMBERS, chamberById, type ChamberId } from '@tqw/engine';
import { DOOR as APARTMENT_DOOR } from './apartment/door.ts';
import { DOOR as OFFICE_DOOR } from './certification-office/door.ts';
import { DOOR as ATRIUM_DOOR } from './great-atrium/door.ts';
import { DOOR as EXCHANGE_DOOR } from './exchange/door.ts';
import { DOOR as TOMORROW_DOOR } from './tomorrow-engine/door.ts';
import { DOOR as OUTLINE_DOOR } from './annex-codex/door.ts';
import type { ChamberComponent, ChamberModule } from './types.ts';

/**
 * Chamber code and doors, keyed by registry id. The release flag is the public approval switch;
 * development builds can open authored rooms while their production flag remains closed.
 */
export const CHAMBER_MODULES: Record<ChamberId, ChamberModule> = {
  'certification-office': { door: OFFICE_DOOR, releaseOpen: true, load: () => import('./certification-office/index.ts') },
  apartment: { door: APARTMENT_DOOR, releaseOpen: false },
  'tomorrow-engine': { door: TOMORROW_DOOR, releaseOpen: false },
  'great-atrium': { door: ATRIUM_DOOR, releaseOpen: false },
  exchange: { door: EXCHANGE_DOOR, releaseOpen: false, load: () => import('./exchange/index.ts') },
  'outline-room': { door: OUTLINE_DOOR, releaseOpen: false, load: () => import('./annex-codex/index.ts') },
};

const pending = new Map<ChamberId, Promise<{ default: ChamberComponent }>>();

/** The authored release state, evaluated at build time for public routes and doors. */
export function isChamberOpenInBuild(id: ChamberId, development = import.meta.env.DEV): boolean {
  const entry = chamberById(id);
  return entry.status === 'open' && (development || CHAMBER_MODULES[id].releaseOpen);
}

/** Chamber entries with the status this build should present to visitors. */
export const VISIBLE_CHAMBERS = CHAMBERS.map((entry) => ({
  ...entry,
  status: isChamberOpenInBuild(entry.id) ? 'open' as const : 'sealed' as const,
}));

/** Start (or reuse) loading a chamber's code. Safe to call repeatedly, e.g. on every hover. */
export function preloadChamber(id: ChamberId, development = import.meta.env.DEV): Promise<{ default: ChamberComponent }> | null {
  if (!isChamberOpenInBuild(id, development)) return null;
  const load = CHAMBER_MODULES[id].load;
  if (!load) return null;
  let promise = pending.get(id);
  if (!promise) {
    promise = load();
    // A failed load must not poison later attempts.
    promise.catch(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}
