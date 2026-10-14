import { CORRIDOR_PROPS } from '@tqw/engine';
import { mulberry32 } from '../math.ts';
import { drawTracked, FONTS, fitFont, wrapLines } from '../textures/text.ts';
import { ATLAS, ATLAS_SIZES, PROP_ATLAS, type AtlasId } from './atlasLayout.ts';
import { BALL_MAP, ballTexel, texelDirection } from './ballPattern.ts';
import { PROP_COPY, splitLabel } from './copy.ts';

/**
 * Paints the props' atlas: the team photograph and its caption slip, the cards, tags and labels
 * with their drafted words, the engraved plates, the chessboard and a patch. Everything is drawn
 * from code with seeded noise, so it is the same on every load. Words come from
 * `CORRIDOR_PROPS` and are never retyped here; `log` records every string set, so a test can
 * check the lettering against the copy without a canvas.
 */

export type Ctx = CanvasRenderingContext2D;

export interface Scratch {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  dispose(): void;
}

export interface Typeset {
  /** Every string set on the atlas, with the item it belongs to. */
  log?: { id: AtlasId; text: string }[];
  /** A scratch canvas for the photograph's small, soft scene; a document canvas when omitted. */
  scratch?: (width: number, height: number) => Scratch;
}

const INK = '#241C14';

