import { describe, expect, it } from 'vitest';
import { RECORDS } from '../../../../audio/music/catalogue.ts';
import { GRAMOPHONE, GRAMOPHONE_SOURCE } from '../../../../audio/music/space.ts';
import type { NeedleState } from '../../../../audio/music/needle.ts';
import { LOBBY } from '../../../layout.ts';
import { ARM, ARM_TRAVEL_S, armPose, armStep, armTarget, PARTS, PLATTER, platterStep, PLATTER_REST, PLATTER_RAD_PER_S, REST_AT } from './model.ts';
import { WALL } from '../placement.ts';
import { gramophonePlacement, ROUTE_HALF_WIDTH, toWorld } from './placement.ts';
import { actionFor, actionsFor, readingOf } from './reading.ts';
import { BUILD_PARTS, buildGramophone, HORN, hornRadius } from './visual.ts';

const built = buildGramophone();

describe('where the gramophone stands', () => {
  const placement = gramophonePlacement();

  it('is on the lobby\'s left wall, local +z pointing into the room', () => {
    expect(placement.wallX).toBe(-LOBBY.width / 2);
    expect(placement.normal).toEqual([1, 0, 0]);
    const out = toWorld(placement, [0, 0, 1]);
    expect(out[0]).toBeCloseTo(-LOBBY.width / 2 + 1, 9);
    expect(out[2]).toBeCloseTo(GRAMOPHONE.z, 9);
    // Local +x runs along the wall toward the corridor, to the right of a visitor facing the wall.
    expect(toWorld(placement, [1, 0, 0])[2]).toBeCloseTo(GRAMOPHONE.z - 1, 9);
  });

  it('keeps all of itself out of the wall and out of the 1.5 m route', () => {
    const { min, max } = built.bounds();
    // Clear of the skirting, which stands 36 mm off the wall.
    expect(min[2]).toBeGreaterThanOrEqual(WALL.skirting);
    const reach = placement.wallX + max[2];
    // The wall is at x = -2.5; the route is |x| <= 0.75. The horn's lip is the furthest thing out.
    expect(reach).toBeLessThan(-ROUTE_HALF_WIDTH - 0.5);
    expect(max[2]).toBeLessThan(0.6);
    // The cabinet and table stand inside their own footprint along the wall, with the horn's lip and the crank a little beyond.
    expect(max[0] - min[0]).toBeLessThan(0.9);
  });

  it('ends its horn where the music comes from: the horn\'s mouth is the sound\'s source, to the centimetre', () => {
    const mouth = toWorld(placement, HORN.mouth);
    expect(mouth[0]).toBeCloseTo(GRAMOPHONE.mouth.x, 1);
    expect(mouth[1]).toBeCloseTo(GRAMOPHONE.mouth.y, 1);
    expect(mouth[2]).toBeCloseTo(GRAMOPHONE.mouth.z, 1);
    expect(Math.hypot(mouth[0] - GRAMOPHONE_SOURCE.x, mouth[2] - GRAMOPHONE_SOURCE.z)).toBeLessThan(0.02);
  });
});

