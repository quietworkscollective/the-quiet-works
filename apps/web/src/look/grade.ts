import { clamp01, luminance, type Rgb } from './colour.ts';

/**
 * The look's grade, as a function on display-referred colour (sRGB-encoded, after tone mapping).
 * It is the one definition: the LUT table is this function sampled on a lattice, so every pipeline
 * that reads the table gives the same picture.
 *
 * What it does, and what it keeps out of:
 *  - Shadows are lifted a little and lean warm, and keep a little more of their colour than they
 *    had. The dark reads as evening shade in an old room, never as crushed black and never as a
 *    drained, cold horror grey. Black itself becomes a warm dark brown. A cool shadow, such as
 *    the Office's teal, is lifted too but is not turned toward brown.
 *  - Nothing above the shadow knee moves. Bone paper (#E6DCC7 family), the Office teal and every
 *    other lit colour pass through untouched, so the lit parts of a warm room are not pushed
 *    further toward orange.
 *
 * This is the full-strength grade. The intensity a profile asks for (0.25 to 0.4) mixes it into
 * the frame, so what the visitor sees is a quarter to two-fifths of what this function does.
 */
export const GRADE = {
  shadow: {
    /** Luma below which shadow treatment starts to fade in, and above which it is gone. */
    from: 0.03,
    to: 0.4,
    /** Offset added to every channel at full shadow weight, sRGB-encoded: the lift that keeps a shadow off black. */
    lift: 0.05,
    /**
     * Extra offset that leans the shadow warm (red over green over blue), applied to neutral and
     * warm colours only: a cool shadow, the Office's teal, is lifted but not turned toward brown.
     */
    warm: [0.05, 0.02, -0.015] as Rgb,
    /** How much more of its colour a shadow keeps: a fraction of the colour it already has, added again. */
    colour: 0.12,
  },
} as const;

/** Hermite step from 0 at `lo` to 1 at `hi`, as in GLSL. */
function smoothstep(lo: number, hi: number, x: number): number {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

/** Full-strength grade of one display-referred colour. Each channel stays in [0, 1]. */
export function gradeColour(c: Rgb): Rgb {
  const { from, to, lift, warm, colour } = GRADE.shadow;
  const luma = luminance(c);
  const weight = 1 - smoothstep(from, to, luma);
  const boost = colour * weight;
  // 1 for neutral and warm colours, falling to 0 as a colour turns cooler than neutral.
  const lean = smoothstep(-0.04, 0, c[0] - c[2]);
  return [
    clamp01(c[0] + (c[0] - luma) * boost + weight * (lift + warm[0] * lean)),
    clamp01(c[1] + (c[1] - luma) * boost + weight * (lift + warm[1] * lean)),
    clamp01(c[2] + (c[2] - luma) * boost + weight * (lift + warm[2] * lean)),
  ];
}

/** The graded colour mixed in at `intensity`: 0 returns the input exactly, 1 the full grade. */
export function applyGrade(c: Rgb, intensity: number): Rgb {
  const g = gradeColour(c);
  return [c[0] + (g[0] - c[0]) * intensity, c[1] + (g[1] - c[1]) * intensity, c[2] + (g[2] - c[2]) * intensity];
}
