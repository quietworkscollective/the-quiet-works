import { describe, expect, it } from 'vitest';
import { BufferGeometry, Material, Matrix4, type PerspectiveCamera } from 'three';
import { ATMOSPHERES, CONE_TRIANGLES, type HeightFogLayer, type LightConeSpec } from './data.ts';
import { chooseCones, CONE_CULL_DISTANCE, type AtmosphereLamp } from './lamps.ts';
import { kelvinToLinear } from '../colour.ts';
import { coneDensity, coneFrame, createConeGeometry, createCones, goboMask, MAX_CONES } from './cones.ts';
import { LightPatchEffect, MAX_PATCHES, PATCH_FACING, PATCH_FLOOR, patchBoost, patchFacing, strongest } from './lightPatch.ts';
import { createDust, seededSequence } from './dust.ts';
import { farGlowAmount, HeightFogEffect, layerColour, layerOpticalDepth, linearColour, MAX_FOG_LAYERS } from './heightFog.ts';

type P = readonly [number, number, number];

/** Numerical optical depth along the same ray: the check that the closed form is the integral. */
function integrate(layer: HeightFogLayer, eye: P, point: P, steps = 4000): number {
  const length = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]);
  const s = layer.thins === 'up' ? 1 : -1;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const y = eye[1] + (point[1] - eye[1]) * t;
    sum += layer.density * Math.exp((-s * (y - layer.y)) / layer.scaleHeight);
  }
  return (sum * length) / steps;
}

const floorMist: HeightFogLayer = { id: 'floor', y: 0, thins: 'up', scaleHeight: 0.35, density: 0.06, colour: '#8C7556' };
const ceilingSmoke: HeightFogLayer = { id: 'ceiling', y: 3.8, thins: 'down', scaleHeight: 0.7, density: 0.05, colour: '#A67C3F' };

describe('height fog: the closed form is the integral of the density along the ray', () => {
  const rays: [P, P][] = [
    [[0, 1.62, 0], [0, 0, -12]],
    [[0, 1.62, 0], [3, 3.5, -20]],
    [[0, 1.62, 0], [-2, 1.62, -9]],
    [[1, 0.4, 2], [1, 3.7, -6]],
    [[0, 3, 0], [0, 0.1, -4]],
  ];
  for (const layer of [floorMist, ceilingSmoke]) {
    for (const [eye, point] of rays) {
      it(`${layer.id}: ray ${eye.join(',')} to ${point.join(',')}`, () => {
        expect(layerOpticalDepth(layer, eye, point)).toBeCloseTo(integrate(layer, eye, point), 4);
      });
    }
  }

  it('is zero for a ray of no length and grows with the length of a level ray', () => {
    expect(layerOpticalDepth(floorMist, [0, 1, 0], [0, 1, 0])).toBe(0);
    const short = layerOpticalDepth(ceilingSmoke, [0, 2, 0], [0, 2, -5]);
    const long = layerOpticalDepth(ceilingSmoke, [0, 2, 0], [0, 2, -10]);
    expect(long).toBeCloseTo(short * 2, 9);
  });

  it('is thicker through the layer than away from it', () => {
    const along = layerOpticalDepth(floorMist, [0, 0.2, 0], [0, 0.2, -10]);
    const away = layerOpticalDepth(floorMist, [0, 2.5, 0], [0, 2.5, -10]);
    expect(along).toBeGreaterThan(away * 10);
  });

  it('gives each layer a warm linear colour', () => {
    for (const layer of ATMOSPHERES.corridor.heightFog) {
      const [r, g, b] = layerColour(layer);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
    }
    expect(linearColour('#FFFFFF')).toEqual([1, 1, 1]);
  });
});

describe('far glow', () => {
  const glow = ATMOSPHERES.corridor.farGlow;

  it('adds nothing up close, rises smoothly, and reaches its strength at the far distance', () => {
    expect(farGlowAmount(glow, 0)).toBe(0);
    expect(farGlowAmount(glow, glow.from)).toBe(0);
    expect(farGlowAmount(glow, glow.to)).toBeCloseTo(glow.strength, 12);
    expect(farGlowAmount(glow, glow.to * 3)).toBeCloseTo(glow.strength, 12);
    let previous = 0;
    for (let d = glow.from; d <= glow.to; d += 0.5) {
      const amount = farGlowAmount(glow, d);
      expect(amount).toBeGreaterThanOrEqual(previous);
      previous = amount;
    }
  });

  it('rises as a smoothstep: slowly at first, so the near corridor is not veiled', () => {
    const quarter = glow.from + (glow.to - glow.from) * 0.25;
    expect(farGlowAmount(glow, quarter)).toBeCloseTo(glow.strength * 0.15625, 12);
  });

  it('lifts the far end of the corridor visibly: more than a few levels of light', () => {
    const [r] = linearColour(glow.colour);
    expect(farGlowAmount(glow, 40) * r).toBeGreaterThan(0.01);
  });
});

