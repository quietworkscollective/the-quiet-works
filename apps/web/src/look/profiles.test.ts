import { describe, expect, it } from 'vitest';
import { APARTMENT_LOOK, CORRIDOR_LOOK, EXCHANGE_LOOK, LANDING_LOOK, LOOK_PROFILES, OFFICE_LOOK, type LookProfile } from './profiles.ts';
import { hexToSrgb } from './colour.ts';
import { opticalDepth } from './atmosphere/data.ts';
import { AO_PRESETS, EXPOSURE, inRange, LOOK_RANGES } from './ranges.ts';

const ALL: readonly LookProfile[] = [CORRIDOR_LOOK, LANDING_LOOK, OFFICE_LOOK, EXCHANGE_LOOK, APARTMENT_LOOK];

describe('look profiles', () => {
  it('keys each profile by the space it belongs to', () => {
    for (const [key, profile] of Object.entries(LOOK_PROFILES)) expect(profile.space).toBe(key);
    expect(Object.keys(LOOK_PROFILES).sort()).toEqual(['apartment', 'corridor', 'exchange', 'landing', 'office']);
  });

  for (const profile of ALL) {
    describe(profile.space, () => {
      it('keeps the contact shadow inside consult 6: radius and intensity, on a cheap preset', () => {
        expect(inRange(profile.ao.radius, LOOK_RANGES.aoRadius), `radius ${profile.ao.radius}`).toBe(true);
        expect(inRange(profile.ao.intensity, LOOK_RANGES.aoIntensity), `intensity ${profile.ao.intensity}`).toBe(true);
        expect(Object.keys(AO_PRESETS), `preset ${profile.ao.quality}`).toContain(profile.ao.quality);
        expect(profile.ao.distanceFalloff).toBeGreaterThan(0);
        expect(profile.ao.distanceFalloff).toBeLessThanOrEqual(2);
      });

      it('tints the contact shadow warm, so it is shade and never a cold black', () => {
        const [r, g, b] = hexToSrgb(profile.ao.tint);
        expect(r).toBeGreaterThan(g);
        expect(g).toBeGreaterThan(b);
      });

      it('keeps the vignette and grain at the subtle end of their ranges', () => {
        expect(profile.grain.amount).toBeLessThanOrEqual(0.04);
        expect(profile.vignette.amount).toBeLessThanOrEqual(0.06);
      });

      it('keeps bloom inside consult 6, with a threshold only a lamp core can cross', () => {
        const strengthRange = profile.space === 'exchange' ? [0.1, 0.15] as const : LOOK_RANGES.bloomStrength;
        expect(inRange(profile.bloom.strength, strengthRange), `strength ${profile.bloom.strength}`).toBe(true);
        expect(inRange(profile.bloom.radius, LOOK_RANGES.bloomRadius), `radius ${profile.bloom.radius}`).toBe(true);
        expect(inRange(profile.bloom.threshold, LOOK_RANGES.bloomThreshold), `threshold ${profile.bloom.threshold}`).toBe(true);
      });

      it('keeps the corridor bloom at two mip levels so the finished frame stays within 125 draws', () => {
        if (profile.space === 'corridor') expect(profile.bloom.levels).toBe(2);
      });

      it('keeps the range’s own floor above 1, so no setting can make a lit surface bloom', () => {
        expect(LOOK_RANGES.bloomThreshold[0]).toBeGreaterThan(1);
      });

      it('puts the bloom threshold above anything a lit surface reaches and, where lamp glass is known, below it', () => {
        expect(profile.bloom.threshold, 'a lit surface is under 1').toBeGreaterThan(1);
        // Measured on real frames: the corridor's and the landing's lamp glass reads 1.2 to 1.3 in HDR.
        if (profile.space === 'corridor' || profile.space === 'landing') {
          expect(profile.bloom.threshold, 'sconce glass must cross it').toBeLessThan(1.2);
        }
      });

      it('keeps the phone’s grade at least as strong as the desktop’s and inside its own range', () => {
        expect(inRange(profile.lut.mobileIntensity, LOOK_RANGES.mobileLutIntensity), `mobile lut ${profile.lut.mobileIntensity}`).toBe(true);
        expect(profile.lut.mobileIntensity).toBeGreaterThanOrEqual(profile.lut.intensity);
      });

      it('keeps the grade, grain and environment inside consult 6', () => {
        expect(inRange(profile.lut.intensity, LOOK_RANGES.lutIntensity), `lut ${profile.lut.intensity}`).toBe(true);
        expect(inRange(profile.grain.amount, LOOK_RANGES.grainAmount), `grain ${profile.grain.amount}`).toBe(true);
        expect(inRange(profile.environment.intensity, LOOK_RANGES.environmentIntensity), `environment ${profile.environment.intensity}`).toBe(true);
        expect(inRange(profile.environment.ceilingKelvin, LOOK_RANGES.ceilingKelvin), `ceiling ${profile.environment.ceilingKelvin} K`).toBe(true);
      });

      it('holds exposure at 1', () => {
        expect(profile.exposure).toBe(EXPOSURE);
        expect(EXPOSURE).toBe(1);
      });

      it('keeps the window patch dimmer than a ceiling patch and near neutral in colour', () => {
        expect(profile.environment.windowWeight).toBeGreaterThan(0);
        expect(profile.environment.windowWeight).toBeLessThan(1);
        expect(profile.environment.windowKelvin).toBeGreaterThanOrEqual(6000);
        expect(profile.environment.windowKelvin).toBeLessThanOrEqual(7000);
      });
    });
  }

  it('gives the corridor and the office a 5 to 8 per cent vignette', () => {
    for (const profile of [CORRIDOR_LOOK, OFFICE_LOOK]) {
      expect(inRange(profile.vignette.amount, LOOK_RANGES.vignetteAmount), `${profile.space} vignette ${profile.vignette.amount}`).toBe(true);
    }
  });

  it('never puts a vignette on the landing, whose hero already darkens its edges', () => {
    expect(LANDING_LOOK.vignette.amount).toBe(0);
  });

  it('gives Exchange a narrow bloom threshold and restrained lamp-core strength', () => {
    expect(EXCHANGE_LOOK.bloom.threshold).toBe(1.2);
    expect(EXCHANGE_LOOK.bloom.strength).toBe(0.10);
    expect(EXCHANGE_LOOK.bloom.levels).toBe(2);
    expect(EXCHANGE_LOOK.environment.intensity).toBe(0.25);
  });

  it('uses the measured upper phone-grade limit to keep the Exchange gallery out of void', () => {
    expect(EXCHANGE_LOOK.lut.mobileIntensity).toBeGreaterThanOrEqual(0.8);
  });
});

