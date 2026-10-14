import type { CanvasTexture } from 'three';
import type { Rect } from '../artLayout.ts';
import { MARK_CELLS, MARK_TEXT, MARKS_ATLAS, type MarksLayout, STENCIL_ADVANCE } from '../marksLayout.ts';
import { clamp, mulberry32 } from '../math.ts';
import { context2d, createCanvas, FONT_MONO, makeTexture, TileNoise } from './canvas.ts';

/**
 * The marks atlas: masks for everything that is applied to a door's surface rather than built
 * into it. Chips and flakes where paint has failed, scuffs and polish where hands and feet go,
 * dust on a ledge, the ghost of a sign that was taken down, carved borders, and stencilled
 * lettering. Each is white (or grey where it carries relief) with alpha; the colour of the paint
 * or substrate is the vertex colour of the quad that uses it, so one atlas dresses every door.
 *
 * Seeded and drawn once at start-up; nothing is fetched.
 */

type Ctx = CanvasRenderingContext2D;

/** An irregular blob: a ring of radii perturbed by noise, for flakes, stains and chips. */
function blobPath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rough: number, rng: () => number, points = 22): void {
  ctx.beginPath();
  const phase = rng() * Math.PI * 2;
  const wob = [rng(), rng(), rng()];
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + rough * ((wob[0] ?? 0) * Math.sin(a * 2 + phase) + (wob[1] ?? 0) * Math.sin(a * 3 + phase * 1.7) + (wob[2] ?? 0) * Math.sin(a * 5 + phase * 0.6) + (rng() - 0.5) * 0.5);
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function withCell(ctx: Ctx, r: Rect, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x, r.y);
  draw();
  ctx.restore();
}

/** Soft radial glow: polish where a hand has been, or a halo of grime. */
function paintPolish(ctx: Ctx, r: Rect): void {
  withCell(ctx, r, () => {
    const g = ctx.createRadialGradient(r.w / 2, r.h / 2, 0, r.w / 2, r.h / 2, r.w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.w, r.h);
  });
}

