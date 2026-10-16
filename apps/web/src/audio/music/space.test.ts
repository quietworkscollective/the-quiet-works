import { describe, expect, it } from 'vitest';
import { bayCentreZ, CORRIDOR, LOBBY, WALK_LIMITS } from '../../corridor/layout.ts';
import { BED_GAIN, BED_START_M, GRAMOPHONE, GRAMOPHONE_SOURCE, levelDb, mixAt, NEAR_M } from './space.ts';

const at = (x: number, z: number, yawDeg = 0) => ({ x, z, yawDeg });
const db = (x: number, z: number) => mixAt(at(x, z)).gainDb;

/** The walking route is the corridor's central 1.5 m. */
const ROUTE_HALF_WIDTH = 0.75;

describe('where the gramophone is', () => {
  it('stands on the lobby wall, on the corridor side of the notice board and clear of the route', () => {
    const board = LOBBY.board;
    // The board's edge nearest the corridor is at board.z - width/2: the table sits beyond it.
    expect(GRAMOPHONE.z).toBeLessThan(board.z - board.width / 2);
    expect(GRAMOPHONE.z).toBeGreaterThan(CORRIDOR.innerDoorZ + 0.6);
    expect(GRAMOPHONE_SOURCE.x).toBeLessThan(-ROUTE_HALF_WIDTH - 0.5);
    expect(GRAMOPHONE.wallX).toBe(-LOBBY.width / 2);
  });
});