describe('the height-fog effect', () => {
  it('holds the layers, the haze and the glow as uniforms, so a profile change needs no recompile', () => {
    const air = ATMOSPHERES.corridor;
    const effect = new HeightFogEffect({ layers: air.heightFog, haze: air.haze, farGlow: air.farGlow });
    const layers = effect.uniforms.get('layers')?.value as { x: number; y: number; z: number; w: number }[];
    expect(layers).toHaveLength(MAX_FOG_LAYERS);
    expect(layers[0]?.w, 'the first layer’s density').toBe(air.heightFog[0]?.density);
    expect(layers[0]?.y, 'a floor layer thins upward').toBe(1);
    expect(layers[2]?.y, 'a ceiling layer thins downward').toBe(-1);
    expect(layers[3]?.w, 'an unused slot is empty').toBe(0);
    effect.setAir([], air.haze, air.farGlow);
    expect(layers.every((layer) => layer.w === 0)).toBe(true);
  });
});

describe('lamp cones', () => {
  const spec: LightConeSpec = { lamp: 'sconce', halfAngleDeg: 38, length: 2.2, opacity: 0.1, falloff: 1.6, edge: 0.8, kelvin: 2700, breakup: 0.25, patch: 0 };
  const apex: P = [0, 2, 0];
  const down: P = [0, -1, 0];

  it('is empty outside the shaft: behind the lamp, past its end, and beside it', () => {
    expect(coneDensity(spec, apex, down, [0, 2.5, 0])).toBe(0);
    expect(coneDensity(spec, apex, down, [0, 2 - 2.3, 0])).toBe(0);
    expect(coneDensity(spec, apex, down, [3, 1, 0])).toBe(0);
  });

  it('is brightest on the axis near the lamp, and fades along the shaft', () => {
    const near = coneDensity(spec, apex, down, [0, 2 - 0.3, 0]);
    const middle = coneDensity(spec, apex, down, [0, 2 - 1.1, 0]);
    const far = coneDensity(spec, apex, down, [0, 2 - 2.0, 0]);
    expect(near).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
    expect(far).toBeGreaterThan(0);
  });

  it('fades in just below the lamp, so the fitting itself is not smeared', () => {
    const tiny = coneDensity(spec, apex, down, [0, 2 - 0.02, 0]);
    const clear = coneDensity(spec, apex, down, [0, 2 - 0.3, 0]);
    expect(tiny).toBeLessThan(clear * 0.5);
  });

  it('fades toward the edge of the shaft and never goes negative', () => {
    const y = 2 - 1;
    const half = Math.tan((spec.halfAngleDeg * Math.PI) / 180);
    const onAxis = coneDensity(spec, apex, down, [0, y, 0]);
    const nearEdge = coneDensity(spec, apex, down, [half * 0.95, y, 0]);
    const justOutside = coneDensity(spec, apex, down, [half * 1.05, y, 0]);
    expect(onAxis).toBeGreaterThan(nearEdge);
    expect(nearEdge).toBeGreaterThanOrEqual(0);
    expect(justOutside).toBe(0);
  });

  it('is a hard-edged shaft when its edge is 0 and softer when it is 1', () => {
    const half = Math.tan((spec.halfAngleDeg * Math.PI) / 180);
    const probe: P = [half * 0.5, 2 - 1, 0];
    const hard = coneDensity({ ...spec, edge: 0 }, apex, down, probe);
    const soft = coneDensity({ ...spec, edge: 1 }, apex, down, probe);
    expect(hard).toBeGreaterThan(soft);
  });

  it('builds a unit cone of exactly the triangles the budget counts', () => {
    const geometry = createConeGeometry();
    const positions = geometry.getAttribute('position');
    expect(positions.count / 3).toBe(CONE_TRIANGLES);
    let apexVertices = 0;
    for (let i = 0; i < positions.count; i += 1) if (positions.getX(i) === 0 && positions.getY(i) === 0 && positions.getZ(i) === 0) apexVertices += 1;
    expect(apexVertices, 'one apex vertex per triangle of the first row').toBe(16);
    expect(geometry.getAttribute('radial').count).toBe(positions.count);
    geometry.dispose();
  });

  it('draws only as many cones as it was given, up to its capacity', () => {
    const cones = createCones(10);
    const one = { apex, axis: down, spec };
    cones.set([one, one, one]);
    expect(cones.geometry.instanceCount).toBe(3);
    cones.set(Array.from({ length: 40 }, () => one));
    expect(cones.geometry.instanceCount).toBe(10);
    expect(createCones(99).geometry.getAttribute('iApex').count).toBe(MAX_CONES);
    cones.dispose();
  });

  it('marks a framed shaft for the square section and a plain one for the round', () => {
    const cones = createCones(4);
    const framed = { apex, axis: down, spec: { ...spec, gobo: { columns: 2, rows: 2, bar: 0.2, soft: 0.1 } } };
    cones.set([{ apex, axis: down, spec }, framed]);
    const look = cones.geometry.getAttribute('iLook');
    expect(look.itemSize).toBe(3);
    for (const [i, flag] of [[0, 0], [1, 1]] as const) {
      expect(look.getX(i)).toBeCloseTo(spec.edge, 5);
      expect(look.getY(i)).toBeCloseTo(spec.breakup, 5);
      expect(look.getZ(i)).toBe(flag);
    }
    cones.dispose();
  });

  it('frees its geometry and material', () => {
    const cones = createCones(4);
    const disposed: string[] = [];
    (cones.geometry as BufferGeometry).addEventListener('dispose', () => disposed.push('geometry'));
    (cones.material as Material).addEventListener('dispose', () => disposed.push('material'));
    cones.dispose();
    expect(disposed.sort()).toEqual(['geometry', 'material']);
  });
});

