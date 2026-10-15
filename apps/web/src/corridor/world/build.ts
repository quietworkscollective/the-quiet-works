import { Matrix4 } from 'three';
import type { Bucket } from './builder.ts';
import { createBuckets, mergeBuckets, placeLocal, triangleTotal, type Buckets } from './buckets.ts';
import { PlaqueLayout } from './artLayout.ts';
import { MarksLayout } from './marksLayout.ts';
import { buildLobby, END_WALL_MATRIX } from './architecture/lobby.ts';
import { buildCorridor } from './architecture/corridor.ts';
import { buildClock, buildFanSwitch, buildPendants } from './architecture/lobbyDecor.ts';
import { buildFascia, buildHallTable } from './architecture/lobbyFixtures.ts';
import { buildLobbyWindow } from './architecture/lobbyWindow.ts';
import { buildBoardStatic } from './board.ts';
import { buildCare } from './care.ts';
import { buildAnnexSign, buildGroupings } from './groupings.ts';
import { LETTERING_ASPECT } from './textures/lettering.ts';
import { buildDoor, type DoorBuild } from './doorKit/build.ts';
import { INNER_DOORS, INNER_OPEN_DEG } from './doorKit/lobbyDoors.ts';
import { buildOpening, doorMatrix, type OpeningStyles } from './doorKit/opening.ts';
import { buildLamps, type DoorLamp, type Lamp } from './lighting.ts';
import { hash2 } from './math.ts';
import { holeOf, placements, type Placement } from './openings.ts';

/**
 * Everything static in the corridor world, built as plain data with no GL: geometry buckets
 * (one per shared material), the analytic lamps, the plaque layout and the chamber doors'
 * animatable parts. Kept separate from the React component so its size can be measured and
 * tested in node.
 */
export interface ChamberDoorBuild {
  placement: Placement;
  build: DoorBuild;
}

export interface WorldBuild {
  buckets: Buckets;
  /** The Annex wayfinding face uses the fog-free beacon material so its lettering survives distance. */
  annexSign: Bucket;
  lamps: Lamp[];
  places: Placement[];
  plaques: PlaqueLayout;
  marks: MarksLayout;
  chamberDoors: ChamberDoorBuild[];
  triangles: number;
}

export const OPENING_STYLES: OpeningStyles = {
  trim: {},
  plaster: { uv: { du: 0.2, dv: 0.4 } },
  dark: {},
};

/** A stable seed per door, so blank doors that share a spec still differ a little. */
const seedOf = (key: string): number => Math.floor(hash2(key.length * 131 + key.charCodeAt(key.length - 1), key.charCodeAt(0)) * 1e6);

export function buildWorld(): WorldBuild {
  const buckets = createBuckets();
  const places = placements();
  const plaques = new PlaqueLayout([...places.flatMap((p) => (p.spec.plaque ? [p.spec.plaque] : [])), { text: 'ANNEX', code: 'BAY 6' }]);
  const marks = new MarksLayout(places.flatMap((p) => (p.far ? [] : (p.spec.character?.marks ?? []).flatMap((m) => (m.text ? [m.text] : [])))));
  buildCorridor(buckets, places);
  buildLobby(buckets, OPENING_STYLES);
  buildFascia(buckets, LETTERING_ASPECT);
  buildHallTable(buckets);
  buildLobbyWindow(buckets, OPENING_STYLES.plaster, OPENING_STYLES.trim);
  buildPendants(buckets);
  buildFanSwitch(buckets);
  buildClock(buckets);
  buildBoardStatic(buckets);
  buildGroupings(buckets);
  const annexSign = buildAnnexSign(buckets, plaques);
  buildCare(buckets);

  const chamberDoors: ChamberDoorBuild[] = [];
  const identity = new Matrix4();
  for (const p of places) {
    const built = buildDoor(p.spec, { lod: p.far ? 'far' : 'near', plaques, marks, animated: p.chamber !== null, seed: seedOf(p.key) });
    placeLocal(buckets, doorMatrix(p.side, p.z), (local) => {
      // The Outline Room's Blender model supplies both its custom static frame and moving leaf.
      if (p.key !== 'outline-room') {
        buildOpening(local, p.spec, OPENING_STYLES);
        mergeBuckets(local, p.chamber ? built.fixed : built.flat, identity);
      }
    });
    if (p.chamber) chamberDoors.push({ placement: p, build: built });
  }

  // The inner pair, hinged at the end wall's jambs and standing open into the lobby.
  const inner = buildDoor(INNER_DOORS, { lod: 'near', plaques, animated: true, seed: 12 });
  for (const leaf of inner.leaves) {
    const sign = leaf.hinge === 'left' ? -1 : 1;
    const swing = new Matrix4()
      .multiply(END_WALL_MATRIX)
      .multiply(new Matrix4().makeTranslation(...leaf.pivot))
      .multiply(new Matrix4().makeRotationY((sign * INNER_OPEN_DEG * Math.PI) / 180));
    mergeBuckets(buckets, leaf.body, swing);
    // Seen from both sides, so the back of each leaf is the same joinery. The leaf's geometry is
    // relative to its pivot on the mid-plane (z = 0), so the reflection plane is z = 0.
    const back = createBuckets();
    for (const key of Object.keys(leaf.body) as (keyof Buckets)[]) {
      if (leaf.body[key].triangleCount > 0) back[key] = leaf.body[key].mirrored(0);
    }
    mergeBuckets(buckets, back, swing);
  }

  const doorLamps: DoorLamp[] = places.flatMap((p) => {
    const lamp = p.spec.character?.lamp;
    return lamp && !p.far ? [{ key: p.key, side: p.side, z: p.z, top: holeOf(p.spec).height, kelvin: lamp.kelvin, strength: lamp.strength }] : [];
  });
  return { buckets, annexSign, lamps: buildLamps(doorLamps), places, plaques, marks, chamberDoors, triangles: triangleTotal(buckets) };
}
