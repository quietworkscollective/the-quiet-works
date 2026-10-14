import type { CanvasTexture } from 'three';
import type { Rect } from '../artLayout.ts';
import { FOLIAGE_ATLAS, FOLIAGE_CELLS } from '../foliageLayout.ts';
import { mulberry32 } from '../math.ts';
import { context2d, createCanvas, makeTexture } from './canvas.ts';

/**
 * Leaf shapes for the corridor's plants, drawn from code. Grey with alpha: the vertex colour of
 * each card supplies its green. Veins are darker grey, the blade is lit pale, the margin a touch
 * darker, so a tinted card reads as a leaf at a glance and as a cluster at a distance.
 */

type Ctx = CanvasRenderingContext2D;

function inCell(ctx: Ctx, r: Rect, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x, r.y);
  draw();
  ctx.restore();
}

function blade(ctx: Ctx, path: () => void, veins: () => void): void {
  path();
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgb(232,232,232)');
  g.addColorStop(1, 'rgb(196,196,196)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(120,120,120,0.9)';
  ctx.stroke();
  ctx.save();
  path();
  ctx.clip();
  ctx.strokeStyle = 'rgba(96,96,96,0.8)';
  ctx.lineCap = 'round';
  veins();
  ctx.restore();
}

function ivy(ctx: Ctx, r: Rect): void {
  inCell(ctx, r, () => {
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(128, 246);
      ctx.bezierCurveTo(70, 238, 14, 190, 24, 132);
      ctx.bezierCurveTo(26, 110, 50, 112, 60, 118);
      ctx.bezierCurveTo(44, 84, 78, 72, 96, 88);
      ctx.bezierCurveTo(88, 52, 112, 28, 128, 10);
      ctx.bezierCurveTo(144, 28, 168, 52, 160, 88);
      ctx.bezierCurveTo(178, 72, 212, 84, 196, 118);
      ctx.bezierCurveTo(206, 112, 230, 110, 232, 132);
      ctx.bezierCurveTo(242, 190, 186, 238, 128, 246);
      ctx.closePath();
    };
    blade(ctx, path, () => {
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(128, 246);
      ctx.lineTo(128, 24);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (const [dx, dy] of [[-80, -40], [-96, -100], [-60, -150], [80, -40], [96, -100], [60, -150]] as const) {
        ctx.beginPath();
        ctx.moveTo(128, 200);
        ctx.quadraticCurveTo(128 + dx * 0.5, 200 + dy * 0.2, 128 + dx, 200 + dy);
        ctx.stroke();
      }
    });
  });
}

function oval(ctx: Ctx, r: Rect): void {
  inCell(ctx, r, () => {
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(128, 248);
      ctx.bezierCurveTo(52, 214, 30, 120, 128, 8);
      ctx.bezierCurveTo(226, 120, 204, 214, 128, 248);
      ctx.closePath();
    };
    blade(ctx, path, () => {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(128, 248);
      ctx.lineTo(128, 14);
      ctx.stroke();
      ctx.lineWidth = 2.2;
      for (let y = 210; y > 40; y -= 26) {
        ctx.beginPath();
        ctx.moveTo(128, y);
        ctx.lineTo(128 - 58 + (210 - y) * 0.2, y - 38);
        ctx.moveTo(128, y);
        ctx.lineTo(128 + 58 - (210 - y) * 0.2, y - 38);
        ctx.stroke();
      }
    });
  });
}

function frond(ctx: Ctx, r: Rect, rng: () => number): void {
  inCell(ctx, r, () => {
    // A curved rachis with paired leaflets that shorten toward the tip.
    const rachis = (t: number): [number, number] => [128 + Math.sin(t * 1.1) * 18 * t, 248 - t * 232];
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(130,130,130,1)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i <= 30; i += 1) {
      const [x, y] = rachis(i / 30);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let k = 1; k < 17; k += 1) {
      const t = k / 17;
      const [x, y] = rachis(t);
      const len = (1 - t) * 92 + 10 + rng() * 6;
      for (const side of [-1, 1] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(side * (1.15 - t * 0.35));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.5, -len * 0.16 * side, len, -len * 0.04 * side);
        ctx.quadraticCurveTo(len * 0.5, len * 0.12 * side, 0, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgb(216,216,216)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(118,118,118,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  });
}

function broad(ctx: Ctx, r: Rect): void {
  inCell(ctx, r, () => {
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(128, 250);
      ctx.bezierCurveTo(20, 220, 6, 90, 128, 6);
      ctx.bezierCurveTo(250, 90, 236, 220, 128, 250);
      ctx.closePath();
    };
    blade(ctx, path, () => {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(128, 250);
      ctx.lineTo(128, 12);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      for (let y = 224; y > 40; y -= 22) {
        ctx.beginPath();
        ctx.moveTo(128, y);
        ctx.quadraticCurveTo(128 - 50, y - 12, 128 - 104, y - 44);
        ctx.moveTo(128, y);
        ctx.quadraticCurveTo(128 + 50, y - 12, 128 + 104, y - 44);
        ctx.stroke();
      }
    });
  });
}

export function drawFoliageAtlas(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(FOLIAGE_ATLAS.width, FOLIAGE_ATLAS.height);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rng = mulberry32(0x464f4c49);
  ivy(ctx, FOLIAGE_CELLS.ivy);
  oval(ctx, FOLIAGE_CELLS.oval);
  frond(ctx, FOLIAGE_CELLS.frond, rng);
  broad(ctx, FOLIAGE_CELLS.broad);
  return makeTexture(canvas, { anisotropy });
}