describe('how far the music carries', () => {
  it('keeps the gramophone close and brings in a steady, soft corridor bed beyond the lobby', () => {
    const local = mixAt(at(GRAMOPHONE_SOURCE.x + 0.5, GRAMOPHONE.z));
    expect(local.bed).toBe(0);
    expect(local.bedWet).toBe(0);

    let previous = 0;
    for (let z = 1; z >= WALK_LIMITS.minZ; z -= 0.1) {
      const bed = mixAt(at(0, z)).bed;
      expect(bed).toBeGreaterThanOrEqual(previous);
      previous = bed;
    }
    const firstBay = mixAt(at(0, bayCentreZ(0)));
    const farEnd = mixAt(at(0, WALK_LIMITS.minZ));
    expect(firstBay.bed).toBeGreaterThan(0.1);
    expect(farEnd.bed).toBeGreaterThanOrEqual(firstBay.bed);
    expect(farEnd.bed).toBeCloseTo(BED_GAIN, 9);
    expect(farEnd.bedWet).toBeGreaterThan(0);
    expect(farEnd.bedWet).toBeLessThan(farEnd.bed);
  });

  it('is at full level within the near radius and does not rise any further', () => {
    expect(levelDb(0)).toBe(0);
    expect(levelDb(NEAR_M)).toBe(0);
    expect(db(GRAMOPHONE_SOURCE.x + 0.5, GRAMOPHONE_SOURCE.z)).toBeCloseTo(3.5, 9);
  });

  it('lifts the horn locally, then eases that presence away before the diffuse bed begins', () => {
    const near = mixAt(at(GRAMOPHONE_SOURCE.x + 0.5, GRAMOPHONE.z));
    const beforeBed = mixAt(at(GRAMOPHONE_SOURCE.x + NEAR_M + 0.1, GRAMOPHONE.z));
    const bedStart = mixAt(at(GRAMOPHONE_SOURCE.x + BED_START_M, GRAMOPHONE.z));
    expect(near.gainDb).toBeCloseTo(3.5, 9);
    expect(beforeBed.gainDb).toBeLessThan(near.gainDb);
    expect(beforeBed.gainDb).toBeGreaterThan(bedStart.gainDb);
    expect(bedStart.gainDb).toBeCloseTo(levelDb(BED_START_M), 2);
  });

  it('falls strictly with distance, never rising once the visitor is out of the near radius', () => {
    let last = levelDb(NEAR_M);
    for (let d = NEAR_M + 0.05; d < 40; d += 0.05) {
      const level = levelDb(d);
      expect(level, `at ${d.toFixed(2)} m`).toBeLessThan(last);
      last = level;
    }
  });

  it('never quite vanishes in the walkable stretch: still within 30 dB of full at the far end', () => {
    const farEnd = mixAt(at(0, WALK_LIMITS.minZ));
    expect(farEnd.gainDb).toBeGreaterThan(-30);
    expect(farEnd.gain).toBeGreaterThan(0.03);
    // And it bends toward a floor rather than a cliff: the last ten metres cost less than the first ten.
    expect(levelDb(10 + 20) - levelDb(10)).toBeGreaterThan(levelDb(10) - levelDb(NEAR_M) - 20);
  });

  it('falls monotonically as the visitor walks down the corridor from the gramophone to the far end', () => {
    let last = Number.POSITIVE_INFINITY;
    for (let z = GRAMOPHONE.z; z >= WALK_LIMITS.minZ; z -= 0.1) {
      const level = db(0, z);
      expect(level, `at z = ${z.toFixed(1)}`).toBeLessThanOrEqual(last);
      last = level;
    }
  });

  it('rises monotonically as the visitor walks from the entrance toward the gramophone', () => {
    let last = Number.NEGATIVE_INFINITY;
    for (let z = WALK_LIMITS.maxZ; z >= GRAMOPHONE.z; z -= 0.1) {
      const level = db(0, z);
      expect(level, `at z = ${z.toFixed(1)}`).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('is clearly there at the first bay and a faint presence by the third', () => {
    const first = db(0, bayCentreZ(0));
    const third = db(0, bayCentreZ(2));
    // The source voice still falls with distance; the separate diffuse bed carries the combined mix.
    expect(first).toBeLessThan(-6);
    expect(first).toBeGreaterThan(-14);
    expect(third).toBeLessThan(-14);
    expect(third).toBeGreaterThan(-24);
    expect(third).toBeLessThan(first - 5);
  });

  it('turns more of the sound into the room, and darker, as the visitor goes down the corridor', () => {
    let lastWet = -1;
    let lastDark = Number.POSITIVE_INFINITY;
    for (let z = GRAMOPHONE.z; z >= WALK_LIMITS.minZ; z -= 1) {
      const mix = mixAt(at(0, z));
      const share = mix.wet ** 2 / (mix.wet ** 2 + mix.dry ** 2);
      expect(share).toBeGreaterThanOrEqual(lastWet);
      expect(mix.lowpassHz).toBeLessThanOrEqual(lastDark);
      // Equal power: the room takes from the direct sound what it adds.
      expect(mix.wet ** 2 + mix.dry ** 2).toBeCloseTo(mix.gain ** 2, 9);
      lastWet = share;
      lastDark = mix.lowpassHz;
    }
    // Near: a little of the room. Far: mostly the room.
    expect(mixAt(at(GRAMOPHONE_SOURCE.x + 0.5, GRAMOPHONE_SOURCE.z)).wet ** 2).toBeLessThan(0.2 * mixAt(at(GRAMOPHONE_SOURCE.x + 0.5, GRAMOPHONE_SOURCE.z)).gain ** 2);
    const far = mixAt(at(0, WALK_LIMITS.minZ));
    expect(far.wet ** 2 / far.gain ** 2).toBeGreaterThan(0.45);
    expect(mixAt(at(0, GRAMOPHONE.z)).lowpassHz).toBeGreaterThan(far.lowpassHz + 1500);
  });
});

describe('which side it is on', () => {
  it('sits on the left of a visitor facing down the corridor, and ahead of one who turns to face it', () => {
    expect(mixAt(at(0, 6, 0)).pan).toBeLessThan(-0.3);
    // Facing the wall it stands against (yaw -90 looks toward -x), it is in front: centred.
    expect(Math.abs(mixAt(at(0, GRAMOPHONE.z, -90)).pan)).toBeLessThan(0.05);
    // Facing the other wall it is directly behind: no side to put it on.
    expect(Math.abs(mixAt(at(0, GRAMOPHONE.z, 90)).pan)).toBeLessThan(0.05);
  });

  it('crosses to the right of a visitor who has walked past it and looks back toward the entrance', () => {
    // Looking back toward the lobby (yaw 180), the left wall is on the visitor's right.
    expect(mixAt(at(0, GRAMOPHONE.z - 3, 180)).pan).toBeGreaterThan(0.3);
  });

  it('keeps the pan within -1 and 1 and does not jitter right beside the horn', () => {
    for (const yaw of [-170, -90, 0, 90, 170]) {
      for (const x of [-2.4, -1.5, 0, 1.5]) {
        const pan = mixAt(at(x, GRAMOPHONE.z + 0.01, yaw)).pan;
        expect(Math.abs(pan)).toBeLessThanOrEqual(1);
      }
    }
    expect(Math.abs(mixAt(at(GRAMOPHONE_SOURCE.x + 0.02, GRAMOPHONE_SOURCE.z, 0)).pan)).toBeLessThan(0.05);
  });
});