describe('choosing the cones for a frame', () => {
  const specs = ATMOSPHERES.corridor.cones.specs;
  const lamp = (id: string, z: number, kind = 'sconce'): AtmosphereLamp => ({ id, kind, position: [0, 2, z], direction: [0, -2, 0] });

  it('picks the lamps nearest the eye, nearest first, up to the cap', () => {
    const lamps = [lamp('c', -12), lamp('a', -2), lamp('d', -20), lamp('b', -6)];
    const chosen = chooseCones(lamps, specs, [0, 1.6, 0], 3);
    expect(chosen.map((c) => c.apex[2])).toEqual([-2, -6, -12]);
  });

  it('drops lamps past the cull distance and lamps the profile has no cone for', () => {
    const lamps = [lamp('near', -3), lamp('far', -(CONE_CULL_DISTANCE + 1)), lamp('odd', -4, 'chandelier')];
    expect(chooseCones(lamps, specs, [0, 1.6, 0], 10).map((c) => c.apex[2])).toEqual([-3]);
  });

  it('normalises each shaft’s direction and takes its shape from the profile', () => {
    const [cone] = chooseCones([lamp('a', -3)], specs, [0, 1.6, 0], 5);
    expect(Math.hypot(...(cone?.axis ?? [0, 0, 0]))).toBeCloseTo(1, 9);
    expect(cone?.spec).toBe(specs[0]);
  });

  it('chooses nothing for no lamps, and for a cap of zero', () => {
    expect(chooseCones([], specs, [0, 0, 0], 5)).toEqual([]);
    expect(chooseCones([lamp('a', -3)], specs, [0, 0, 0], 0)).toEqual([]);
  });
});

describe('dust', () => {
  it('draws the same motes every time: a fixed seed, uniform in the unit interval', () => {
    const a = seededSequence(7);
    const b = seededSequence(7);
    const first = Array.from({ length: 50 }, () => a());
    expect(first).toEqual(Array.from({ length: 50 }, () => b()));
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...first)).toBeLessThan(1);
    expect(seededSequence(8)()).not.toBe(first[0]);
  });

  it('makes as many motes as the profile asks for, and frees its geometry and material', () => {
    const dust = createDust(ATMOSPHERES.office.dust);
    expect(dust.points.geometry.getAttribute('seed').count).toBe(ATMOSPHERES.office.dust.count);
    const disposed: string[] = [];
    dust.points.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    dust.material.addEventListener('dispose', () => disposed.push('material'));
    dust.dispose();
    expect(disposed.sort()).toEqual(['geometry', 'material']);
  });

  it('is lit by at most as many cones as the shader holds', () => {
    const dust = createDust(ATMOSPHERES.corridor.dust);
    const spec = ATMOSPHERES.corridor.cones.specs[0]!;
    dust.lightBy(Array.from({ length: 40 }, () => ({ apex: [0, 2, 0] as P, axis: [0, -1, 0] as P, spec })));
    expect(dust.material.uniforms['coneCount']?.value).toBe(MAX_CONES);
    dust.dispose();
  });
});

