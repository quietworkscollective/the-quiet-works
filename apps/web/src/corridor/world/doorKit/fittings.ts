import { quad } from '../builder.ts';
import { ART, ART_ATLAS, NUMERAL_4, NUMERAL_ATLAS, quadUvs, uvRect } from '../artLayout.ts';
import { linear, mulRgb, type Rgb } from '../colour.ts';
import { cylinder, sphere, stud, torus } from '../shapes.ts';
import { bevelOf, span, zFace, type Ctx } from './ctx.ts';
import { HANDLE_IRON } from './handles.ts';
import type { PlanPart } from './plan.ts';
import { nth } from '../math.ts';

/**
 * Small fittings that make a door this door: the shared plaque, the Office's service hatch, the
 * door lamp, a brass 4, a doormat, a letterbox, a pressure gauge, rows of rivets.
 */

/** Bone enamel: the plaque's edge and body colour. */
const BONE = linear('#DDD5C8');

/** The shared plaque: 280 x 90 mm, bone enamel with four screws, hung at 1.55 m. Text from the atlas. */
export function buildPlaque(c: Ctx, part: PlanPart): void {
  const text = c.spec.plaque?.text;
  if (!text) return;
  const lb = nth(c.leaf, part.leaf ?? 0);
  const [cx, cy] = [part.centre[0], part.centre[1]];
  const [w, h] = part.size;
  const depth = 0.008;
  span(lb.paint, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], [zFace, zFace + depth], bevelOf(c, 0.0015), { colour: BONE }, ['-z', '+z']);
  const zf = zFace + depth + 0.0002;
  quad(lb.plaque, [cx - w / 2, cy - h / 2, zf], [cx + w / 2, cy - h / 2, zf], [cx + w / 2, cy + h / 2, zf], [cx - w / 2, cy + h / 2, zf], undefined, [0, 0, 1], quadUvs(c.plaques.uv(text)));
  if (c.lod === 'near') {
    const metal = { colour: c.tints.metal };
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) stud(lb.brass, [cx + sx * (w / 2 - 0.011), cy + sy * (h / 2 - 0.011), zf + 0.0012], 0.0036, 0.0036, 0.0024, 8, metal);
  }
}

/** The Office's closed service hatch: a steel rim, a recessed teal panel, two hinges and a pull. */
export function buildHatch(c: Ctx, part: PlanPart): void {
  const lb = nth(c.leaf, part.leaf ?? 0);
  const [cx, cy] = [part.centre[0], part.centre[1]];
  const [w, h] = part.size;
  const rim = 0.02;
  const steel = { colour: c.tints.secondary };
  // The rim is a frame of four bars standing proud of the leaf; the panel sits inside it.
  const rz: readonly [number, number] = [zFace, zFace + 0.014];
  const rb = bevelOf(c, 0.002);
  span(lb.paint, [cx - w / 2 - rim, cx + w / 2 + rim], [cy + h / 2, cy + h / 2 + rim], rz, rb, steel, ['-z']);
  span(lb.paint, [cx - w / 2 - rim, cx + w / 2 + rim], [cy - h / 2 - rim, cy - h / 2], rz, rb, steel, ['-z']);
  span(lb.paint, [cx - w / 2 - rim, cx - w / 2], [cy - h / 2, cy + h / 2], rz, rb, steel, ['-z']);
  span(lb.paint, [cx + w / 2, cx + w / 2 + rim], [cy - h / 2, cy + h / 2], rz, rb, steel, ['-z']);
  span(lb.enamel, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], [zFace, zFace + 0.0085], bevelOf(c, 0.002), { colour: c.tints.primary }, ['-z']);
  if (c.lod !== 'near') return;
  const metal = { colour: c.tints.metal };
  // A plain brass pull on the top edge and two hinge knuckles on the left.
  span(lb.brass, [cx - 0.035, cx + 0.035], [cy + h / 2 - 0.03, cy + h / 2 - 0.016], [zFace + 0.0115, zFace + 0.0265], 0.002, metal);
  for (const sy of [-0.045, 0.045]) cylinder(lb.iron, { at: [cx - w / 2 - 0.004, cy + sy, zFace + 0.0135] }, 0.0065, 0.0065, 0.035, 10, { colour: HANDLE_IRON });
  // Two small screws at the lower corners, the only sign the hatch is ever opened.
  for (const sx of [-1, 1]) stud(lb.brass, [cx + sx * (w / 2 - 0.02), cy - h / 2 + 0.018, zFace + 0.0118], 0.0042, 0.0042, 0.0024, 8, metal);
}

