import { describe, expect, it } from 'vitest';
import { TIMING } from '../../../timing.ts';
import { HEAVY_FALL_BOUNCE, heavyFall, noise1, overshootOf, springResponse } from './anim.ts';
import { IMPRINT_STEP_MM, IMPRINT_WIDTH_MM, imprintAlpha, imprintPlacement, isSmeared } from './canvasArt.ts';
import { facingYaw } from './context.ts';
import { OVERLOAD_SCRIPT } from './director.ts';
import { LATCH_POP, OPEN_ANGLE, overloadHatchAngle } from './hatchMotion.ts';
import { RAMP, ramp } from './machineLayout.ts';

describe('imprint placement', () => {
  const mmPerPx = 0.36 / 1024 / 0.001; // millimetres per canvas pixel on the 0.36 m form
  const place = (n: number) => {
    const p = imprintPlacement(n);
    return { x: p.dx * mmPerPx, y: p.dy * mmPerPx, rotation: p.rotation };
  };

  it('is a pure function of the stamp index', () => {
    for (let n = 1; n <= 40; n += 1) expect(imprintPlacement(n)).toEqual(imprintPlacement(n));
    // ...including when asked out of order or after other stamps were computed.
    expect(imprintPlacement(7)).toEqual(imprintPlacement(7));
    const late = imprintPlacement(30);
    imprintPlacement(2);
    expect(imprintPlacement(30)).toEqual(late);
  });

  it('turns each impression by 3 to 5 degrees, either way', () => {
    for (let n = 1; n <= 60; n += 1) {
      const deg = (Math.abs(place(n).rotation) * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(deg).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it('separates consecutive centres by 10 to 15% of the stamp width (and at least 17 mm)', () => {
    for (let n = 1; n < 60; n += 1) {
      const a = place(n);
      const b = place(n + 1);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      expect(d).toBeGreaterThanOrEqual(IMPRINT_STEP_MM.min - 1e-6);
      expect(d).toBeLessThanOrEqual(IMPRINT_STEP_MM.max + 1e-6);
      expect(d / IMPRINT_WIDTH_MM).toBeGreaterThanOrEqual(0.1);
      expect(d / IMPRINT_WIDTH_MM).toBeLessThanOrEqual(0.15 + 1e-6);
    }
  });

  it('keeps the pile inside the FOR OFFICE USE ONLY box and near the rubber', () => {
    for (let n = 1; n <= 200; n += 1) {
      const p = place(n);
      // Box half-extents minus the half-size of an impression (144 x 84 mm); the rubber margin is 10 mm.
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(17.5 + 1e-6);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(26);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(18);
    }
  });

  it('puts the first five impressions in five distinct places', () => {
    const pts = [1, 2, 3, 4, 5].map(place);
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const a = pts[i];
        const b = pts[j];
        if (a && b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(8);
      }
    }
  });
});

describe('imprint ageing and smear', () => {
  it('lets only the overload stamp (the fifth) smear', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(isSmeared)).toEqual([false, false, false, false, true, false, false, false]);
  });

  it('dries each older impression a little, but keeps three clearly readable after five stamps', () => {
    const readable = [0, 1, 2, 3, 4].map(imprintAlpha);
    for (let i = 1; i < readable.length; i += 1) expect(readable[i]).toBeLessThan(readable[i - 1] ?? 0);
    expect(readable.filter((a) => a >= 0.7)).toHaveLength(3);
    expect(imprintAlpha(100)).toBeGreaterThan(0); // never vanishes entirely
  });
});

describe('facing the viewer', () => {
  it('turns a sheet so its text is upright to the camera', () => {
    // Looking straight down -z: no turn. Looking along +x: a quarter turn.
    expect(facingYaw({ forwardX: 0, forwardZ: -1 })).toBeCloseTo(0, 6);
    expect(facingYaw({ forwardX: 1, forwardZ: 0 })).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('hatch hesitation then fall', () => {
  const lead = TIMING.overloadLatchLeadMs;

  it('pops, shivers and sags for the hesitation without ever jumping', () => {
    let maxStep = 0;
    let peak = 0;
    let previous = overloadHatchAngle(0);
    expect(previous).toBe(0);
    for (let ms = 1; ms <= OVERLOAD_SCRIPT.hangMs; ms += 1) {
      const a = overloadHatchAngle(ms);
      maxStep = Math.max(maxStep, Math.abs(a - previous));
      peak = Math.max(peak, a);
      previous = a;
    }
    expect(peak).toBeGreaterThan(LATCH_POP); // the pop is there
    expect(peak).toBeLessThan(0.055); // and it stays a small movement, about 3 degrees at most
    expect(maxStep).toBeLessThan(0.005); // no millisecond-to-millisecond jump: nothing flashes
  });

  it('shows a visible shiver: the angle wobbles on top of the pop', () => {
    let reversals = 0;
    let previous = overloadHatchAngle(36);
    let direction = 0;
    for (let ms = 37; ms <= 200; ms += 1) {
      const a = overloadHatchAngle(ms);
      const dir = Math.sign(a - previous);
      if (dir !== 0 && direction !== 0 && dir !== direction) reversals += 1;
      if (dir !== 0) direction = dir;
      previous = a;
    }
    expect(reversals).toBeGreaterThanOrEqual(2);
  });

  it('is continuous where the hesitation hands over to the fall, then makes first contact on the latch lead', () => {
    expect(Math.abs(overloadHatchAngle(OVERLOAD_SCRIPT.hangMs + 1) - overloadHatchAngle(OVERLOAD_SCRIPT.hangMs))).toBeLessThan(0.004);
    expect(overloadHatchAngle(lead)).toBeCloseTo(OPEN_ANGLE, 6);
    expect(overloadHatchAngle(lead - 40)).toBeLessThan(OPEN_ANGLE);
  });

  it('rebounds once off the stop and is open and still afterwards', () => {
    const fallMs = lead - OVERLOAD_SCRIPT.hangMs;
    let minAfter = OPEN_ANGLE;
    for (let ms = lead + 1; ms <= lead + HEAVY_FALL_BOUNCE * fallMs; ms += 1) {
      minAfter = Math.min(minAfter, overloadHatchAngle(ms));
    }
    expect(minAfter).toBeLessThan(OPEN_ANGLE * 0.96);
    expect(minAfter).toBeGreaterThan(OPEN_ANGLE * 0.9);
    for (let ms = lead + HEAVY_FALL_BOUNCE * fallMs + 1; ms <= lead + 2000; ms += 25) {
      expect(overloadHatchAngle(ms)).toBe(OPEN_ANGLE);
    }
  });
});

describe('stamp return spring', () => {
  it('overshoots by the damping-ratio prediction and settles', () => {
    const zeta = 0.685;
    const omega = 13.4;
    let peak = 0;
    for (let ms = 0; ms <= 2000; ms += 1) peak = Math.max(peak, springResponse(ms / 1000, zeta, omega));
    expect(peak - 1).toBeCloseTo(overshootOf(zeta), 3);
    expect(Math.abs(springResponse(2, zeta, omega) - 1)).toBeLessThan(1e-3);
  });
});

describe('hatch fall', () => {
  it('makes first contact at t = 1, rebounds once, and ends at rest', () => {
    expect(heavyFall(0)).toBe(0);
    expect(heavyFall(1)).toBe(1);
    expect(heavyFall(0.5)).toBeLessThan(0.5); // accelerating: ease-in
    let minRebound = 1;
    let reboundSteps = 0;
    let previous = 1;
    for (let i = 1001; i <= 1000 + Math.round(HEAVY_FALL_BOUNCE * 1000); i += 1) {
      const f = heavyFall(i / 1000);
      minRebound = Math.min(minRebound, f);
      if (f > previous + 1e-9 && previous < 1) reboundSteps += 1;
      previous = f;
    }
    expect(minRebound).toBeCloseTo(0.93, 2);
    expect(reboundSteps).toBeGreaterThan(0); // it comes back down after the rebound: one bounce
    for (let t = 1 + HEAVY_FALL_BOUNCE; t <= 2; t += 0.01) expect(heavyFall(t)).toBe(1);
  });
});

describe('noise', () => {
  it('stays within [-1, 1]', () => {
    for (let i = 0; i < 500; i += 1) expect(Math.abs(noise1(i * 0.37, 3))).toBeLessThanOrEqual(1);
  });
});

describe('hatch ramp', () => {
  it('slopes down from the hinge to just above the desk', () => {
    expect(ramp(RAMP.z0 - 0.1)).toBe(RAMP.y0);
    expect(ramp(RAMP.z1)).toBeGreaterThan(0);
    expect(ramp(RAMP.z1)).toBeLessThan(RAMP.y0);
    expect(ramp(RAMP.z1 + 0.01)).toBe(0);
  });
});