/** A scuff: dense short strokes at a slight slant, fading off at the ends, as boots leave on a kick plate. */
function paintScuff(ctx: Ctx, r: Rect, rng: () => number, slant: number): void {
  withCell(ctx, r, () => {
    for (let i = 0; i < 46; i += 1) {
      const y = rng() * r.h;
      const x = rng() * r.w;
      const len = 30 + rng() * 120;
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.32})`;
      ctx.lineWidth = 0.8 + rng() * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + len * slant + (rng() - 0.5) * 6);
      ctx.stroke();
    }
    // Fade the edges so a scuff never ends in a visible rectangle.
    const fade = ctx.createLinearGradient(0, 0, r.w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.18, 'rgba(0,0,0,0)');
    fade.addColorStop(0.82, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, r.w, r.h);
    const vfade = ctx.createLinearGradient(0, 0, 0, r.h);
    vfade.addColorStop(0, 'rgba(0,0,0,1)');
    vfade.addColorStop(0.25, 'rgba(0,0,0,0)');
    vfade.addColorStop(0.75, 'rgba(0,0,0,0)');
    vfade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = vfade;
    ctx.fillRect(0, 0, r.w, r.h);
  });
}

/** Dust settled along the back of a ledge: dense at the bottom edge, thinning upward, with clumps. */
function paintDust(ctx: Ctx, r: Rect, rng: () => number): void {
  withCell(ctx, r, () => {
    const noise = new TileNoise(16, rng);
    const img = ctx.createImageData(r.w, r.h);
    for (let y = 0; y < r.h; y += 1) {
      for (let x = 0; x < r.w; x += 1) {
        const along = noise.at(x / r.w, 0.2) * 0.7 + noise.at((x / r.w) * 3, 0.6) * 0.3;
        const depth = 1 - y / r.h;
        const a = clamp(depth ** 1.6 * (0.45 + along * 0.8) - rng() * 0.12, 0, 1);
        const i = (y * r.w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    // putImageData ignores the clip and the transform: it must be given the cell's own origin.
    ctx.putImageData(img, r.x, r.y);
  });
}

/** A water run: a thin vertical streak that wavers, wider at the head and breaking up toward the foot. */
function paintDrip(ctx: Ctx, r: Rect, rng: () => number): void {
  withCell(ctx, r, () => {
    const g = ctx.createLinearGradient(0, 0, 0, r.h);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    let x = r.w / 2;
    const half = (y: number) => 2.5 + (1 - y / r.h) * 7;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let y = 0; y <= r.h; y += 8) {
      x += (rng() - 0.5) * 3;
      x = clamp(x, 10, r.w - 10);
      left.push([x - half(y), y]);
      right.push([x + half(y), y]);
    }
    ctx.moveTo(...(left[0] ?? [0, 0]));
    for (const p of left) ctx.lineTo(...p);
    for (const p of right.reverse()) ctx.lineTo(...p);
    ctx.closePath();
    ctx.fill();
  });
}

/** A stain: a broad irregular patch with a darker tide line at its edge, as damp leaves. */
function paintStain(ctx: Ctx, r: Rect, rng: () => number): void {
  withCell(ctx, r, () => {
    blobPath(ctx, r.w / 2, r.h / 2, r.w * 0.38, r.h * 0.36, 0.34, rng, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

/** An angular flake outline: straight edges with uneven reach, as paint lifts along its own cracks. */
function flakePath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rng: () => number, sides: number): void {
  ctx.beginPath();
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < sides; i += 1) {
    const a = phase + (i / sides) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const k = 0.55 + rng() * 0.6;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * One lifted flake. Grey carries relief, so that tinted by a substrate colour it reads as paint
 * that has come away: a pale body, a dark shadow inside the upper-left edges where the film
 * stands proud of what it uncovered, and a thin bright lip along the lower-right.
 */
function flake(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rng: () => number, sides = 7): void {
  flakePath(ctx, cx, cy, rx, ry, rng, sides);
  ctx.fillStyle = 'rgba(210,210,210,1)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.translate(2.6, 2.6);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(34,34,34,0.92)';
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(1.3, 1.3);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
}

function paintChip(ctx: Ctx, r: Rect, rng: () => number, variant: number): void {
  withCell(ctx, r, () => {
    switch (variant) {
      case 0: // a single small flake
        flake(ctx, 64, 64, 36, 30, rng, 6);
        break;
      case 1: // a larger, longer flake
        flake(ctx, 64, 62, 54, 26, rng, 7);
        break;
      case 2: // a cluster of three
        flake(ctx, 38, 42, 22, 18, rng, 6);
        flake(ctx, 86, 50, 26, 20, rng, 7);
        flake(ctx, 60, 92, 22, 16, rng, 5);
        break;
      case 3: // a long thin strip of lifted film
        flake(ctx, 64, 64, 60, 11, rng, 6);
        break;
      case 4: // pits: scattered tiny losses
        for (let i = 0; i < 18; i += 1) flake(ctx, 12 + rng() * 104, 12 + rng() * 104, 3 + rng() * 5, 3 + rng() * 4, rng, 5);
        break;
      default: {
        // A corner loss with one straight side, where a blow took the arris.
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(116, 10);
        for (let i = 0; i < 6; i += 1) ctx.lineTo(116 - i * 17 + (rng() - 0.5) * 10, 10 + i * 17 + (rng() - 0.5) * 12);
        ctx.lineTo(10, 116);
        ctx.closePath();
        ctx.fillStyle = 'rgba(210,210,210,1)';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.translate(2.6, 2.6);
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(34,34,34,0.92)';
        ctx.stroke();
        ctx.restore();
      }
    }
    // Grain through the exposed body: faint dark lines along u.
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 12; i += 1) {
      ctx.strokeStyle = `rgba(60,60,60,${0.08 + rng() * 0.14})`;
      ctx.lineWidth = 0.8 + rng();
      const y = rng() * r.h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(r.w * 0.3, y + (rng() - 0.5) * 8, r.w * 0.7, y + (rng() - 0.5) * 8, r.w, y + (rng() - 0.5) * 6);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** Worn edges: a band whose inner margin is ragged and stepped, laid along a rail or stile where paint has gone. */
function paintEdge(ctx: Ctx, r: Rect, rng: () => number, corner: boolean): void {
  withCell(ctx, r, () => {
    ctx.beginPath();
    if (!corner) {
      ctx.moveTo(0, 0);
      ctx.lineTo(r.w, 0);
      // A stepped, angular inner margin rather than a wobble: paint comes away in plates.
      let x = r.w;
      while (x > 0) {
        const step = 6 + rng() * 14;
        const y = 12 + rng() * 38 * (0.35 + 0.65 * Math.sin((x / r.w) * Math.PI));
        ctx.lineTo(x, y);
        x -= step;
        ctx.lineTo(Math.max(0, x), y + (rng() - 0.5) * 10);
      }
      ctx.lineTo(0, 0);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(r.w, 0);
      for (let i = 0; i <= 8; i += 1) ctx.lineTo(r.w - 22 - rng() * 36, i * 14);
      for (let i = 8; i >= 0; i -= 1) ctx.lineTo(i * 14, r.h * 0.5 + rng() * 34);
      ctx.lineTo(0, 0);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(210,210,210,1)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.translate(0, -3);
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(34,34,34,0.9)';
    ctx.stroke();
    ctx.restore();
  });
}

/** The ghost of a notice or sign taken down: a clean rectangle with torn corners and tape ghosts. */
function paintResidue(ctx: Ctx, r: Rect, rng: () => number, variant: number): void {
  withCell(ctx, r, () => {
    const m = 16;
    ctx.beginPath();
    const torn = (a: number, b: number): number => a + (rng() - 0.5) * b;
    ctx.moveTo(torn(m, 8), torn(m, 8));
    ctx.lineTo(torn(r.w - m, 6), torn(m, 6));
    ctx.lineTo(torn(r.w - m, 6), torn(r.h - m, 6));
    ctx.lineTo(torn(m, 8), torn(r.h - m, 8));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    // Brown adhesive at the edges and four tape ghosts at the corners.
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = 5;
    ctx.stroke();
    for (const [x, y] of [[m, m], [r.w - m, m], [m, r.h - m], [r.w - m, r.h - m]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((variant === 0 ? 38 : -52) * Math.PI) / 180 + (rng() - 0.5) * 0.25);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-24, -9, 48, 18);
      ctx.restore();
    }
  });
}

/** The carefully filled outline of a removed fitting: an outline only, never a solid. */
function paintFilled(ctx: Ctx, r: Rect, rng: () => number): void {
  withCell(ctx, r, () => {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 7;
    // A handle plate: a rounded rectangle with a round rose at its centre and two screw holes.
    const x = r.w / 2;
    const y = r.h / 2;
    ctx.beginPath();
    ctx.roundRect(x - 34, y - 78, 68, 156, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + 4, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    for (const dy of [-56, 62]) {
      ctx.beginPath();
      ctx.arc(x, y + dy, 4.2 + rng(), 0, Math.PI * 2);
      ctx.fill();
    }
    // The long ghost of a lever, filled and sanded flush.
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 2, 96, 15, 7);
    ctx.stroke();
  });
}

/** Carved border: a shallow guilloche, groove dark and the lit edge bright, so it reads as relief. */
function paintBorder(ctx: Ctx, r: Rect, corner: boolean): void {
  withCell(ctx, r, () => {
    const groove = 'rgba(14,10,8,0.82)';
    const lit = 'rgba(255,244,224,0.55)';
    const stroke = (dx: number, dy: number, colour: string, fn: () => void): void => {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 3.4;
      fn();
      ctx.restore();
    };
    const straight = (): void => {
      // Two parallel rules with a repeating stepped-key pattern between them.
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(r.w, 10);
      ctx.moveTo(0, r.h - 10);
      ctx.lineTo(r.w, r.h - 10);
      ctx.stroke();
      ctx.beginPath();
      const step = 28;
      for (let x = 0; x < r.w; x += step) {
        ctx.moveTo(x + 4, r.h - 18);
        ctx.lineTo(x + 4, 20);
        ctx.lineTo(x + step - 8, 20);
        ctx.lineTo(x + step - 8, r.h - 26);
        ctx.lineTo(x + step - 18, r.h - 26);
      }
      ctx.stroke();
    };
    const cornerShape = (): void => {
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(r.w - 10, 10);
      ctx.lineTo(r.w - 10, r.h);
      ctx.moveTo(0, r.h - 90);
      ctx.lineTo(r.w - 90, r.h - 90);
      ctx.lineTo(r.w - 90, r.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.w - 50, 50, 22, 0, Math.PI * 2);
      ctx.moveTo(r.w - 50 - 12, 50);
      ctx.lineTo(r.w - 50 + 12, 50);
      ctx.moveTo(r.w - 50, 50 - 12);
      ctx.lineTo(r.w - 50, 50 + 12);
      ctx.stroke();
    };
    const shape = corner ? cornerShape : straight;
    stroke(1.8, 1.8, lit, shape);
    stroke(0, 0, groove, shape);
  });
}

/** A hairline split along the grain: a dark thin crack with a lit lip. */
function paintCrack(ctx: Ctx, r: Rect, rng: () => number): void {
  withCell(ctx, r, () => {
    const points: [number, number][] = [];
    let x = r.w / 2;
    for (let y = 0; y <= r.h; y += 6) {
      x += (rng() - 0.5) * 2.4;
      points.push([x, y]);
    }
    const run = (dx: number): void => {
      ctx.beginPath();
      points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px + dx, py) : ctx.lineTo(px + dx, py)));
      ctx.stroke();
    };
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    run(1.8);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    run(0);
  });
}

/** The ghost of a brass 4: the cleaner, darker silhouette left on paint a numeral sheltered from the light, and its two screw holes. */
function paintGhost4(ctx: Ctx, r: Rect): void {
  withCell(ctx, r, () => {
    ctx.font = `600 150px Newsreader, Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText('4', r.w / 2, r.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y] of [[r.w * 0.5, 12], [r.w * 0.5, r.h - 4]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** A patch: a soft-edged rounded rectangle, the sanded margin of a repair. */
function paintPatch(ctx: Ctx, r: Rect): void {
  withCell(ctx, r, () => {
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.roundRect(14, 14, r.w - 28, r.h - 28, 8);
    ctx.fill();
  });
}

/** Stencilled lettering on a strip exactly as wide as the string: spray through a cut sheet, so with bridges. */
function paintStencil(ctx: Ctx, r: Rect, text: string, rng: () => number): void {
  withCell(ctx, r, () => {
    const size = MARK_TEXT.fontPx;
    ctx.font = `600 ${size}px ${FONT_MONO}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    const baseline = r.h * 0.5 + size * 0.36;
    const advance = size * STENCIL_ADVANCE + MARK_TEXT.trackPx;
    let x = 0;
    for (const ch of text) {
      ctx.fillText(ch, x + (size * STENCIL_ADVANCE - ctx.measureText(ch).width) / 2, baseline);
      x += advance;
    }
    // Bridges: the thin uncut ties of a real stencil, across the closed letters.
    ctx.globalCompositeOperation = 'destination-out';
    x = 0;
    for (const ch of text) {
      if ('ABDOPQR0468 9'.includes(ch) && ch !== ' ') {
        const gx = x + (size * STENCIL_ADVANCE) / 2;
        ctx.fillRect(gx - size * 0.34, r.h * 0.5 - 1.6, size * 0.2, 3.2);
        ctx.fillRect(gx + size * 0.14, r.h * 0.5 - 1.6, size * 0.2, 3.2);
      }
      x += advance;
    }
    // Spray fuzz: speckle along the strokes' edges.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.2 + rng() * 0.5})`;
      ctx.fillRect(rng() * r.w, rng() * r.h, 1 + rng() * 2, 1 + rng() * 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** Every mark the corridor's doors use, drawn once. */
export function drawMarksAtlas(layout: MarksLayout, anisotropy: number): CanvasTexture {
  const canvas = createCanvas(MARKS_ATLAS.width, MARKS_ATLAS.height);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rng = mulberry32(0x4d41524b);
  ctx.fillStyle = '#ffffff';
  const solid = MARK_CELLS.solid;
  ctx.fillRect(solid.x, solid.y, solid.w, solid.h);
  paintPolish(ctx, MARK_CELLS.polish);
  paintScuff(ctx, MARK_CELLS.scuff0, rng, 0.06);
  paintScuff(ctx, MARK_CELLS.scuff1, rng, -0.1);
  paintDust(ctx, MARK_CELLS.dust, rng);
  paintDrip(ctx, MARK_CELLS.drip, rng);
  paintStain(ctx, MARK_CELLS.stain, rng);
  paintChip(ctx, MARK_CELLS.chip0, rng, 0);
  paintChip(ctx, MARK_CELLS.chip1, rng, 1);
  paintChip(ctx, MARK_CELLS.chip2, rng, 2);
  paintChip(ctx, MARK_CELLS.chip3, rng, 3);
  paintChip(ctx, MARK_CELLS.chip4, rng, 4);
  paintChip(ctx, MARK_CELLS.chip5, rng, 5);
  paintEdge(ctx, MARK_CELLS.edge0, rng, false);
  paintEdge(ctx, MARK_CELLS.edge1, rng, true);
  paintResidue(ctx, MARK_CELLS.residue0, rng, 0);
  paintResidue(ctx, MARK_CELLS.residue1, rng, 1);
  paintFilled(ctx, MARK_CELLS.filled, rng);
  paintBorder(ctx, MARK_CELLS.borderStraight, false);
  paintBorder(ctx, MARK_CELLS.borderCorner, true);
  paintCrack(ctx, MARK_CELLS.crack, rng);
  paintGhost4(ctx, MARK_CELLS.ghost4);
  paintPatch(ctx, MARK_CELLS.patch);
  for (const text of layout.all) paintStencil(ctx, layout.textRect(text), text, rng);
  return makeTexture(canvas, { anisotropy });
}
