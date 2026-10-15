import { CORRIDOR_PROPS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { ATLAS, ATLAS_SIZES, atlasUvRect, LABEL_ITEMS, PROP_ATLAS, TROPHY_ITEMS, type AtlasId } from './atlasLayout.ts';
import { paintAtlas, type Ctx, type Scratch } from './atlasPaint.ts';
import { BALL_MAP, ballTexel, panelAt, PATCH_DIRECTION, texelDirection } from './ballPattern.ts';
import { PROP_COPY, splitLabel } from './copy.ts';
import { readingOf } from './reading.ts';
import { PROP_IDS } from './testkit.ts';

/** A canvas context that draws nothing and remembers nothing but its font: enough to run the painters in node. */
function fakeContext(): Ctx {
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const fontSize = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state['font']))?.[1] ?? 10);
  return new Proxy({} as Ctx, {
    get(_target, key: string) {
      if (key === 'measureText') return (text: string) => ({ width: text.length * fontSize() * 0.5 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (key in state) return state[key];
      return () => undefined;
    },
    set(_target, key: string, value: unknown) {
      state[key] = value;
      return true;
    },
  });
}

function typeset(): { id: AtlasId; text: string }[] {
  const ctx = fakeContext();
  const log: { id: AtlasId; text: string }[] = [];
  const scratch = (): Scratch => ({ canvas: {} as HTMLCanvasElement, ctx, dispose: () => undefined });
  paintAtlas(ctx, { log, scratch });
  return log;
}

/** Wording compared without the colon that a heading drops and the line breaks a card makes. */
const words = (s: string): string => s.replace(/:/g, '').replace(/\s+/g, ' ').trim();

describe('the lettering on the props is the drafted copy', () => {
  const log = typeset();
  const on = (id: AtlasId): string[] => log.filter((l) => l.id === id).map((l) => l.text);

  it('sets each of the six drafted labels, word for word, on the prop it belongs to', () => {
    expect(Object.keys(LABEL_ITEMS).sort()).toEqual(Object.keys(CORRIDOR_PROPS.labels).sort());
    for (const [key, item] of Object.entries(LABEL_ITEMS) as [keyof typeof CORRIDOR_PROPS.labels, AtlasId][]) {
      expect(words(on(item).join(' ')), `${key} on ${item}`).toBe(words(CORRIDOR_PROPS.labels[key]));
    }
  });

  it('engraves each trophy with its inscription exactly, and the kept space says RESERVED', () => {
    expect(TROPHY_ITEMS.length).toBe(CORRIDOR_PROPS.trophies.length);
    TROPHY_ITEMS.forEach((item, i) => expect(on(item), `inscription ${i}`).toEqual([CORRIDOR_PROPS.trophies[i]]));
    expect(CORRIDOR_PROPS.trophies[CORRIDOR_PROPS.trophies.length - 1]).toBe('RESERVED');
  });

  it('writes the recipe card and the score book from the props lane\'s own drafted lines', () => {
    expect(on('recipeCard')).toEqual([PROP_COPY.recipe.title, ...PROP_COPY.recipe.lines]);
    expect(on('scoreCover')).toEqual([PROP_COPY.scorebook.cover, PROP_COPY.scorebook.season]);
    // The modelled scorebook's cover is blank: the same two lines go on a label pasted over it.
    expect(on('scoreLabel')).toEqual([PROP_COPY.scorebook.cover, PROP_COPY.scorebook.season]);
  });

  it('says, in words, everything the props print: the page carries every beat the 3D scene does', () => {
    const spoken = new Set(PROP_IDS.flatMap((id) => readingOf(id).lines.flatMap((l) => words(l).toLowerCase().split(' '))));
    // Every word set on the atlas (the ball and the chessboard set none) is in some prop's reading.
    for (const { id, text } of log) for (const word of words(text).toLowerCase().split(' ')) expect(spoken.has(word), `"${word}" on ${id}`).toBe(true);
    for (const id of PROP_IDS) expect(readingOf(id).verb, id).toBe(CORRIDOR_PROPS.verbs[id]);
  });

  it('splits a label at its first sentence break and loses nothing', () => {
    for (const copy of Object.values(CORRIDOR_PROPS.labels)) {
      const { heading, rest, joiner } = splitLabel(copy);
      expect(`${heading}${joiner}${rest}`).toBe(copy);
      expect(heading.length).toBeGreaterThan(3);
      expect(rest.length).toBeGreaterThan(3);
    }
  });
});

describe('the atlas layout', () => {
  const ids = Object.keys(ATLAS_SIZES) as AtlasId[];

  it('gives every item the pixel size it asks for, inside the atlas', () => {
    for (const id of ids) {
      const r = ATLAS[id];
      expect([r.w, r.h]).toEqual([...ATLAS_SIZES[id]]);
      expect(r.x).toBeGreaterThanOrEqual(PROP_ATLAS.gutter);
      expect(r.y).toBeGreaterThanOrEqual(PROP_ATLAS.gutter);
      expect(r.x + r.w).toBeLessThanOrEqual(PROP_ATLAS.width - PROP_ATLAS.gutter);
      expect(r.y + r.h).toBeLessThanOrEqual(PROP_ATLAS.height - PROP_ATLAS.gutter);
    }
  });

  it('keeps a gutter between items, so mipmaps never bleed one item into another', () => {
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const ra = ATLAS[a];
        const rb = ATLAS[b];
        const apartX = ra.x + ra.w + PROP_ATLAS.gutter <= rb.x || rb.x + rb.w + PROP_ATLAS.gutter <= ra.x;
        const apartY = ra.y + ra.h + PROP_ATLAS.gutter <= rb.y || rb.y + rb.h + PROP_ATLAS.gutter <= ra.y;
        expect(apartX || apartY, `${a} and ${b} are apart`).toBe(true);
      }
    }
  });

  it('maps each item to UVs inside 0..1, v up', () => {
    for (const id of ids) {
      const [u0, v0, u1, v1] = atlasUvRect(id);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v0).toBeGreaterThanOrEqual(0);
      expect(u1).toBeLessThanOrEqual(1);
      expect(v1).toBeLessThanOrEqual(1);
      expect(u1).toBeGreaterThan(u0);
      expect(v1).toBeGreaterThan(v0);
    }
  });
});