describe('a frame that cuts the light into bars', () => {
  const gobo = { columns: 3, rows: 2, bar: 0.2, soft: 0.1 };

  it('is open at the middle of a pane and shut at the middle of a bar', () => {
    // Panes are 2/3 wide across [-1, 1]; the bars sit at -1, -1/3, 1/3 and 1, and at -1, 0 and 1 in the other axis.
    expect(goboMask([0, -0.5], gobo)).toBeCloseTo(1, 9);
    expect(goboMask([-1 / 3, -0.5], gobo)).toBe(0);
    expect(goboMask([0, 0], gobo)).toBe(0);
    expect(goboMask([1, -0.5], gobo)).toBe(0);
  });

  it('is shut for the whole half-thickness of a bar and open again by the end of its softness', () => {
    // Three columns: the bar between the first two is centred on q = -1/3. Its half-thickness is bar/2 = 0.1 of a pane
    // (0.2/3*... in q), then `soft` more of a pane to full light. A pane is 2/3 of q wide.
    const pane = 2 / 3;
    const centre = -1 / 3;
    const y = -0.5;
    expect(goboMask([centre + 0.05 * pane, y], gobo), 'inside the bar').toBe(0);
    expect(goboMask([centre - 0.05 * pane, y], gobo), 'inside the bar, the other side').toBe(0);
    expect(goboMask([centre + (gobo.bar / 2 + gobo.soft + 0.01) * pane, y], gobo), 'past the softness').toBe(1);
    expect(goboMask([centre + (gobo.bar / 2 + gobo.soft / 2) * pane, y], gobo), 'in the softness').toBeGreaterThan(0.3);
    expect(goboMask([centre + (gobo.bar / 2 + gobo.soft / 2) * pane, y], gobo)).toBeLessThan(0.7);
  });

  it('is soft between: rising monotonically from a bar into a pane, strictly between 0 and 1 on the way', () => {
    let previous = -1;
    let seenBetween = false;
    for (let step = 0; step <= 40; step += 1) {
      const m = goboMask([-1 / 3 + (step / 40) * (1 / 3), -0.5], gobo);
      expect(m).toBeGreaterThanOrEqual(previous - 1e-12);
      if (m > 0 && m < 1) seenBetween = true;
      previous = m;
    }
    expect(seenBetween).toBe(true);
  });

  it('is 1 everywhere when there is no frame, and symmetric about the middle of the shaft', () => {
    expect(goboMask([0.3, -0.7], undefined)).toBe(1);
    expect(goboMask([0.3, -0.7], gobo)).toBeCloseTo(goboMask([-0.3, 0.7], gobo), 9);
  });

  it('builds the two axes across a shaft as unit, perpendicular vectors, whichever way it points', () => {
    for (const axis of [[0, -1, 0], [0, 0, -1], [0.6, -0.8, 0], [0.05, -0.15, -1]] as const) {
      const n = Math.hypot(...axis);
      const unit: P = [axis[0] / n, axis[1] / n, axis[2] / n];
      const { right, other } = coneFrame(unit);
      const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(Math.hypot(...right)).toBeCloseTo(1, 9);
      expect(Math.hypot(...other)).toBeCloseTo(1, 9);
      expect(dot(right, other)).toBeCloseTo(0, 9);
      expect(dot(right, unit)).toBeCloseTo(0, 9);
      expect(dot(other, unit)).toBeCloseTo(0, 9);
    }
  });

  const plain: LightConeSpec = { lamp: 'window', halfAngleDeg: 24, length: 5.5, opacity: 0.05, falloff: 0.9, edge: 0.35, kelvin: 5000, breakup: 0.3, patch: 0.7 };
  const spec: LightConeSpec = { ...plain, gobo };
  const apex: P = [0, 1.5, 0];
  const axis: P = [0, 0, -1];
  const along = 3;
  const half = along * Math.tan((24 * Math.PI) / 180);
  const { right, other } = coneFrame(axis);
  const at = (qx: number, qy: number): P => [
    apex[0] + axis[0] * along + right[0] * qx * half + other[0] * qy * half,
    apex[1] + axis[1] * along + right[1] * qx * half + other[1] * qy * half,
    apex[2] + axis[2] * along + right[2] * qx * half + other[2] * qy * half,
  ];

  it('gives a framed shaft a rectangular section: the corners of the square are lit where a round shaft ends', () => {
    // The middle of the pane in the corner of the section: inside the square, outside the circle.
    const corner = at(-2 / 3 + 0.05, -0.9);
    expect(Math.hypot(-2 / 3 + 0.05, -0.9)).toBeGreaterThan(1);
    expect(coneDensity(spec, apex, axis, corner)).toBeGreaterThan(0);
    expect(coneDensity(plain, apex, axis, corner), 'a round shaft ends before the corner').toBe(0);
  });

  it('puts bars of shade into the light: nothing along a bar, light in a pane', () => {
    expect(coneDensity(spec, apex, axis, at(0, -0.5))).toBeGreaterThan(0.05);
    expect(coneDensity(spec, apex, axis, at(-1 / 3, -0.5))).toBe(0);
    expect(coneDensity(spec, apex, axis, at(0, 0))).toBe(0);
  });

  it('scales a surface’s boost by the patch strength and is none where the strength is 0', () => {
    const point: P = [0, 1.5 - 0.01, -2];
    const lit = { apex, axis, spec: { ...plain, patch: 0.7 } };
    const dark = { apex, axis, spec: { ...plain, patch: 0 } };
    expect(patchBoost(lit, point)).toBeGreaterThan(0);
    expect(patchBoost(dark, point)).toBe(0);
    expect(patchBoost({ ...lit, spec: { ...lit.spec, patch: 0.35 } }, point)).toBeCloseTo(patchBoost(lit, point) / 2, 9);
  });
});

