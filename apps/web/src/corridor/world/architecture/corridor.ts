import { box, breaks, grid, quad, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { linear, type Rgb } from '../colour.ts';
import { CORRIDOR } from '../../layout.ts';
import { CORRIDOR_END_Z } from '../extent.ts';
import { darkness } from '../darkness.ts';
import { corridorSconceSlots } from '../lighting.ts';
import { bayOffset, bayTone, cornerShade } from '../shading.ts';
import { FRAME, gapOf, holeOf, type Placement } from '../openings.ts';
import { TILE } from '../tiles.ts';
import { buildCorridorFloor } from './floor.ts';
import { buildWallRun, WALL_CEILING_OVERLAP } from './run.ts';
import { cornice, wallGrid, type WallFrame, type WallHole } from './wall.ts';

/** The corridor's wall faces start here: the lobby end wall is 0.3 m thick, from z = 1.0 to 0.7. */
export const CORRIDOR_START_Z = 0.7;
export const END_WALL_THICKNESS = CORRIDOR.innerDoorZ - CORRIDOR_START_Z;

/** Ceiling plaster is paler than wall plaster: the contract's two colours, as a tint. */
const plasterLin = linear(CORRIDOR.colours.plaster);
const ceilingLin = linear(CORRIDOR.colours.ceiling);
export const CEILING_TINT: Rgb = [ceilingLin[0] / plasterLin[0], ceilingLin[1] / plasterLin[1], ceilingLin[2] / plasterLin[2]];

const HW = CORRIDOR.width / 2;
const ROOM = { x0: -HW, x1: HW, y0: 0, y1: CORRIDOR.height };

/** How far the corridor's piers and upper walls fall into the dark (darkness.ts). */
export const CORRIDOR_DARKNESS = { radius: 2.4, floor: 0.46, fallFrom: 2.6, ceilingValue: 0.52 } as const;

export const CORRIDOR_CORNICE = { projection: CORRIDOR.corniceDepth, height: 0.3 } as const;
const CEILING_OVERLAP = 0.06;

/** The wall frame of a corridor side: s runs along +z, depth out of the wall into the corridor. */
export function sideFrame(side: 'left' | 'right'): WallFrame {
  return side === 'left'
    ? { normal: [1, 0, 0], along: [0, 0, 1], origin: [-HW, 0, 0] }
    : { normal: [-1, 0, 0], along: [0, 0, 1], origin: [HW, 0, 0] };
}

interface Gap {
  s0: number;
  s1: number;
  height: number;
  aperture0: number;
  aperture1: number;
  apertureHeight: number;
}

/**
 * Walls, floor, ceiling and cornice of the corridor from the lobby's end wall to `farZ`, with a
 * gap in the panelling for every placement. Opening joinery and doors are the door kit's.
 */
export function buildCorridor(b: Buckets, places: readonly Placement[]): void {
  const shadeRoom = cornerShade(ROOM, { strength: 0.52, radius: 0.4 });
  const tone = (z: number) => bayTone(z);
  // Value bands (see darkness.ts): each sconce's pool at full value, the piers and the upper wall
  // and ceiling falling into the dark between and above them.
  const dark = darkness({
    pools: corridorSconceSlots(CORRIDOR_END_Z).map((s) => ({ x: s.side === 'left' ? -HW : HW, z: s.z })),
    radius: CORRIDOR_DARKNESS.radius,
    floor: CORRIDOR_DARKNESS.floor,
    fallFrom: CORRIDOR_DARKNESS.fallFrom,
    height: CORRIDOR.height,
    ceilingValue: CORRIDOR_DARKNESS.ceilingValue,
  });
  const wallShade = (p: readonly [number, number, number], n: readonly [number, number, number]) => shadeRoom(p, n) * tone(p[2]) * dark(p);

  buildCorridorFloor(b, { shade: shadeRoom });

  // Carry the side walls 120 mm into the lobby end wall so the stepped cap has no raster seam.
  const zNear = CORRIDOR_START_Z + 0.12;
  // The authored corridor ends after thirteen full bays, where the terrazzo and the warm
  // destination already meet. Keep its side walls, ceiling and cap on that same line.
  const zFar = CORRIDOR_END_Z;

  for (const side of ['left', 'right'] as const) {
    const frame = sideFrame(side);
    const gaps: Gap[] = places
      .filter((p) => p.side === side)
      .map((p) => {
        const g = gapOf(p.spec);
        const aperture = holeOf(p.spec);
        return {
          s0: p.z - g.width / 2,
          s1: p.z + g.width / 2,
          height: g.height,
          aperture0: p.z - aperture.width / 2,
          aperture1: p.z + aperture.width / 2,
          apertureHeight: aperture.height,
        };
      })
      .sort((a, c) => a.s0 - c.s0);

    let cursor: number = zFar;
    let index = 0;
    const run = (s0: number, s1: number): void => {
      if (s1 - s0 < 0.02) return;
      const du = bayOffset(index * 2 + (side === 'left' ? 0 : 1), 0, TILE.plaster);
      const dv = bayOffset(index * 2 + (side === 'left' ? 0 : 1), 1, TILE.plaster);
      const plasterStyle: Style = { shade: wallShade, uv: { du, dv } };
      buildWallRun(b, s0, s1, {
        frame,
        ceiling: CORRIDOR.height,
        dado: CORRIDOR.dado,
        plasterStyle,
        oakStyle: (alongGrain) => ({ shade: wallShade, uv: { swap: !alongGrain, du: du * 0.4, dv: dv * 0.4 } }),
        index,
        detail: s1 > -CORRIDOR.bay * CORRIDOR.walkableBays + CORRIDOR.innerDoorZ - 1 ? 'full' : 'far',
      });
      index += 1;
    };
    for (const g of gaps) {
      run(cursor, g.s0);
      // Plaster above the gap: the architrave covers the rest.
      const ys = [g.height, g.height + 0.2, CORRIDOR.height - 0.8, CORRIDOR.height - 0.45, CORRIDOR.height - 0.2, CORRIDOR.height + WALL_CEILING_OVERLAP]
        .filter((y) => y <= CORRIDOR.height + WALL_CEILING_OVERLAP)
        .sort((a, b) => a - b);
      wallGrid(b.plaster, frame, 0, [g.s0, g.s1], [...new Set(ys)], { shade: wallShade, uv: { du: 0.3, dv: 0.7 } });
      // The corridor wall is a shell, not a single face. Behind the architrave, return the plaster
      // through its 200 mm reveal so an oblique phone view cannot look through the thin wall at the
      // edge of an opening. Leave the true aperture clear for an open door and its leaf.
      // The wall return tucks 50 mm behind each jamb and the head: the visible opening stays
      // clear, while the back of the reveal closes the raster seam at an extreme viewing angle.
      const returnMargin = 0.075;
      const returnS0 = g.aperture0 + returnMargin;
      const returnS1 = g.aperture1 - returnMargin;
      const returnY1 = Math.max(0, g.apertureHeight - returnMargin);
      const returns: readonly WallHole[] = [
        {
          s: [returnS0, returnS1],
          y: [0, returnY1],
        },
      ];
      wallGrid(
        b.plaster,
        frame,
        -FRAME.reveal,
        [g.s0, returnS0, returnS1, g.s1],
        [0, returnY1, CORRIDOR.height],
        { shade: wallShade, uv: { du: 0.3, dv: 0.7 } },
        returns,
      );
      cursor = g.s1;
    }
    run(cursor, zNear);

    cornice(b.plaster, frame, [zFar, zNear], CORRIDOR.height, CORRIDOR_CORNICE, { colour: CEILING_TINT, shade: wallShade }, 12);
  }

  // Ceiling: pale plaster, with a shallow rib at every bay boundary for the rhythm of the bays.
  const ceilStyle: Style = { colour: CEILING_TINT, shade: wallShade, uv: { du: 0.5, dv: 1.1 } };
  const xs = breaks(-HW - CEILING_OVERLAP, HW + CEILING_OVERLAP, 0.8, [-HW + 0.18, -HW + 0.34, HW - 0.34, HW - 0.18]);
  const ribZ: number[] = [];
  for (let k = 1; CORRIDOR.innerDoorZ - CORRIDOR.bay * k > zFar; k += 1) ribZ.push(CORRIDOR.innerDoorZ - CORRIDOR.bay * k);
  const zs = breaks(zFar - CEILING_OVERLAP, zNear + CEILING_OVERLAP, 1.2, ribZ.flatMap((z) => [z - 0.13, z + 0.13]));
  grid(b.plaster, [0, CORRIDOR.height, 0], [1, 0, 0], [0, 0, 1], xs, zs, ceilStyle);
  // The ribs sit in the ceiling's own corner, so they take a milder contact shade than the walls.
  const ribShade = cornerShade({ ...ROOM, y1: CORRIDOR.height }, { strength: 0.22, radius: 0.22 });
  for (const z of ribZ) {
    box(b.plaster, [0, CORRIDOR.height - 0.07, z], [2 * HW - 0.02, 0.14, 0.26], 0.004, { colour: CEILING_TINT, shade: (p, n) => ribShade(p, n) * tone(p[2]), uv: { du: 0.2, dv: 0.9 } }, ['+y']);
  }

  // The far end of the corridor: a plain plaster wall, deep in fog.
  quad(b.plaster, [-HW, 0, zFar], [HW, 0, zFar], [HW, CORRIDOR.height, zFar], [-HW, CORRIDOR.height, zFar], { shade: wallShade }, [0, 0, 1]);
}
