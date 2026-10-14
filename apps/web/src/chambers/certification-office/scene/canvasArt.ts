import { OFFICE_LEGIBILITY, HATCH_INTERIOR, OVERLOAD_AT, STAMP_WORD } from '@tqw/engine';
import { hash2, mulberry32 } from './anim.ts';
import { impression } from './beatMotion.ts';
import { PALETTE } from './palette.ts';
import { context2d, createCanvas, FONT_COND, FONT_MONO, FONT_SERIF } from './textures.ts';

/**
 * All the drawn, text-bearing art: the form and its imprints, the amber display, receipts, the
 * brass nameplate, the hatch interior and the memo. Every function is deterministic: the same
 * input always draws the same pixels (imprint n is a pure function of n).
 */

type Ctx = CanvasRenderingContext2D;

/** Fill text with explicit tracking (ctx.letterSpacing is not available everywhere). */
export function spacedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
  stroke = false,
): number {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let width = 0;
  const advances: number[] = [];
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    advances.push(w);
    width += w + spacing;
  }
  width -= spacing;
  let cursor = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  let i = 0;
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cursor, y);
    else ctx.fillText(ch, cursor, y);
    cursor += (advances[i] ?? 0) + spacing;
    i += 1;
  }
  ctx.textAlign = prevAlign;
  return width;
}