describe('the light-patch effect', () => {
  const make = (patch: number, gobo?: LightConeSpec['gobo']): { apex: P; axis: P; spec: LightConeSpec } => ({
    apex: [0, 2, 0],
    axis: [0, -1, 0],
    spec: { lamp: 'x', halfAngleDeg: 30, length: 3, opacity: 0.1, falloff: 1.7, edge: 0.5, kelvin: 3000, breakup: 0, patch, ...(gobo ? { gobo } : {}) },
  });

  it('uses only the shafts that carry light, and no more than it holds', () => {
    const effect = new LightPatchEffect();
    expect(effect.load([make(0), make(0.5), make(0), make(0.2)])).toBe(2);
    expect(effect.load(Array.from({ length: 9 }, () => make(0.4)))).toBe(MAX_PATCHES);
    expect(effect.load([])).toBe(0);
    expect(effect.uniforms.get('patchCount')?.value).toBe(0);
  });

  it('keeps the strongest shafts when more carry light than it holds, so a window is not crowded out by weak fittings', () => {
    const weak = Array.from({ length: MAX_PATCHES }, () => make(0.1));
    const window = make(0.7);
    const chosen = strongest([...weak, window]);
    expect(chosen).toHaveLength(MAX_PATCHES);
    expect(chosen[0]).toBe(window);
    expect(chosen.map((c) => c.spec.patch)).toEqual([0.7, ...Array.from({ length: MAX_PATCHES - 1 }, () => 0.1)]);
    // Equal strength keeps the order given.
    const a = make(0.3);
    const b = make(0.3);
    expect(strongest([a, b])).toEqual([a, b]);
    expect(strongest([b, a])[0]).toBe(b);
  });

  it('puts each shaft’s shape, tint and frame into the uniforms', () => {
    const effect = new LightPatchEffect();
    effect.load([make(0.5, { columns: 3, rows: 2, bar: 0.2, soft: 0.1 })]);
    type V = { x: number; y: number; z: number; w: number };
    const apexes = effect.uniforms.get('patchApex')?.value as V[];
    const gobos = effect.uniforms.get('patchGobo')?.value as V[];
    const colours = effect.uniforms.get('patchColour')?.value as V[];
    expect([apexes[0]?.x, apexes[0]?.y, apexes[0]?.w]).toEqual([0, 2, 3]);
    expect([gobos[0]?.x, gobos[0]?.y]).toEqual([3, 2]);
    expect(colours[0]?.x, 'warm: red leads blue').toBeGreaterThan(colours[0]?.z ?? 0);
    expect(colours[0]?.w, 'the fall-off').toBe(1.7);
    const axes = effect.uniforms.get('patchAxis')?.value as V[];
    const edges = effect.uniforms.get('patchEdge')?.value as number[];
    expect([axes[0]?.x, axes[0]?.y, axes[0]?.z]).toEqual([0, -1, 0]);
    expect(axes[0]?.w, 'tan of the half angle').toBeCloseTo(Math.tan((30 * Math.PI) / 180), 9);
    expect(edges[0], 'the edge softness').toBe(0.5);
    effect.load([make(0.5)]);
    expect(gobos[0]?.x, 'a shaft with no frame clears it').toBe(0);
  });

  it('scales the tint by the shaft’s strength', () => {
    const effect = new LightPatchEffect();
    const colours = effect.uniforms.get('patchColour')?.value as { x: number; y: number; z: number }[];
    effect.load([make(0.5)]);
    const half = colours[0]?.x ?? 0;
    effect.load([make(0.25)]);
    const quarter = colours[0]?.x ?? 0;
    expect(half / quarter).toBeCloseTo(2, 9);
    expect(half).toBeCloseTo(kelvinToLinear(3000)[0] * 0.5, 9);
  });

  it('does nothing, and does not throw, before it has a camera', () => {
    const effect = new LightPatchEffect();
    effect.setSource({ lastChosen: [make(0.5)] });
    expect(() => effect.update()).not.toThrow();
    expect(effect.uniforms.get('patchCount')?.value).toBe(0);
  });

  it('reads the shafts from its source each frame, and uses none without one', () => {
    const effect = new LightPatchEffect();
    effect.setSource({ lastChosen: [make(0.5)] });
    effect.mainCamera = { updateMatrixWorld: () => undefined, projectionMatrixInverse: new Matrix4(), matrixWorld: new Matrix4() } as unknown as PerspectiveCamera;
    effect.update();
    expect(effect.uniforms.get('patchCount')?.value).toBe(1);
    effect.setSource(null);
    effect.update();
    expect(effect.uniforms.get('patchCount')?.value).toBe(0);
  });
});

