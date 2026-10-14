import { hexToSrgb, luminance } from '../colour.ts';

/**
 * The air of each space, as data. The founder asked for "multiple layers of darkness and a little
 * bit of smoke so it looks real"; this file says what that means in numbers, so any pipeline (a
 * composer, a node graph, plain materials) can draw it and a test can hold it to the same
 * numbers. Nothing here knows about a renderer.
 *
 * The air is warm and luminous, like sunlit dust in an old library, and never grey or green. The
 * founder's first visitor found the corridor creepy, so every part below is held to that:
 * the haze adds light, the far end of a room is lifted and kept legible, and the darkest value is a
 * small warm tone in the recesses, not a threat.
 *
 * Six parts, each chosen to cost almost nothing:
 *  - three value bands in the darkness, warm-tinted, the darkest of them small;
 *  - height-fog layers: thin, warm, luminous smoke that lies low and hangs under the ceiling;
 *  - a far glow, so the end of a long room reads as warm light and never as a void;
 *  - lamp cones: a faked shaft of light under each lamp, with no shadow map and no ray march;
 *  - slow haze: the density of the air varies, and drifts only while some other frame is drawn;
 *  - dust: a few motes that show only inside a lamp cone.
 */

export type SpaceId = 'corridor' | 'landing' | 'office';

/** One of the three tones of the dark. Luma is sRGB-encoded, 0 black to 1 white. */
export interface DarkBand {
  readonly name: 'deep' | 'mid' | 'penumbra';
  /** The display luma this band is centred on. */
  readonly luma: number;
  /** The hue the band leans toward, so the dark has colour instead of grey. */
  readonly tint: string;
}

export interface DarknessProfile {
  /** Deepest first. Each band is at least 1.8 times the one below it. */
  readonly bands: readonly [DarkBand, DarkBand, DarkBand];
  /** Below this display luma a pixel counts as crushed black. */
  readonly crushedBelow: number;
  /** Pixels under this display luma belong to the darkness; brighter ones are lit. */
  readonly ceiling: number;
  /** The darkest band may hold at most this share of a whole frame: it is a recess, not a room. */
  readonly maxDeepOfFrame: number;
}

/** A layer of thin smoke whose density falls off exponentially with height. */
export interface HeightFogLayer {
  readonly id: string;
  /** World height of the densest plane, in metres. */
  readonly y: number;
  /** `up`: densest at `y` and thinning upward (mist on the floor). `down`: thinning downward (smoke under a ceiling). */
  readonly thins: 'up' | 'down';
  /** The height over which the density falls to 1/e, in metres. */
  readonly scaleHeight: number;
  /** Extinction at `y`, per metre. */
  readonly density: number;
  /** The colour the layer scatters toward the eye. */
  readonly colour: string;
}

/**
 * A frame that cuts a lamp's light into soft bars, as a mullioned window does: a grid of
 * `columns` by `rows` panes of light with bars between them and around the edge. The shaft then
 * has a rectangular section and carries the grid onto the floor and walls it reaches.
 */
export interface GoboSpec {
  readonly columns: number;
  readonly rows: number;
  /** Bar thickness as a fraction of one pane, 0 to 1. */
  readonly bar: number;
  /** How soft the bar edges are, as a fraction of one pane. */
  readonly soft: number;
}

/** The fake volumetric shaft under one kind of lamp. */
export interface LightConeSpec {
  readonly lamp: string;
  readonly halfAngleDeg: number;
  /** Length of the shaft along its axis, in metres. */
  readonly length: number;
  /** Peak additive opacity at the lamp, 0 to 1. */
  readonly opacity: number;
  /** Exponent of the fall-off along the axis: higher gathers the light near the lamp. */
  readonly falloff: number;
  /** 0 is a hard edge, 1 fades from the axis outward. */
  readonly edge: number;
  readonly kelvin: number;
  /** How much a fixed noise breaks the shaft up, 0 to 1. */
  readonly breakup: number;
  /**
   * How much light the shaft puts on the surfaces it reaches, as a fraction of what they already
   * show: a pool on the desk under the lamp, a window's panes on the floor. 0 puts none. The
   * lamps the scenes already light analytically (the corridor's sconces) leave this at 0.
   */
  readonly patch: number;
  /** A frame the light passes through; see `GoboSpec`. */
  readonly gobo?: GoboSpec;
}

