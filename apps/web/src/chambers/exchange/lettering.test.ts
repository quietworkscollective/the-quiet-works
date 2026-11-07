import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LETTERED_FACES, readFace, readGlbDocument } from './scene/lettering.ts';

const model = readGlbDocument(new Uint8Array(readFileSync(new URL('./assets/exchange.glb', import.meta.url))));

describe('The Exchange lettering', () => {
  it('limits scene lettering to the four script items', () => {
    expect(LETTERED_FACES.map(face => face.node).sort()).toEqual(['exchange_board_title_face', 'line_card_03', 'operator_plate_inner', 'operator_plate_outer']);
  });

  it.each(LETTERED_FACES)('reads $node left to right from the $view view', (face) => {
    expect(readFace(model, face).screenRight).toBeGreaterThan(0.9);
  });

  it.each(LETTERED_FACES)('turns the printed side of $node toward the $view camera', (face) => {
    expect(readFace(model, face).facing).toBeGreaterThan(0.5);
  });
});
