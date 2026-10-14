import groups from 'virtual:third-party-credits';
import type { CreditGroup } from './groupCredits.ts';

export type { CreditGroup, CreditItem } from './groupCredits.ts';

/**
 * The third-party models and surfaces the Credits page lists, by provider. The module is generated
 * at build time from src/assets/third-party.json (`thirdPartyCredits` in vite.config.ts).
 */
export const THIRD_PARTY_CREDITS: readonly CreditGroup[] = groups;