/** A door lamp's glass, 3000 K and over-bright so it reads as the source after tone mapping. */
const LAMP_GLASS: Rgb = [3.4, 2.15, 0.9];

/** A caged bulkhead lamp on the wall above the door. */
export function buildLamp(c: Ctx, part: PlanPart): void {
  const b = c.fixed;
  const [cx, cy] = [part.centre[0], part.centre[1]];
  // Door lamps (3000 K) are lit on every lamp door; only an open chamber leaks light at its seam.
  const metal = { colour: c.tints.metal };
  // Backplate on the wall, then a short collar, the glass dome and a guard ring.
  stud(b.brass, [cx, cy, 0.01], 0.092, 0.095, 0.02, 24, metal);
  stud(b.brass, [cx, cy, 0.034], 0.068, 0.076, 0.028, 20, metal);
  sphere(b.lamp, { at: [cx, cy, 0.046], rot: [Math.PI / 2, 0, 0] }, 0.066, 20, 8, { colour: LAMP_GLASS }, Math.PI * 2, Math.PI / 2);
  torus(b.brass, { at: [cx, cy, 0.05] }, 0.068, 0.0055, 5, 24, metal);
  if (c.lod === 'near') {
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI;
      torus(b.brass, { at: [cx, cy, 0.046], rot: [0, a, 0] }, 0.07, 0.0022, 4, 16, metal, Math.PI);
    }
  }
}

/** A brass numeral on the leaf. The glyph is lettering on the numeral atlas, cut out by alpha. */
export function buildNumeral4(c: Ctx, part: PlanPart): void {
  const lb = nth(c.leaf, part.leaf ?? 0);
  const [cx, cy] = [part.centre[0], 1.55];
  const [w, h] = part.size;
  const z = zFace + 0.004;
  // A shallow backing so the numeral stands off the paint and catches a thin edge of shadow.
  quad(
    lb.numeral,
    [cx - w / 2, cy - h / 2, z],
    [cx + w / 2, cy - h / 2, z],
    [cx + w / 2, cy + h / 2, z],
    [cx - w / 2, cy + h / 2, z],
    { colour: c.tints.metal },
    [0, 0, 1],
    quadUvs(uvRect(NUMERAL_4, NUMERAL_ATLAS.width, NUMERAL_ATLAS.height)),
  );
}

/** A coir mat on the corridor floor in front of the door. */
export function buildDoormat(c: Ctx, part: PlanPart): void {
  const [cx, cz] = [part.centre[0], part.centre[2]];
  const [w, d] = part.size;
  span(c.fixed.rubber, [cx - w / 2, cx + w / 2], [0, 0.013], [cz - d / 2, cz + d / 2], bevelOf(c, 0.003), { uv: { du: 0.17 } }, ['-y']);
  // A woven border a shade darker than the field.
  const m = 0.035;
  const edge = { colour: [0.55, 0.55, 0.55] as Rgb, uv: { du: 0.4 } };
  span(c.fixed.rubber, [cx - w / 2 + m, cx + w / 2 - m], [0.0128, 0.0136], [cz - d / 2 + m, cz - d / 2 + m + 0.012], 0, edge, ['-y']);
  span(c.fixed.rubber, [cx - w / 2 + m, cx + w / 2 - m], [0.0128, 0.0136], [cz + d / 2 - m - 0.012, cz + d / 2 - m], 0, edge, ['-y']);
  span(c.fixed.rubber, [cx - w / 2 + m, cx - w / 2 + m + 0.012], [0.0128, 0.0136], [cz - d / 2 + m, cz + d / 2 - m], 0, edge, ['-y']);
  span(c.fixed.rubber, [cx + w / 2 - m - 0.012, cx + w / 2 - m], [0.0128, 0.0136], [cz - d / 2 + m, cz + d / 2 - m], 0, edge, ['-y']);
}

/** A brass letterbox plate with its flap, set in the leaf at hand height. */
export function buildLetterbox(c: Ctx, part: PlanPart): void {
  const lb = nth(c.leaf, part.leaf ?? 0);
  const [cx, cy] = [part.centre[0], part.centre[1]];
  const [w, h] = part.size;
  const metal = { colour: c.tints.metal };
  span(lb.brass, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], [zFace, zFace + 0.007], bevelOf(c, 0.0025), metal, ['-z']);
  // The slot, dark, and the flap's lip over it.
  span(lb.iron, [cx - w / 2 + 0.03, cx + w / 2 - 0.03], [cy - 0.011, cy + 0.011], [zFace + 0.0068, zFace + 0.0074], 0, { colour: [0.012, 0.012, 0.012] });
  span(lb.brass, [cx - w / 2 + 0.024, cx + w / 2 - 0.024], [cy + 0.011, cy + 0.02], [zFace + 0.007, zFace + 0.0135], bevelOf(c, 0.002), metal);
}

