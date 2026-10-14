import { describe, expect, it } from 'vitest';
import { CORRIDOR_LOOK, OFFICE_LOOK, type LookProfile } from './profiles.ts';
import { chooseTier, detectDevice, MOBILE_MSAA_SAMPLES, MOBILE_SHORT_SIDE, MSAA_PIXEL_LIMIT, planFor } from './tier.ts';

const motion = { reducedMotion: false };
const still = { reducedMotion: true };

describe('tier selection', () => {
  it('bypasses the stack on a software renderer whatever the device', () => {
    expect(chooseTier('lite', 'desktop')).toBe('lite');
    expect(chooseTier('lite', 'mobile')).toBe('lite');
  });

  it('gives a real GPU the tier of its device', () => {
    expect(chooseTier('full', 'desktop')).toBe('desktop');
    expect(chooseTier('full', 'mobile')).toBe('mobile');
  });

  it('calls a coarse-pointer device with a small viewport a phone, and nothing else', () => {
    expect(detectDevice({ coarsePointer: true, width: 412, height: 915 })).toBe('mobile');
    expect(detectDevice({ coarsePointer: true, width: 915, height: 412 })).toBe('mobile');
    expect(detectDevice({ coarsePointer: false, width: 412, height: 915 })).toBe('desktop');
    expect(detectDevice({ coarsePointer: true, width: MOBILE_SHORT_SIDE, height: 1180 })).toBe('desktop');
    expect(detectDevice({ coarsePointer: false, width: 1440, height: 900 })).toBe('desktop');
  });
});

describe('what each tier runs', () => {
  it('runs nothing in the lite tier: no stages, no effects, no environment, no dither', () => {
    const plan = planFor('lite', OFFICE_LOOK, motion);
    expect(plan.stages).toEqual([]);
    expect(plan.effects).toEqual([]);
    expect(plan.environment).toBe(false);
    expect(plan.dither).toBe(false);
    expect(plan.depth).toBe(false);
    expect(plan.atmosphere).toEqual({ heightFog: false, cones: false, dust: false });
  });

  it('runs the mobile tier as scene then finish: tone mapping, grade and dither only', () => {
    const plan = planFor('mobile', OFFICE_LOOK, motion);
    expect(plan.stages).toEqual(['scene', 'finish']);
    expect(plan.effects).toEqual(['tone-mapping', 'lut']);
    expect(plan.dither).toBe(true);
    expect(plan.environment).toBe(true);
  });

  it('gives the mobile tier no contact shadow, vignette, grain, bloom or air, and no depth texture', () => {
    const plan = planFor('mobile', OFFICE_LOOK, motion);
    expect(plan.stages).not.toContain('ao');
    expect(plan.stages).not.toContain('atmosphere');
    for (const effect of ['height-fog', 'bloom', 'vignette', 'grain'] as const) expect(plan.effects).not.toContain(effect);
    expect(plan.atmosphere).toEqual({ heightFog: false, cones: false, dust: false });
    expect(plan.depth).toBe(false);
  });

  it('keeps mobile bloom off unless a space asks for it, and then at reduced resolution', () => {
    expect(planFor('mobile', CORRIDOR_LOOK, motion).effects).not.toContain('bloom');
    const asking: LookProfile = { ...CORRIDOR_LOOK, bloom: { ...CORRIDOR_LOOK.bloom, mobile: { enabled: true, scale: 0.5 } } };
    const plan = planFor('mobile', asking, motion);
    expect(plan.effects).toEqual(['bloom', 'tone-mapping', 'lut']);
    expect(plan.bloomScale).toBe(0.5);
    expect(planFor('desktop', asking, motion).bloomScale).toBe(1);
  });

  it('runs the desktop tier in the briefed order: contact shadow, air, then one finish pass', () => {
    const plan = planFor('desktop', OFFICE_LOOK, motion);
    expect(plan.stages).toEqual(['scene', 'ao', 'atmosphere', 'finish']);
    expect(plan.effects).toEqual(['light-patch', 'height-fog', 'bloom', 'tone-mapping', 'lut', 'vignette', 'grain']);
    expect(plan.dither).toBe(true);
    expect(plan.depth).toBe(true);
    expect(plan.atmosphere).toEqual({ heightFog: true, cones: true, dust: true });
  });

  it('draws the whole finish as one merged pass', () => {
    for (const tier of ['mobile', 'desktop'] as const) {
      expect(planFor(tier, OFFICE_LOOK, motion).stages.filter((s) => s === 'finish')).toHaveLength(1);
    }
  });

  it('applies tone mapping once: exactly one tone-mapping effect in every running tier', () => {
    for (const tier of ['mobile', 'desktop'] as const) {
      expect(planFor(tier, OFFICE_LOOK, motion).effects.filter((e) => e === 'tone-mapping')).toHaveLength(1);
    }
  });

  it('works on the HDR frame before tone mapping and on the display image after it', () => {
    const { effects } = planFor('desktop', OFFICE_LOOK, motion);
    const at = (e: (typeof effects)[number]): number => effects.indexOf(e);
    expect(at('height-fog')).toBeLessThan(at('tone-mapping'));
    expect(at('bloom')).toBeLessThan(at('tone-mapping'));
    expect(at('tone-mapping')).toBeLessThan(at('lut'));
    expect(at('lut')).toBeLessThan(at('vignette'));
    expect(at('vignette')).toBeLessThan(at('grain'));
  });

  it('puts the light a shaft lays on surfaces first among the HDR effects, so the fog veils it', () => {
    const { effects } = planFor('desktop', OFFICE_LOOK, motion);
    expect(effects.indexOf('light-patch')).toBe(0);
    expect(effects.indexOf('light-patch')).toBeLessThan(effects.indexOf('height-fog'));
  });

  it('has no light-patch effect where no shaft carries light, or on a phone', () => {
    expect(planFor('desktop', CORRIDOR_LOOK, motion).effects).not.toContain('light-patch');
    expect(planFor('mobile', OFFICE_LOOK, motion).effects).not.toContain('light-patch');
    const dim: LookProfile = {
      ...OFFICE_LOOK,
      atmosphere: { ...OFFICE_LOOK.atmosphere, cones: { ...OFFICE_LOOK.atmosphere.cones, specs: OFFICE_LOOK.atmosphere.cones.specs.map((s) => ({ ...s, patch: 0 })) } },
    };
    expect(planFor('desktop', dim, motion).effects).not.toContain('light-patch');
  });

  it('turns grain off, and only grain, when the visitor asked for less motion', () => {
    const plan = planFor('desktop', OFFICE_LOOK, still);
    expect(plan.effects).toEqual(['light-patch', 'height-fog', 'bloom', 'tone-mapping', 'lut', 'vignette']);
    expect(plan.stages).toEqual(['scene', 'ao', 'atmosphere', 'finish']);
  });

  it('draws no vignette where the profile asks for none', () => {
    const landing: LookProfile = { ...CORRIDOR_LOOK, vignette: { amount: 0, inner: 0.45 } };
    expect(planFor('desktop', landing, motion).effects).not.toContain('vignette');
  });

  it('drops the grade where the profile asks for none, since an intensity of 0 is the identity', () => {
    const plain: LookProfile = { ...OFFICE_LOOK, lut: { intensity: 0, mobileIntensity: 0 } };
    expect(planFor('desktop', plain, motion).effects).not.toContain('lut');
    expect(planFor('mobile', plain, motion).effects).toEqual(['tone-mapping']);
  });

  it('drops the contact shadow when a profile applies none of it', () => {
    const flat: LookProfile = { ...OFFICE_LOOK, ao: { ...OFFICE_LOOK.ao, intensity: 0 } };
    expect(planFor('desktop', flat, motion).stages).not.toContain('ao');
  });

  it('drops the parts of the air a profile leaves empty, and the depth texture with them', () => {
    const empty: LookProfile = {
      ...OFFICE_LOOK,
      ao: { ...OFFICE_LOOK.ao, intensity: 0 },
      atmosphere: {
        ...OFFICE_LOOK.atmosphere,
        heightFog: [],
        cones: { ...OFFICE_LOOK.atmosphere.cones, specs: [] },
        dust: { ...OFFICE_LOOK.atmosphere.dust, count: 0 },
      },
    };
    const plan = planFor('desktop', empty, motion);
    expect(plan.stages).toEqual(['scene', 'finish']);
    expect(plan.effects).not.toContain('height-fog');
    expect(plan.depth).toBe(false);
  });

  it('keeps the contact shadow, cones and dust off the mobile tier whatever the profile says', () => {
    const plan = planFor('mobile', OFFICE_LOOK, motion);
    expect(plan.atmosphere.cones).toBe(false);
    expect(plan.atmosphere.dust).toBe(false);
    expect(plan.atmosphere.heightFog).toBe(false);
  });

  it('gives a phone fewer samples than a desktop at the same size, to bound memory', () => {
    const pixels = 618 * 1372;
    expect(planFor('mobile', OFFICE_LOOK, { ...motion, pixels }).msaaSamples).toBe(MOBILE_MSAA_SAMPLES);
    expect(planFor('desktop', OFFICE_LOOK, { ...motion, pixels }).msaaSamples).toBeGreaterThan(MOBILE_MSAA_SAMPLES);
  });

  it('halves the multisampling past the pixel limit, to bound memory', () => {
    expect(planFor('desktop', OFFICE_LOOK, { ...motion, pixels: 1440 * 900 }).msaaSamples).toBe(4);
    expect(planFor('desktop', OFFICE_LOOK, { ...motion, pixels: MSAA_PIXEL_LIMIT + 1 }).msaaSamples).toBe(2);
  });
});

