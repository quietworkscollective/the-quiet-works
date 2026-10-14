import type { PropModel } from '../model.ts';
import { bicycleWheel } from './bicycleWheel.ts';
import { chess } from './chess.ts';
import { cricketBat } from './cricketBat.ts';
import { football } from './football.ts';
import { recipeDrawer } from './recipeDrawer.ts';
import { repairKit } from './repairKit.ts';
import { teamPhoto } from './teamPhoto.ts';
import { teamShirts } from './teamShirts.ts';
import { trophyCabinet } from './trophyCabinet.ts';
import { walkingBoots } from './walkingBoots.ts';
import { wateringCan } from './wateringCan.ts';
import { workGlove } from './workGlove.ts';

/** Every prop, in contract order. */
export const MODELS: readonly PropModel[] = [trophyCabinet, teamPhoto, wateringCan, football, cricketBat, teamShirts, walkingBoots, repairKit, bicycleWheel, recipeDrawer, chess, workGlove];