describe('the football\'s skin', () => {
  it('has pentagons, hexagons and seams, and the puncture patch where it is said to be', () => {
    const seen = new Set<string>();
    for (let y = 0; y < BALL_MAP.height; y += 2) for (let x = 0; x < BALL_MAP.width; x += 2) seen.add(panelAt(texelDirection(x, y)));
    for (const panel of ['pentagon', 'hexagon', 'seam', 'patch', 'glue']) expect(seen.has(panel), panel).toBe(true);
    expect(panelAt(PATCH_DIRECTION)).toBe('patch');
  });

  it('is mostly pale hexagon, a fair fraction dark pentagon, as a real ball is', () => {
    const counts = { pentagon: 0, hexagon: 0, other: 0 };
    let total = 0;
    for (let y = 0; y < BALL_MAP.height; y += 1) {
      // Weight by the area a texel covers on the sphere: rows near the poles are narrow.
      const weight = Math.sin(((y + 0.5) / BALL_MAP.height) * Math.PI);
      for (let x = 0; x < BALL_MAP.width; x += 1) {
        const panel = panelAt(texelDirection(x, y));
        counts[panel === 'pentagon' ? 'pentagon' : panel === 'hexagon' ? 'hexagon' : 'other'] += weight;
        total += weight;
      }
    }
    // Twelve pentagons and twenty hexagons: the pentagons are 28% of a truncated icosahedron, less the seams and the patch.
    expect(counts.pentagon / total).toBeGreaterThan(0.2);
    expect(counts.pentagon / total).toBeLessThan(0.285);
    expect(counts.hexagon / total).toBeGreaterThan(0.4);
  });

  it('returns whole sRGB bytes for every texel', () => {
    for (let y = 0; y < BALL_MAP.height; y += 7) {
      for (let x = 0; x < BALL_MAP.width; x += 7) {
        for (const c of ballTexel(texelDirection(x, y), x, y)) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});
