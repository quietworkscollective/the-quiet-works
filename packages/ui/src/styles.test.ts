import raw from './styles.css?raw';

/** The stylesheet without comments, so braces and selectors inside them cannot confuse the parsing below. */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Text of the first `{ ... }` block opened by something matching `header`, nesting respected. */
function blockAfter(source: string, header: RegExp): string | null {
  const match = header.exec(source);
  if (!match) return null;
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  for (; i < source.length && depth > 0; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
  }
  return source.slice(start, i - 1);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Declarations of the first top-level-looking rule whose selector is exactly `selector`. */
function declarationsOf(selector: string): string {
  const header = new RegExp(`(?:^|\\})\\s*${escapeRegExp(selector)}\\s*\\{`);
  const body = blockAfter(css, header);
  if (body === null) throw new Error(`no rule for ${selector}`);
  return body;
}

function tokens(): Map<string, string> {
  const body = blockAfter(css, /:root\s*\{/);
  if (body === null) throw new Error('no :root block');
  const map = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(name!, value!.trim());
  return map;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function color(name: string): string {
  const value = tokens().get(name);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a #rrggbb token: ${value}`);
  return value;
}

describe('design tokens', () => {
  it('defines the palette from the blueprint', () => {
    const t = tokens();
    expect(t.get('--coal')).toBe('#151a20');
    expect(t.get('--coal-2')).toBe('#1c222a');
    expect(t.get('--bone')).toBe('#ddd5c8');
    expect(t.get('--teal')).toBe('#3c7775');
    expect(t.get('--teal-ink')).toBe('#24504e');
    expect(t.get('--amber')).toBe('#d59b4a');
    expect(t.get('--coral')).toBe('#d78d79');
    expect(t.get('--paper')).toBe('#e6ded0');
    expect(t.get('--paper-ink')).toBe('#2d2a26');
    expect(t.get('--amber-glow')).toMatch(/^rgba\(/);
    expect(t.get('--bone-dim')).toBeDefined();
  });

  it('declares a dark colour scheme and a coal page', () => {
    expect(tokens().get('color-scheme')).toBeUndefined();
    expect(blockAfter(css, /:root\s*\{/)).toMatch(/color-scheme:\s*dark;/);
    expect(declarationsOf('body')).toMatch(/background:\s*var\(--coal\)/);
  });

  it('builds the type scale from clamp()', () => {
    const t = tokens();
    for (const step of ['--step--2', '--step--1', '--step-0', '--step-1', '--step-2', '--step-3', '--step-4']) {
      expect(t.get(step), step).toMatch(/^clamp\(/);
    }
  });
});

describe('contrast', () => {
  // Measured against the solid token backgrounds. Text must reach 4.5 : 1.
  const text: Array<[string, string, string]> = [
    ['--bone', '--coal', 'body text'],
    ['--bone', '--coal-2', 'text on the desk'],
    ['--bone-dim', '--coal', 'secondary text'],
    ['--bone-dim', '--coal-2', 'secondary text on the desk'],
    ['--amber', '--coal', 'machine display'],
    ['--coral', '--coal', 'warm accent text'],
    ['--coal', '--amber', 'label on the brass stamp'],
    ['--bone', '--teal-ink', 'light text on dark teal'],
    ['--paper-ink', '--paper', 'memo and form text'],
    ['--paper-ink-dim', '--paper', 'memo provenance and footnote'],
    ['--teal-ink', '--paper', 'form number and ink imprints'],
    // The hatch stencil is the punchline: the verdict in bone, the supporting line in bone-dim,
    // both read against the dark cavity and against the coal it fades to.
    ['--bone', '--cavity', 'hatch stencil verdict'],
    ['--bone-dim', '--cavity', 'hatch stencil supporting line'],
    ['--bone', '--coal', 'hatch stencil verdict, far end of the cavity gradient'],
    ['--bone-dim', '--coal', 'hatch stencil supporting line, far end of the cavity gradient'],
    ['--coal', '--brass-calm-lo', 'label on the calm dock stamp, darkest brass'],
    ['--coal', '--brass-calm', 'label on the calm dock stamp'],
    ['--bone', '--coal-2', 'label on the stepped-back stamp'],
  ];

  it.each(text)('%s on %s reaches 4.5 : 1 (%s)', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('--bone-dim is at least 4.5 : 1 on coal, with the measured values recorded', () => {
    const onCoal = contrast(color('--bone-dim'), color('--coal'));
    const onCoal2 = contrast(color('--bone-dim'), color('--coal-2'));
    expect(onCoal).toBeGreaterThanOrEqual(4.5);
    expect(onCoal).toBeCloseTo(6.56, 1);
    expect(onCoal2).toBeCloseTo(6.0, 1);
  });

  it('the focus ring is at least 3 : 1 against what it sits on', () => {
    expect(contrast(color('--amber'), color('--coal'))).toBeGreaterThanOrEqual(3);
    // On paper the ring is ink, because amber would be about 1.9 : 1.
    expect(contrast(color('--paper-ink'), color('--paper'))).toBeGreaterThanOrEqual(3);
    expect(contrast(color('--amber'), color('--paper'))).toBeLessThan(3);
  });
});

describe('focus and targets', () => {
  it('draws one 2 px amber focus ring with a 2 px offset, on :focus-visible only', () => {
    const body = blockAfter(css, /:where\(\.tqw-app\)\s*:focus-visible,\s*\.tqw-memo\s*:focus-visible\s*\{/);
    expect(body).toMatch(/outline:\s*2px solid var\(--amber\)/);
    expect(body).toMatch(/outline-offset:\s*2px/);
    expect(css).not.toMatch(/:focus\s*\{/);
  });

  it('draws the toggles\' ring on their visible face, with the same 2 px amber and 2 px offset', () => {
    expect(declarationsOf('.tqw-toggle:focus-visible')).toMatch(/outline:\s*none/);
    const face = declarationsOf('.tqw-toggle:focus-visible .tqw-toggle__face');
    expect(face).toMatch(/outline:\s*2px solid var\(--amber\)/);
    expect(face).toMatch(/outline-offset:\s*2px/);
  });

  it('uses an ink focus ring on the memo paper', () => {
    expect(declarationsOf('.tqw-memo :focus-visible')).toMatch(/outline-color:\s*var\(--paper-ink\)/);
  });

  it.each(['.tqw-toggle', '.tqw-link-button', '.tqw-memo__close'])('%s is at least 44 px tall', (selector) => {
    expect(declarationsOf(selector)).toMatch(/min-height:\s*44px/);
  });

  it('keeps the settings hit target at 44 x 44 while the visible face is smaller', () => {
    const toggle = declarationsOf('.tqw-toggle');
    expect(toggle).toMatch(/min-width:\s*44px/);
    expect(toggle).toMatch(/min-height:\s*44px/);
    // Desktop face: 2 rem = 32 px. Phone face: 2.5 rem = 40 px disc. Both sit inside the 44 px box.
    expect(declarationsOf('.tqw-toggle__face')).toMatch(/height:\s*2rem/);
  });

  it('keeps the dock stamp at 44 px or more, and the desk stamp 20-25% below round one', () => {
    expect(declarationsOf(".tqw-stamp[data-variant='dock']")).toMatch(/min-height:\s*46px/);
    const desk = declarationsOf(".tqw-stamp[data-variant='desk']");
    // Round one was 24 rem x 6.5 rem. 18.5 x 5 rem is 23% smaller on both axes.
    expect(desk).toMatch(/width:\s*min\(100%,\s*18\.5rem\)/);
    expect(desk).toMatch(/min-height:\s*5rem/);
    // On a phone it may compact a little, but never below 4.5 rem = 72 px.
    expect(css).toMatch(/min-height:\s*4\.5rem;\s*padding:\s*0\.5rem/);
  });

  it('stops text selection and the double-tap zoom delay on the stamp', () => {
    const stamp = declarationsOf('.tqw-stamp');
    expect(stamp).toMatch(/user-select:\s*none/);
    expect(stamp).toMatch(/touch-action:\s*manipulation/);
  });

  it('hides the Space hint on coarse pointers', () => {
    const block = blockAfter(css, /@media \(pointer: coarse\)\s*\{/);
    expect(block).toMatch(/\.tqw-stamp__key\s*\{\s*display:\s*none/);
  });
});

describe('reduced motion', () => {
  const noMotion = (body: string) => {
    expect(body).toMatch(/animation:\s*none\s*!important/);
    expect(body).toMatch(/transition:\s*none\s*!important/);
  };

  it('the visitor toggle (data-reduced-motion) removes every animation and transition', () => {
    const header = /\[data-reduced-motion='true'\] \*,\s*\[data-reduced-motion='true'\] \*::before,\s*\[data-reduced-motion='true'\] \*::after,[^{]*\{/;
    const body = blockAfter(css, header);
    expect(body, 'no [data-reduced-motion="true"] kill-switch rule found').not.toBeNull();
    noMotion(body!);
  });

  it('the visitor toggle also reaches the memo backdrop, which is not a descendant', () => {
    expect(css).toMatch(/\[data-reduced-motion='true'\] \.tqw-memo::backdrop/);
  });

  it('the OS preference removes them too, including on the memo and its backdrop', () => {
    const body = blockAfter(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^{]*\{/);
    // blockAfter above returns the inner rule body; grab the selector list as well.
    const media = blockAfter(css, /@media \(prefers-reduced-motion: reduce\)\s*\{/);
    expect(body, 'no @media (prefers-reduced-motion: reduce) rule found').not.toBeNull();
    noMotion(media!);
    for (const selector of ['.tqw-app *', '.tqw-app *::before', '.tqw-app *::after', '.tqw-memo', '.tqw-memo::backdrop']) {
      expect(media, selector).toContain(selector);
    }
  });

  it('no animated or transitioned rule targets the .tqw-app root itself, which the kill switches cannot reach', () => {
    const withoutReduced = css
      .replace(blockAfter(css, /@media \(prefers-reduced-motion: reduce\)\s*\{/)!, '')
      .replace(/\[data-reduced-motion='true'\] \*[^{]*\{[^}]*\}/, '');
    const animated: string[] = [];
    for (const [, selector, body] of withoutReduced.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/(?:^|;|\s)(animation|transition)(?:-[a-z-]+)?\s*:/.test(body!) && !/animation:\s*none/.test(body!)) {
        animated.push(selector!.trim());
      }
    }
    expect(animated.length).toBeGreaterThan(5);
    for (const selector of animated) {
      for (const part of selector.split(',').map((s) => s.trim())) {
        expect(part, `${part} is the app root`).not.toMatch(/^\.tqw-app(?:\[[^\]]*\])?$/);
        expect(part, `${part} is outside the app`).toMatch(/^\.tqw-|^from|^to|^\d+%/);
      }
    }
  });
});

/** Every `@media` block whose query contains `query`, as text, nesting respected. */
function mediaBlocks(query: string): string[] {
  const found: string[] = [];
  const header = new RegExp(`@media[^{]*${escapeRegExp(query)}[^{]*\\{`, 'g');
  for (const match of css.matchAll(header)) {
    const at = match.index! + match[0].length;
    found.push(blockAfter(css.slice(at - match[0].length), /^@media[^{]*\{/) ?? '');
  }
  return found;
}

function inMedia(query: string, selector: string): string {
  const hit = mediaBlocks(query).find((block) => new RegExp(`(?:^|\\})\\s*${escapeRegExp(selector)}\\s*\\{`).test(block));
  if (!hit) throw new Error(`no ${selector} rule inside @media ${query}`);
  const body = blockAfter(hit, new RegExp(`(?:^|\\})\\s*${escapeRegExp(selector)}\\s*\\{`));
  return body ?? '';
}

describe('settings row', () => {
  it('is a single non-wrapping row of buttons at every width (no grid, no flex-wrap on the group)', () => {
    const group = declarationsOf('.tqw-settings');
    expect(group).toMatch(/display:\s*flex/);
    expect(group).not.toMatch(/flex-wrap:\s*wrap/);
    expect(group).not.toMatch(/grid/);
    expect(inMedia('(max-width: 40rem)', '.tqw-header')).toMatch(/flex-wrap:\s*nowrap/);
  });

  it('on a phone each toggle is a 40 px icon disc inside its 44 px hit box', () => {
    const face = inMedia('(max-width: 40rem)', '.tqw-toggle__face');
    expect(face).toMatch(/width:\s*2\.5rem/);
    expect(face).toMatch(/height:\s*2\.5rem/);
    expect(face).toMatch(/border-radius:\s*50%/);
  });

  it('on a phone the label is clipped out of sight but not removed, so it stays the accessible name', () => {
    const label = inMedia('(max-width: 40rem)', '.tqw-toggle__label');
    expect(label).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(label).not.toMatch(/display:\s*none/);
    expect(label).not.toMatch(/visibility:\s*hidden/);
  });

  it('on desktop the face is quieter: a faint outline, with the label visible', () => {
    const face = declarationsOf('.tqw-toggle__face');
    expect(face).toMatch(/border:\s*1px solid rgba\(221, 213, 200, 0\.1\d?\)/);
    expect(css).not.toMatch(/\.tqw-toggle__label\s*\{[^}]*display:\s*none/);
  });
});

describe('wordmark', () => {
  it('keeps UNHELD small and restrained', () => {
    const name = declarationsOf('.tqw-wordmark__name');
    expect(name).toMatch(/font-size:\s*var\(--step--2\)/);
    expect(name).toMatch(/color:\s*var\(--bone-dim\)/);
  });

  it('on a phone sets the place line smaller and in bone-dim', () => {
    const room = inMedia('(max-width: 40rem)', '.tqw-wordmark__room');
    expect(room).toMatch(/font-size:\s*var\(--step--2\)/);
    expect(room).toMatch(/color:\s*var\(--bone-dim\)/);
    // And it was larger and brighter before, so the phone really is quieter.
    expect(declarationsOf('.tqw-wordmark__room')).toMatch(/color:\s*var\(--bone\)/);
  });
});

describe('readout tracking', () => {
  const em = (rule: string) => Number.parseFloat(/letter-spacing:\s*([\d.]+)em/.exec(rule)?.[1] ?? 'NaN');

  it('sets long status lines tighter than short identifiers', () => {
    expect(em(declarationsOf(".tqw-readout__display[data-long='true']"))).toBeLessThan(
      em(declarationsOf('.tqw-readout__display')),
    );
    expect(em(declarationsOf(".tqw-office .tqw-readout__display[data-long='true']"))).toBeLessThan(
      em(declarationsOf('.tqw-office .tqw-readout__display')),
    );
  });

  it('tightens them further on a phone, where they must not wrap awkwardly at 320 px', () => {
    const phone = inMedia('(max-width: 40rem)', ".tqw-dock .tqw-readout__display[data-long='true']");
    expect(em(phone)).toBeLessThanOrEqual(0.03);
    const phoneShort = inMedia('(max-width: 40rem)', '.tqw-dock .tqw-readout__display');
    expect(em(phoneShort)).toBeLessThan(em(declarationsOf('.tqw-readout__display')));
  });

  it('on a phone the receipt takes its own line and the dash is not left hanging', () => {
    expect(inMedia('(max-width: 40rem)', '.tqw-dock .tqw-readout__receipt')).toMatch(/display:\s*block/);
    expect(inMedia('(max-width: 40rem)', ".tqw-dock .tqw-readout__sep [aria-hidden='true']")).toMatch(/display:\s*none/);
  });
});

describe('hatch stencil', () => {
  it('reads as the punchline: verdict in bone, supporting line in bone-dim, on the cavity', () => {
    expect(declarationsOf('.tqw-hatch__verdict')).toMatch(/color:\s*var\(--bone\)/);
    expect(declarationsOf('.tqw-hatch__lead')).toMatch(/color:\s*var\(--bone-dim\)/);
    expect(declarationsOf('.tqw-hatch__interior')).toMatch(/var\(--cavity\)/);
  });

  it('is not set in a dimmer colour than its contrast pair allows, and never fades in half-visible', () => {
    const stencil = declarationsOf('.tqw-hatch__stencil');
    expect(stencil).not.toMatch(/\bcolor:/);
    expect(stencil).not.toMatch(/opacity/);
    expect(stencil).not.toMatch(/animation/);
    expect(declarationsOf('.tqw-hatch__verdict')).not.toMatch(/opacity|animation/);
    expect(declarationsOf('.tqw-hatch__lead')).not.toMatch(/opacity|animation/);
  });
});