export interface Haze {
  /** Fractional variation of the air's density, 0 to 1. */
  readonly amplitude: number;
  /** Size of one patch of denser air, in metres. */
  readonly scale: number;
  /** How fast the patches drift while a frame is being drawn, in metres a second. 0 under reduced motion. */
  readonly drift: number;
}

/**
 * Warm light added to whatever is far away, so a long room never ends in a dark void: the far end
 * stays legible and warm. It is added, not mixed, so the structure that is still visible keeps its
 * contrast. Applied to surfaces between `from` and `to` metres from the eye.
 */
export interface FarGlow {
  readonly from: number;
  readonly to: number;
  /** The colour of the light added at `to`, `#rrggbb`. */
  readonly colour: string;
  /** Linear strength of that light, 0 to 1. */
  readonly strength: number;
}

export interface Dust {
  readonly count: number;
  /** On-screen size of a mote, in CSS pixels. */
  readonly sizePx: readonly [number, number];
  /** Brightness inside a cone at its brightest, 0 to 1. Outside every cone a mote is invisible. */
  readonly brightness: number;
  /** Drift of the motes while a frame is drawn, in metres a second; the air rises a little. */
  readonly drift: number;
  readonly rise: number;
  /** The box, in metres, around the camera inside which motes live. */
  readonly volume: readonly [number, number, number];
}

export interface AtmosphereProfile {
  /** World height of the ceiling the layers hang from, in metres. */
  readonly ceilingY: number;
  readonly darkness: DarknessProfile;
  readonly heightFog: readonly HeightFogLayer[];
  readonly farGlow: FarGlow;
  readonly cones: {
    readonly specs: readonly LightConeSpec[];
    /** The nearest this many cones are drawn; the rest are skipped. */
    readonly maxVisible: number;
  };
  readonly haze: Haze;
  readonly dust: Dust;
  /**
   * What the air may add to a frame. Fog layers and haze are evaluated where the scene is shaded
   * (no draw call); the cones are one instanced draw and the dust one points draw.
   */
  readonly budget: { readonly drawCalls: number; readonly triangles: number };
}

/** Triangles in one cone shell; the cones are instances of a single low-poly cone. */
export const CONE_TRIANGLES = 48;

/**
 * Band tints are the bands' own colours, so each one's luma is the luma its band is centred on. All
 * three lean warm (red over green over blue): the dark is evening shade, not a cold threat.
 */
const DEEP = '#0C0A08';
const MID = '#181511';
const PENUMBRA = '#2E2820';
const DARKNESS: DarknessProfile = {
  bands: [
    { name: 'deep', luma: 0.04, tint: DEEP },
    { name: 'mid', luma: 0.084, tint: MID },
    { name: 'penumbra', luma: 0.16, tint: PENUMBRA },
  ],
  crushedBelow: 0.02,
  ceiling: 0.26,
  maxDeepOfFrame: 0.12,
};

