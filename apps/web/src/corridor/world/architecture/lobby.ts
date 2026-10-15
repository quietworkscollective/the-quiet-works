import { Matrix4 } from 'three';
import { box, breaks, grid, type Style } from '../builder.ts';
import { placeLocal, type Buckets } from '../buckets.ts';
import { CORRIDOR, LOBBY } from '../../layout.ts';
import { darkness, type DarknessOptions } from '../darkness.ts';
import { LOBBY_SCONCES } from '../lighting.ts';
import { bayOffset, cornerShade } from '../shading.ts';
import { TILE } from '../tiles.ts';
import { buildOpeningFrame, type OpeningStyles } from '../doorKit/opening.ts';
import { ENTRANCE_DOORS, INNER_DOORS } from '../doorKit/lobbyDoors.ts';
import { WALL_OVERLAP } from '../doorKit/frame.ts';
import { holeFor } from '../doorKit/plan.ts';
import { FRAME } from '../openings.ts';
import { CEILING_TINT, CORRIDOR_CORNICE, CORRIDOR_START_Z, END_WALL_THICKNESS } from './corridor.ts';
import { buildLobbyFloor, WALL_FLOOR_OVERLAP } from './floor.ts';
import { buildWallRun, WALL_CEILING_OVERLAP } from './run.ts';
import { LOBBY_BEAMS, LOBBY_WINDOW, PENDANTS } from './lobbyPlan.ts';
import { cornice, wallGrid, wallQuad, type WallFrame } from './wall.ts';

/**
 * The entrance lobby (5 m wide, 4.2 m high, from z = 7.2 to the inner doors at z = 1): the same
 * building as the corridor, with the same oak and plaster, at a more formal scale. The end wall
 * carries the open inner doors and the lettering over them; the opposite wall holds the closed
 * entrance doors, so the visitor can look back the way they came.
 */

export const LOBBY_ZONE = {
  halfWidth: LOBBY.width / 2,
  height: LOBBY.height,
  zNear: CORRIDOR.innerDoorZ,
  zFar: LOBBY.startZ,
} as const;

/** The opening in the end wall that frames the corridor. */
export const INNER_OPENING = { width: INNER_DOORS.width, height: INNER_DOORS.height } as const;
export const ENTRANCE_OPENING = holeFor(ENTRANCE_DOORS);

export const LOBBY_CORNICE = { projection: 0.2, height: 0.36 } as const;
const CEILING_OVERLAP = 0.06;

const HW = LOBBY_ZONE.halfWidth;

export const LOBBY_FRAMES = {
  left: { normal: [1, 0, 0], along: [0, 0, 1], origin: [-HW, 0, 0] },
  right: { normal: [-1, 0, 0], along: [0, 0, 1], origin: [HW, 0, 0] },
  end: { normal: [0, 0, 1], along: [1, 0, 0], origin: [0, 0, LOBBY_ZONE.zNear] },
  corridorEnd: { normal: [0, 0, -1], along: [1, 0, 0], origin: [0, 0, CORRIDOR_START_Z] },
  back: { normal: [0, 0, -1], along: [1, 0, 0], origin: [0, 0, LOBBY_ZONE.zFar] },
} as const satisfies Record<string, WallFrame>;

/** Door-local to world for the end wall (the inner doors). */
export const END_WALL_MATRIX = new Matrix4().makeTranslation(0, 0, LOBBY_ZONE.zNear);
export const BACK_WALL_MATRIX = new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, LOBBY_ZONE.zFar);

/** How far the lobby's corners and upper walls fall into the dark (darkness.ts): gentler than the corridor's. */
export const LOBBY_DARKNESS = { radius: 2.7, floor: 0.42, fallFrom: 2.7, ceilingValue: 0.48 } as const;

/** The lobby's lit places and how far its corners and upper walls fall away from them (see darkness.ts). */
export function lobbyDarkness(): DarknessOptions {
  return {
    pools: [
      ...LOBBY_SCONCES.map((l) => ({ x: l.x, z: l.z })),
      ...PENDANTS.map((z) => ({ x: 0, z })),
      { x: -HW, z: (LOBBY_WINDOW.s[0] + LOBBY_WINDOW.s[1]) / 2 },
      { x: -HW, z: LOBBY.board.z },
    ],
    radius: LOBBY_DARKNESS.radius,
    floor: LOBBY_DARKNESS.floor,
    fallFrom: LOBBY_DARKNESS.fallFrom,
    height: LOBBY_ZONE.height,
    ceilingValue: LOBBY_DARKNESS.ceilingValue,
  };
}

