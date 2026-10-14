import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';
import { clamp01 } from '../colour.ts';

/**
 * The vignette as a function of where a pixel sits in the frame. `amount` is the fraction of light
 * lost at the corners (the profile's 5 to 8%); `inner` is the radius, 0 at the centre to 1 at a
 * corner, where the fall-off begins. The shader below is this function in GLSL, and a test holds
 * the two to the same corner and centre values.
 */
export function vignetteFactor(u: number, v: number, amount: number, inner: number): number {
  const r = Math.hypot(u * 2 - 1, v * 2 - 1) * Math.SQRT1_2;
  const t = clamp01((r - inner) / (1 - inner));
  const smooth = t * t * (3 - 2 * t);
  return 1 - amount * smooth * smooth;
}

const FRAGMENT = /* glsl */ `
uniform float amount;
uniform float inner;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	float r = length(uv * 2.0 - 1.0) * 0.70710678;
	float t = smoothstep(inner, 1.0, r);
	// Light, not code values: the effect works in linear light, so 6% means 6% of the light.
	outputColor = vec4(inputColor.rgb * (1.0 - amount * t * t), inputColor.a);
}
`;

/** Darkens the corners by `amount` of the light, in linear light, after the grade. */
export class VignetteEffect extends Effect {
  private readonly u: { amount: Uniform<number>; inner: Uniform<number> };

  constructor(amount: number, inner: number) {
    const u = { amount: new Uniform(amount), inner: new Uniform(inner) };
    super('LookVignetteEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>(Object.entries(u)),
    });
    this.u = u;
  }

  get amount(): number {
    return this.u.amount.value;
  }

  set amount(value: number) {
    this.u.amount.value = value;
  }

  get inner(): number {
    return this.u.inner.value;
  }

  set inner(value: number) {
    this.u.inner.value = value;
  }
}
