import type { ChamberId } from '@tqw/engine';
import { DOOR as APARTMENT_DOOR } from './apartment/door.ts';
import { DOOR as OFFICE_DOOR } from './certification-office/door.ts';
import { DOOR as ATRIUM_DOOR } from './great-atrium/door.ts';
import { DOOR as TOMORROW_DOOR } from './tomorrow-engine/door.ts';
import type { ChamberComponent, ChamberModule } from './types.ts';

/**
 * Chamber code and doors, keyed by registry id. Only open chambers have `load`; their code is
 * a separate chunk fetched when the visitor approaches, focuses or chooses the door.
 */
export const CHAMBER_MODULES: Record<ChamberId, ChamberModule> = {
  'certification-office': { door: OFFICE_DOOR, load: () => import('./certification-office/index.ts') },
  apartment: { door: APARTMENT_DOOR },
  'tomorrow-engine': { door: TOMORROW_DOOR },
  'great-atrium': { door: ATRIUM_DOOR },
};

const pending = new Map<ChamberId, Promise<{ default: ChamberComponent }>>();

/** Start (or reuse) loading a chamber's code. Safe to call repeatedly, e.g. on every hover. */
export function preloadChamber(id: ChamberId): Promise<{ default: ChamberComponent }> | null {
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