export const ATMOSPHERES: Readonly<Record<SpaceId, AtmosphereProfile>> = {
  // 3.2 m wide, 3.8 m high, 3.6 m bays: a long room of lamps and doors, already warm.
  corridor: {
    ceilingY: 3.8,
    darkness: DARKNESS,
    heightFog: [
      { id: 'floor-mist', y: 0, thins: 'up', scaleHeight: 0.35, density: 0.036, colour: '#8C7556' },
      { id: 'mid-haze', y: 0, thins: 'up', scaleHeight: 2.6, density: 0.0072, colour: '#9A7B4E' },
      { id: 'ceiling-smoke', y: 3.8, thins: 'down', scaleHeight: 0.7, density: 0.03, colour: '#A67C3F' },
    ],
    farGlow: { from: 16, to: 46, colour: '#B08A4E', strength: 0.06 },
    cones: {
      specs: [
        { lamp: 'sconce', halfAngleDeg: 38, length: 2.4, opacity: 0.1, falloff: 1.6, edge: 0.8, kelvin: 2700, breakup: 0.25, patch: 0 },
        { lamp: 'door-lamp', halfAngleDeg: 28, length: 1.8, opacity: 0.12, falloff: 1.4, edge: 0.7, kelvin: 3000, breakup: 0.2, patch: 0 },
      ],
      maxVisible: 10,
    },
    haze: { amplitude: 0.35, scale: 5.5, drift: 0.02 },
    dust: { count: 1500, sizePx: [1, 2.4], brightness: 0.7, drift: 0.012, rise: 0.008, volume: [3, 3.6, 14] },
    budget: { drawCalls: 2, triangles: 10 * CONE_TRIANGLES },
  },
  // 5 m wide, 4.2 m high: the hero lobby. Its edges already darken, so the air is quieter.
  landing: {
    ceilingY: 4.2,
    darkness: DARKNESS,
    heightFog: [
      { id: 'floor-mist', y: 0, thins: 'up', scaleHeight: 0.3, density: 0.03, colour: '#8C7556' },
      { id: 'mid-haze', y: 0, thins: 'up', scaleHeight: 2.4, density: 0.006, colour: '#9A7B4E' },
      { id: 'ceiling-smoke', y: 4.2, thins: 'down', scaleHeight: 0.8, density: 0.024, colour: '#A67C3F' },
    ],
    farGlow: { from: 14, to: 40, colour: '#B08A4E', strength: 0.06 },
    cones: {
      specs: [{ lamp: 'hero-lamp', halfAngleDeg: 34, length: 3.2, opacity: 0.09, falloff: 1.5, edge: 0.85, kelvin: 2900, breakup: 0.2, patch: 0 }],
      maxVisible: 4,
    },
    haze: { amplitude: 0.3, scale: 6, drift: 0.015 },
    dust: { count: 1000, sizePx: [1, 2.2], brightness: 0.65, drift: 0.01, rise: 0.007, volume: [4.6, 4, 8] },
    budget: { drawCalls: 2, triangles: 4 * CONE_TRIANGLES },
  },
  // 8.4 m wide, 5.8 m high, 30 m deep: a large room lit by a desk lamp, two fittings and a window.
  office: {
    ceilingY: 5.8,
    darkness: DARKNESS,
    heightFog: [
      { id: 'floor-mist', y: 0, thins: 'up', scaleHeight: 0.4, density: 0.027, colour: '#8C7556' },
      { id: 'mid-haze', y: 0, thins: 'up', scaleHeight: 3.2, density: 0.006, colour: '#9A7B4E' },
      { id: 'ceiling-smoke', y: 5.8, thins: 'down', scaleHeight: 1.1, density: 0.018, colour: '#A67C3F' },
    ],
    farGlow: { from: 14, to: 34, colour: '#B08A4E', strength: 0.05 },
    cones: {
      specs: [
        // A pool with a hard-ish edge at the shade's rim, as in a library's desk lamps.
        { lamp: 'desk-lamp', halfAngleDeg: 28, length: 1.7, opacity: 0.14, falloff: 1.3, edge: 0.25, kelvin: 2900, breakup: 0.15, patch: 0.45 },
        { lamp: 'ceiling-fitting', halfAngleDeg: 40, length: 4.2, opacity: 0.06, falloff: 1.7, edge: 0.9, kelvin: 3000, breakup: 0.3, patch: 0.15 },
        // The speaking window's frame, projected into the room as bars of daylight on the floor and the wall.
        { lamp: 'window', halfAngleDeg: 24, length: 5.5, opacity: 0.05, falloff: 0.9, edge: 0.35, kelvin: 5000, breakup: 0.3, patch: 0.7, gobo: { columns: 4, rows: 3, bar: 0.22, soft: 0.09 } },
      ],
      maxVisible: 6,
    },
    haze: { amplitude: 0.35, scale: 7, drift: 0.02 },
    dust: { count: 800, sizePx: [1, 2.4], brightness: 0.75, drift: 0.01, rise: 0.008, volume: [8, 5.4, 9] },
    budget: { drawCalls: 2, triangles: 6 * CONE_TRIANGLES },
  },
};