describe('the needle and the arm', () => {
  it('rests exactly as authored at 0 and swings 26 degrees, lowering into the groove, at 1', () => {
    expect(armPose(0)).toEqual({ yaw: 0, lift: 0 });
    const down = armPose(1);
    expect(down.yaw).toBeCloseTo((-ARM.swingDeg * Math.PI) / 180, 9);
    // Lowered from the rest's height by exactly the rest's lift.
    expect(Math.sin(-down.lift) * ARM.length).toBeCloseTo(ARM.restLift, 9);
  });

  it('raises the head to travel and sets it down only at the end', () => {
    const heights = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 1].map((a) => Math.sin(armPose(a).lift) * ARM.length);
    // Higher than at rest in the middle of the journey, and the lowest of all in the groove.
    expect(Math.max(...heights.slice(1, 6))).toBeGreaterThan(0.005);
    expect(heights[heights.length - 1]).toBe(Math.min(...heights));
  });

  it('lands the needle in the record\'s outer groove, and parks it clear of the record on the rest', () => {
    const [px, , pz] = ARM.pivot;
    const head: [number, number] = [px + 0.005, pz + 0.27];
    const tip = (yaw: number): [number, number] => {
      // Rotation about +y by `yaw`: x' = x cos + z sin, z' = -x sin + z cos (about the pivot).
      const dx = head[0] - px;
      const dz = head[1] - pz;
      return [px + dx * Math.cos(yaw) + dz * Math.sin(yaw), pz - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    };
    const [cx, , cz] = PLATTER.centre;
    const distance = (p: [number, number]): number => Math.hypot(p[0] - cx, p[1] - cz);
    const landed = distance(tip(armPose(1).yaw));
    expect(landed).toBeLessThan(PLATTER.radius - 0.004);
    expect(landed).toBeGreaterThan(PLATTER.radius - 0.02);
    expect(distance(tip(armPose(0).yaw))).toBeGreaterThan(PLATTER.radius + 0.08);
  });

  it('takes 0.85 s between its rest and the groove, in either direction, and goes where the needle is', () => {
    expect(ARM_TRAVEL_S).toBe(0.85);
    const frame = 1 / 60;
    let a = 0;
    let elapsed = 0;
    while (a < 1) {
      a = armStep(a, 1, frame);
      elapsed += frame;
    }
    expect(elapsed).toBeGreaterThanOrEqual(0.85);
    expect(elapsed).toBeLessThan(0.85 + 2 * frame);
    // Half way through the time it is half way there, and back again takes as long.
    expect(armStep(0, 1, 0.425)).toBeCloseTo(0.5, 9);
    expect(armStep(1, 0, 0.425)).toBeCloseTo(0.5, 9);
    expect(armStep(0.5, 1, 10)).toBe(1);
    expect(armStep(0.5, 0, 10)).toBe(0);
    const down: NeedleState[] = ['lead-in', 'playing', 'run-out'];
    const up: NeedleState[] = ['up', 'gap', 'swap'];
    for (const n of down) expect(armTarget(n)).toBe(1);
    for (const n of up) expect(armTarget(n)).toBe(0);
  });

  it('parks the needle on the rest: its tip is at the rest\'s height above the record at the authored pose', () => {
    // The rest is where the arm lies; its cap is under the tube, at the tube's x.
    expect(REST_AT[0]).toBeCloseTo(ARM.pivot[0] + 0.005, 3);
  });
});

describe('the platter', () => {
  const run = (turning: boolean, seconds: number, from = PLATTER_REST, reduced = false) => {
    let state = from;
    for (let t = 0; t < seconds; t += 1 / 15) state = platterStep(state, turning, 1 / 15, reduced);
    return state;
  };

  it('turns while the needle is down, up to its speed, and runs down to a stop when it is not', () => {
    const turning = run(true, 4);
    expect(turning.speed).toBeCloseTo(PLATTER_RAD_PER_S, 1);
    const stopped = run(false, 6, turning);
    expect(stopped.speed).toBe(0);
    // Still, so no frame is worth drawing for it.
    expect(platterStep(stopped, false, 1, false)).toEqual(stopped);
  });

  it('turns slowly enough to read as turning at the 15 frames a second of an ambient window', () => {
    expect(PLATTER_RAD_PER_S / 15).toBeLessThan(Math.PI / 6);
    expect(PLATTER_RAD_PER_S / 15).toBeGreaterThan(0.1);
  });

  it('never turns under reduced motion, whatever the needle does', () => {
    expect(run(true, 5, PLATTER_REST, true)).toEqual(PLATTER_REST);
    expect(run(true, 5, { angle: 1, speed: 3 }, true)).toEqual(PLATTER_REST);
  });
});