describe('which way a surface faces the lamp', () => {
  it('takes only the floor share of the light facing directly away, and all of it facing the lamp', () => {
    expect(patchFacing(-1)).toBeCloseTo(PATCH_FACING.floor, 9);
    expect(patchFacing(0)).toBeCloseTo(PATCH_FACING.floor, 9);
    expect(patchFacing(PATCH_FACING.ramp)).toBeCloseTo(1, 9);
    expect(patchFacing(1)).toBeCloseTo(1, 9);
  });

  it('rises monotonically between, strictly inside (floor, 1)', () => {
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) {
      const value = patchFacing((step / 20) * PATCH_FACING.ramp);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
    const half = patchFacing(PATCH_FACING.ramp / 2);
    expect(half).toBeGreaterThan(PATCH_FACING.floor);
    expect(half).toBeLessThan(1);
  });

  const cone = { apex: [0, 2, 0] as P, axis: [0, -1, 0] as P, spec: { lamp: 'x', halfAngleDeg: 30, length: 3, opacity: 0.1, falloff: 1, edge: 0.5, kelvin: 3000, breakup: 0, patch: 0.5 } satisfies LightConeSpec };
  const point: P = [0, 1, 0];

  it('lights an upward-facing floor under a lamp fully and a downward-facing one by the floor share', () => {
    const lit = patchBoost(cone, point, [0, 1, 0]);
    const away = patchBoost(cone, point, [0, -1, 0]);
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeCloseTo(patchBoost(cone, point), 9);
    expect(away).toBeCloseTo(lit * PATCH_FACING.floor, 9);
  });

  it('keeps the light of a patch restrained: a floor that adds light of its own, but only a fraction of a lit surface', () => {
    expect(PATCH_FLOOR).toBeGreaterThan(0.1);
    expect(PATCH_FLOOR).toBeLessThan(0.35);
  });

  it('reads the depth’s derivatives before any early return, so every pixel of a quad reaches them', () => {
    const source = new LightPatchEffect().getFragmentShader();
    const derivatives = source.indexOf('dFdx(point)');
    const early = source.indexOf('depth >= 1.0');
    expect(derivatives).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(-1);
    expect(derivatives).toBeLessThan(early);
  });
});