/**
 * Optical depth of the height-fog layers along a horizontal ray at height `eyeY` and length
 * `distance` metres. Transmittance is exp(-depth), so a depth of 0.1 is a 10% veil.
 */
export function opticalDepth(layers: readonly HeightFogLayer[], eyeY: number, distance: number): number {
  let depth = 0;
  for (const layer of layers) {
    const away = layer.thins === 'up' ? eyeY - layer.y : layer.y - eyeY;
    const density = away <= 0 ? layer.density : layer.density * Math.exp(-away / layer.scaleHeight);
    depth += density * distance;
  }
  return depth;
}

export interface DarknessShares {
  /** Share of all pixels that belong to the darkness. */
  readonly dark: number;
  /** Share of all pixels that fall in the darkest band, crushed black included. */
  readonly deepOfFrame: number;
  /** Share of all pixels that are crushed black. */
  readonly crushed: number;
  /** Share of the dark pixels in each band. */
  readonly bands: { readonly deep: number; readonly mid: number; readonly penumbra: number };
}

/**
 * Where the dark pixels of a frame sit. Feed it the display luma (0 to 1) of every pixel of a
 * captured frame. The band edges are the geometric means between neighbouring band centres,
 * because the eye reads dark values by ratio, not by difference.
 */
export function darknessShares(lumas: ArrayLike<number>, darkness: DarknessProfile): DarknessShares {
  const [deep, mid, penumbra] = darkness.bands;
  const lowEdge = Math.sqrt(deep.luma * mid.luma);
  const highEdge = Math.sqrt(mid.luma * penumbra.luma);
  let dark = 0;
  let crushed = 0;
  let inDeep = 0;
  let inMid = 0;
  let inPenumbra = 0;
  for (let i = 0; i < lumas.length; i += 1) {
    const l = lumas[i] ?? 0;
    if (l >= darkness.ceiling) continue;
    dark += 1;
    if (l < darkness.crushedBelow) crushed += 1;
    if (l < lowEdge) inDeep += 1;
    else if (l < highEdge) inMid += 1;
    else inPenumbra += 1;
  }
  const total = lumas.length || 1;
  const of = dark || 1;
  return {
    dark: dark / total,
    deepOfFrame: inDeep / total,
    crushed: crushed / total,
    bands: { deep: inDeep / of, mid: inMid / of, penumbra: inPenumbra / of },
  };
}

/**
 * True when the darkness has all three bands occupied, almost no crushed black, and a darkest band
 * that stays small. The mid and penumbra bands must each hold a real share of the dark pixels;
 * the darkest only has to exist (a recess has a little of it) and may not fill the frame.
 */
export function hasLayeredDarkness(
  shares: DarknessShares,
  darkness: DarknessProfile,
  minBandShare = 0.08,
  minDeepShare = 0.02,
  maxCrushed = 0.02,
): boolean {
  const { deep, mid, penumbra } = shares.bands;
  return (
    shares.dark > 0 &&
    deep >= minDeepShare &&
    Math.min(mid, penumbra) >= minBandShare &&
    shares.crushed <= maxCrushed &&
    shares.deepOfFrame <= darkness.maxDeepOfFrame
  );
}

/** The display luma of a `#rrggbb` colour: Rec. 709 weights on the encoded values, as a frame's pixels give. */
export function displayLuma(hex: string): number {
  return luminance(hexToSrgb(hex));
}