export function buildLobby(b: Buckets, styles: OpeningStyles): void {
  const room = {
    x0: -HW,
    x1: HW,
    y0: 0,
    y1: LOBBY_ZONE.height,
    z0: LOBBY_ZONE.zNear,
    z1: LOBBY_ZONE.zFar,
  };
  const shade = cornerShade(room, { strength: 0.5, radius: 0.5 });
  // Carry terrazzo beneath the closed entrance leaves to fill the rear threshold.
  buildLobbyFloor(b, { shade }, HW, LOBBY_ZONE.zNear - WALL_FLOOR_OVERLAP, LOBBY_ZONE.zFar + 0.12);

  const dark = darkness(lobbyDarkness());
  const wallShade = (p: readonly [number, number, number], n: readonly [number, number, number]): number => shade(p, n) * dark(p);

  const runFor = (
    name: keyof typeof LOBBY_FRAMES,
    s0: number,
    s1: number,
    index: number,
    holes: readonly { s: readonly [number, number]; y: readonly [number, number] }[] = [],
    ceiling: number = LOBBY_ZONE.height,
  ): void => {
    const du = bayOffset(index + 40, 0, TILE.plaster);
    const dv = bayOffset(index + 40, 1, TILE.plaster);
    buildWallRun(b, s0, s1, {
      frame: LOBBY_FRAMES[name],
      ceiling,
      dado: CORRIDOR.dado,
      plasterStyle: { shade: wallShade, uv: { du, dv } },
      oakStyle: (alongGrain) => ({ shade: wallShade, uv: { swap: !alongGrain, du: du * 0.4, dv: dv * 0.4 } }),
      index: index + 40,
      detail: 'full',
      holes,
    });
  };

  // Side walls: one unbroken run each. (The notice board hangs over the left one, with a high window over it.)
  runFor('left', LOBBY_ZONE.zNear, LOBBY_ZONE.zFar, 0, [{ s: LOBBY_WINDOW.s, y: LOBBY_WINDOW.y }]);
  runFor('right', LOBBY_ZONE.zNear, LOBBY_ZONE.zFar, 1);

  // End wall: a run each side of the opening, plaster over it.
  // Hide the cut edge behind the projecting architrave so the baked wall cannot leave a seam.
  const innerGap = INNER_OPENING.width / 2 + FRAME.architrave - WALL_OVERLAP;
  runFor('end', -HW, -innerGap, 2);
  runFor('end', innerGap, HW, 3);
  const headY = INNER_OPENING.height + FRAME.architrave;
  const lintelYs = [headY, headY + 0.25, LOBBY_ZONE.height - 0.8, LOBBY_ZONE.height - 0.5, LOBBY_ZONE.height - 0.2, LOBBY_ZONE.height + WALL_CEILING_OVERLAP].sort((a, b) => a - b);
  wallGrid(b.plaster, LOBBY_FRAMES.end, 0, [-innerGap, innerGap], lintelYs, { shade: wallShade, uv: { du: 0.4, dv: 0.2 } });

  // The rear wall closes the lobby behind its starting view, with the same full joinery as the sides.
  const entranceGap = ENTRANCE_OPENING.width / 2 + FRAME.architrave - WALL_OVERLAP;
  // Carry the plaster behind the top architrave by the same overlap used at its sides. The bake
  // can otherwise leave a hairline clear-colour seam where the two faces meet.
  const entranceHead = ENTRANCE_OPENING.height + FRAME.architrave - WALL_OVERLAP;
  const backBreaks = breaks(-HW, HW, 0.9, [-entranceGap, entranceGap]);
  const backDoor = { s: [-entranceGap, entranceGap] as const, y: [0, entranceHead] as const };
  const backDu = bayOffset(44, 0, TILE.plaster);
  const backDv = bayOffset(44, 1, TILE.plaster);
  wallGrid(
    b.oak,
    LOBBY_FRAMES.back,
    0,
    backBreaks,
    [0, 0.17, 0.3, CORRIDOR.dado - 0.12, CORRIDOR.dado],
    { shade: wallShade, uv: { swap: true, du: backDu * 0.4, dv: backDv * 0.4 } },
    [backDoor],
  );
  wallGrid(
    b.plaster,
    LOBBY_FRAMES.back,
    0,
    backBreaks,
    [CORRIDOR.dado - 0.025, CORRIDOR.dado, 2.15, 2.7, entranceHead, Math.min(entranceHead + 0.2, LOBBY_ZONE.height), LOBBY_ZONE.height + WALL_CEILING_OVERLAP],
    { shade: wallShade, uv: { du: 0.9, dv: 0.5 } },
    [backDoor],
  );
  const backOak = { shade: wallShade, uv: { swap: true, du: backDu * 0.4, dv: backDv * 0.4 } };
  wallQuad(b.oak, LOBBY_FRAMES.back, 0.018, [-HW, HW], [0.17, 0.2], backOak);
  wallQuad(b.oak, LOBBY_FRAMES.back, 0.018, [-HW, HW], [CORRIDOR.dado - 0.12, CORRIDOR.dado], backOak);
  for (let x = -HW + 0.45; x < HW - 0.2; x += 0.9) {
    if (x > -entranceGap - 0.05 && x < entranceGap + 0.05) continue;
    wallQuad(b.oak, LOBBY_FRAMES.back, 0.016, [x - 0.035, x + 0.035], [0.2, CORRIDOR.dado - 0.12], backOak);
  }

  // Seen from the corridor, the inner partition carries the same lower timber and a full plaster head.
  runFor('corridorEnd', -HW, -innerGap, 6, [], LOBBY_ZONE.height);
  runFor('corridorEnd', innerGap, HW, 7, [], LOBBY_ZONE.height);
  const corridorLintelYs = [headY, Math.min(headY + 0.2, CORRIDOR.height), CORRIDOR.height, LOBBY_ZONE.height + WALL_CEILING_OVERLAP];
  wallGrid(b.plaster, LOBBY_FRAMES.corridorEnd, 0, [-HW, -innerGap, innerGap, HW], corridorLintelYs, { shade: wallShade, uv: { du: 0.4, dv: 0.2 } });

  // The two finished faces and the plaster reveal meet at a solid masonry core. Without it, an
  // oblique view can pass through the 300 mm partition at the shoulders or just above the head.
  const coreZ = (CORRIDOR_START_Z + LOBBY_ZONE.zNear) / 2;
  const coreDepth = END_WALL_THICKNESS - 0.01;
  const coreStyle: Style = { shade: wallShade, uv: { du: 0.4, dv: 0.2 } };
  const coreHalf = INNER_OPENING.width / 2 - 0.003;
  const pierWidth = HW - coreHalf;
  for (const sign of [-1, 1] as const) {
    box(b.plaster, [sign * (HW + coreHalf) / 2, LOBBY_ZONE.height / 2, coreZ], [pierWidth, LOBBY_ZONE.height, coreDepth], 0, coreStyle);
  }
  const coreHead = LOBBY_ZONE.height - INNER_OPENING.height + 0.003;
  box(
    b.plaster,
    [0, INNER_OPENING.height + coreHead / 2 - 0.003, coreZ],
    [2 * coreHalf, coreHead, coreDepth],
    0,
    coreStyle,
  );

  // Cornice all round.
  const corniceStyle: Style = { colour: CEILING_TINT, shade: wallShade };
  cornice(b.plaster, LOBBY_FRAMES.left, [LOBBY_ZONE.zNear, LOBBY_ZONE.zFar], LOBBY_ZONE.height, LOBBY_CORNICE, corniceStyle, 12);
  cornice(b.plaster, LOBBY_FRAMES.right, [LOBBY_ZONE.zNear, LOBBY_ZONE.zFar], LOBBY_ZONE.height, LOBBY_CORNICE, corniceStyle, 12);
  cornice(b.plaster, LOBBY_FRAMES.end, [-HW, HW], LOBBY_ZONE.height, LOBBY_CORNICE, corniceStyle, 12);
  cornice(b.plaster, LOBBY_FRAMES.corridorEnd, [-HW, HW], CORRIDOR.height, CORRIDOR_CORNICE, corniceStyle, 12);
  cornice(b.plaster, LOBBY_FRAMES.back, [-HW, HW], LOBBY_ZONE.height, LOBBY_CORNICE, corniceStyle, 12);

  // Ceiling with two shallow beams across it.
  const ceilStyle: Style = { colour: CEILING_TINT, shade: wallShade, uv: { du: 0.3, dv: 0.6 } };
  const beamZ = LOBBY_BEAMS;
  const xs = breaks(-HW - CEILING_OVERLAP, HW + CEILING_OVERLAP, 1.0, [-HW + 0.2, -HW + 0.4, HW - 0.4, HW - 0.2]);
  const zs = breaks(
    LOBBY_ZONE.zNear - CEILING_OVERLAP,
    LOBBY_ZONE.zFar + CEILING_OVERLAP,
    1.3,
    [...beamZ.flatMap((z) => [z - 0.18, z + 0.18]), LOBBY_ZONE.zNear + 0.2, LOBBY_ZONE.zFar - 0.2],
  );
  grid(b.plaster, [0, LOBBY_ZONE.height, 0], [1, 0, 0], [0, 0, 1], xs, zs, ceilStyle);
  for (const z of beamZ) {
    box(b.plaster, [0, LOBBY_ZONE.height - 0.11, z], [2 * HW - 0.02, 0.22, 0.36], 0.005, { colour: CEILING_TINT, shade: wallShade, uv: { du: 0.2, dv: 0.9 } }, ['+y']);
  }

  // The inner opening's reveal (the end wall's thickness) and its architrave on the lobby face.
  placeLocal(b, END_WALL_MATRIX, (local) =>
    buildOpeningFrame(local, INNER_OPENING, { reveal: END_WALL_THICKNESS, plasterReveal: true, lining: 0, backed: false }, styles),
  );
  const corridorEndMatrix = new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, CORRIDOR_START_Z);
  placeLocal(b, corridorEndMatrix, (local) =>
    buildOpeningFrame(local, INNER_OPENING, { reveal: 0.004, plasterReveal: false, lining: 0, backed: false }, styles),
  );
  placeLocal(b, BACK_WALL_MATRIX, (local) =>
    buildOpeningFrame(local, ENTRANCE_OPENING, { reveal: 0.3, plasterReveal: false, lining: 0.035, backed: true }, styles),
  );

  // The lobby side walls begin 0.3 m beyond the corridor face. Return them to the corridor cap
  // and splay the wall edges back to the narrower corridor. These finished returns close the
  // widening vestibule on both sides of the inner partition.
  const corridorHalf = CORRIDOR.width / 2;
  const corridorSideNearZ = CORRIDOR_START_Z + 0.12;
  const dz = LOBBY_ZONE.zNear - corridorSideNearZ;
  const dx = HW - corridorHalf;
  const returnLength = Math.hypot(dx, dz);
  const returnX = dx / returnLength;
  const returnZ = dz / returnLength;
  const returns: readonly { frame: WallFrame; index: number }[] = [
    {
      frame: { normal: [returnZ, 0, returnX], along: [returnX, 0, -returnZ], origin: [-HW, 0, LOBBY_ZONE.zNear] },
      index: 8,
    },
    {
      frame: { normal: [-returnZ, 0, returnX], along: [returnX, 0, returnZ], origin: [corridorHalf, 0, corridorSideNearZ] },
      index: 9,
    },
  ];
  for (const { frame, index } of returns) {
    const du = bayOffset(index + 40, 0, TILE.plaster);
    const dv = bayOffset(index + 40, 1, TILE.plaster);
    buildWallRun(b, 0, returnLength, {
      frame,
      ceiling: LOBBY_ZONE.height,
      dado: CORRIDOR.dado,
      plasterStyle: { shade: wallShade, uv: { du, dv } },
      oakStyle: (alongGrain) => ({ shade: wallShade, uv: { swap: !alongGrain, du: du * 0.4, dv: dv * 0.4 } }),
      index: index + 40,
      detail: 'full',
    });
    cornice(b.plaster, frame, [0, returnLength], CORRIDOR.height, CORRIDOR_CORNICE, { colour: CEILING_TINT, shade: wallShade }, 12);
  }

  const zc = CORRIDOR_START_Z;
  const face: Style = { uv: { du: 0.2, dv: 0.4 } };
  wallQuad(b.plaster, LOBBY_FRAMES.left, 0.015, [zc - 0.25, LOBBY_ZONE.zNear + 0.015], [0, LOBBY_ZONE.height], face);
  wallQuad(b.plaster, LOBBY_FRAMES.right, 0.015, [zc - 0.25, LOBBY_ZONE.zNear + 0.015], [0, LOBBY_ZONE.height], face);
}
