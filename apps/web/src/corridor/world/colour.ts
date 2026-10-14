import { Color } from 'three';
import { clamp } from './math.ts';

/** Linear-light RGB triple. Vertex colours and shader uniforms are linear. */
export type Rgb = readonly [number, number, number];

/** A hex colour (sRGB, as written in the art direction) to linear RGB. */
export function linear(hex: string): Rgb {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

export const mulRgb = (c: Rgb, s: number): Rgb => [c[0] * s, c[1] * s, c[2] * s];
export const tintRgb = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Colour temperature to linear RGB, normalised so the largest channel is 1 (Tanner Helland's
 * blackbody fit, valid for 1000..40000 K). The art direction is written in kelvin (sconces
 * 2700, door lamps 3000, desk light 2900, ambient 4300), so the light colours are too.
 */
export function kelvinToLinear(kelvin: number): Rgb {
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const srgb = [r, g, b].map((v) => clamp(v, 0, 255) / 255);
  const lin = srgb.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const peak = Math.max(lin[0] ?? 0, lin[1] ?? 0, lin[2] ?? 0) || 1;
  return [(lin[0] ?? 0) / peak, (lin[1] ?? 0) / peak, (lin[2] ?? 0) / peak];
}
