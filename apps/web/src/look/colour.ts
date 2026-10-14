/**
 * Colour arithmetic the look stack needs and nothing else: sRGB transfer, colour temperature,
 * CIE Lab and a colour difference. Plain functions on number triples, so the same maths serves a
 * composer pipeline, a node pipeline and the tests, and nothing here touches a renderer.
 */

/** An RGB triple. Whether it is linear or sRGB-encoded is stated where it is used. */
export type Rgb = readonly [number, number, number];

/** Rec. 709 luminance weights (linear light). */
export const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** A `#rrggbb` string to an sRGB-encoded triple in [0, 1]. */
export function hexToSrgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const luminance = (c: Rgb): number => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/**
 * Colour temperature to linear RGB, normalised so the largest channel is 1 (Tanner Helland's
 * blackbody fit, valid for 1000..40000 K). It is the same fit the corridor's lamps use, so a
 * kelvin value in a look profile means the colour it means in the world; a test pins the two
 * together without making this folder import the corridor's code.
 */
export function kelvinToLinear(kelvin: number): Rgb {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const lin = [r, g, b].map((v) => srgbToLinear(Math.min(255, Math.max(0, v)) / 255));
  const peak = Math.max(lin[0] ?? 0, lin[1] ?? 0, lin[2] ?? 0) || 1;
  return [(lin[0] ?? 0) / peak, (lin[1] ?? 0) / peak, (lin[2] ?? 0) / peak];
}

/** sRGB-encoded triple to CIE L*a*b* (D65). */
export function srgbToLab(c: Rgb): Rgb {
  const [r, g, b] = [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two sRGB-encoded colours: about 1 is the smallest visible step. */
export function deltaE(a: Rgb, b: Rgb): number {
  const [la, lb] = [srgbToLab(a), srgbToLab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** Lab chroma, the colourfulness of an sRGB-encoded colour. */
export function chroma(c: Rgb): number {
  const lab = srgbToLab(c);
  return Math.hypot(lab[1], lab[2]);
}
