import { BlendFunction, Effect } from 'postprocessing';
import { SRGBColorSpace, Uniform } from 'three';

/**
 * PCG hash on 32-bit unsigned integers, as in the shader below. Integer arithmetic, so a pixel's
 * grain depends only on its coordinates and the seed: no precision drift, no dependence on how
 * long the page has been open.
 */
export function pcg(value: number): number {
  const state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/** One pixel's grain: three independent channel values in [-0.5, 0.5). `y` counts from the bottom, as gl_FragCoord does. */
export function grainSample(x: number, y: number, seed: number): [number, number, number] {
  const h = pcg((x + pcg((y + pcg(seed)) >>> 0)) >>> 0);
  const h1 = pcg(h);
  const h2 = pcg(h1);
  const h3 = pcg(h2);
  const scale = 1 / 4294967295;
  return [h1 * scale - 0.5, h2 * scale - 0.5, h3 * scale - 0.5];
}

const FRAGMENT = /* glsl */ `
uniform float amount;
uniform float seed;

uint pcg(uint v) {
	uint state = v * 747796405u + 2891336453u;
	uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
	return (word >> 22u) ^ word;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	uvec2 p = uvec2(gl_FragCoord.xy);
	uint h = pcg(p.x + pcg(p.y + pcg(uint(seed))));
	uint h1 = pcg(h);
	uint h2 = pcg(h1);
	uint h3 = pcg(h2);
	vec3 n = vec3(float(h1), float(h2), float(h3)) * (1.0 / 4294967295.0) - 0.5;
	// Multiplicative: a black stays black, so the grain cannot lift the dark the grade opens up.
	outputColor = vec4(inputColor.rgb * (1.0 + n * amount), inputColor.a);
}
`;

/**
 * Colour film grain on the display image. It is frozen: the pattern depends on the pixel and on
 * `seed`, and the seed only changes when the stack is told a frame is being drawn, so an idle
 * view holds still and the effect never asks for a frame. `amount` is the peak-to-peak variation
 * of each channel as a fraction of its value.
 */
export class GrainEffect extends Effect {
  private readonly u: { amount: Uniform<number>; seed: Uniform<number> };

  constructor(amount: number) {
    const u = { amount: new Uniform(amount), seed: new Uniform(0) };
    super('LookGrainEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>(Object.entries(u)),
    });
    this.u = u;
    // The amplitude is defined on the display image, as the film pass it replaces was.
    this.inputColorSpace = SRGBColorSpace;
  }

  get amount(): number {
    return this.u.amount.value;
  }

  set amount(value: number) {
    this.u.amount.value = value;
  }

  get seed(): number {
    return this.u.seed.value;
  }

  set seed(value: number) {
    this.u.seed.value = value;
  }
}
