import type { Handle } from '../../doorKit.ts';
import { linear, mulRgb } from '../colour.ts';
import { bar, sphere, stud, torus } from '../shapes.ts';
import { bevelOf, span, zFace, type Ctx } from './ctx.ts';
import type { PlanPart } from './plan.ts';
import { nth } from '../math.ts';

/**
 * The five handle types. The turning part goes in `ctx.handle[leaf]`, built about the handle's
 * pivot (the centre of its rose) so the runtime can rotate it; the rose and any plate it sits on
 * are fixed to the leaf. A handle's `dir` is which way it points along the leaf: toward the
 * hinge for a lever, so that turning it down is a rotation about z by `-dir * handleTurn`.
 */

export const HANDLE_IRON = linear('#2b2f31');

export function handleDir(ctx: Ctx, leaf: number): 1 | -1 {
  const l = nth(ctx.plan.leaves, leaf);
  // A lever points toward the hinge: for a hinge on the left (x0 < x1) that is -x.
  return l.hinge === 'left' ? -1 : 1;
}

export function buildHandle(c: Ctx, part: PlanPart, kind: Handle): void {
  const leaf = part.leaf ?? 0;
  const lb = nth(c.leaf, leaf);
  const hb = nth(c.handle, leaf);
  const [hx, hy] = [part.centre[0], part.centre[1]];
  const z = zFace;
  const metal = { colour: c.tints.metal };
  const brassLike = hb.brass;
  const near = c.lod === 'near';
  const dir = handleDir(c, leaf);

  switch (kind) {
    case 'lever': {
      stud(lb.brass, [hx, hy, z + 0.004], 0.027, 0.029, 0.008, near ? 20 : 8, metal);
      stud(brassLike, [hx, hy, z + 0.019], 0.0095, 0.0095, 0.022, 10, metal);
      stud(brassLike, [hx, hy, z + 0.032], 0.017, 0.017, 0.012, 14, metal);
      span(brassLike, [dir > 0 ? hx : hx - 0.145, dir > 0 ? hx + 0.145 : hx], [hy - 0.0105, hy + 0.0105], [z + 0.03, z + 0.048], bevelOf(c, 0.004), metal);
      stud(brassLike, [hx + dir * 0.145, hy, z + 0.039], 0.0105, 0.0105, 0.018, 12, metal);
      break;
    }
    case 'knob': {
      stud(lb.brass, [hx, hy, z + 0.004], 0.03, 0.032, 0.008, near ? 20 : 8, metal);
      stud(brassLike, [hx, hy, z + 0.02], 0.011, 0.012, 0.026, 10, metal);
      sphere(brassLike, { at: [hx, hy, z + 0.05], scale: [1, 1, 0.82] }, 0.031, 12, 8, metal);
      break;
    }
    case 'wheel': {
      stud(lb.iron, [hx, hy, z + 0.01], 0.05, 0.056, 0.02, near ? 20 : 8, { colour: HANDLE_IRON });
      const iron = { colour: mulRgb(HANDLE_IRON, 1.15) };
      stud(hb.iron, [hx, hy, z + 0.036], 0.022, 0.026, 0.032, 12, iron);
      torus(hb.iron, { at: [hx, hy, z + 0.056] }, 0.1, 0.0105, 6, 28, iron);
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const r = 0.052;
        bar(hb.iron, { at: [hx + Math.cos(a) * r, hy + Math.sin(a) * r, z + 0.056], rot: [0, 0, a] }, [0.104, 0.014, 0.014], iron);
      }
      if (c.look.signature === 'leather-grip' && near) {
        // Where a spoke's grip was replaced: a leather wrap round one stretch of the rim, bound with twine.
        const arc = Math.PI / 3.2;
        const start = Math.PI * 0.05;
        const leather = { colour: linear('#4A3322') };
        torus(hb.paint, { at: [hx, hy, z + 0.056], rot: [0, 0, start] }, 0.1, 0.0158, 7, 14, leather, arc);
        for (let k = 0; k <= 4; k += 1) {
          const a = start + (arc * k) / 4;
          torus(hb.paint, { at: [hx, hy, z + 0.056], rot: [0, 0, a] }, 0.1, 0.0166, 5, 3, { colour: linear('#B8A47A') }, 0.045);
        }
      }
      break;
    }
    case 'ring-pull': {
      stud(lb.brass, [hx, hy + 0.01, z + 0.004], 0.04, 0.043, 0.008, near ? 20 : 8, metal);
      stud(brassLike, [hx, hy + 0.012, z + 0.02], 0.007, 0.007, 0.024, 8, metal);
      torus(brassLike, { at: [hx, hy - 0.04, z + 0.034] }, 0.05, 0.0075, 6, near ? 24 : 12, metal);
      break;
    }
    case 'push-plate': {
      span(lb.brass, [hx - 0.05, hx + 0.05], [hy - 0.16, hy + 0.16], [z, z + 0.004], bevelOf(c, 0.002), metal, ['-z']);
      for (const sy of [-0.135, 0.135]) for (const sx of [-0.03, 0.03]) stud(lb.brass, [hx + sx, hy + sy, z + 0.0055], 0.0035, 0.0035, 0.003, 6, metal);
      break;
    }
  }
}
