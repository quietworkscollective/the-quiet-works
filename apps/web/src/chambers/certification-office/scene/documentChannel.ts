import { officeAssetSlot } from './assetSlots.ts';
import { boxAt } from './geometry.ts';
/** Scanned-conveyor placeholder: a 28 mm edge, beyond the press and primary paper sightlines. */
const placement = officeAssetSlot('document-channel');
export const DOCUMENT_CHANNEL = { size: [placement.footprint[0], .028, placement.footprint[1]], position: placement.position } as const;
export function documentChannelGeometry() {
  return boxAt(...DOCUMENT_CHANNEL.size, ...DOCUMENT_CHANNEL.position);
}
