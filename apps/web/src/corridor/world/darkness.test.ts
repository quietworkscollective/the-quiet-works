import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { CORRIDOR, LOBBY } from '../layout.ts';
import { CEILING_TINT, CORRIDOR_DARKNESS } from './architecture/corridor.ts';
import { buildWorld } from './build.ts';
import { darkness, heightValue, poolValue, type DarknessOptions } from './darkness.ts';
import { FOG_COLOUR } from './fog.ts';
import { corridorSconceSlots } from './lighting.ts';
import { FOG_CODE } from './shader.ts';

const HW = CORRIDOR.width / 2;
const slots = corridorSconceSlots(CORRIDOR.farZ);
const options: DarknessOptions = {
  pools: slots.map((s) => ({ x: s.side === 'left' ? -HW : HW, z: s.z })),
  radius: CORRIDOR_DARKNESS.radius,
  floor: CORRIDOR_DARKNESS.floor,
  fallFrom: CORRIDOR_DARKNESS.fallFrom,
  height: CORRIDOR.height,
  ceilingValue: CORRIDOR_DARKNESS.ceilingValue,
};

describe('the value bands', () => {
  it('a pool is full value at its light and falls to the floor value far from every light', () => {
    const s = slots[0];
    if (!s) throw new Error('no sconce');
    const x = s.side === 'left' ? -HW : HW;
    expect(poolValue(x, s.z, options)).toBeCloseTo(1, 6);
    expect(poolValue(0, -500, options)).toBeCloseTo(options.floor, 3);
    // Monotonic away from the light along the wall, while it is still the nearest one (the next
    // sconce, across the corridor and staggered, takes over beyond about 1.7 m).
    let last = 1;
    for (let d = 0.25; d <= 1.5; d += 0.25) {
      const v = poolValue(x, s.z - d, options);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });

  it('height is untouched below the fall and reaches the ceiling value at the ceiling', () => {
    expect(heightValue(0, options)).toBe(1);
    expect(heightValue(options.fallFrom, options)).toBe(1);
    expect(heightValue(options.height, options)).toBeCloseTo(options.ceilingValue, 6);
    let last = 1;
    for (let y = options.fallFrom; y <= options.height; y += 0.1) {
      const v = heightValue(y, options);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });

  it('the corridor has three distinct bands: the pool beside a sconce, the pier between, and the ceiling above', () => {
    const dark = darkness(options);
    const a = slots.find((s) => s.side === 'left' && s.z < -5);
    if (!a) throw new Error('no left sconce');
    const lit = dark([-HW, CORRIDOR.sconce.y, a.z]);
    // Midway between this sconce and the next on the same wall, which is also across from the stagger.
    const pier = dark([-HW, CORRIDOR.sconce.y, a.z - CORRIDOR.sconce.spacing / 2 - 0.4]);
    const ceiling = dark([0, CORRIDOR.height, a.z - CORRIDOR.sconce.spacing / 2]);
    expect(lit).toBeGreaterThan(0.9);
    expect(pier).toBeLessThan(0.6 * lit);
    // The ceiling sits nearer the lights in plan than the pier does, but falls away with height.
    expect(ceiling).toBeLessThan(pier);
    expect(ceiling).toBeLessThan(0.5 * lit);
  });

  it('the fog and the far end are a warm brown, never blue-grey or green', () => {
    const c = new Color(FOG_COLOUR);
    // Linear light: red leads, then green, then blue, with a clear gap between red and blue.
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.g).toBeGreaterThan(c.b);
    expect(c.r - c.b).toBeGreaterThan(0.03);
    // And it is a haze to travel into, not a void: well above black.
    expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toBeGreaterThan(0.02);
  });
});

describe('the fog in the shader', () => {
  it('mixes toward the fog colour as it is, with no further darkening with distance', () => {
    expect(FOG_CODE).toContain('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, tqwFog );');
  });
});

describe('the value bands in the built corridor', () => {
  const plaster = buildWorld().buckets.plaster;
  /** Mean vertex value (red channel over the tint) of plaster vertices satisfying `pick`. */
  const mean = (pick: (x: number, y: number, z: number, nx: number, ny: number) => boolean, tint = 1): number => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < plaster.vertexCount; i += 1) {
      const x = plaster.pos[i * 3] ?? 0;
      const y = plaster.pos[i * 3 + 1] ?? 0;
      const z = plaster.pos[i * 3 + 2] ?? 0;
      if (!pick(x, y, z, plaster.nor[i * 3] ?? 0, plaster.nor[i * 3 + 1] ?? 0)) continue;
      sum += (plaster.col[i * 3] ?? 0) / tint;
      n += 1;
    }
    if (n === 0) throw new Error('no plaster vertices matched');
    return sum / n;
  };
  const nearestPool = (x: number, z: number): number => Math.min(...options.pools.map((p) => Math.hypot(x - p.x, z - p.z)));
  const wall = (x: number, y: number, z: number, nx: number): boolean => Math.abs(Math.abs(x) - HW) < 0.02 && Math.abs(nx) > 0.9 && z < -2 && z > -30 && y > 1.5 && y < 2.3;

  it('wall plaster beside a sconce is at least 1.6 times the value of the pier between sconces', () => {
    const pool = mean((x, y, z, nx) => wall(x, y, z, nx) && nearestPool(x, z) < 0.7);
    const pier = mean((x, y, z, nx) => wall(x, y, z, nx) && nearestPool(x, z) > 2.8);
    expect(pool).toBeGreaterThan(1.6 * pier);
  });

  it('the upper wall is darker than the wall at lamp height, and the ceiling darker again', () => {
    const lamp = mean((x, y, z, nx) => wall(x, y, z, nx));
    const upper = mean((x, y, z, nx) => Math.abs(Math.abs(x) - HW) < 0.02 && Math.abs(nx) > 0.9 && z < -2 && z > -30 && y > 3.4);
    const ceiling = mean((_x, y, z, _nx, ny) => y > CORRIDOR.height - 0.01 && ny < -0.9 && z < -2 && z > -30, CEILING_TINT[0]);
    expect(upper).toBeLessThan(0.75 * lamp);
    expect(ceiling).toBeLessThan(0.85 * upper);
  });

  it('the lobby falls into the dark above its lamps: its upper wall and ceiling are darker than its wall at lamp height', () => {
    const half = LOBBY.width / 2;
    const side = (x: number, z: number, nx: number): boolean => Math.abs(Math.abs(x) - half) < 0.02 && Math.abs(nx) > 0.9 && z > 2 && z < LOBBY.startZ - 1;
    const lamp = mean((x, y, z, nx) => side(x, z, nx) && y > 1.6 && y < 2.4);
    // Between the contact shading at the cove and the lamps' height, where only the bands act.
    const upper = mean((x, y, z, nx) => side(x, z, nx) && y > 3.1 && y < 3.6);
    const ceiling = mean((_x, y, z, _nx, ny) => y > LOBBY.height - 0.01 && ny < -0.9 && z > 2 && z < LOBBY.startZ - 1, CEILING_TINT[0]);
    expect(upper).toBeLessThan(0.86 * lamp);
    expect(ceiling).toBeLessThan(0.85 * lamp);
  });
});
