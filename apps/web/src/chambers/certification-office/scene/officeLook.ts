import { OFFICE_LOOK, type LookProfile } from '../../../look/profiles.ts';

/** Neutral suspended air beside warm practicals; the inherited dark bands retain their warmth. */
export const OFFICE_FINISH: LookProfile = {
 ...OFFICE_LOOK,
 environment: {...OFFICE_LOOK.environment,intensity:.22},
 atmosphere: {...OFFICE_LOOK.atmosphere,
  heightFog: OFFICE_LOOK.atmosphere.heightFog.map(layer=>({...layer,colour:'#dad9d5'})),
  farGlow: {...OFFICE_LOOK.atmosphere.farGlow,colour:'#bbb9b4'},
 },
};