describe('how much of the grade each tier mixes in', () => {
  const motion = { reducedMotion: false };

  it('gives a desktop exactly the profile’s intensity and a phone exactly its mobile intensity', () => {
    for (const profile of [CORRIDOR_LOOK, OFFICE_LOOK]) {
      expect(planFor('desktop', profile, motion).lutIntensity).toBe(profile.lut.intensity);
      expect(planFor('mobile', profile, motion).lutIntensity).toBe(profile.lut.mobileIntensity);
    }
    const apart: LookProfile = { ...OFFICE_LOOK, lut: { intensity: 0.31, mobileIntensity: 0.62 } };
    expect(planFor('desktop', apart, motion).lutIntensity).toBe(0.31);
    expect(planFor('mobile', apart, motion).lutIntensity).toBe(0.62);
  });

  it('draws the grade on each tier by that tier’s own intensity: a phone with none asks for none, and so does a desktop', () => {
    const phoneOff: LookProfile = { ...OFFICE_LOOK, lut: { intensity: 0.3, mobileIntensity: 0 } };
    expect(planFor('mobile', phoneOff, motion).effects).not.toContain('lut');
    expect(planFor('desktop', phoneOff, motion).effects).toContain('lut');
    const desktopOff: LookProfile = { ...OFFICE_LOOK, lut: { intensity: 0, mobileIntensity: 0.5 } };
    expect(planFor('desktop', desktopOff, motion).effects).not.toContain('lut');
    expect(planFor('mobile', desktopOff, motion).effects).toContain('lut');
  });

  it('has no grade at all when the stack is bypassed', () => {
    expect(planFor('lite', OFFICE_LOOK, motion).lutIntensity).toBe(0);
  });
});
