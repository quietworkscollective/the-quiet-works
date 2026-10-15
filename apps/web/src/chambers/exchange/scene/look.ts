import { EXCHANGE_LOOK } from '../../../look/profiles.ts';

/** The Exchange's local lamp cores stay below the bloom clip even when the warm key is in frame. */
export const EXCHANGE_ROOM_LOOK = {
  ...EXCHANGE_LOOK,
  bloom: { ...EXCHANGE_LOOK.bloom, strength: 0.10, threshold: 1.35 },
};