function grain(ctx: Ctx, w: number, h: number, seed: number, amount = 0.06, dark = '70,56,38'): void {
  const rng = mulberry32(seed);
  const count = Math.floor((w * h) / 90);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.45 ? dark : '255,250,238'},${(rng() * amount).toFixed(3)})`;
    ctx.fillRect(rng() * w, rng() * h, 1.2, 1.2);
  }
}

function paper(ctx: Ctx, w: number, h: number, from: string, to: string, seed: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, seed);
}

type Painter = (ctx: Ctx, w: number, h: number, say: (text: string) => void, scratch: (width: number, height: number) => Scratch, origin: { x: number; y: number }) => void;

/** Set `text` at the largest size (down from `start`) that fits `width`, tracked, and say it. */
function line(ctx: Ctx, say: (t: string) => void, text: string, face: string, weight: number, x: number, baseline: number, width: number, start: number, track: number, align: 'left' | 'center' | 'right' = 'left', colour = INK): number {
  const size = fitFont(ctx, text, (s) => `${weight} ${s}px ${face}`, width, start, track, 8);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  drawTracked(ctx, text, x, baseline, track * size, align);
  say(text);
  return size;
}

const PAINTERS: Record<AtlasId, Painter> = {
  photo(ctx, w, h, _say, scratch) {
    paintPhotograph(ctx, w, h, scratch);
  },

  slip(ctx, w, h, say) {
    paper(ctx, w, h, '#E9E0C8', '#D9CFB3', 11);
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['team-photo']);
    line(ctx, say, heading, FONTS.mono, 600, 30, 52, w - 60, 40, 0.06);
    line(ctx, say, rest, FONTS.mono, 400, 30, 94, w - 60, 28, 0.02);
    ctx.fillStyle = 'rgba(36,28,20,0.5)';
    ctx.fillRect(18, 10, w - 36, 1.4);
  },

  rota(ctx, w, h, say) {
    paper(ctx, w, h, '#EDE5CF', '#DDD3B8', 21);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 1;
    ctx.strokeRect(17, 17, w - 34, h - 34);
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['trophy-cabinet']);
    line(ctx, say, heading, FONTS.cond, 600, 32, 66, w - 64, 44, 0.16);
    line(ctx, say, rest, FONTS.mono, 400, 32, 100, w - 64, 25, 0.02);
    // Twelve boxes for the twelve months; some ticked in pencil, not all.
    const ticked = new Set([0, 1, 2, 4, 5, 7, 8, 10]);
    const months = 'JFMAMJJASOND';
    const cell = (w - 64) / 12;
    for (let i = 0; i < 12; i += 1) {
      const x = 32 + i * cell;
      ctx.strokeStyle = 'rgba(36,28,20,0.65)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 2, 118, cell - 4, 42);
      ctx.fillStyle = INK;
      ctx.font = `400 14px ${FONTS.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(months.charAt(i), x + cell / 2, 176);
      ctx.textAlign = 'left';
      if (ticked.has(i)) {
        ctx.strokeStyle = 'rgba(52,56,70,0.85)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x + 8, 140);
        ctx.lineTo(x + cell / 2 - 1, 154);
        ctx.lineTo(x + cell - 8, 124);
        ctx.stroke();
      }
    }
  },

  plateComposed(ctx, w, h, say) {
    plate(ctx, w, h, CORRIDOR_PROPS.trophies[0] ?? '', say, 41);
  },
  plateEffort(ctx, w, h, say) {
    plate(ctx, w, h, CORRIDOR_PROPS.trophies[1] ?? '', say, 42);
  },
  plateRunner(ctx, w, h, say) {
    plate(ctx, w, h, CORRIDOR_PROPS.trophies[2] ?? '', say, 43);
  },

  reserved(ctx, w, h, say) {
    paper(ctx, w, h, '#EAE2CC', '#D8CEB2', 51);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    line(ctx, say, CORRIDOR_PROPS.trophies[3] ?? '', FONTS.cond, 700, w / 2, h / 2 + 18, w - 46, 56, 0.18, 'center');
  },

  shirtLabel(ctx, w, h, say) {
    paper(ctx, w, h, '#E7DEC5', '#D6CCB0', 61);
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['team-shirts']);
    line(ctx, say, heading, FONTS.cond, 700, 22, 38, w - 44, 32, 0.12);
    line(ctx, say, rest, FONTS.mono, 400, 22, 70, w - 44, 22, 0.02);
    ctx.fillStyle = 'rgba(36,28,20,0.45)';
    ctx.fillRect(0, h - 4, w, 4);
  },

  bootTag(ctx, w, h, say) {
    paper(ctx, w, h, '#C9AE7B', '#B89A66', 71);
    ctx.strokeStyle = 'rgba(60,40,20,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    // The reinforced eyelet ring near the top.
    ctx.fillStyle = 'rgba(236,224,190,0.9)';
    ctx.beginPath();
    ctx.arc(w / 2, 40, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,28,16,0.55)';
    ctx.beginPath();
    ctx.arc(w / 2, 40, 9, 0, Math.PI * 2);
    ctx.fill();
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['walking-boots']);
    ctx.textBaseline = 'alphabetic';
    // The heading stacks a word to a line, the rest wraps; each line is one `say`, in reading order.
    const words = heading.split(' ');
    let y = 120;
    for (const word of words) {
      line(ctx, say, word, FONTS.cond, 700, w / 2, y, w - 40, 38, 0.08, 'center', '#2B1D0F');
      y += 38;
    }
    ctx.font = `400 21px ${FONTS.mono}`;
    ctx.fillStyle = '#2B1D0F';
    y += 12;
    for (const wrapped of wrapLines(ctx, rest, w - 40)) {
      ctx.textAlign = 'center';
      ctx.fillText(wrapped, w / 2, y);
      ctx.textAlign = 'left';
      say(wrapped);
      y += 26;
    }
  },

  kitLabel(ctx, w, h, say) {
    paper(ctx, w, h, '#EDE4CB', '#DCD1B4', 81);
    ctx.strokeStyle = '#2F5A57';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(17, 17, w - 34, h - 34);
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['repair-kit']);
    line(ctx, say, heading, FONTS.cond, 700, w / 2, 70, w - 70, 40, 0.1, 'center', '#2A2218');
    line(ctx, say, rest, FONTS.mono, 400, w / 2, 112, w - 70, 22, 0.02, 'center', '#2A2218');
  },

  recipeLabel(ctx, w, h, say) {
    paper(ctx, w, h, '#EFE7D0', '#DFD5BA', 91);
    ctx.strokeStyle = 'rgba(36,28,20,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    const { heading, rest } = splitLabel(CORRIDOR_PROPS.labels['recipe-drawer']);
    line(ctx, say, heading, FONTS.cond, 700, 22, 40, w - 44, 30, 0.12);
    line(ctx, say, rest, FONTS.mono, 400, 22, 72, w - 44, 20, 0.02);
  },

  recipeCard(ctx, w, h, say) {
    paper(ctx, w, h, '#F1EAD6', '#E2D8BE', 101);
    ctx.strokeStyle = 'rgba(176,80,70,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 46);
    ctx.lineTo(w, 46);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,110,150,0.32)';
    ctx.lineWidth = 1;
    for (let y = 78; y < h - 10; y += 28) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(w - 12, y);
      ctx.stroke();
    }
    // A hand-set card: Newsreader italic stands in for a good hand.
    line(ctx, say, PROP_COPY.recipe.title, FONTS.serif, 600, 20, 36, w - 40, 32, 0.01);
    ctx.font = `italic 400 20px ${FONTS.serif}`;
    ctx.fillStyle = '#2E3A4A';
    let y = 74;
    for (const text of PROP_COPY.recipe.lines) {
      ctx.fillText(text, 20, y);
      say(text);
      y += 28;
    }
    // One thumbprint of grease, as every card in a working kitchen has.
    const g = ctx.createRadialGradient(w - 64, h - 52, 2, w - 64, h - 52, 34);
    g.addColorStop(0, 'rgba(140,110,50,0.28)');
    g.addColorStop(1, 'rgba(140,110,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w - 100, h - 90, 80, 80);
  },

  scoreCover(ctx, w, h, say) {
    // Cloth-bound, maroon, with a pasted label.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#5B2A32');
    g.addColorStop(1, '#46202A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(111);
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y + rng());
      ctx.lineTo(w, y + rng());
      ctx.stroke();
    }
    ctx.fillStyle = '#E9E1C8';
    ctx.fillRect(34, 66, w - 68, 138);
    ctx.strokeStyle = '#2A1C14';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 72, w - 80, 126);
    line(ctx, say, PROP_COPY.scorebook.cover, FONTS.cond, 700, w / 2, 130, w - 100, 34, 0.12, 'center', '#2A1C14');
    ctx.fillStyle = '#2A1C14';
    ctx.fillRect(60, 152, w - 120, 1.4);
    line(ctx, say, PROP_COPY.scorebook.season, FONTS.mono, 400, 60, 180, w - 120, 20, 0.1);
    ctx.fillRect(130, 182, w - 190, 1.2);
  },

  chess(ctx, w) {
    const n = 8;
    const s = w / n;
    const rng = mulberry32(121);
    for (let r = 0; r < n; r += 1) {
      for (let f = 0; f < n; f += 1) {
        const light = (r + f) % 2 === 0;
        ctx.fillStyle = light ? '#D9CCA8' : '#6B4B2F';
        ctx.fillRect(f * s, r * s, s, s);
        for (let i = 0; i < 40; i += 1) {
          ctx.fillStyle = `rgba(${light ? '90,70,40' : '20,10,0'},${(rng() * 0.1).toFixed(3)})`;
          ctx.fillRect(f * s + rng() * s, r * s + rng() * s, rng() * 12 + 2, 1);
        }
      }
    }
  },

  ball(ctx, w, h, _say, _scratch, origin) {
    // An equirectangular skin, with its first and last columns wrapped round so the seam at the
    // back of the ball filters cleanly.
    const img = ctx.createImageData(w, h);
    const { width, margin } = BALL_MAP;
    for (let y = 0; y < h; y += 1) {
      for (let px = 0; px < w; px += 1) {
        const tx = (((px - margin) % width) + width) % width;
        const [r, g, b] = ballTexel(texelDirection(tx, y), tx, y);
        const i = (y * w + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, origin.x, origin.y);
  },

  patch(ctx, w, h) {
    ctx.fillStyle = '#3B5675';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.strokeStyle = '#E3D9BE';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.setLineDash([]);
  },
};

/** An engraved plate: aged brass with a beaten edge, the words cut dark and tracked wide. */
function plate(ctx: Ctx, w: number, h: number, text: string, say: (t: string) => void, seed: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#C7A967');
  g.addColorStop(0.5, '#A88A4C');
  g.addColorStop(1, '#8B6F3A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, seed, 0.1);
  ctx.strokeStyle = 'rgba(60,44,20,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  // A cut letter: dark, with a bright lip below it where the light catches the edge of the cut.
  const size = fitFont(ctx, text, (s) => `600 ${s}px ${FONTS.cond}`, w - 40, 54, 0.1, 10);
  ctx.textBaseline = 'alphabetic';
  const y = h / 2 + size * 0.34;
  ctx.fillStyle = 'rgba(240,222,170,0.5)';
  drawTracked(ctx, text, w / 2, y + 1.6, 0.1 * size, 'center');
  ctx.fillStyle = '#2B2012';
  drawTracked(ctx, text, w / 2, y, 0.1 * size, 'center');
  say(text);
}

/** The team photograph: two rows of people, out of focus, in sepia, on the kind of paper that curls. */
function paintPhotograph(ctx: Ctx, w: number, h: number, makeScratch: (width: number, height: number) => Scratch): void {
  const rng = mulberry32(0x7e41);
  // The scene is drawn small and scaled up: an old photograph is soft.
  const sw = 176;
  const sh = 112;
  const scene = makeScratch(sw, sh);
  const c = scene.ctx;
  const back = c.createLinearGradient(0, 0, 0, sh);
  back.addColorStop(0, '#c4bcab');
  back.addColorStop(0.5, '#9b9585');
  back.addColorStop(1, '#6f6a5d');
  c.fillStyle = back;
  c.fillRect(0, 0, sw, sh);
  // A pavilion wall behind: boards, a window and a doorway of dark.
  c.fillStyle = 'rgba(70,64,54,0.32)';
  for (let x = 0; x < sw; x += 11) c.fillRect(x, 0, 1, 74);
  c.fillStyle = 'rgba(48,44,38,0.7)';
  c.fillRect(132, 10, 26, 58);
  c.fillStyle = 'rgba(214,206,186,0.55)';
  c.fillRect(8, 10, 30, 20);
  c.fillStyle = 'rgba(70,64,54,0.6)';
  c.fillRect(22, 10, 1.4, 20);
  c.fillRect(8, 19.5, 30, 1.4);

  const SKIN = '#b4a794';
  const HAIR = '#3a342c';
  /** One sitter or stander: shoulders, neck, head, hair; hooped jersey or a plain jacket. */
  const person = (x: number, headY: number, k: number, jersey: string, stripe: string | null): void => {
    c.fillStyle = jersey;
    c.beginPath();
    c.moveTo(x - 10.5 * k, headY + 46 * k);
    c.lineTo(x - 11.5 * k, headY + 13 * k);
    c.quadraticCurveTo(x - 10 * k, headY + 7.2 * k, x - 3.4 * k, headY + 6.4 * k);
    c.lineTo(x + 3.4 * k, headY + 6.4 * k);
    c.quadraticCurveTo(x + 10 * k, headY + 7.2 * k, x + 11.5 * k, headY + 13 * k);
    c.lineTo(x + 10.5 * k, headY + 46 * k);
    c.closePath();
    c.fill();
    if (stripe) {
      c.fillStyle = stripe;
      c.fillRect(x - 11.2 * k, headY + 19 * k, 22.4 * k, 6.5 * k);
    }
    // Neck and collar, then the head with a shadow under the chin.
    c.fillStyle = SKIN;
    c.fillRect(x - 2.3 * k, headY + 3 * k, 4.6 * k, 4.6 * k);
    c.beginPath();
    c.ellipse(x, headY, 4.3 * k, 5.2 * k, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(60,44,30,0.28)';
    c.beginPath();
    c.ellipse(x, headY + 2.2 * k, 4 * k, 3 * k, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = HAIR;
    c.beginPath();
    c.ellipse(x, headY - 1.6 * k, 4.5 * k, 3.5 * k, 0, Math.PI, Math.PI * 2);
    c.fill();
    c.fillRect(x - 4.5 * k, headY - 1.8 * k, 1.1 * k, 3 * k);
    c.fillRect(x + 3.4 * k, headY - 1.8 * k, 1.1 * k, 3 * k);
  };
  const jerseyLight = '#cbc4b3';
  const jerseyDark = '#4f4a42';
  const jerseyMid = '#8a8474';
  // Back row: eight standing, the coach in a dark coat at the end. Mostly plain; two wear a hoop.
  for (let i = 0; i < 8; i += 1) {
    const x = 16 + i * 20.5 + (rng() - 0.5) * 2;
    if (i === 7) person(x, 30 + (rng() - 0.5) * 2, 1.04, '#3e3a34', null);
    else person(x, 30 + (rng() - 0.5) * 2.4, 1.0, i % 3 === 1 ? jerseyMid : jerseyLight, i === 2 || i === 5 ? jerseyDark : null);
  }
  // Front row, seated and a little larger; one place left empty, with a bag on it.
  for (let i = 0; i < 7; i += 1) {
    const x = 24 + i * 21 + (rng() - 0.5) * 2;
    if (i === 3) {
      c.fillStyle = 'rgba(52,44,34,0.9)';
      c.fillRect(x - 7, 84, 14, 12);
      c.fillStyle = 'rgba(160,150,130,0.6)';
      c.fillRect(x - 5, 80, 10, 4);
      continue;
    }
    person(x, 64 + (rng() - 0.5) * 2.4, 1.14, i % 2 === 0 ? jerseyMid : jerseyLight, i === 1 || i === 6 ? jerseyDark : null);
  }
  // A ball at the front, on the grass.
  c.fillStyle = 'rgba(78,92,58,0.45)';
  c.fillRect(0, 100, sw, 12);
  c.fillStyle = 'rgba(224,218,198,0.95)';
  c.beginPath();
  c.arc(88, 105, 4.6, 0, Math.PI * 2);
  c.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scene.canvas, 0, 0, w, h);
  scene.dispose();
  // Sepia: a warm wash over the greys, then age at the edges and a few scratches.
  ctx.globalCompositeOperation = 'multiply';
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, '#f1dcb0');
  wash.addColorStop(1, '#d9b67c');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
  vignette.addColorStop(0, 'rgba(60,36,10,0)');
  vignette.addColorStop(1, 'rgba(60,36,10,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 0x9d, 0.1);
  ctx.strokeStyle = 'rgba(255,244,214,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const x = rng() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 20, h);
    ctx.stroke();
  }
}

/** A small scratch canvas in the document. */
function documentScratch(width: number, height: number): Scratch {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return {
    canvas,
    ctx,
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** Paint every item into its rectangle on `ctx` (an atlas-sized canvas). */
export function paintAtlas(ctx: Ctx, typeset: Typeset = {}): void {
  ctx.clearRect(0, 0, PROP_ATLAS.width, PROP_ATLAS.height);
  for (const id of Object.keys(ATLAS_SIZES) as AtlasId[]) {
    const r = ATLAS[id];
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    PAINTERS[id](ctx, r.w, r.h, (text) => typeset.log?.push({ id, text }), typeset.scratch ?? documentScratch, { x: r.x, y: r.y });
    ctx.restore();
  }
}
