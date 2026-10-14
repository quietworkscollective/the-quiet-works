import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { box, Bucket, breaks, grid, quad, strip } from './builder.ts';
import { kelvinToLinear, linear } from './colour.ts';

/** Every triangle's winding must agree with its stored normal, or FrontSide materials show holes. */
function windingErrors(b: Bucket): number {
  let bad = 0;
  for (let t = 0; t < b.idx.length; t += 3) {
    const [i0, i1, i2] = [b.idx[t]!, b.idx[t + 1]!, b.idx[t + 2]!];
    const p = (i: number) => [b.pos[i * 3]!, b.pos[i * 3 + 1]!, b.pos[i * 3 + 2]!] as const;
    const [a, c, d] = [p(i0), p(i1), p(i2)];
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]] as const;
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] as const;
    const s = [b.nor[i0 * 3]!, b.nor[i0 * 3 + 1]!, b.nor[i0 * 3 + 2]!] as const;
    if (n[0] * s[0] + n[1] * s[1] + n[2] * s[2] <= 0) bad += 1;
  }
  return bad;
}

describe('box', () => {
  it('fills exactly its size and faces outward', () => {
    const b = new Bucket();
    box(b, [1, 2, 3], [0.4, 1.0, 0.2], 0.004);
    const { min, max } = b.bounds();
    expect(min[0]).toBeCloseTo(0.8, 6);
    expect(max[0]).toBeCloseTo(1.2, 6);
    expect(min[1]).toBeCloseTo(1.5, 6);
    expect(max[1]).toBeCloseTo(2.5, 6);
    expect(min[2]).toBeCloseTo(2.9, 6);
    expect(max[2]).toBeCloseTo(3.1, 6);
    expect(windingErrors(b)).toBe(0);
  });

  it('bevels every edge: 6 faces, 12 chamfers and 8 corners', () => {
    const b = new Bucket();
    box(b, [0, 0, 0], [1, 1, 1], 0.003);
    expect(b.triangleCount).toBe(6 * 2 + 12 * 2 + 8);
  });

  it('a square-cornered box is just six faces', () => {
    const b = new Bucket();
    box(b, [0, 0, 0], [1, 1, 1], 0);
    expect(b.triangleCount).toBe(12);
  });

  it('a skipped face is absent and its neighbours run to the full extent', () => {
    const b = new Bucket();
    box(b, [0, 0, 0], [1, 1, 0.2], 0.01, undefined, ['-z']);
    expect(windingErrors(b)).toBe(0);
    // No vertex lies on the skipped plane except the neighbours' edges, which reach it exactly.
    const { min } = b.bounds();
    expect(min[2]).toBeCloseTo(-0.1, 6);
    // No chamfer or corner pieces touch the skipped face.
    for (let i = 0; i < b.nor.length; i += 3) expect(b.nor[i + 2]!).toBeGreaterThan(-0.5);
  });
});

describe('grid and strip', () => {
  it('a grid faces along axisU x axisV and is watertight in area', () => {
    const b = new Bucket();
    grid(b, [0, 0, 0], [1, 0, 0], [0, 0, -1], [0, 1, 2], [0, 0.5, 1]);
    expect(b.triangleCount).toBe(2 * 2 * 2);
    expect(windingErrors(b)).toBe(0);
    for (let i = 0; i < b.nor.length; i += 3) expect(b.nor[i + 1]!).toBeCloseTo(1, 6);
  });

  it('a strip faces toward the free space whichever way the profile is listed', () => {
    for (const reversed of [false, true]) {
      const b = new Bucket();
      const profile = [[0, 0, 0], [0.1, 0.05, 0], [0.1, 0.2, 0]] as const;
      strip(b, reversed ? [...profile].reverse() : profile, [0, 0, 5], undefined, [2, 0.1, 2]);
      expect(windingErrors(b)).toBe(0);
      // The riser at x = 0.1 faces +x, toward the free point.
      const riser = [...b.nor.keys()].filter((k) => k % 3 === 0 && Math.abs(b.pos[k]! - 0.1) < 1e-9 && Math.abs(b.pos[k + 1]! - 0.2) < 1e-9);
      for (const k of riser) expect(b.nor[k]!).toBeGreaterThan(0.9);
    }
  });

  it('a quad flips to face the hint', () => {
    const b = new Bucket();
    quad(b, [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], undefined, [0, 0, -1]);
    expect(b.nor[2]).toBeCloseTo(-1, 6);
    expect(windingErrors(b)).toBe(0);
  });

  it('breaks keeps the end points and honours the step', () => {
    const r = breaks(0, 1, 0.3, [0.5]);
    expect(r[0]).toBe(0);
    expect(r[r.length - 1]).toBe(1);
    for (let i = 1; i < r.length; i += 1) expect(r[i]! - r[i - 1]!).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(r).toContain(0.5);
  });
});

describe('append', () => {
  it('places door-local geometry in the world with rotated normals', () => {
    const local = new Bucket();
    quad(local, [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]);
    const world = new Bucket();
    world.append(local, new Matrix4().makeRotationY(-Math.PI / 2).setPosition(1.6, 0, -4));
    // The +z facing quad now faces -x ... rotation by -90 deg about y maps +z to -x.
    expect(world.nor[0]).toBeCloseTo(-1, 6);
    expect(world.pos[0]).toBeCloseTo(1.6, 6);
    expect(windingErrors(world)).toBe(0);
  });
});

describe('colour', () => {
  it('converts the art-direction hex colours to linear light', () => {
    const [r, g, bl] = linear('#FFFFFF');
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(1, 5);
    expect(bl).toBeCloseTo(1, 5);
    expect(linear('#777777')[0]).toBeCloseTo(0.184, 2);
  });

  it('2700 K is warmer than 4300 K, and both are peak-normalised', () => {
    const warm = kelvinToLinear(2700);
    const cool = kelvinToLinear(4300);
    expect(Math.max(...warm)).toBeCloseTo(1, 6);
    expect(warm[2]! / warm[0]!).toBeLessThan(cool[2]! / cool[0]!);
    expect(warm[0]).toBeGreaterThan(warm[1]!);
    expect(warm[1]).toBeGreaterThan(warm[2]!);
  });
});
