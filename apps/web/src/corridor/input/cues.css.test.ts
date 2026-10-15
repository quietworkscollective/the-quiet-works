import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CUE_TUNING } from '../camera/cueTuning.ts';

/** The overlay's stylesheet, read as text: what it must and must not put over the scene (founder: no floating menus). */
const css = readFileSync(new URL('./cues.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
const bodyOf = (selector: string) => rules.find((r) => r.selector.split(',').map((s) => s.trim()).includes(selector))?.body ?? '';

describe('"Places and actions" takes no room until it has focus', () => {
  it('is clipped to a pixel, out of the way of the pointer, whenever nothing in it has focus', () => {
    const body = bodyOf('.tqw-places:not(:focus-within)');
    expect(body).toMatch(/width:\s*1px/);
    expect(body).toMatch(/height:\s*1px/);
    expect(body).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it('shows (at the foot of the picture) only while something in it has focus', () => {
    const body = bodyOf('.tqw-places:focus-within');
    expect(body).toMatch(/bottom:/);
    expect(body).toMatch(/pointer-events:\s*auto/);
  });

  it('is the only standing control in the overlay: nothing else is positioned on the picture except what appears on demand', () => {
    // The label, ring, hint and reader are all shown by state; none is on screen by default in the stylesheet.
    const standing = rules.filter((r) => /position:\s*absolute/.test(r.body)).map((r) => r.selector);
    for (const selector of standing) {
      expect(selector, selector).toMatch(/tqw-cue|tqw-hint|tqw-reader|tqw-places|tqw-cues/);
    }
  });
});

describe('the verb label', () => {
  it('is set in the condensed grotesk, in a 44 px target, at the tuned size, fading over the tuned times', () => {
    const body = bodyOf('.tqw-cue');
    expect(body).toMatch(/font-family:\s*'IBM Plex Sans Condensed'/);
    expect(body).toMatch(/min-height:\s*var\(--tqw-cue-target,\s*44px\)/);
    expect(body).toMatch(/font-size:\s*var\(--tqw-cue-font,\s*17px\)/);
    expect(body).toMatch(/var\(--tqw-cue-fade-in,\s*120ms\)/);
    expect(body).toMatch(/var\(--tqw-cue-fade-out,\s*120ms\)/);
    // The stylesheet's fallbacks are the tuning's numbers.
    expect(CUE_TUNING.labelMinTargetPx).toBe(44);
    expect(CUE_TUNING.labelFontPx).toBe(17);
    expect(CUE_TUNING.fadeInMs).toBe(120);
    expect(CUE_TUNING.fadeOutMs).toBe(120);
  });

  it('sits beside the object by the side the rig picks, never fixed over it', () => {
    expect(bodyOf(".tqw-cue[data-side='left']")).toMatch(/translate\(-100%,\s*-50%\)/);
    expect(bodyOf(".tqw-cue[data-side='above']")).toMatch(/translate\(-50%,\s*-100%\)/);
    expect(bodyOf('.tqw-cue')).toMatch(/--tqw-cue-shift:\s*translate\(0,\s*-50%\)/);
  });

  it('does not fade for a visitor who asks for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.tqw-cue\s*\{\s*animation:\s*none;\s*transition:\s*none/);
    expect(bodyOf(".tqw-cues[data-reduced='true'] .tqw-cue")).toMatch(/animation:\s*none/);
  });

  it('can be pressed (a mouse or a finger) only while it is fully showing', () => {
    expect(bodyOf('.tqw-cue--button')).toMatch(/pointer-events:\s*auto/);
    expect(bodyOf(".tqw-cue--button[data-visible='false']")).toMatch(/pointer-events:\s*none/);
  });
});

describe('the focus indicator', () => {
  it('is a steady 2 px outline on every control of ours, and a steady 2 px ring in the scene', () => {
    expect(bodyOf('.tqw-places__item:focus-visible')).toMatch(/outline:\s*2px solid/);
    expect(bodyOf('.tqw-cue-ring')).toMatch(/border:\s*2px solid/);
    // Steady: nothing animates the ring.
    expect(bodyOf('.tqw-cue-ring')).not.toMatch(/animation|transition/);
  });
});
