import type { CanvasTexture } from 'three';
import { LANDING } from '@tqw/engine';
import type { PlaqueLayout } from '../artLayout.ts';
import type { MarksLayout } from '../marksLayout.ts';
import { drawArtAtlas, drawNumeralAtlas, drawPlaqueAtlas } from './art.ts';
import { drawClippingAtlas } from './clippings.ts';
import { drawFoliageAtlas } from './foliage.ts';
import { drawLettering } from './lettering.ts';
import { drawMarksAtlas } from './marks.ts';

/** Every lettered or drawn texture the corridor needs, painted once fonts are ready. */
export interface ArtSet {
  plaque: CanvasTexture;
  numeral: CanvasTexture;
  art: CanvasTexture;
  lettering: CanvasTexture;
  lettering_orm: CanvasTexture;
  clippings: CanvasTexture;
  marks: CanvasTexture;
  foliage: CanvasTexture;
}

export function makeArt(plaques: PlaqueLayout, marks: MarksLayout, anisotropy: number): ArtSet {
  const lettering = drawLettering(LANDING.lettering, anisotropy);
  return {
    plaque: drawPlaqueAtlas(plaques, anisotropy),
    numeral: drawNumeralAtlas(anisotropy),
    art: drawArtAtlas(anisotropy),
    lettering: lettering.map,
    lettering_orm: lettering.orm,
    clippings: drawClippingAtlas(anisotropy),
    marks: drawMarksAtlas(marks, anisotropy),
    foliage: drawFoliageAtlas(anisotropy),
  };
}