/** A brass-rimmed pressure gauge on a short pipe stub, on the wall beside the door. */
export function buildGauge(c: Ctx, part: PlanPart): void {
  const b = c.fixed;
  const [cx, cy] = [part.centre[0], part.centre[1]];
  const r = part.size[0] / 2;
  const metal = { colour: c.tints.metal };
  const iron = { colour: HANDLE_IRON };
  // Pipe stub from the wall, a union nut, the gauge body and its rim.
  stud(b.iron, [cx, cy - 0.03, 0.05], 0.014, 0.014, 0.1, 10, iron);
  stud(b.brass, [cx, cy - 0.02, 0.1], 0.02, 0.02, 0.018, 8, metal);
  stud(b.brass, [cx, cy + 0.02, 0.125], r + 0.004, r + 0.004, 0.032, 28, metal);
  torus(b.brass, { at: [cx, cy + 0.02, 0.142] }, r, 0.0048, 6, 28, metal);
  const dial = { colour: [1, 1, 1] as Rgb };
  const z = 0.1425;
  const rect = uvRect(ART.gauge, ART_ATLAS.width, ART_ATLAS.height);
  quad(b.art, [cx - r, cy + 0.02 - r, z], [cx + r, cy + 0.02 - r, z], [cx + r, cy + 0.02 + r, z], [cx - r, cy + 0.02 + r, z], dial, [0, 0, 1], quadUvs(rect));
  // Over the dial: a faint sheen of glass (the glass itself is clear, so the dial reads).
  quad(b.pane, [cx - r, cy + 0.02 - r, 0.1435], [cx + r, cy + 0.02 - r, 0.1435], [cx + r, cy + 0.02 + r, 0.1435], [cx - r, cy + 0.02 + r, 0.1435], undefined, [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // And the plant-room pipe it is plumbed to: a vertical run on the wall, floor to ceiling, held off by brackets.
  const x = cx + 0.12;
  cylinder(b.iron, { at: [x, 1.9, 0.06] }, 0.03, 0.03, 3.8, 14, { colour: mulRgb(HANDLE_IRON, 1.1) });
  for (const y of [0.3, 1.2, 2.1, 3.0]) {
    span(b.iron, [x - 0.036, x + 0.036], [y - 0.012, y + 0.012], [0, 0.07], 0.002, iron);
    cylinder(b.iron, { at: [x, y, 0.06], rot: [Math.PI / 2, 0, 0] }, 0.036, 0.036, 0.012, 14, iron);
  }
}

/** Domed rivets along the edge and seams of an iron door. */
export function buildRivets(c: Ctx, part: PlanPart): void {
  if (c.lod !== 'near') return;
  const leaf = nth(c.plan.leaves, part.leaf ?? 0);
  const lb = nth(c.leaf, part.leaf ?? 0);
  const x0 = Math.min(leaf.x0, leaf.x1) + 0.045;
  const x1 = Math.max(leaf.x0, leaf.x1) - 0.045;
  const y0 = 0.012 + 0.045;
  const y1 = 0.012 + leaf.height - 0.045;
  const style = { colour: mulRgb(c.tints.primary, 1.25) };
  const dome = (x: number, y: number): void => sphere(lb.paint, { at: [x, y, zFace], rot: [Math.PI / 2, 0, 0] }, 0.0115, 6, 3, style, Math.PI * 2, Math.PI / 2);
  const pitch = 0.092;
  const along = (a: number, b: number, f: (t: number) => void): void => {
    const n = Math.max(1, Math.round(Math.abs(b - a) / pitch));
    for (let i = 0; i <= n; i += 1) f(a + ((b - a) * i) / n);
  };
  along(x0, x1, (x) => {
    dome(x, y0);
    dome(x, y1);
  });
  along(y0 + pitch, y1 - pitch, (y) => {
    dome(x0, y);
    dome(x1, y);
  });
  // Two horizontal plate seams: a raised strap with its own rivets.
  for (const f of [0.31, 0.64]) {
    const y = y0 + (y1 - y0) * f;
    span(lb.paint, [x0 - 0.02, x1 + 0.02], [y - 0.03, y + 0.03], [zFace, zFace + 0.004], 0.002, { colour: mulRgb(c.tints.primary, 0.9) }, ['-z']);
    along(x0 + 0.02, x1 - 0.02, (x) => dome(x, y));
  }
}