describe('what it is made of', () => {
  it('has the named moving parts and a body, each with geometry', () => {
    expect(PARTS.map((p) => p.name)).toEqual(['platter', 'tonearm']);
    expect(BUILD_PARTS).toEqual(['body', 'platter', 'tonearm']);
    for (const part of BUILD_PARTS) {
      const triangles = Object.values(built.buckets[part]).reduce((n, b) => n + b.triangleCount, 0);
      expect(triangles, part).toBeGreaterThan(50);
    }
  });

  it('stays inside the prop budget: about 25 draw calls and 45 thousand triangles', () => {
    const drawCalls = BUILD_PARTS.flatMap((part) => Object.values(built.buckets[part]).filter((b) => b.triangleCount > 0)).length;
    expect(drawCalls).toBeLessThanOrEqual(14);
    expect(built.triangles).toBeLessThan(12_000);
  });

  it('turns each moving part about its own origin: the platter\'s own geometry is centred on its spindle', () => {
    const { min, max } = (() => {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const bucket of Object.values(built.buckets.platter)) {
        for (let i = 0; i < bucket.pos.length; i += 3) {
          for (let k = 0; k < 3; k += 1) {
            lo[k] = Math.min(lo[k] ?? 0, bucket.pos[i + k] ?? 0);
            hi[k] = Math.max(hi[k] ?? 0, bucket.pos[i + k] ?? 0);
          }
        }
      }
      return { min: lo, max: hi };
    })();
    expect((min[0]! + max[0]!) / 2).toBeCloseTo(0, 2);
    expect((min[2]! + max[2]!) / 2).toBeCloseTo(0, 2);
    expect(max[0]!).toBeLessThanOrEqual(PLATTER.felt + 0.001);
  });

  it('puts the ivory on the two fittings and nowhere else, and in the enamel channel', () => {
    expect(new Set(built.fittings.map((f) => f.target))).toEqual(new Set(['needle', 'records']));
    for (const f of built.fittings) {
      expect(f.end).toBeGreaterThan(f.start);
      const enamel = built.buckets[f.part].enamel;
      expect(f.end).toBeLessThanOrEqual(enamel.vertexCount);
    }
    // The needle's fitting is on the arm's rest, in the body (the arm swings away from it).
    expect(built.fittings.find((f) => f.target === 'needle')?.part).toBe('body');
    expect(built.fittingAt.needle).toEqual(REST_AT);
  });

  it('gives each target a hit area at least as generous as the twelve props\' (0.42 m a side along the wall and in height)', () => {
    for (const target of ['needle', 'records'] as const) {
      const area = built.hits[target];
      expect(area.size[0], target).toBeGreaterThanOrEqual(0.42);
      expect(area.size[1], target).toBeGreaterThanOrEqual(0.42);
    }
    // And they do not overlap, so a click reads as one verb.
    const a = built.hits.needle;
    const b = built.hits.records;
    const overlapY = Math.min(a.centre[1] + a.size[1] / 2, b.centre[1] + b.size[1] / 2) - Math.max(a.centre[1] - a.size[1] / 2, b.centre[1] - b.size[1] / 2);
    expect(overlapY).toBeLessThan(0);
  });

  it('flares from a throat to a bell in one direction, never narrowing', () => {
    let last = 0;
    for (let u = 0; u <= 1; u += 0.02) {
      expect(hornRadius(u)).toBeGreaterThanOrEqual(last);
      last = hornRadius(u);
    }
    expect(hornRadius(0)).toBeCloseTo(HORN.throatRadius, 9);
    expect(hornRadius(1)).toBeCloseTo(HORN.mouthRadius, 9);
  });

  it('faces its record\'s top up: the label and the bands look toward the ceiling', () => {
    const enamel = built.buckets.platter.enamel;
    let up = 0;
    let down = 0;
    for (let i = 0; i < enamel.nor.length; i += 3) {
      const ny = enamel.nor[i + 1] ?? 0;
      if (ny > 0.9) up += 1;
      if (ny < -0.9) down += 1;
    }
    expect(up).toBeGreaterThan(0);
    expect(up).toBeGreaterThan(down);
  });
});

describe('what it says', () => {
  it('names the verbs as the brief does, the needle\'s own switching with the needle', () => {
    expect(actionsFor({ needle: 'up', record: 0 }).map((a) => a.label)).toEqual(['Play', 'Change the record']);
    expect(actionsFor({ needle: 'playing', record: 0 }).map((a) => a.label)).toEqual(['Lift the needle', 'Change the record']);
    expect(actionFor({ needle: 'lead-in', record: 0 }, 'needle').verb).toBe('lift');
    expect(actionFor({ needle: 'gap', record: 0 }, 'needle').verb).toBe('play');
    expect(actionFor({ needle: 'up', record: 0 }, 'records').verb).toBe('change');
  });

  it('reads as "A gramophone. Playing: ..." and names the record, in every state', () => {
    const title = (i: number) => `${RECORDS[i]?.title}, ${RECORDS[i]?.composer}`;
    expect(readingOf({ needle: 'playing', record: 1 }, true).text).toBe(`A gramophone. Playing: ${title(1)}.`);
    expect(readingOf({ needle: 'up', record: 0 }, true).text).toBe(`A gramophone. The needle is up. On the platter: ${title(0)}.`);
    expect(readingOf({ needle: 'lead-in', record: 2 }, true).text).toContain(title(2));
    expect(readingOf({ needle: 'gap', record: 1 }, true).text).toContain(`Next: ${title(1)}`);
    expect(readingOf({ needle: 'swap', record: 1 }, true).text).toContain('Changing the record');
    expect(readingOf({ needle: 'run-out', record: 0 }, true).text).toContain('groove');
  });

  it('says so when the sound is off, and only then', () => {
    expect(readingOf({ needle: 'playing', record: 0 }, true).text).not.toContain('sound is off');
    expect(readingOf({ needle: 'playing', record: 0 }, false).text.endsWith('The sound is off.')).toBe(true);
  });
});
