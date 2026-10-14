import { describe, expect, it } from 'vitest';
import { ATMOSPHERES, CONE_TRIANGLES, darknessShares, displayLuma, hasLayeredDarkness, opticalDepth, type SpaceId } from './data.ts';
import { hexToSrgb } from '../colour.ts';

const spaces = Object.keys(ATMOSPHERES) as SpaceId[];

/** Standing eye height in both the corridor and the Office, in metres. */
const EYE_HEIGHT = 1.62;

/** A frame, as a list of display lumas, with the given count of pixels at each luma. */
function frame(parts: readonly (readonly [luma: number, count: number])[]): Float32Array {
  const out: number[] = [];
  for (const [luma, count] of parts) for (let i = 0; i < count; i += 1) out.push(luma);
  return Float32Array.from(out);
}

describe('three value bands in the darkness', () => {
  for (const space of spaces) {
    const { darkness } = ATMOSPHERES[space];

    it(`${space}: keeps three bands, each at least 1.8 times the one below`, () => {
      const [deep, mid, penumbra] = darkness.bands;
      expect(deep.name).toBe('deep');
      expect(mid.name).toBe('mid');
      expect(penumbra.name).toBe('penumbra');
      expect(mid.luma / deep.luma).toBeGreaterThanOrEqual(1.8);
      expect(penumbra.luma / mid.luma).toBeGreaterThanOrEqual(1.8);
    });

    it(`${space}: keeps even the deepest band clear of crushed black and under the lit ceiling`, () => {
      const [deep, , penumbra] = darkness.bands;
      expect(deep.luma).toBeGreaterThanOrEqual(darkness.crushedBelow * 2);
      expect(penumbra.luma * 1.4).toBeLessThanOrEqual(darkness.ceiling);
    });

    it(`${space}: leans every band warm, red over green over blue, so the dark is evening shade and not a cold threat`, () => {
      for (const band of darkness.bands) {
        const [r, g, b] = hexToSrgb(band.tint);
        expect(r, `${band.name} ${band.tint}`).toBeGreaterThan(g);
        expect(g).toBeGreaterThanOrEqual(b);
        expect(r).toBeGreaterThan(b);
      }
    });

    it(`${space}: draws the crushed-black line high enough to mean something`, () => {
      expect(darkness.crushedBelow).toBeGreaterThanOrEqual(0.015);
    });

    it(`${space}: keeps the darkest band a recess: a small share of any frame`, () => {
      expect(darkness.maxDeepOfFrame).toBeGreaterThan(0);
      expect(darkness.maxDeepOfFrame).toBeLessThanOrEqual(0.15);
    });

    it(`${space}: tints each band to the luma it is centred on`, () => {
      for (const band of darkness.bands) {
        expect(Math.abs(displayLuma(band.tint) - band.luma) / band.luma, `${band.name} ${band.tint}`).toBeLessThan(0.1);
      }
    });
  }
});

