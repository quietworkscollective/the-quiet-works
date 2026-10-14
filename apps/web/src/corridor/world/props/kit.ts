import { quad, type UvRule } from '../builder.ts';
import type { Vec3 } from '../math.ts';
import { METAL } from './colours.ts';
import type { Assembly, Channel, Tint } from './parts.ts';

/** Shape recipes shared by several props. All in prop-local metres. */

export interface LoftSample {
  /** Height of this section. */
  y: number;
  /** Half-width along the wall at this height. */
  hw: number;
  /** Front (toward the room) and back faces' z at this height. */
  zf: number;
  zb: number;
}

/**
 * A flat-sided body lofted up through sections: a cricket blade, a shoulder, a tag. Front and
 * back follow the samples; the sides and the end caps are closed, so it is solid from any side.
 */
export function loft(a: Assembly, channel: Channel, samples: readonly LoftSample[], tint?: Tint, x = 0, uv?: UvRule): void {
  a.raw(
    channel,
    tint,
    (b, style) => {
    const at = (s: LoftSample, sx: -1 | 1, front: boolean): Vec3 => [x + sx * s.hw, s.y, front ? s.zf : s.zb];
    for (let i = 0; i + 1 < samples.length; i += 1) {
      const s0 = samples[i];
      const s1 = samples[i + 1];
      if (!s0 || !s1) continue;
      quad(b, at(s0, -1, true), at(s0, 1, true), at(s1, 1, true), at(s1, -1, true), style, [0, 0, 1]);
      quad(b, at(s0, 1, false), at(s0, -1, false), at(s1, -1, false), at(s1, 1, false), style, [0, 0, -1]);
      quad(b, at(s0, -1, false), at(s0, -1, true), at(s1, -1, true), at(s1, -1, false), style, [-1, 0, 0]);
      quad(b, at(s0, 1, true), at(s0, 1, false), at(s1, 1, false), at(s1, 1, true), style, [1, 0, 0]);
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first) quad(b, at(first, -1, false), at(first, 1, false), at(first, 1, true), at(first, -1, true), style, [0, -1, 0]);
    if (last) quad(b, at(last, -1, true), at(last, 1, true), at(last, 1, false), at(last, -1, false), style, [0, 1, 0]);
    },
    uv,
  );
}

/** A round-headed brass screw standing out of a surface facing +z (rotate for other faces). */
export function screw(a: Assembly, at: Vec3, radius = 0.0045, channel: Channel = 'brass', tint: Tint = METAL.brass): void {
  a.cyl(channel, { at: [at[0], at[1], at[2] + 0.0015], rot: [Math.PI / 2, 0, 0] }, radius, radius, 0.003, 10, tint);
}

/** A small brass plate screwed to a wall-facing surface: a hanging plate, a label frame's backing. */
export function brassFrame(a: Assembly, centre: Vec3, size: readonly [number, number], depth: number, bar = 0.0035): void {
  const [cx, cy, cz] = centre;
  const [w, h] = size;
  const tint = METAL.polished;
  a.span('brass', [cx - w / 2, cx + w / 2], [cy - h / 2, cy - h / 2 + bar], [cz, cz + depth], 0, tint);
  a.span('brass', [cx - w / 2, cx + w / 2], [cy + h / 2 - bar, cy + h / 2], [cz, cz + depth], 0, tint);
  a.span('brass', [cx - w / 2, cx - w / 2 + bar], [cy - h / 2 + bar, cy + h / 2 - bar], [cz, cz + depth], 0, tint);
  a.span('brass', [cx + w / 2 - bar, cx + w / 2], [cy - h / 2 + bar, cy + h / 2 - bar], [cz, cz + depth], 0, tint);
}