describe('the phone’s grade, measured on Pixel 7 frames', () => {
  it('keeps the dark Office near 0.7, where its deepest band stops filling the frame', () => {
    expect(OFFICE_LOOK.lut.mobileIntensity).toBeGreaterThanOrEqual(0.6);
  });

  it('leaves the already-lifted corridor and landing at their desktop number: more takes their deepest band away', () => {
    expect(CORRIDOR_LOOK.lut.mobileIntensity).toBeLessThanOrEqual(0.4);
    expect(LANDING_LOOK.lut.mobileIntensity).toBeLessThanOrEqual(0.4);
  });
});

describe('the Apartment air', () => {
  it('keeps white-grey air a faint 2 to 4 per cent veil over 10 metres', () => {
    const depth = opticalDepth(APARTMENT_LOOK.atmosphere.heightFog, 1.62, 10);
    const veil = 1 - Math.exp(-depth);
    expect(veil).toBeGreaterThanOrEqual(0.02);
    expect(veil).toBeLessThanOrEqual(0.04);
  });

  it('lets the visible warm window and kitchen sources carry restrained shafts', () => {
    const specs = APARTMENT_LOOK.atmosphere.cones.specs;
    expect(specs).toHaveLength(2);
    expect(specs.every(({ opacity }) => opacity <= 0.02)).toBe(true);
    const window = specs.find(({ lamp }) => lamp === 'window');
    expect(window?.kelvin).toBeGreaterThanOrEqual(2700);
    expect(window?.kelvin).toBeLessThanOrEqual(3500);
  });
});