function wrapWords(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------------------------------------ */
/* The form                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export const FORM_W = 1024;
export const FORM_H = 1365;
/** Canvas pixels per metre on the form (0.36 m wide paper). */
export const FORM_PX_PER_M = FORM_W / 0.36;
/** Where the stamp lands: centre of the FOR OFFICE USE ONLY box. */
export const FORM_STAMP_X = FORM_W / 2;
export const FORM_STAMP_Y = 819;

const INK = '45,42,38';

/** Paper plus every printed element of Form W-1. No imprints. */
export function drawFormBase(): HTMLCanvasElement {
  const rng = mulberry32(0xf0a);
  const canvas = createCanvas(FORM_W, FORM_H);
  const ctx = context2d(canvas);

  // Paper: warm bone with grain, fibres and uneven tone.
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, FORM_W, FORM_H);
  for (let i = 0; i < 60; i += 1) {
    const x = rng() * FORM_W;
    const y = rng() * FORM_H;
    const r = 80 + rng() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() > 0.5;
    g.addColorStop(0, light ? 'rgba(255,250,240,0.07)' : 'rgba(120,100,70,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '90,70,50' : '255,255,250'},${(0.03 + rng() * 0.07).toFixed(3)})`;
    ctx.fillRect(rng() * FORM_W, rng() * FORM_H, 1 + rng() * 1.6, 1 + rng() * 1.2);
  }
  for (let i = 0; i < 160; i += 1) {
    ctx.strokeStyle = `rgba(110,90,60,${(0.04 + rng() * 0.05).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    const x = rng() * FORM_W;
    const y = rng() * FORM_H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 14, y + (rng() - 0.5) * 14, x + (rng() - 0.5) * 22, y + (rng() - 0.5) * 22);
    ctx.stroke();
  }
  // Coffee-ring ghost, 4%.
  ctx.strokeStyle = 'rgba(92,60,30,0.04)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(806, 262, 86, 0.2, Math.PI * 2 - 0.5);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(808, 264, 80, 0.5, Math.PI * 2 - 0.9);
  ctx.stroke();

  const ink = (alpha: number) => `rgba(${INK},${alpha})`;
  ctx.textBaseline = 'alphabetic';

  // Header.
  ctx.fillStyle = ink(0.8);
  ctx.font = `600 64px ${FONT_COND}`;
  ctx.font = `600 57px ${FONT_COND}`;
  ctx.fillText(OFFICE_LEGIBILITY.form, 70, 125, 740);
  ctx.fillRect(70, 150, FORM_W - 140, 4);
  ctx.fillRect(70, 162, FORM_W - 140, 1.5);

  // Form number block.
  ctx.strokeStyle = ink(0.8);
  ctx.lineWidth = 3;
  ctx.strokeRect(836, 60, 118, 70);
  ctx.font = `600 36px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText('W-1', 895, 108);
  ctx.textAlign = 'left';

  // Subhead.
  ctx.fillStyle = ink(0.78);
  ctx.font = `400 25px ${FONT_MONO}`;
  ctx.font = `600 65px ${FONT_COND}`;
  ctx.fillText(OFFICE_LEGIBILITY.applicant, 70, 242);

  // Fields.
  const label = (text: string, x: number, y: number) => {
    ctx.font = `600 21px ${FONT_COND}`;
    ctx.fillStyle = ink(0.8);
    spacedText(ctx, text, x, y, 2.2);
  };
  const rule = (x0: number, x1: number, y: number) => {
    ctx.strokeStyle = ink(0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  };
  label('APPLICANT', 70, 338);
  rule(260, FORM_W - 70, 342);
  label('EVIDENCE ENCLOSED', 70, 428);
  const boxes: Array<[string, number]> = [
    ['COMPETENCE', 400],
    ['ADEQUACY', 626],
    ['OTHER', 820],
  ];
  for (const [text, x] of boxes) {
    ctx.strokeStyle = ink(0.8);
    ctx.lineWidth = 2.6;
    ctx.strokeRect(x - 38, 407, 26, 26);
    label(text, x, 428);
  }
  label('WITNESSED BY', 70, 518);
  rule(260, FORM_W - 70, 522);
  label('DATE', 70, 598);
  rule(260, 520, 602);
  label('NO. OF PAGES', 570, 598);
  rule(790, FORM_W - 70, 602);

  // FOR OFFICE USE ONLY box (stamp lands in its centre).
  const bx = FORM_STAMP_X - 280;
  const by = FORM_STAMP_Y - 165;
  ctx.strokeStyle = ink(0.8);
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.roundRect(bx, by, 560, 330, 6);
  ctx.stroke();
  ctx.fillStyle = ink(0.8);
  ctx.fillRect(bx, by, 560, 40);
  ctx.fillStyle = PALETTE.bone;
  ctx.font = `600 22px ${FONT_COND}`;
  ctx.font = `600 41px ${FONT_COND}`;
  ctx.fillText(OFFICE_LEGIBILITY.evidence, bx + 20, by + 32, 520);
  ctx.fillStyle = ink(0.6);
  ctx.font = `400 15px ${FONT_MONO}`;
  ctx.fillText('RECEIVED', bx + 20, by + 296);
  rule(bx + 110, bx + 270, by + 298);
  ctx.fillText('DISPOSITION', bx + 290, by + 296);
  rule(bx + 410, bx + 540, by + 298);

  // Small print.
  ctx.fillStyle = ink(0.62);
  ctx.font = `400 19px ${FONT_COND}`;
  const small =
    '1. The Applicant certifies that the evidence enclosed is true, sufficient, and was not obtained under duress. ' +
    '2. The Office accepts no liability for the sufficiency of the Office. ' +
    '3. Approval of this form acknowledges that approval was requested, not that it was granted. ' +
    '4. This form must be submitted in duplicate; the duplicate has been submitted. ' +
    '5. Evidence expires on receipt.';
  const smallLines = wrapWords(ctx, small, FORM_W - 140);
  smallLines.forEach((line, i) => ctx.fillText(line, 70, 1046 + i * 27));

  // Signatures.
  rule(70, 440, 1262);
  label('APPLICANT SIGNATURE', 70, 1290);
  rule(570, FORM_W - 70, 1262);
  label('APPROVING CLERK', 570, 1290);
  ctx.fillStyle = ink(0.5);
  ctx.font = `400 15px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText('W-1 (REV. 1971)', FORM_W - 70, 1334);
  ctx.textAlign = 'left';

  // Editorial purpose labels on the near edge stay readable beneath the resting carriage.
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(70, 1020, FORM_W - 140, FORM_H - 1040);
  ctx.fillStyle = ink(.9);
  ctx.textAlign = 'left';
  ctx.font = `600 55px ${FONT_COND}`;
  ctx.fillText(OFFICE_LEGIBILITY.form, 70, 1100, FORM_W - 140);
  ctx.font = `600 66px ${FONT_COND}`;
  ctx.fillText(OFFICE_LEGIBILITY.applicant, 70, 1190, FORM_W - 140);
  ctx.fillText(OFFICE_LEGIBILITY.evidence, 70, 1290, FORM_W - 140);
  return canvas;
}

/* -- imprints -------------------------------------------------------------------------------- */

const IMPRINT_W = 470;
const IMPRINT_H = 290;
const imprintCache = new Map<number, HTMLCanvasElement>();

/** Width of one imprint's outer rule, millimetres. */
export const IMPRINT_WIDTH_MM = 144;
/**
 * Each stamp lands 10-15% of its own width from the one before it (and, to satisfy the reading
 * of "the stamp" as the 164 mm rubber plate too, never closer than 17 mm): near enough to
 * overlap absurdly, far enough that the sequence stays countable.
 */
export const IMPRINT_STEP_MM = { min: 17, max: 21 } as const;
/**
 * The stamp point drifts around a ring this many millimetres from the stamp point: wide enough
 * that five strikes make five distinct impressions (the rubber's 10 mm margin leaves a few
 * millimetres of each one peeking out as it lifts, which reads as a hand, not a machine).
 */
const RING_MM = 17.5;

export interface ImprintPlacement {
  /** Radians; between 3 and 5 degrees either way. */
  rotation: number;
  /** Canvas pixels from the stamp point. */
  dx: number;
  dy: number;
}

const MM = FORM_PX_PER_M / 1000;
const ring: number[] = [];

/**
 * Each strike lands a chord of 17-21 mm further round a ring of 17.5 mm radius, so five stamps
 * make five distinct, evenly spread impressions (a hand that never quite returns to the same
 * spot) and the sixth begins to retrace the first. Deterministic: a pure function of the index.
 */
function ringAngle(n: number): number {
  if (ring.length === 0) ring.push(hash2(1, 21) * Math.PI * 2);
  while (ring.length < n) {
    const i = ring.length + 1;
    const chord = IMPRINT_STEP_MM.min + hash2(i, 23) * (IMPRINT_STEP_MM.max - IMPRINT_STEP_MM.min);
    ring.push((ring[ring.length - 1] ?? 0) + 2 * Math.asin(chord / (2 * RING_MM)));
  }
  return ring[n - 1] ?? 0;
}

/** Placement is a pure function of the stamp index. */
export function imprintPlacement(n: number): ImprintPlacement {
  const angle = ringAngle(Math.max(1, n));
  const sign = hash2(n, 14) > 0.5 ? 1 : -1;
  return {
    rotation: (sign * (3 + 2 * hash2(n, 11)) * Math.PI) / 180,
    dx: Math.cos(angle) * RING_MM * MM,
    dy: Math.sin(angle) * RING_MM * MM,
  };
}

/** Only the overload stamp slips. */
export const isSmeared = (n: number): boolean => n === OVERLOAD_AT;

/**
 * The ink is not renewed between strikes: each older impression is a little drier. The newest
 * is full strength; the tenth back is a ghost.
 */
export const imprintAlpha = (age: number): number => Math.max(0.42, 0.95 - 0.1 * age);

/** One APPROVED imprint: double-ruled, inked unevenly, with seeded dropout. Pure function of n. */
export function drawImprint(n: number): HTMLCanvasElement {
  const cached = imprintCache.get(n);
  if (cached) return cached;
  const rng = mulberry32(0xa11ce + n * 7919);
  const canvas = createCanvas(IMPRINT_W, IMPRINT_H);
  const ctx = context2d(canvas);
  ctx.translate(IMPRINT_W / 2, IMPRINT_H / 2);
  ctx.fillStyle = PALETTE.ink;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineJoin = 'round';

  // Body of the ink at 80%, then darker pooled edges on top.
  ctx.globalAlpha = 0.84;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.roundRect(-205, -122, 410, 244, 20);
  ctx.stroke();
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.roundRect(-188, -105, 376, 210, 11);
  ctx.stroke();

  ctx.font = `600 142px ${FONT_COND}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Fit the word inside the inner rule.
  const tracking = 8;
  let width = 0;
  for (const ch of STAMP_WORD) width += ctx.measureText(ch).width + tracking;
  width -= tracking;
  const fit = Math.min(1, 338 / width);
  ctx.save();
  ctx.scale(fit, 1);
  spacedText(ctx, STAMP_WORD, 0, 49, tracking, 'center');
  ctx.globalAlpha = 0.96;
  ctx.lineWidth = 1.6;
  spacedText(ctx, STAMP_WORD, 0, 49, tracking, 'center', true);
  ctx.restore();

  // Uneven pressure: heavier on one side, picked per stamp.
  const angle = rng() * Math.PI * 2;
  const gx = Math.cos(angle) * 230;
  const gy = Math.sin(angle) * 145;
  const pressure = ctx.createLinearGradient(-gx, -gy, gx, gy);
  pressure.addColorStop(0, 'rgba(0,0,0,1)');
  pressure.addColorStop(1, 'rgba(0,0,0,0.66)');
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = pressure;
  ctx.fillRect(-IMPRINT_W / 2, -IMPRINT_H / 2, IMPRINT_W, IMPRINT_H);

  // Seeded dropout: ink that did not take.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1100; i += 1) {
    const x = (rng() - 0.5) * IMPRINT_W;
    const y = (rng() - 0.5) * IMPRINT_H;
    // Lighter side drops more ink.
    const side = (x * Math.cos(angle) + y * Math.sin(angle)) / 230;
    if (rng() > 0.55 + side * 0.25) continue;
    ctx.fillStyle = `rgba(0,0,0,${(0.45 + rng() * 0.55).toFixed(3)})`;
    const r = 0.5 + rng() * rng() * 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${(0.35 + rng() * 0.4).toFixed(3)})`;
    ctx.fillRect((rng() - 0.5) * IMPRINT_W, (rng() - 0.5) * IMPRINT_H, 6 + rng() * 14, 1 + rng() * 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Softer absorption: the ink wicks into the stock, so a faint halo spreads around a core that
  // is relaxed a little from the rubber's hard edge.
  const soft = createCanvas(IMPRINT_W, IMPRINT_H);
  const sctx = context2d(soft);
  if (typeof sctx.filter === 'string') {
    sctx.filter = 'blur(1.6px)';
    sctx.globalAlpha = 0.6;
    sctx.drawImage(canvas, 0, 0);
    sctx.filter = 'blur(0.5px)';
  }
  sctx.globalAlpha = 0.92;
  sctx.drawImage(canvas, 0, 0);

  if (imprintCache.size > 48) imprintCache.clear();
  imprintCache.set(n, soft);
  return soft;
}

/** How many imprints stay on the sheet. */
export const MAX_IMPRINTS = 12;

/** Redraw the form: clean base plus the latest imprints for stamp count `n`. */
export function composeForm(target: HTMLCanvasElement, base: HTMLCanvasElement, n: number, ink = impression('centre', false, 150)): void {
  const ctx = context2d(target);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(base, 0, 0);
  const first = Math.max(1, n - MAX_IMPRINTS + 1);
  const mm = MM;
  for (let i = first; i <= n; i += 1) {
    const imprint = drawImprint(i);
    const place = imprintPlacement(i);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(FORM_STAMP_X + place.dx + ink.offset * FORM_PX_PER_M, FORM_STAMP_Y + place.dy);
    ctx.rotate(place.rotation);
    ctx.scale(ink.spread, ink.spread);
    const strength = imprintAlpha(n - i) * ink.opacity;
    if (isSmeared(i)) {
      // The overloaded stamp slips: the same impression twice, 1.5 mm apart, the second fainter.
      ctx.globalAlpha = strength * 0.55;
      ctx.drawImage(imprint, -IMPRINT_W / 2 + 1.5 * mm, -IMPRINT_H / 2 + 1.0 * mm);
      ctx.globalAlpha = strength;
      ctx.drawImage(imprint, -IMPRINT_W / 2 - 0.75 * mm, -IMPRINT_H / 2 - 0.5 * mm);
    } else {
      ctx.globalAlpha = strength;
      ctx.drawImage(imprint, -IMPRINT_W / 2, -IMPRINT_H / 2);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------------------------------ */
/* The amber display                                                                          */
/* ------------------------------------------------------------------------------------------ */

export const DISPLAY_W = 1120;
export const DISPLAY_H = 200;

let displayOverlay: HTMLCanvasElement | null = null;

/** Dot-matrix cell grid, scanlines and edge falloff, drawn once and laid over every frame. */
function getDisplayOverlay(): HTMLCanvasElement {
  if (displayOverlay) return displayOverlay;
  const canvas = createCanvas(DISPLAY_W, DISPLAY_H);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  for (let y = 0; y < DISPLAY_H; y += 4) ctx.fillRect(0, y + 2.6, DISPLAY_W, 1.4);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < DISPLAY_W; x += 4) ctx.fillRect(x + 2.7, 0, 1.3, DISPLAY_H);
  const edge = ctx.createRadialGradient(
    DISPLAY_W / 2,
    DISPLAY_H / 2,
    DISPLAY_H * 0.5,
    DISPLAY_W / 2,
    DISPLAY_H / 2,
    DISPLAY_W * 0.62,
  );
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
  displayOverlay = canvas;
  return canvas;
}

interface DisplayLayout {
  size: number;
  lines: string[];
}

function layoutDisplay(ctx: Ctx, text: string): DisplayLayout {
  const maxWidth = DISPLAY_W - 90;
  for (let size = 80; size >= 28; size -= 2) {
    ctx.font = `600 ${size}px ${FONT_MONO}`;
    const lines = wrapWords(ctx, text, maxWidth);
    const fits = lines.every((line) => ctx.measureText(line).width <= maxWidth);
    if (lines.length <= 2 && fits && lines.length * size * 1.08 <= DISPLAY_H - 36) return { size, lines };
  }
  ctx.font = `600 28px ${FONT_MONO}`;
  return { size: 28, lines: wrapWords(ctx, text, maxWidth) };
}

/**
 * Draw the display. `layoutText` fixes size and wrapping; `visibleChars` reveals only the first
 * n characters of it (so "PROCESSING..." can animate its dots without the text re-centering).
 */
export function drawDisplay(canvas: HTMLCanvasElement, layoutText: string, visibleChars?: number): void {
  const ctx = context2d(canvas);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.displayBg;
  ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
  // Unlit dot-matrix cells.
  ctx.fillStyle = 'rgba(213,155,74,0.045)';
  ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);

  const { size, lines } = layoutDisplay(ctx, layoutText);
  const lineHeight = size * 1.08;
  const top = DISPLAY_H / 2 - ((lines.length - 1) * lineHeight) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px ${FONT_MONO}`;

  const draw = (alpha: number, blur: boolean) => {
    let remaining = visibleChars ?? Number.POSITIVE_INFINITY;
    lines.forEach((line, i) => {
      if (remaining <= 0) return;
      const full = ctx.measureText(line).width;
      const shown = line.slice(0, Math.max(0, remaining));
      remaining -= line.length + 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.amber;
      if (blur) {
        if (typeof ctx.filter === 'string') ctx.filter = 'blur(6px)';
        else {
          ctx.shadowColor = PALETTE.amber;
          ctx.shadowBlur = 16;
        }
      }
      ctx.textAlign = 'left';
      ctx.fillText(shown, DISPLAY_W / 2 - full / 2, top + i * lineHeight);
      ctx.restore();
    });
  };
  draw(0.35, true);
  draw(1, false);

  ctx.drawImage(getDisplayOverlay(), 0, 0);
}

/* ------------------------------------------------------------------------------------------ */
/* Receipts                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export const RECEIPT_PX = 384;

export function receiptNumber(step: number): number {
  return 1000 + step;
}

/** Thermal receipt, tip at the top of the canvas, tear line at the bottom. */
export function drawReceipt(canvas: HTMLCanvasElement, step: number, text: string): void {
  const ctx = context2d(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(0x7e + step);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#d9d3c6';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '120,105,80' : '255,255,250'},${(0.04 + rng() * 0.06).toFixed(3)})`;
    ctx.fillRect(rng() * w, rng() * h, 1.4, 1.4);
  }
  // Slight edge shading so the strip has a body.
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(60,50,35,0.14)');
  side.addColorStop(0.1, 'rgba(60,50,35,0)');
  side.addColorStop(0.9, 'rgba(60,50,35,0)');
  side.addColorStop(1, 'rgba(60,50,35,0.14)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);

  // Canvas top is the end inside the machine; the free tip is the bottom. At full feed (0.12 of
  // 0.16 m) the visible part is the lower three quarters, so the tear line sits at its top edge.
  ctx.fillStyle = 'rgba(38,34,30,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 15px ${FONT_MONO}`;
  dotted(ctx, 22, w - 22, h * 0.25 + 4);
  spacedText(ctx, 'TEAR HERE', w / 2, h * 0.25 + 26, 3, 'center');

  ctx.fillStyle = 'rgba(38,34,30,0.9)';
  ctx.font = `600 22px ${FONT_MONO}`;
  spacedText(ctx, `CERT. OFFICE \u00b7 NO. ${receiptNumber(step)}`, w / 2, 176, 0, 'center');
  dotted(ctx, 22, w - 22, 198);

  ctx.textAlign = 'left';
  ctx.font = `400 32px ${FONT_MONO}`;
  const lines = wrapWords(ctx, text, w - 52);
  lines.forEach((line, i) => ctx.fillText(line, 26, 244 + i * 40));
}

function dotted(ctx: Ctx, x0: number, x1: number, y: number): void {
  ctx.fillStyle = 'rgba(38,34,30,0.55)';
  for (let x = x0; x <= x1; x += 9) {
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Nameplate, hatch interior, memo                                                            */
/* ------------------------------------------------------------------------------------------ */

export const NAMEPLATE_W = 1280;
export const NAMEPLATE_H = 160;

/** Engraved brass: brushed metal, bevel, screws, dark cut letters with a lit lower lip. */
export function drawNameplate(canvas: HTMLCanvasElement): void {
  const ctx = context2d(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(0xb4a55);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#c49c5e');
  base.addColorStop(0.5, '#b08a4e');
  base.addColorStop(1, '#9a773f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 520; i += 1) {
    ctx.strokeStyle = rng() > 0.5 ? `rgba(255,236,190,${(0.03 + rng() * 0.06).toFixed(3)})` : `rgba(60,38,10,${(0.04 + rng() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.8;
    const y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(rng() * w * 0.4, y);
    ctx.lineTo(w * (0.55 + rng() * 0.45), y + (rng() - 0.5) * 1.2);
    ctx.stroke();
  }
  // Bevel.
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,236,190,0.55)';
  ctx.beginPath();
  ctx.moveTo(4, h - 4);
  ctx.lineTo(4, 4);
  ctx.lineTo(w - 4, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(50,30,8,0.6)';
  ctx.beginPath();
  ctx.moveTo(w - 4, 4);
  ctx.lineTo(w - 4, h - 4);
  ctx.lineTo(4, h - 4);
  ctx.stroke();
  // Screws.
  for (const x of [34, w - 34]) {
    ctx.fillStyle = '#8c6a35';
    ctx.beginPath();
    ctx.arc(x, h / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,6,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 8, h / 2 - 3);
    ctx.lineTo(x + 8, h / 2 + 3);
    ctx.stroke();
  }
  // Engraved text.
  const text = 'CERTIFICATION OFFICE · EVIDENCE INTAKE';
  ctx.textBaseline = 'middle';
  ctx.font = `600 58px ${FONT_COND}`;
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + 7;
  const fit = Math.min(1, (w - 150) / width);
  ctx.save();
  ctx.translate(w / 2, h / 2 + 2);
  ctx.scale(fit, 1);
  ctx.fillStyle = 'rgba(255,236,190,0.5)';
  spacedText(ctx, text, 0, 3, 7, 'center');
  ctx.fillStyle = 'rgba(28,16,4,0.92)';
  spacedText(ctx, text, 0, 0, 7, 'center');
  ctx.restore();
}

export const HATCH_W = 1536;
export const HATCH_H = 592;

/** The empty cavity behind the hatch: a bracket outline, a stencil, and a dark memo slot. */
export function drawHatchInterior(canvas: HTMLCanvasElement): void {
  const ctx = context2d(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(0x1a7c4);

  // Warm, dim cavity: lit from below-front, so the top and sides fall away into shadow.
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#1b1209');
  base.addColorStop(0.55, '#3b2610');
  base.addColorStop(1, '#5a3a17');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '230,170,90' : '10,6,2'},${(0.02 + rng() * 0.05).toFixed(3)})`;
    ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5);
  }

  // Ceiling and wall shadows to sell depth.
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  top.addColorStop(0, 'rgba(0,0,0,0.78)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.4);
  for (const [x0, x1, a] of [
    [0, w * 0.14, 0.7],
    [w, w * 0.86, 0.7],
  ] as const) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
  }

  // Mounting bracket: the shape of a thing that should be here. Dashed outline, corner angles,
  // four bolt holes. Kept quieter than the stencil: it is the outline of an absence.
  const bx = w * 0.1;
  const by = h * 0.07;
  const bw = w * 0.8;
  const bh = h * 0.6;
  ctx.strokeStyle = 'rgba(232,176,98,0.34)';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 16]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(232,176,98,0.44)';
  const arm = 54;
  for (const [cx, cy, sx, sy] of [
    [bx, by, 1, 1],
    [bx + bw, by, -1, 1],
    [bx, by + bh, 1, -1],
    [bx + bw, by + bh, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
    ctx.stroke();
    ctx.fillStyle = 'rgba(6,4,2,0.9)';
    ctx.beginPath();
    ctx.arc(cx + sx * 26, cy + sy * 26, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,176,98,0.32)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(232,176,98,0.44)';
  }

  // Stencil text: monospaced capitals with bridges cut through the letters. The first line is
  // legible but subordinate (smaller, dimmer); the second is the punchline (larger, brightest).
  const lines = HATCH_INTERIOR.split(' \u2014 ');
  const first = lines[0] ?? '';
  const second = lines[1] ?? '';
  const stencil: Array<{ text: string; y: number; size: number; fill: string; glow: string; blur: number }> = [
    { text: `${first} \u2014`, y: h * 0.25, size: 54, fill: '#c89c5c', glow: 'rgba(200,156,92,0.35)', blur: 10 },
    { text: second, y: h * 0.5, size: 132, fill: '#ffe6b0', glow: 'rgba(255,214,140,0.8)', blur: 34 },
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { text: line, y, size, fill, glow, blur } of stencil) {
    ctx.save();
    ctx.font = `600 ${size}px ${FONT_MONO}`;
    ctx.fillStyle = fill;
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    spacedText(ctx, line, w / 2, y, size * 0.07, 'center');
    ctx.shadowBlur = 0;
    // Stencil bridges.
    ctx.globalCompositeOperation = 'destination-out';
    const advance = ctx.measureText('M').width + size * 0.07;
    const total = advance * line.length - size * 0.07;
    for (let i = 0; i < line.length; i += 1) {
      const cx = w / 2 - total / 2 + i * advance + advance * 0.45;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(cx - size * 0.022, y - size * 0.62, size * 0.044, size * 0.2);
      ctx.fillRect(cx - size * 0.022, y + size * 0.18, size * 0.044, size * 0.2);
    }
    ctx.restore();
  }
  // Refill the cavity behind the cut letters so bridges show the dark cavity, not transparency.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#2c1c0c';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Maker's plate: small, bottom-left.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 26px ${FONT_MONO}`;
  ctx.fillStyle = 'rgba(232,176,98,0.5)';
  spacedText(ctx, 'RCV-0001  AUTHORITY MODULE', w * 0.2, h * 0.76, 3);
  ctx.fillStyle = 'rgba(232,176,98,0.36)';
  ctx.fillText('SLOT EMPTY', w * 0.2, h * 0.76 + 36);

  // The memo slot, along the floor of the cavity.
  const slotW = w * 0.5;
  const slotH = 38;
  const slotX = w * 0.5 - slotW / 2;
  const slotY = h * 0.925 - slotH / 2;
  ctx.fillStyle = '#050302';
  ctx.beginPath();
  ctx.roundRect(slotX, slotY, slotW, slotH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,176,98,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Floor glow.
  const floor = ctx.createLinearGradient(0, h * 0.8, 0, h);
  floor.addColorStop(0, 'rgba(240,184,102,0)');
  floor.addColorStop(1, 'rgba(240,184,102,0.14)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
}

export const MEMO_PX_W = 768;
export const MEMO_PX_H = 640;

/** The folded memo's face: restrained, Newsreader, a crease shadow at the fold. */
export function drawMemoFace(canvas: HTMLCanvasElement, creaseV: number): void {
  const ctx = context2d(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(0x3e30);
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '100,80,55' : '255,255,248'},${(0.03 + rng() * 0.07).toFixed(3)})`;
    ctx.fillRect(rng() * w, rng() * h, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(45,42,38,0.9)';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 74px ${FONT_SERIF}`;
  spacedText(ctx, 'MEMO 001', 70, 170, 9);
  ctx.fillStyle = 'rgba(45,42,38,0.6)';
  ctx.fillRect(70, 204, w - 140, 2.4);
  ctx.font = `italic 400 30px ${FONT_SERIF}`;
  ctx.fillStyle = 'rgba(45,42,38,0.72)';
  ctx.fillText('From the desk of the Approving Clerk', 70, 262);
  ctx.fillText('(position vacant)', 70, 302);
  // Body, suggested.
  ctx.fillStyle = 'rgba(45,42,38,0.2)';
  for (let i = 0; i < 6; i += 1) {
    const lineW = (i === 5 ? 0.42 : 0.84 + rng() * 0.14) * (w - 140);
    ctx.fillRect(70, 352 + i * 36, lineW, 9);
  }
  // The fold: a soft shadow on one side, a thin light line on the other.
  const y = creaseV * h;
  const shade = ctx.createLinearGradient(0, y - 46, 0, y + 46);
  shade.addColorStop(0, 'rgba(60,45,25,0)');
  shade.addColorStop(0.5, 'rgba(60,45,25,0.22)');
  shade.addColorStop(1, 'rgba(60,45,25,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, y - 46, w, 92);
  ctx.fillStyle = 'rgba(255,252,244,0.4)';
  ctx.fillRect(0, y + 1, w, 2);
}

/** Adopted material labels; these do not introduce another machine reply. */
export function drawPaperDetail(canvas: HTMLCanvasElement, kind: 'expiry' | 'fold'): void {
  const ctx = context2d(canvas);
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  ctx.fillStyle = PALETTE.paperInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${kind === 'expiry' ? 62 : 24}px ${FONT_MONO}`;
  if (kind === 'expiry') ctx.fillText('EXPIRED', canvas.width / 2, canvas.height / 2);
  else {
    ctx.fillText('CONFIRMATION REQUIRES APPROVAL', canvas.width / 2, 90);
    ctx.font = `400 70px ${FONT_MONO}`;
    ctx.fillText('↓', canvas.width / 2, 170);
  }
}