describe('measuring a frame for layered darkness', () => {
  const { darkness } = ATMOSPHERES.office;

  it('finds all three bands in a frame that has them', () => {
    const shares = darknessShares(
      frame([[0.045, 300], [0.085, 300], [0.15, 300], [0.2, 100], [0.7, 4000]]),
      darkness,
    );
    expect(shares.bands.deep).toBeGreaterThan(0.2);
    expect(shares.bands.mid).toBeGreaterThan(0.2);
    expect(shares.bands.penumbra).toBeGreaterThan(0.2);
    expect(hasLayeredDarkness(shares, darkness)).toBe(true);
  });

  it('accepts a darkest band that is only a recess: a few per cent of the dark, a sliver of the frame', () => {
    const shares = darknessShares(frame([[0.045, 60], [0.085, 400], [0.15, 600], [0.2, 100], [0.7, 4000]]), darkness);
    expect(shares.bands.deep).toBeLessThan(0.08);
    expect(shares.bands.deep).toBeGreaterThanOrEqual(0.02);
    expect(hasLayeredDarkness(shares, darkness)).toBe(true);
  });

  it('rejects a frame with no darkest band at all: its darkness is only the lifted tones', () => {
    const shares = darknessShares(frame([[0.085, 400], [0.15, 600], [0.7, 4000]]), darkness);
    expect(shares.bands.deep).toBe(0);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('rejects a frame whose darkness is one flat black', () => {
    const shares = darknessShares(frame([[0.0, 3000], [0.7, 4000]]), darkness);
    expect(shares.crushed).toBeGreaterThan(0.4);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('rejects a frame whose darkness is one tone, even a lifted one', () => {
    const shares = darknessShares(frame([[0.085, 3000], [0.7, 4000]]), darkness);
    expect(shares.bands.mid).toBeCloseTo(1, 6);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('rejects a frame with layers but a patch of crushed black', () => {
    const shares = darknessShares(frame([[0.0, 600], [0.045, 300], [0.085, 300], [0.15, 300], [0.7, 4000]]), darkness);
    expect(shares.bands.deep).toBeGreaterThan(0.08);
    expect(shares.crushed).toBeGreaterThan(0.02);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('rejects a frame whose darkest band fills it, even with every band present and no crushed black', () => {
    const shares = darknessShares(frame([[0.045, 3000], [0.085, 500], [0.15, 500], [0.7, 2000]]), darkness);
    expect(shares.bands.deep).toBeGreaterThan(0.5);
    expect(shares.crushed).toBe(0);
    expect(shares.deepOfFrame).toBeGreaterThan(darkness.maxDeepOfFrame);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('rejects a frame with plenty of one band and a sliver of the other', () => {
    const thinPenumbra = darknessShares(frame([[0.045, 300], [0.085, 900], [0.15, 10], [0.7, 8790]]), darkness);
    expect(thinPenumbra.bands.mid).toBeGreaterThan(0.5);
    expect(thinPenumbra.bands.penumbra).toBeLessThan(0.08);
    expect(hasLayeredDarkness(thinPenumbra, darkness)).toBe(false);
    const thinMid = darknessShares(frame([[0.045, 300], [0.085, 10], [0.15, 900], [0.7, 8790]]), darkness);
    expect(thinMid.bands.penumbra).toBeGreaterThan(0.5);
    expect(thinMid.bands.mid).toBeLessThan(0.08);
    expect(hasLayeredDarkness(thinMid, darkness)).toBe(false);
  });

  it('rejects crushed black on its own account: a few per cent of the frame, with every band present and the darkest band small', () => {
    const shares = darknessShares(frame([[0.0, 300], [0.045, 300], [0.085, 400], [0.15, 400], [0.7, 8600]]), darkness);
    expect(shares.crushed).toBeGreaterThan(0.02);
    expect(shares.deepOfFrame, 'the darkest band alone would not reject it').toBeLessThanOrEqual(darkness.maxDeepOfFrame);
    expect(shares.bands.mid).toBeGreaterThanOrEqual(0.08);
    expect(shares.bands.penumbra).toBeGreaterThanOrEqual(0.08);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
  });

  it('never calls a frame with no darkness layered, whatever shares the caller asks for', () => {
    const lit = darknessShares(frame([[0.8, 100]]), darkness);
    expect(hasLayeredDarkness(lit, darkness, 0, 0, 1)).toBe(false);
    expect(hasLayeredDarkness(darknessShares([], darkness), darkness, 0, 0, 1)).toBe(false);
  });

  it('counts a fully lit frame as having no darkness, and does not divide by zero', () => {
    const shares = darknessShares(frame([[0.8, 100]]), darkness);
    expect(shares.dark).toBe(0);
    expect(Object.values(shares.bands).every(Number.isFinite), 'no band share is NaN').toBe(true);
    expect(hasLayeredDarkness(shares, darkness)).toBe(false);
    const empty = darknessShares([], darkness);
    expect(empty.dark).toBe(0);
    expect(empty.crushed).toBe(0);
    expect(Object.values(empty.bands).every(Number.isFinite)).toBe(true);
  });
});

describe('a little bit of smoke', () => {
  for (const space of spaces) {
    const atmosphere = ATMOSPHERES[space];

    it(`${space}: veils a 10 m view at eye height by a noticeable but small amount`, () => {
      const depth = opticalDepth(atmosphere.heightFog, EYE_HEIGHT, 10);
      const veil = 1 - Math.exp(-depth);
      expect(veil, 'at least a 2% veil').toBeGreaterThan(0.02);
      expect(veil, 'no more than a 20% veil').toBeLessThan(0.2);
    });

    it(`${space}: makes the smoke warm and luminous like sunlit dust, never grey or green`, () => {
      for (const layer of atmosphere.heightFog) {
        const [r, g, b] = hexToSrgb(layer.colour);
        expect(r, layer.id).toBeGreaterThanOrEqual(g);
        expect(g, `${layer.id} is not green`).toBeGreaterThanOrEqual(b);
        expect((r - b) / r, `${layer.id} is warm enough to read as gold`).toBeGreaterThan(0.2);
        expect(displayLuma(layer.colour), `${layer.id} adds light`).toBeGreaterThan(0.3);
      }
    });

    it(`${space}: lifts the far end with warm light so a long room never ends in a void`, () => {
      const glow = atmosphere.farGlow;
      expect(glow.from).toBeLessThan(glow.to);
      expect(glow.to).toBeLessThanOrEqual(60);
      expect(glow.strength).toBeGreaterThan(0.02);
      expect(glow.strength).toBeLessThanOrEqual(0.2);
      const [r, g, b] = hexToSrgb(glow.colour);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
      expect(displayLuma(glow.colour)).toBeGreaterThan(0.4);
    });

    it(`${space}: lies low and hangs under the ceiling, inside the room`, () => {
      expect(atmosphere.heightFog.some((l) => l.thins === 'up' && l.y === 0)).toBe(true);
      for (const layer of atmosphere.heightFog) {
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeLessThanOrEqual(atmosphere.ceilingY);
        expect(layer.density).toBeGreaterThan(0);
        expect(layer.scaleHeight).toBeGreaterThan(0);
        if (layer.thins === 'down') expect(layer.y).toBe(atmosphere.ceilingY);
      }
      expect(atmosphere.heightFog.some((l) => l.thins === 'down')).toBe(true);
    });
  }

  it('is thicker near the floor than at the eye, and thicker near the ceiling than at the eye', () => {
    const layers = ATMOSPHERES.corridor.heightFog;
    const low = opticalDepth(layers, 0.2, 10);
    const eye = opticalDepth(layers, EYE_HEIGHT, 10);
    const high = opticalDepth(layers, 3.6, 10);
    expect(low).toBeGreaterThan(eye);
    expect(high).toBeGreaterThan(eye);
  });
});

describe('lamp cones and dust', () => {
  it('lets the Office’s window carry its frame onto the floor and its desk lamp a pool with a firm edge', () => {
    const specs = ATMOSPHERES.office.cones.specs;
    const window = specs.find((s) => s.lamp === 'window');
    const desk = specs.find((s) => s.lamp === 'desk-lamp');
    expect(window?.gobo, 'the window has a frame').toBeDefined();
    expect(window?.patch).toBeGreaterThan(0.3);
    expect(desk?.patch).toBeGreaterThan(0.2);
    expect(desk?.edge, 'a hard-ish edge at the shade’s rim').toBeLessThanOrEqual(0.4);
  });

  it('leaves the corridor’s sconces to the analytic lamps that already light the walls', () => {
    for (const cone of ATMOSPHERES.corridor.cones.specs) expect(cone.patch).toBe(0);
  });

  for (const space of spaces) {
    const { cones, dust, haze, budget } = ATMOSPHERES[space];

    it(`${space}: keeps each cone a veil, not a wall, warm, and a window neutral-to-warm`, () => {
      for (const cone of cones.specs) {
        expect(cone.opacity).toBeGreaterThan(0);
        expect(cone.opacity, cone.lamp).toBeLessThanOrEqual(0.2);
        expect(cone.halfAngleDeg).toBeGreaterThan(5);
        expect(cone.halfAngleDeg).toBeLessThan(60);
        expect(cone.length).toBeGreaterThan(0);
        // A window is daylight: neutral to warm (a low sun), never the cold blue that reads as creepy.
        if (cone.lamp === 'window') {
          expect(cone.kelvin).toBeGreaterThanOrEqual(4000);
          expect(cone.kelvin).toBeLessThanOrEqual(5600);
        }
        else {
          expect(cone.kelvin, cone.lamp).toBeGreaterThanOrEqual(2700);
          expect(cone.kelvin, cone.lamp).toBeLessThanOrEqual(3200);
        }
      }
    });

    it(`${space}: keeps each shaft’s patch strength and frame in range`, () => {
      for (const cone of cones.specs) {
        expect(cone.patch, cone.lamp).toBeGreaterThanOrEqual(0);
        expect(cone.patch, cone.lamp).toBeLessThanOrEqual(1);
        if (cone.gobo) {
          expect(Number.isInteger(cone.gobo.columns) && cone.gobo.columns >= 1, `${cone.lamp} columns`).toBe(true);
          expect(Number.isInteger(cone.gobo.rows) && cone.gobo.rows >= 1, `${cone.lamp} rows`).toBe(true);
          expect(cone.gobo.bar, `${cone.lamp} bar`).toBeGreaterThan(0);
          expect(cone.gobo.bar).toBeLessThan(0.5);
          expect(cone.gobo.soft).toBeGreaterThan(0);
          expect(cone.patch, 'a frame with no light on the surfaces shows nothing').toBeGreaterThan(0);
        }
      }
    });

    it(`${space}: keeps dust to a few motes of a pixel or two, a lot of them so that some are always in a shaft`, () => {
      expect(dust.count).toBeGreaterThan(0);
      expect(dust.count).toBeLessThanOrEqual(2000);
      expect(dust.sizePx[0]).toBeGreaterThanOrEqual(1);
      expect(dust.sizePx[1]).toBeLessThanOrEqual(3);
      expect(dust.brightness).toBeLessThanOrEqual(1);
    });

    it(`${space}: moves the haze and dust slowly, under a few centimetres a second`, () => {
      expect(haze.drift).toBeGreaterThan(0);
      expect(haze.drift).toBeLessThanOrEqual(0.05);
      expect(dust.drift).toBeLessThanOrEqual(0.05);
      expect(dust.rise).toBeLessThanOrEqual(0.05);
    });

    it(`${space}: adds at most two draw calls, and the triangles of the cones it shows`, () => {
      expect(budget.drawCalls).toBeLessThanOrEqual(2);
      expect(budget.triangles).toBe(cones.maxVisible * CONE_TRIANGLES);
      expect(budget.triangles).toBeLessThanOrEqual(1000);
    });
  }
});
