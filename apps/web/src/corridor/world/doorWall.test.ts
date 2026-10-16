import { describe, expect, it } from 'vitest';
import { CORRIDOR } from '../layout.ts';
import { buildWorld } from './build.ts';
import { CORRIDOR_START_Z } from './architecture/corridor.ts';
import { INNER_OPENING } from './architecture/lobby.ts';

const plaster = buildWorld().buckets.plaster;

function coreEndCapTriangles(z: number, facing: -1 | 1): number {
  let count = 0;
  for (let i = 0; i < plaster.idx.length; i += 3) {
    const ids = [plaster.idx[i]!, plaster.idx[i + 1]!, plaster.idx[i + 2]!];
    if (!ids.every((id) => Math.abs(plaster.pos[id * 3 + 2]! - z) < 1e-6 && plaster.nor[id * 3 + 2]! * facing > 0.99)) continue;
    const x = ids.reduce((sum, id) => sum + plaster.pos[id * 3]!, 0) / 3;
    const y = ids.reduce((sum, id) => sum + plaster.pos[id * 3 + 1]!, 0) / 3;
    const besideOpening = Math.abs(x) > CORRIDOR.width / 2;
    const aboveOpening = Math.abs(x) < INNER_OPENING.width / 2 && y > INNER_OPENING.height;
    if (besideOpening || aboveOpening) count += 1;
  }
  return count;
}

describe('the inner lobby doorway wall', () => {
  it('keeps the masonry core end caps out of both baked wall faces', () => {
    // These 5 mm buried caps are closer than one corridor bake position step. Quantization can
    // move them in front of the plaster face and expose their independent lightmap charts.
    const lobbyFace = coreEndCapTriangles(CORRIDOR.innerDoorZ - 0.005, 1);
    const corridorFace = coreEndCapTriangles(CORRIDOR_START_Z + 0.005, -1);
    expect({ lobbyFace, corridorFace }).toEqual({ lobbyFace: 0, corridorFace: 0 });
  });
});
