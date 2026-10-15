import { describe, expect, it } from 'vitest';
import { CORRIDOR } from '../layout.ts';
import { END_Z } from './stage.ts';
import { FLOOR_WARMTH } from './architecture/floor.ts';
import { BEACON, buildBeacon, glowMounts, GLOW_FROM_Z } from './beacon.ts';
import { windowBarPixels } from './textures/glow.ts';
import { kelvinToLinear, linear } from './colour.ts';
import { buildLamps, corridorSconceSlots } from './lighting.ts';
import { FILL_KELVIN, GROUND_KELVIN } from './palette.ts';

/**
 * Founder feedback: the first full view read as creepy to a first-time visitor (a long, symmetrical,
 * still corridor running into black). These guard the answer: warm shadows, light all the way down
 * and a warm destination at the end. Signs of care and the end of bare walls are in care.test.ts.
 */

const HW = CORRIDOR.width / 2;

describe('warm shadows and a lit corridor', () => {
  it('the fill, the ground bounce, the floor and every lamp are warm: red leads, blue trails', () => {
    const warm = (name: string, [r, g, b]: readonly [number, number, number]): void => {
      expect(r, `${name} red over green`).toBeGreaterThanOrEqual(g);
      expect(g, `${name} green over blue`).toBeGreaterThan(b);
    };
    warm('fill', kelvinToLinear(FILL_KELVIN));
    warm('ground', kelvinToLinear(GROUND_KELVIN));
    const [tr, tg, tb] = linear(CORRIDOR.colours.terrazzo);
    warm('floor', [tr * FLOOR_WARMTH[0], tg * FLOOR_WARMTH[1], tb * FLOOR_WARMTH[2]]);
    for (const l of buildLamps([])) warm(l.id, l.colour);
  });

  it('a sconce, in every other bay, all the way down: no stretch of the corridor goes four metres without a light', () => {
    const zs = corridorSconceSlots(END_Z).map((s) => s.z).sort((a, b) => b - a);
    expect(zs.length).toBeGreaterThan(8);
    for (let i = 1; i < zs.length; i += 1) expect((zs[i - 1] as number) - (zs[i] as number), `gap before sconce ${i}`).toBeLessThanOrEqual(4);
    // And the last of them is close to the far end.
    expect((zs[zs.length - 1] as number) - END_Z).toBeLessThanOrEqual(8);
  });

  it('every sconce beyond the doors keeps a glow that the fog cannot take, dimmer with distance', () => {
    const far = corridorSconceSlots(END_Z).filter((s) => s.z < GLOW_FROM_Z);
    const glows = glowMounts();
    expect(glows).toHaveLength(far.length);
    expect(glows.length).toBeGreaterThan(5);
    const sorted = [...glows].sort((a, b) => b.position[2] - a.position[2]);
    for (let i = 1; i < sorted.length; i += 1) expect((sorted[i] as (typeof sorted)[number]).strength).toBeLessThanOrEqual((sorted[i - 1] as (typeof sorted)[number]).strength + 1e-9);
    expect((sorted[0] as (typeof sorted)[number]).strength).toBeGreaterThan(0.9);
    // Faint, never gone: even the farthest still shows.
    expect((sorted[sorted.length - 1] as (typeof sorted)[number]).strength).toBeGreaterThan(0.5);
    for (const g of glows) expect(Math.abs(g.position[0])).toBeLessThan(HW);
  });
});

describe('the far end is a warm destination', () => {
  it('is a door left ajar at the end wall, off the corridor axis, lit at 2700 to 3000 K', () => {
    expect(BEACON.kelvin).toBeGreaterThanOrEqual(2700);
    expect(BEACON.kelvin).toBeLessThanOrEqual(3000);
    // Off the axis: the first view is not perfectly symmetrical.
    expect(Math.abs(BEACON.x)).toBeGreaterThan(0.2);
    expect(Math.abs(BEACON.x) + BEACON.width / 2).toBeLessThan(HW - 0.3);
    const b = buildBeacon();
    const door = b.doorway.bounds();
    expect(door.min[2]).toBeGreaterThan(END_Z);
    expect(door.min[2]).toBeLessThan(END_Z + 0.2);
    expect(door.max[1] - door.min[1]).toBeGreaterThan(2);
    // The leaf narrows the lit gap: it covers part of the doorway, not all of it.
    const leaf = b.leaf.bounds();
    const leafWidth = leaf.max[0] - leaf.min[0];
    expect(leafWidth).toBeGreaterThan(0.2);
    expect(leafWidth).toBeLessThan(BEACON.width * 0.6);
    // The light spills down the corridor floor, in front of the door.
    const spill = b.spill.bounds();
    expect(spill.max[2] - spill.min[2]).toBeGreaterThanOrEqual(8);
    expect(spill.max[1]).toBeLessThan(0.05);
    expect(spill.min[2]).toBeGreaterThan(END_Z);

    const window = b.windowPane.bounds();
    expect(window.max[0] - window.min[0]).toBeCloseTo(0.9, 5);
    expect(window.max[1] - window.min[1]).toBeCloseTo(1.48, 5);
    expect(window.min[2]).toBeGreaterThan(END_Z);
    expect(b.windowFrame.bounds().min[0]).toBeGreaterThan(-HW + 0.1);
    expect(window.max[0]).toBeLessThan(BEACON.x - BEACON.width / 2 - 0.3);
    expect(b.windowFrame.triangleCount).toBeGreaterThan(0);
    expect(b.floorBars.triangleCount).toBeGreaterThan(0);
    expect(b.wallBars.triangleCount).toBeGreaterThan(0);
    const mask = windowBarPixels(128);
    expect(mask.some((value, index) => index % 4 === 0 && value > 180)).toBe(true);
  });
});
