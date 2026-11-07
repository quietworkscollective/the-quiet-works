import { EXCHANGE_LOOK } from '../../../look/profiles.ts';

/** Only the full line lamp and the operator lamp pass the bloom threshold. */
export const EXCHANGE_ROOM_LOOK = {
  ...EXCHANGE_LOOK,
  bloom: { ...EXCHANGE_LOOK.bloom, strength: 0.12, threshold: 1.3 },
};
