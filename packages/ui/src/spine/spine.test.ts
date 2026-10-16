import {
  baseCss,
  blockAfter,
  color,
  contrastHex,
  css,
  declarationsOf,
  declaredTokens,
  inMedia,
  subjectClasses,
  tokens,
} from './cssTestUtils.ts';

/** The spine layer's stylesheet, read as text: tokens, contrast, targets, layout, reduced motion, measurements. */

describe('site tokens', () => {
  it('defines the exhibition palette and applies it to the public surface', () => {
    expect(color('--page-ground')).toBe('#171918');
    expect(color('--page-surface')).toBe('#202421');
    expect(color('--page-text')).toBe('#eee9df');
    expect(color('--page-muted')).toBe('#bdbdb4');
    expect(color('--page-rule')).toBe('#414741');
    expect(color('--page-action')).toBe('#d59b4a');
    expect(color('--page-paper')).toBe('#e2dacb');
    expect(color('--menu-surface')).toBe('#20231f');
    expect(color('--menu-text')).toBe('#eeeae1');
    expect(color('--menu-muted')).toBe('#babcb3');
    const site = declarationsOf('.tqw-site');
    expect(site).toMatch(/--coal:\s*var\(--page-ground\)/);
    expect(site).toMatch(/--coal-2:\s*var\(--page-surface\)/);
    expect(site).toMatch(/--bone:\s*var\(--page-text\)/);
    expect(site).toMatch(/--muted:\s*var\(--page-muted\)/);
    expect(site).toMatch(/--divider:\s*var\(--page-rule\)/);
    expect(site).toMatch(/--stock-bone:\s*var\(--page-paper\)/);
  });

  it('defines the ADR palette', () => {
    const t = tokens();
    expect(t.get('--coal')).toBe('#151a20');
    expect(t.get('--bone')).toBe('#ddd5c8');
    expect(t.get('--teal')).toBe('#3c7775');
    expect(t.get('--amber')).toBe('#d59b4a');
    expect(t.get('--muted')).toBe('#b7b1a6');
    expect(t.get('--divider')).toBe('#454a4c');
    expect(t.get('--coral')).toBe('#d78d79');
    expect(t.get('--dawn')).toBe('#b8c6a4');
  });

  it('defines the notice board materials: olive felt, oak, brass and three stocks', () => {
    const t = tokens();
    expect(t.get('--felt')).toBe('#505247');
    for (const name of ['--oak', '--brass', '--stock-bone', '--stock-buff', '--stock-grey-green']) {
      expect(t.get(name), name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('holds the three lower sections to one 1200 px container', () => {
    expect(tokens().get('--section-width')).toBe('1200px');
    for (const selector of ['.tqw-archive__inner', '.tqw-details__inner', '.tqw-footer__inner']) {
      expect(declarationsOf(selector), selector).toMatch(/width:\s*min\(var\(--section-width\), 100%\)/);
    }
  });

  it('lets the archive, details and footer take their content height', () => {
    for (const selector of ['.tqw-archive', '.tqw-details', '.tqw-footer', '.tqw-footer__inner']) {
      expect(declarationsOf(selector), selector).not.toMatch(/min-height\s*:/);
    }
  });
});

describe('contrast', () => {
  const text: Array<[string, string, string]> = [
    ['--bone', '--coal', 'page text, the lockup and the section titles'],
    ['--muted', '--coal', 'tagline detail line, .space, utility text'],
    ['--amber', '--coal', 'the open door in the text-mode list'],
    ['--paper-ink', '--stock-bone', 'a found paper in the archive, and the notice board headline'],
    ['--paper-ink', '--stock-buff', 'headline and description on buff stock'],
    ['--paper-ink', '--stock-grey-green', 'headline and description on grey-green stock'],
    ['--ink-soft', '--stock-bone', 'dateline on bone stock'],
    ['--ink-soft', '--stock-buff', 'dateline on buff stock'],
    ['--ink-soft', '--stock-grey-green', 'dateline on grey-green stock'],
    ['--teal-ink', '--stock-bone', 'sealed stamp on bone stock'],
    ['--teal-ink', '--stock-buff', 'sealed stamp on buff stock'],
    ['--teal-ink', '--stock-grey-green', 'sealed stamp on grey-green stock'],
    ['--coal', '--stock-bone', 'door plaque title'],
    ['--ink-soft', '--stock-bone', 'door plaque status'],
  ];

  it.each(text)('%s on %s reaches 4.5 : 1 (%s)', (fg, bg) => {
    expect(contrastHex(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  const pageTextPairs: Array<[string, string, string]> = [
    ['--page-text', '--page-ground', 'primary page text'],
    ['--page-text', '--page-surface', 'surface text'],
    ['--page-muted', '--page-ground', 'secondary page text'],
    ['--page-muted', '--page-surface', 'secondary surface text'],
    ['--page-action', '--page-ground', 'action text'],
    ['--page-action', '--page-surface', 'action text on a surface'],
    ['--paper-ink', '--page-paper', 'found document copy'],
    ['--ink-soft', '--page-paper', 'found document metadata'],
    ['--teal-ink', '--page-paper', 'found document stamp'],
    ['--menu-text', '--menu-surface', 'menu labels'],
    ['--menu-muted', '--menu-surface', 'menu setting states'],
  ];

  it.each(pageTextPairs)('%s on %s reaches 4.5 : 1 (%s)', (fg, bg) => {
    expect(contrastHex(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps focus indicators at least 3 : 1 on dark and paper surfaces', () => {
    expect(contrastHex(color('--page-action'), color('--page-ground'))).toBeGreaterThanOrEqual(3);
    expect(contrastHex(color('--paper-ink'), color('--page-paper'))).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring is at least 3 : 1 on coal, and ink is on the stocks', () => {
    expect(contrastHex(color('--amber'), color('--coal'))).toBeGreaterThanOrEqual(3);
    expect(contrastHex(color('--paper-ink'), color('--stock-grey-green'))).toBeGreaterThanOrEqual(3);
    expect(contrastHex(color('--amber'), color('--stock-bone'))).toBeLessThan(3);
    expect(declarationsOf('.tqw-clipping :focus-visible,\n.tqw-paper :focus-visible')).toMatch(/outline-color:\s*var\(--paper-ink\)/);
  });

  it('the hero lays a smooth, full-height coal wash under a soft lockup glow', () => {
    const scrim = declarationsOf('.tqw-hero__scrim');
    expect(scrim).toMatch(/inset:\s*0/);
    expect(scrim).toMatch(/linear-gradient\(\s*to bottom/);
    expect(scrim).toMatch(/rgba\(23, 25, 24, 0\.34\) 0%/);
    expect(scrim).toMatch(/rgba\(23, 25, 24, 0\.2\) 100%/);
    expect(scrim).toMatch(/radial-gradient\(/);
    for (const [, alpha = ''] of scrim.matchAll(/rgba\(23, 25, 24, ([\d.]+)\)/g)) expect(Number(alpha)).toBeLessThanOrEqual(0.34);

    const smoke = declarationsOf('.tqw-hero__smoke');
    expect(smoke).toMatch(/rgba\(233, 228, 218, 0\.23\)/);
    expect(smoke).toMatch(/rgba\(189, 184, 174, 0\.16\)/);
    expect(smoke).toMatch(/tqw-hero-smoke-drift 9s/);
    expect(smoke).toMatch(/will-change:\s*transform/);
  });

  it('the lockup glow feathers from the title without a broad dark panel', () => {
    const plate = declarationsOf('.tqw-hero__lockup::before');
    expect(plate).toMatch(/radial-gradient\(\s*ellipse closest-side at 50% 50%/);
    expect(plate).toMatch(/rgba\(23, 25, 24, var\(--hero-plate, 0\.8\)\) 0%/);
    expect(plate).toMatch(/rgba\(23, 25, 24, 0\.74\) 48%/);
    expect(plate).toMatch(/rgba\(23, 25, 24, 0\.28\) 85%/);
    expect(plate).toMatch(/rgba\(23, 25, 24, 0\) 100%/);
    expect(plate).toMatch(/pointer-events:\s*none/);
    expect(plate).toMatch(/z-index:\s*-1/);
    expect(plate).toMatch(/inset:\s*calc\(var\(--plate-y, 8rem\) \* -1\) calc\(var\(--plate-x, 4rem\) \* -1\)/);
    expect(declarationsOf('.tqw-hero__lockup')).toMatch(/padding-block:\s*4\.5rem 1rem/);
    expect(declarationsOf('.tqw-hero__lockup')).toMatch(/isolation:\s*isolate/);
  });

  it('keeps the scroll cue free of a background pseudo-panel', () => {
    expect(declarationsOf('.tqw-hero__cue')).toMatch(/background:\s*none/);
    expect(css).not.toMatch(/\.tqw-hero__cue::before\s*\{/);
  });

  it('the plate reaches past the lockup, so the hero clips it sideways and the page never scrolls sideways at 320 px', () => {
    // clip, not hidden: hidden would make the hero a scroll container and break the sticky window beside it.
    expect(declarationsOf('.tqw-hero')).toMatch(/overflow-x:\s*clip/);
    expect(declarationsOf('.tqw-hero')).not.toMatch(/overflow(?:-x)?:\s*hidden/);
  });
});

describe('targets and focus', () => {
  it.each([
    ['.tqw-page__link', 44],
    ['.tqw-board__close', 48],
    ['.tqw-clipping__go', 48],
    ['.tqw-clipping__status', 48],
    ['.tqw-menu__item', 44],
    ['.tqw-hero__cue', 44],
    ['.tqw-hero__enter', 48],
    ['.tqw-game__leave', 44],
    ['.tqw-game__tool', 44],
    ['.tqw-game__enter-button', 48],
    ['.tqw-archive__action', 44],
    ['.tqw-paper__reread', 44],
    ['.tqw-forget__button', 44],
    ['.tqw-details__link', 44],
    ['.tqw-footer__link', 48],
    ['.tqw-menu-panel__link', 44],
  ] as const)('%s is at least its minimum target tall', (selector, min) => {
    const rule = selector === '.tqw-menu-panel__link' ? declarationsOf('.tqw-menu-panel__close,\n.tqw-menu-panel__link') : declarationsOf(selector);
    expect(rule).toMatch(new RegExp(`min-height:\\s*${min}px`));
  });

  it('the icon-only controls are 44 px square', () => {
    expect(declarationsOf('.tqw-menu__sound')).toMatch(/width:\s*44px/);
    expect(declarationsOf('.tqw-menu__sound')).toMatch(/height:\s*44px/);
    expect(declarationsOf('.tqw-game__tool')).toMatch(/min-width:\s*44px/);
    // The phone rule clips the Fullscreen word, never the target.
    const phone = inMedia('(max-width: 40rem)', '.tqw-game__tool-label');
    expect(phone).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(phone).not.toMatch(/display:\s*none/);
  });

  it('gives keyboard focus a 2 px bone ring with a 3 px offset, at low specificity', () => {
    const rule = declarationsOf(':where(.tqw-site) :focus-visible');
    expect(rule).toMatch(/outline:\s*2px solid var\(--bone\)/);
    expect(rule).toMatch(/outline-offset:\s*3px/);
  });

  it('leaves the programmatically focused page heading unoutlined while controls keep their focus-visible ring', () => {
    expect(declarationsOf(':where(.tqw-site) :focus-visible')).toMatch(/outline:\s*2px solid var\(--bone\)/);
    expect(declarationsOf('.tqw-page__title:focus')).toMatch(/outline:\s*none/);
  });

  it('keeps the skip link out of sight until it is focused', () => {
    expect(declarationsOf('.tqw-skip')).toMatch(/top:\s*-4rem/);
    expect(declarationsOf('.tqw-skip:focus')).toMatch(/top:\s*1rem/);
  });
});

describe('amber is for actionable attention only', () => {
  it('appears as a text or line colour only on interactive states, the open door, and the text-mode notice', () => {
    const uses = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /(?:color|background|border-left|border-bottom-color|outline|outline-color)[^;]*var\(--amber\)/.test(body!))
      .map(([, selector]) => selector!.trim().replace(/\s+/g, ' '));
    expect(uses.length).toBeGreaterThan(0);
    for (const selector of uses) {
      expect(selector, `${selector} uses amber`).toMatch(
        /:hover|:focus|:where\(\.tqw-site\)|\[data-status='open'\]|\.tqw-text__notice|\.tqw-doors--overlay \.tqw-door:focus-visible/,
      );
    }
  });
});

describe('the layers do not collide', () => {
  /**
   * The Office's base layer already styles a `.tqw-stage` (a fixed, clipped box). The page's own
   * wrapper once reused that name and inherited `overflow: hidden`, which defeats `position: sticky`
   * on everything inside it: the game window never pinned. A class this layer styles as a subject
   * must not be one styles.css also styles as a subject, except the ones it deliberately extends.
   */
  const extended = new Set(['tqw-app', 'tqw-link-button', 'tqw-settings', 'tqw-toggle', 'tqw-toggle__face', 'tqw-toggle__icon', 'tqw-toggle__label']);

  it('only restyles a base class where it means to extend it', () => {
    const baseSubjects = subjectClasses(baseCss);
    const shared = [...subjectClasses(css)].filter((name) => baseSubjects.has(name) && name.startsWith('tqw-') && !extended.has(name));
    expect(shared).toEqual([]);
  });

  it('wraps the hero, the run and the game window in a class of its own, not the Office\'s', () => {
    expect(subjectClasses(css).has('tqw-journey')).toBe(true);
    expect(subjectClasses(baseCss).has('tqw-journey')).toBe(false);
    expect(subjectClasses(css).has('tqw-stage')).toBe(false);
  });
});

describe('the hero (ADR 0003, consult 4 section 1)', () => {
  /** Evaluates `clamp(min, calc(base + (100vw - Wpx) * slope), max)` at a viewport width. */
  function clampAt(value: string | undefined, width: number): number {
    const plain = /^(\d+)px$/.exec(value ?? '');
    if (plain) return Number(plain[1]);
    const m = /^clamp\((\d+)px,\s*calc\((\d+)px \+ \(100vw - (\d+)px\) \* ([\d.]+)\),\s*(\d+)px\)$/.exec(value ?? '');
    if (!m) throw new Error(`not a clamp over 100vw: ${value}`);
    const [min, base, from, slope, max] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    return Math.min(max, Math.max(min, base + (width - from) * slope));
  }
  /** A hero token at a width: the 390 px and up values live in the @media block over the narrow phone ones. */
  function hero(property: string, width: number): number {
    const wide = declaredTokens(inMedia('(min-width: 390px)', ':root'));
    return clampAt(width >= 390 ? wide.get(property) : tokens().get(property), width);
  }

  it('sets UNHELD 136 px at 1440, 72 px at 390 and 64 px at 320, and stops growing there', () => {
    expect(hero('--hero-name', 1440)).toBeCloseTo(136, 0);
    expect(hero('--hero-name', 390)).toBeCloseTo(72, 0);
    expect(hero('--hero-name', 320)).toBeCloseTo(64, 0);
    expect(hero('--hero-name', 2560)).toBe(136);
    expect(hero('--hero-name', 280)).toBe(64);
  });

  it('sets .space 20 / 16 px and its gap 6 / 4 px', () => {
    expect(hero('--hero-space', 1440)).toBeCloseTo(20, 0);
    expect(hero('--hero-space', 390)).toBeCloseTo(16, 0);
    expect(hero('--hero-space', 320)).toBeCloseTo(16, 0);
    expect(hero('--hero-space-gap', 1440)).toBeCloseTo(6, 0);
    expect(hero('--hero-space-gap', 390)).toBeCloseTo(4, 0);
  });

  it('sets the tagline 28 / 22 px and its distance from .space 24 / 20 px', () => {
    expect(hero('--hero-tagline', 1440)).toBeCloseTo(28, 0);
    expect(hero('--hero-tagline', 390)).toBeCloseTo(22, 0);
    expect(hero('--hero-tagline', 320)).toBeCloseTo(22, 0);
    expect(hero('--hero-tagline-gap', 1440)).toBeCloseTo(24, 0);
    expect(hero('--hero-tagline-gap', 390)).toBeCloseTo(20, 0);
    expect(hero('--hero-tagline-gap', 320)).toBeCloseTo(20, 0);
  });

  it('keeps 64 / 24 / 20 px clear at the sides', () => {
    expect(hero('--hero-clear', 1440)).toBeCloseTo(64, 0);
    expect(hero('--hero-clear', 412)).toBeCloseTo(24, 0);
    expect(hero('--hero-clear', 320)).toBeCloseTo(20, 0);
  });

  it('sets UNHELD in Plex Sans 700, tracking -0.025 em, line height 0.94, in bone', () => {
    const name = declarationsOf('.tqw-hero__name');
    expect(name).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(name).toMatch(/font-weight:\s*700/);
    expect(name).toMatch(/line-height:\s*0\.9444/);
    expect(name).toMatch(/color:\s*var\(--bone\)/);
    // The tracking is on the word, beside its size: in em on the h1 it would be em of the h1's own
    // 16 px, inherited as a fixed length, and the lockup would be 3.6 px a letter too loose at 144 px.
    const word = declarationsOf('.tqw-hero__word');
    expect(word).toMatch(/font-size:\s*var\(--hero-name\)/);
    expect(word).toMatch(/letter-spacing:\s*-0\.025em/);
    expect(name).not.toMatch(/letter-spacing/);
  });

  it('sets .space small, regular, muted and right-aligned with the D', () => {
    const space = declarationsOf('.tqw-hero__space');
    expect(space).toMatch(/font-size:\s*var\(--hero-space\)/);
    expect(space).toMatch(/font-weight:\s*400/);
    expect(space).toMatch(/color:\s*var\(--muted\)/);
    expect(declarationsOf('.tqw-hero__name')).toMatch(/align-items:\s*flex-end/);
  });

  it('sets the tagline in Newsreader and allows two balanced lines', () => {
    const tagline = declarationsOf('.tqw-hero__tagline');
    expect(tagline).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(tagline).toMatch(/font-size:\s*var\(--hero-tagline\)/);
    expect(tagline).toMatch(/text-wrap:\s*balance/);
  });

  it('sets the live details beside the invitation and the menu to the control scale', () => {
    const details = declarationsOf('.tqw-hero__details');
    expect(details).toMatch(/font-size:\s*var\(--page-meta-size\)/);
    expect(details).toMatch(/gap:\s*0\.25rem 1rem/);
    expect(details).toMatch(/grid-area:\s*details/);
    expect(details).toMatch(/color:\s*var\(--menu-text\)/);
    const item = declarationsOf('.tqw-menu__item');
    expect(item).toMatch(/font-size:\s*var\(--page-control-size\)/);
    expect(item).toMatch(/font-weight:\s*400/);
    expect(item).toMatch(/letter-spacing:\s*0/);
    expect(declarationsOf('.tqw-menu')).toMatch(/gap:\s*1\.5rem/);
  });

  it('a phone shows Menu alone: Notice board and About fold into it', () => {
    const phone = inMedia('(max-width: 40rem)', '.tqw-menu__item--board,\n  .tqw-menu__item--about');
    expect(phone).toMatch(/display:\s*none/);
  });

  it('keeps the lockup above the invitation row, with the scroll cue 24 px below', () => {
    expect(declarationsOf('.tqw-hero')).toMatch(/min-height:\s*var\(--tqw-vh\)/);
    expect(declarationsOf('.tqw-hero')).toMatch(/grid-template-rows:\s*minmax\(0, 1fr\) auto/);
    expect(declarationsOf('.tqw-hero__lockup')).toMatch(/top:\s*calc\(var\(--tqw-vh\) \* -0\.12\)/);
    expect(declarationsOf('.tqw-hero__foot')).toMatch(/inset:\s*58% 0 auto/);
    expect(declarationsOf('.tqw-hero__foot')).toMatch(/row-gap:\s*24px/);
    expect(declarationsOf('.tqw-hero__enter')).toMatch(/min-height:\s*48px/);
  });

  it('uses the small viewport for every section, with a 100vh fallback', () => {
    expect(tokens().get('--tqw-vh')).toBe('100vh');
    const supported = blockAfter(css, /@supports \(height: 100svh\)\s*\{/) ?? '';
    expect(declarationsOf(':root', supported)).toMatch(/--tqw-vh:\s*100svh/);
  });
});

describe('the page is one column of sections (ADR 0003)', () => {
  it('stacks the hero, the run and the game window\'s slot in one flow that shares a cell with the window', () => {
    expect(declarationsOf('.tqw-journey')).toMatch(/display:\s*grid/);
    expect(declarationsOf('.tqw-journey > *')).toMatch(/grid-area:\s*1 \/ 1/);
    expect(declarationsOf('.tqw-journey__flow')).toMatch(/pointer-events:\s*none/);
    expect(declarationsOf('.tqw-journey')).not.toMatch(/overflow/);
  });

  it('runs the smoke for (run - 1) viewports after the hero, so run viewports pass before the window', () => {
    expect(declarationsOf('.tqw-run')).toMatch(/height:\s*calc\(\(var\(--tqw-run, 2\.5\) - 1\) \* var\(--tqw-vh\)\)/);
    expect(declarationsOf('.tqw-slot')).toMatch(/height:\s*var\(--tqw-vh\)/);
  });

  it('pins the game window for the whole run: sticky at the top, one viewport tall, full bleed, clipped', () => {
    const window = declarationsOf('.tqw-game__window');
    expect(window).toMatch(/position:\s*sticky/);
    expect(window).toMatch(/top:\s*0/);
    expect(window).toMatch(/height:\s*var\(--tqw-vh\)/);
    expect(window).toMatch(/overflow:\s*hidden/);
    expect(window).not.toMatch(/border-radius/);
    expect(window).not.toMatch(/(?:^|[\s;])border:/);
  });

  it('never snaps or hijacks scrolling', () => {
    expect(css).not.toMatch(/scroll-snap/);
    expect(css).not.toMatch(/(?<!over)scroll-behavior/);
    expect(css).not.toMatch(/overscroll-behavior(?:-y)?:\s*none/);
  });

  it('stacks the lower sections above the scene and opaque, so no world shows through them', () => {
    for (const selector of ['.tqw-archive', '.tqw-details', '.tqw-footer']) {
      expect(declarationsOf(selector), selector).toMatch(/background:\s*var\(--coal\)/);
      expect(declarationsOf(selector), selector).toMatch(/z-index:\s*2/);
    }
    expect(declarationsOf('.tqw-journey__flow')).toMatch(/z-index:\s*3/);
  });
});

describe('the game window', () => {
  it('fills the window with the world and with any chamber, not the screen', () => {
    const fill = declarationsOf('.tqw-game .tqw-corridor-canvas,\n.tqw-game .tqw-chamber-host');
    expect(fill).toMatch(/position:\s*absolute/);
    expect(fill).toMatch(/inset:\s*0/);
    expect(declarationsOf('.tqw-game .tqw-chamber-host .tqw-app')).toMatch(/position:\s*absolute/);
    // The old full-screen rule for the corridor canvas is gone.
    expect(css).not.toMatch(/\.tqw-corridor-canvas\s*\{[^}]*position:\s*fixed/);
  });

  it('owns every touch gesture only when engaged: resting, the stylesheet claims none and the page scrolls', () => {
    expect(declarationsOf(".tqw-site[data-engaged='true'] .tqw-game__window")).toMatch(/touch-action:\s*none/);
    expect(declarationsOf('.tqw-game__window')).not.toMatch(/touch-action/);
  });

  it('lifts the resting scrim over 180 ms when engaged', () => {
    const scrim = declarationsOf('.tqw-game__scrim');
    expect(scrim).toMatch(/transition:\s*opacity 180ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)/);
    expect(scrim).toMatch(/linear-gradient\(to bottom, rgba\(23, 25, 24, 0\.88\), rgba\(23, 25, 24, 0\) 96px\)/);
    expect(declarationsOf(".tqw-game__window[data-engaged='true'] .tqw-game__scrim")).toMatch(/opacity:\s*0/);
  });

  it('keeps the chrome out of sight and out of reach until the smoke clears, but always when engaged', () => {
    expect(declarationsOf('.tqw-game__chrome')).toMatch(/opacity:\s*var\(--tqw-chrome-o, 0\)/);
    expect(declarationsOf(".tqw-game__window[data-chrome='off'] .tqw-game__chrome")).toMatch(/visibility:\s*hidden/);
    const engaged = declarationsOf(".tqw-game__window[data-engaged='true'] .tqw-game__chrome");
    expect(engaged).toMatch(/opacity:\s*1/);
    expect(engaged).toMatch(/visibility:\s*visible/);
  });

  it('lets the pointer through the chrome except on its own controls', () => {
    expect(declarationsOf('.tqw-game__chrome')).toMatch(/pointer-events:\s*none/);
    expect(declarationsOf('.tqw-game__leave,\n.tqw-game__tool,\n.tqw-game__enter-button')).toMatch(/pointer-events:\s*auto/);
  });

  it('sets the strip 24 px in on a screen and 16 px on a phone, honouring the safe areas', () => {
    expect(declarationsOf('.tqw-game__strip')).toMatch(/max\(1\.5rem, env\(safe-area-inset-top, 0px\)\)/);
    expect(inMedia('(max-width: 40rem)', '.tqw-game__strip')).toMatch(/max\(1rem, env\(safe-area-inset-top, 0px\)\)/);
  });

  it('gives engaged controls a solid 56 px strip and keeps phone labels out of the scene', () => {
    const engaged = declarationsOf(".tqw-game__window[data-engaged='true'] .tqw-game__strip");
    expect(engaged).toMatch(/height:\s*calc\(56px \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(engaged).toMatch(/background:\s*var\(--menu-surface\)/);
    expect(inMedia('(pointer: coarse), (max-width: 40rem)', '.tqw-game__key')).toMatch(/display:\s*none/);
    expect(inMedia('(max-width: 40rem)', ".tqw-game__window[data-engaged='true'] .tqw-game__tool-label")).toMatch(/clip-path:\s*inset\(50%\)/);
  });

  it('shows the touch mode line on a coarse pointer or a phone, and nowhere else', () => {
    expect(declarationsOf('.tqw-game__mode')).toMatch(/display:\s*none/);
    expect(inMedia('(pointer: coarse), (max-width: 40rem)', '.tqw-game__mode')).toMatch(/display:\s*block/);
  });

  it('is the whole screen in browser fullscreen', () => {
    expect(declarationsOf('.tqw-game__window:fullscreen')).toMatch(/height:\s*100%/);
  });
});

describe('the smoke veil', () => {
  it('is composited only: transforms and opacity, never a filter or a backdrop filter', () => {
    const veil = css.slice(css.indexOf('.tqw-veil {'), css.indexOf('.tqw-game {'));
    expect(veil.length).toBeGreaterThan(500);
    expect(veil).not.toMatch(/filter:/);
    expect(veil).not.toMatch(/backdrop-filter/);
  });

  it('draws one texture on two layers, the second 10% larger, mirrored, and at most 6 vh off the first', () => {
    const a = declarationsOf('.tqw-veil__layer--a');
    const b = declarationsOf('.tqw-veil__layer--b');
    expect(declarationsOf('.tqw-veil__layer')).toMatch(/background-image:\s*var\(--tqw-smoke, none\)/);
    expect(a).toMatch(/background-size:\s*max\(100vw, 100vh\) max\(100vw, 100vh\)/);
    expect(b).toMatch(/background-size:\s*calc\(max\(100vw, 100vh\) \* 1\.1\) calc\(max\(100vw, 100vh\) \* 1\.1\)/);
    expect(b).toMatch(/scaleX\(-1\)/);
    expect(b).toMatch(/\(1 - var\(--tqw-veil, 0\)\) \* 6vh/);
  });

  it('rises as one broad mass with a long feathered edge, never a straight line', () => {
    const layer = declarationsOf('.tqw-veil__layer');
    expect(layer).toMatch(/height:\s*160%/);
    expect(layer).toMatch(/mask-image:\s*linear-gradient\(to bottom, transparent 0, #000 42%\)/);
  });

  it('is certain to cover at the seam: an opaque coal backing takes over from 85% coverage', () => {
    const backing = declarationsOf('.tqw-veil__backing');
    expect(backing).toMatch(/background:\s*var\(--coal\)/);
    expect(backing).toMatch(/opacity:\s*clamp\(0, calc\(\(var\(--tqw-veil, 0\) - 0\.85\) \/ 0\.15\), 1\)/);
  });

  it('is plain coal with a 120 ms dissolve, and no texture and no movement, under reduced motion', () => {
    expect(declarationsOf(".tqw-veil[data-reduced='true'] .tqw-veil__layer")).toMatch(/display:\s*none/);
    expect(declarationsOf(".tqw-veil[data-reduced='true'] .tqw-veil__backing")).toMatch(/opacity:\s*var\(--tqw-veil, 0\)/);
    // The base layer kills every transition under reduced motion with !important; the dissolve is the
    // one deliberate exception, so it has to outrank that rule: more specific, and !important too.
    const dissolve = declarationsOf(".tqw-site .tqw-veil[data-reduced='true'] .tqw-veil__backing");
    expect(dissolve).toMatch(/transition:\s*opacity 120ms linear !important/);
  });

  it('never catches the pointer', () => {
    expect(declarationsOf('.tqw-veil')).toMatch(/pointer-events:\s*none/);
  });
});

describe('the archive (ADR 0003: found discoveries only)', () => {
  it('lays papers out three across on a screen, two on a phone and one at 320 px, 20 / 12 px apart', () => {
    expect(declarationsOf('.tqw-archive__items')).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(declarationsOf('.tqw-archive__items')).toMatch(/gap:\s*1\.25rem/);
    expect(inMedia('(max-width: 40rem)', '.tqw-archive__items')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(inMedia('(max-width: 40rem)', '.tqw-archive__items')).toMatch(/gap:\s*0\.75rem/);
    expect(inMedia('(max-width: 22.5rem)', '.tqw-archive__items')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it('gives found documents room for their content without assigning a fixed height', () => {
    expect(declarationsOf('.tqw-paper')).toMatch(/min-height:\s*10rem/);
    expect(css).not.toMatch(/\.tqw-paper\[data-state='(?:found|sealed)'\]\s*\{[^}]*(?:min-)?height:/);
    expect(css).not.toContain(".tqw-paper[data-state='sealed']");
  });

  it('has no styles for empty-room counts, sealed entries or room slots', () => {
    expect(css).not.toMatch(/\.tqw-archive__(?:none|room-count|sealed|sealed-row|recognitions)\b/);
  });

  it('puts Forget everything on its own ruled row after export and import', () => {
    expect(declarationsOf('.tqw-archive__forget')).toMatch(/border-top:\s*1px solid var\(--divider\)/);
    expect(declarationsOf('.tqw-archive__actions')).toMatch(/display:\s*flex/);
  });

  it('draws no progress bar, ring, meter or percentage anywhere in the stylesheet', () => {
    expect(css).not.toMatch(/\.tqw-(?:archive|paper)[\w-]*(?:progress|meter|ring|bar|percent|gauge)/);
    expect(css).not.toMatch(/conic-gradient/);
  });

  it('reveals a newly found paper with a 180 ms opacity fade only', () => {
    expect(declarationsOf(".tqw-paper[data-state='found'][data-new='true']")).toMatch(/animation:\s*tqw-paper-in 180ms ease-out both/);
    const frames = blockAfter(css, /@keyframes tqw-paper-in\s*\{/) ?? '';
    expect(frames).toMatch(/opacity:\s*0/);
    expect(frames).not.toMatch(/transform|translate|scale/);
  });

  it('sets the room title in Newsreader and found paper titles at reading size', () => {
    const title = declarationsOf('.tqw-archive__room-title');
    expect(title).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(title).toMatch(/font-size:\s*1\.75rem/);
    expect(inMedia('(max-width: 40rem)', '.tqw-archive__room-title')).toMatch(/font-size:\s*1\.5rem/);
    expect(declarationsOf('.tqw-paper__title')).toMatch(/font-size:\s*1\.125rem/);
  });

  it('pads the section 96 px on a screen and 64 px on a phone', () => {
    expect(declarationsOf('.tqw-archive')).toMatch(/padding:\s*4rem var\(--page-gutter\)/);
    expect(inMedia('(min-width: 40.0625rem)', '.tqw-archive')).toMatch(/padding-block:\s*6rem/);
  });

  it('keeps Forget everything calm: the same type as its neighbours, set last, with no alarm colour', () => {
    const confirm = declarationsOf('.tqw-forget__button--confirm');
    expect(confirm).toMatch(/color:\s*var\(--bone\)/);
    expect(css).not.toMatch(/\.tqw-forget[^{}]*\{[^}]*(?:var\(--coral\)|red|#f)/);
  });
});

describe('the details and the footer', () => {
  it('sets the details on a twelve column spread, with a five column introduction beside seven topic columns', () => {
    const inner = declarationsOf('.tqw-details__inner');
    expect(inner).toMatch(/grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
    expect(declarationsOf('.tqw-details__intro')).toMatch(/grid-column:\s*span 5/);
    expect(declarationsOf('.tqw-details__topics')).toMatch(/grid-column:\s*span 7/);
    expect(inner).toMatch(/gap:\s*1\.5rem/);
    expect(inMedia('(max-width: 47.5rem)', '.tqw-details__inner')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(inMedia('(max-width: 47.5rem)', '.tqw-details__intro,\n  .tqw-details__topics')).toMatch(/grid-column:\s*1 \/ -1/);
  });

  it('sets the editorial lead in Newsreader and body copy to the 18 / 28 scale', () => {
    const lead = declarationsOf('.tqw-details__lead');
    expect(lead).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(lead).toMatch(/font-size:\s*1\.5rem/);
    expect(lead).toMatch(/line-height:\s*1\.4167/);
    const body = declarationsOf('.tqw-details__topic-body');
    expect(body).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(body).toMatch(/font-size:\s*18px/);
    expect(body).toMatch(/line-height:\s*28px/);
    expect(inMedia('(max-width: 40rem)', '.tqw-details__lead')).toMatch(/font-size:\s*1\.3125rem/);
    expect(declarationsOf('.tqw-details__topic + .tqw-details__topic')).toMatch(/margin-top:\s*2rem/);
    expect(declarationsOf('.tqw-details__link')).toMatch(/margin-top:\s*0\.75rem/);
  });

  it('sets the section titles 48 / 52 px desktop and 34 / 38 px phone, in Newsreader', () => {
    const title = declarationsOf('.tqw-archive__title,\n.tqw-details__title');
    expect(title).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(title).toMatch(/font-size:\s*3rem/);
    expect(title).toMatch(/line-height:\s*1\.0833/);
    expect(inMedia('(max-width: 40rem)', '.tqw-archive__title,\n  .tqw-details__title,\n  .tqw-page__title')).toMatch(/font-size:\s*2\.125rem/);
    expect(inMedia('(max-width: 40rem)', '.tqw-archive__title,\n  .tqw-details__title,\n  .tqw-page__title')).toMatch(/line-height:\s*1\.1176/);
  });

  it('separates the footer\'s links from what is above with one rule, in the divider colour', () => {
    expect(declarationsOf('.tqw-footer__base')).toMatch(/border-top:\s*1px solid var\(--divider\)/);
    // One rule in the whole footer: the section itself draws none.
    expect(css.match(/\.tqw-footer[\w-]*\s*\{[^}]*border-(?:top|bottom):/g)).toHaveLength(1);
  });

  it('allocates no trivia block in the footer stylesheet', () => {
    expect(css).not.toContain('.tqw-footer__trivia');
  });
});

describe('the notice board', () => {
  it('pins every clipping within 2 degrees of true', () => {
    const tilts = [...css.matchAll(/--tilt:\s*(-?[\d.]+)deg/g)].map((m) => Math.abs(Number(m[1])));
    expect(tilts.length).toBeGreaterThanOrEqual(4);
    for (const tilt of tilts) expect(tilt).toBeLessThanOrEqual(2);
    expect(declarationsOf('.tqw-clipping:nth-child(4n + 4)')).toMatch(/--tilt:\s*1\.6deg/);
  });

  it('sets headlines at 18 px or more', () => {
    expect(declarationsOf('.tqw-clipping__headline')).toMatch(/font-size:\s*clamp\(1\.125rem,/);
    expect(declarationsOf('.tqw-clipping__headline')).toMatch(/font-family:\s*var\(--font-serif\)/);
  });

  it('keeps datelines in Mono and sets document text in Plex Sans', () => {
    expect(declarationsOf('.tqw-clipping__dateline')).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(declarationsOf('.tqw-clipping__dek')).toMatch(/font-family:\s*var\(--font-public\)/);
  });

  it('is two columns on a screen and one on a phone', () => {
    expect(declarationsOf('.tqw-board__clippings')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(inMedia('(max-width: 40rem)', '.tqw-board__clippings')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});

describe('site pages', () => {
  it('sets a 720 px reading column in Plex Sans body type', () => {
    expect(declarationsOf('.tqw-page__sheet')).toMatch(/width:\s*min\(720px,/);
    const body = declarationsOf('.tqw-page__article p');
    expect(body).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(body).toMatch(/font-size:\s*var\(--page-body-size\)/);
    expect(body).toMatch(/line-height:\s*var\(--page-body-leading\)/);
  });

  it('sets the navigation in Plex Sans at the control scale', () => {
    const link = declarationsOf('.tqw-page__link');
    expect(link).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(link).toMatch(/font-size:\s*15px/);
    expect(link).toMatch(/line-height:\s*20px/);
  });

  it('leaves 64 px plus the safe-area inset after the final reading text', () => {
    expect(declarationsOf('.tqw-page__sheet')).toMatch(/padding:\s*24px 0 calc\(64px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(inMedia('(max-width: 40rem)', '.tqw-page__sheet'))
      .toMatch(/padding:.*calc\(64px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });

  it('sets a link in the reading text colour and underlined, not in the browser\'s blue', () => {
    const link = declarationsOf('.tqw-page__article a');
    expect(link).toMatch(/color:\s*var\(--reading-text\)/);
    expect(link).toMatch(/text-decoration:\s*underline/);
  });

  it('lists third-party assets as ruled, unbulleted Plex Sans body copy', () => {
    expect(declarationsOf('.tqw-page__assets')).toMatch(/border-top:\s*1px solid var\(--divider\)/);
    const list = declarationsOf('.tqw-page__assets-list');
    expect(list).toMatch(/list-style:\s*none/);
    expect(list).toMatch(/padding:\s*0/);
    const item = declarationsOf('.tqw-page__assets-list li');
    expect(item).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(item).toMatch(/border-top:\s*1px solid var\(--divider\)/);
    // A long title or author must wrap inside the column, never carry the page sideways.
    expect(item).toMatch(/overflow-wrap:\s*anywhere/);
    // A provider's name is set as it writes it: capitals would turn ambientCG into AMBIENTCG.
    expect(declarationsOf('.tqw-page__assets-provider')).not.toMatch(/text-transform/);
    expect(declarationsOf('.tqw-page__assets-group + p')).toMatch(/margin-top:\s*1\.75rem/);
  });
});

describe('the menu panel', () => {
  it('is a fixed panel at the top right that scrolls on its own and never past its edge', () => {
    const panel = declarationsOf('.tqw-menu-panel');
    expect(panel).toMatch(/position:\s*fixed/);
    expect(panel).toMatch(/width:\s*360px/);
    expect(panel).toMatch(/inset:\s*24px 24px auto auto/);
    expect(panel).toMatch(/background:\s*var\(--menu-surface\)/);
    expect(panel).toMatch(/max-height:\s*calc\(100dvh - 48px\)/);
    expect(panel).toMatch(/overscroll-behavior:\s*contain/);
    const phone = inMedia('(max-width: 40rem)', '.tqw-menu-panel');
    expect(phone).toMatch(/inset:\s*16px/);
    expect(phone).toMatch(/max-height:\s*calc\(100dvh - 32px\)/);
    expect(inMedia('(max-width: 40rem)', '.tqw-menu-panel__sheet')).toMatch(/padding:\s*20px/);
  });

  it('shows the settings with their words, whatever the width', () => {
    const label = declarationsOf('.tqw-menu-panel .tqw-toggle__label');
    expect(label).toMatch(/position:\s*static/);
    expect(label).not.toMatch(/clip:\s*rect/);
  });
});

describe('reduced motion', () => {
  const reduced = blockAfter(css, /@media \(prefers-reduced-motion: reduce\)\s*\{/) ?? '';

  it('pins clippings square and removes transitions and entrance fades (system preference)', () => {
    expect(reduced).toMatch(/\.tqw-clipping\s*\{[^}]*transform:\s*none/);
    expect(reduced).toMatch(/\.tqw-board\[open\],\s*\.tqw-page\[open\],\s*\.tqw-menu-panel\[open\]\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/transition:\s*none/);
  });

  it('turns off the newly-found reveal and the scrim fade', () => {
    expect(reduced).toMatch(/\.tqw-paper\[data-state='found'\]\[data-new='true'\]\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.tqw-game__scrim\s*\{[^}]*transition:\s*none/);
  });

  it('does the same for the visitor\'s own Settings choice on .tqw-site', () => {
    expect(css).toMatch(/\.tqw-site\[data-reduced-motion='true'\] \.tqw-clipping\s*\{[^}]*transform:\s*none/);
    expect(css).toMatch(/\[data-reduced-motion='true'\] :is\(\.tqw-board, \.tqw-page, \.tqw-menu-panel\)\[open\]\s*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/\.tqw-site\[data-reduced-motion='true'\] \.tqw-paper\[data-state='found'\]\[data-new='true'\]\s*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/\.tqw-site\[data-reduced-motion='true'\] \.tqw-game__scrim\s*\{[^}]*transition:\s*none/);
  });

  it('has no smooth-scroll override anywhere: scrolling stays native', () => {
    expect(css).not.toMatch(/(?<!over)scroll-behavior/);
  });
});

describe('text mode', () => {
  it('has no world behind the hero: no scrim, and the stage is plain block flow', () => {
    expect(declarationsOf(".tqw-site[data-text='true'] .tqw-journey")).toMatch(/display:\s*block/);
    expect(declarationsOf(".tqw-site[data-text='true'] .tqw-hero__scrim")).toMatch(/display:\s*none/);
  });

  it('puts the corridor\'s prose and door list where the game window would be, in the page\'s flow', () => {
    const section = declarationsOf('.tqw-game--text');
    expect(section).toMatch(/min-height:\s*var\(--tqw-vh\)/);
    expect(section).not.toMatch(/position:\s*sticky/);
    expect(declarationsOf('.tqw-game--text .tqw-chamber-host')).toMatch(/position:\s*relative/);
  });

  it('lets a chamber\'s own text mode join the flow instead of scrolling in a fixed box', () => {
    const rule = declarationsOf(".tqw-game--text .tqw-chamber-host .tqw-app,\n.tqw-game--text .tqw-chamber-host .tqw-app[data-mode='text']");
    expect(rule).toMatch(/position:\s*relative/);
    expect(rule).toMatch(/height:\s*auto/);
  });

  it('keeps corridor prose inside the page grid, with a 44 rem reading column', () => {
    expect(declarationsOf('.tqw-text-corridor')).toMatch(/max-width:\s*var\(--section-width\)/);
    expect(declarationsOf('.tqw-text-corridor > *')).toMatch(/max-width:\s*44rem/);
  });
});

describe('the hero lockup\'s motion (the founder\'s direction: the word is about being let go)', () => {
  const letterArrival = (selector: string) => declarationsOf(`.tqw-hero[data-arrive='run'] ${selector}`);

  it('arrives in this order: HELD, then UN, then the release, then .space, the tagline and the details', () => {
    // HELD fades up at once for 500 ms; UN comes from the left from 700 ms for 550 ms.
    expect(letterArrival('.tqw-hero__letter:nth-child(n + 3) .tqw-hero__arrive')).toMatch(/tqw-fade-in 500ms ease-out both/);
    expect(letterArrival('.tqw-hero__letter:nth-child(-n + 2) .tqw-hero__arrive')).toMatch(/tqw-un-arrive 550ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\) 700ms both/);
    // The word re-centres as UN joins, over the same time and with the same easing.
    expect(letterArrival('.tqw-hero__word')).toMatch(/tqw-recentre 550ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\) 700ms both/);
    // Released at 1250 ms, over 1200 ms, for all six letters.
    for (const selector of ['.tqw-hero__letter:nth-child(n + 3) .tqw-hero__arrive', '.tqw-hero__letter:nth-child(-n + 2) .tqw-hero__arrive']) {
      expect(letterArrival(selector), selector).toMatch(/tqw-release 1200ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\) 1250ms both/);
    }
    expect(letterArrival('.tqw-hero__space')).toMatch(/tqw-fade-in 600ms ease-out 1800ms both/);
    expect(letterArrival('.tqw-hero__tagline')).toMatch(/tqw-fade-in 500ms ease-out 2100ms both/);
    expect(letterArrival('.tqw-hero__details')).toMatch(/tqw-fade-in 500ms ease-out 2300ms both/);
  });

  it('draws nothing until the fonts are ready: every moving part starts at opacity 0', () => {
    expect(declarationsOf('.tqw-hero__arrive,\n.tqw-hero__space,\n.tqw-hero__tagline,\n.tqw-hero__details')).toMatch(/opacity:\s*0/);
    expect(declarationsOf(".tqw-hero[data-arrive='wait'] .tqw-hero__lockup::before")).toMatch(/opacity:\s*0/);
  });

  it('brings UN in from 0.35 em to the left, with a 4 px blur that clears', () => {
    const frames = blockAfter(css, /@keyframes tqw-un-arrive\s*\{/) ?? '';
    expect(frames).toMatch(/from\s*\{[^}]*opacity:\s*0[^}]*translate:\s*-0\.35em 0[^}]*filter:\s*blur\(4px\)/);
    expect(frames).toMatch(/to\s*\{[^}]*opacity:\s*1[^}]*translate:\s*0 0[^}]*filter:\s*none/);
  });

  it('holds the word off-centre by half of UN\'s width until UN lands, then eases it home', () => {
    const frames = blockAfter(css, /@keyframes tqw-recentre\s*\{/) ?? '';
    expect(frames).toMatch(/from\s*\{[^}]*translate3d\(calc\(var\(--tqw-lead, 0px\) \* -1\), 0, 0\)/);
    expect(frames).toMatch(/to\s*\{[^}]*translate3d\(0, 0, 0\)/);
  });

  it('moves only by transform, translate, opacity and the one blur: nothing that makes the page lay out again', () => {
    const allowed = new Set(['opacity', 'transform', 'translate', 'filter']);
    for (const name of ['tqw-fade-in', 'tqw-recentre', 'tqw-un-arrive', 'tqw-release', 'tqw-breathe']) {
      const frames = blockAfter(css, new RegExp(`@keyframes ${name}\\s*\\{`)) ?? '';
      expect(frames.length, name).toBeGreaterThan(20);
      const properties = [...frames.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:/g)].map((m) => m[1]!).filter((p) => !p.startsWith('--'));
      expect(properties.length, name).toBeGreaterThan(0);
      for (const property of properties) expect(allowed.has(property), `${name} animates ${property}`).toBe(true);
    }
  });

  it('lets the word go by transform and opacity from the scroll, never by changing the tracking', () => {
    const letter = declarationsOf('.tqw-hero__letter');
    expect(letter).toMatch(/transform:\s*translate3d\(calc\(\(var\(--i\) - 2\.5\) \* 0\.145em \* var\(--tqw-rel, 0\)\), calc\(var\(--lift, 0px\) \* var\(--tqw-rel, 0\) \* -1\), 0\)/);
    expect(letter).toMatch(/opacity:\s*var\(--tqw-fade, 1\)/);
    expect(letter).not.toMatch(/letter-spacing/);
    // The spread is the 0.12 em of tracking added to -0.025 em: 0.145 em a letter.
    expect(0.12 + 0.025).toBeCloseTo(0.145, 5);
  });

  it('breathes by --by and --br, scaled by --tqw-amp, around its rest offset: up, back, down, back', () => {
    const frames = blockAfter(css, /@keyframes tqw-breathe\s*\{/) ?? '';
    expect(frames).toMatch(/25%\s*\{[^}]*calc\(var\(--by, 0px\) \* var\(--tqw-amp\)\)[^}]*calc\(var\(--br, 0deg\) \* var\(--tqw-amp\)\)/);
    expect(frames).toMatch(/75%\s*\{[^}]*calc\(var\(--by, 0px\) \* var\(--tqw-amp\) \* -1\)[^}]*calc\(var\(--br, 0deg\) \* var\(--tqw-amp\) \* -1\)/);
    // It starts and ends at rest, so it never jumps when it begins.
    expect(frames).toMatch(/0%,\s*50%,\s*100%\s*\{[^}]*translate3d\(0, 0, 0\) rotate\(0deg\)/);
  });

  it('breathes on each letter\'s own period and start, forever, from the end of its release', () => {
    expect(letterArrival('.tqw-hero__glyph')).toMatch(/tqw-breathe var\(--bp, 11s\) ease-in-out var\(--bd, 2450ms\) infinite both/);
  });

  it('gathers back when touched: the amplitude is a registered number, halved, and eased', () => {
    expect(declarationsOf('@property --tqw-amp')).toMatch(/syntax:\s*'<number>'/);
    expect(declarationsOf('@property --tqw-amp')).toMatch(/initial-value:\s*1/);
    expect(declarationsOf(".tqw-hero__lockup[data-held='true']")).toMatch(/--tqw-amp:\s*0\.5/);
    expect(css).toMatch(/\.tqw-hero__lockup\s*\{\s*--tqw-amp:\s*1;\s*transition:\s*--tqw-amp 500ms ease-out;/);
  });

  it('pauses every animation while the hero is off screen', () => {
    // The local glow and drifting smoke are paused too; no compositor work continues off screen.
    const rule = declarationsOf(
      ".tqw-hero[data-visible='false'] :is(.tqw-hero__word, .tqw-hero__arrive, .tqw-hero__glyph, .tqw-hero__space, .tqw-hero__tagline, .tqw-hero__details),\n.tqw-hero[data-visible='false'] .tqw-hero__lockup::before,\n.tqw-hero[data-visible='false'] .tqw-hero__smoke",
    );
    // !important: the arrival rules are more specific, and each animation shorthand resets the play state.
    expect(rule).toMatch(/animation-play-state:\s*paused !important/);
  });

  it('under reduced motion: the whole lockup fades in over 200 ms and nothing moves, outranking the base layer\'s ban on animation', () => {
    expect(declarationsOf(".tqw-site .tqw-hero[data-motion='still'] .tqw-hero__lockup")).toMatch(/animation:\s*tqw-fade-in 200ms ease-out both !important/);
    const letter = declarationsOf(".tqw-hero[data-motion='still'] .tqw-hero__letter");
    expect(letter).toMatch(/transform:\s*none/);
    expect(letter).toMatch(/opacity:\s*1/);
    expect(declarationsOf(".tqw-hero[data-motion='still'] :is(.tqw-hero__arrive, .tqw-hero__space, .tqw-hero__tagline, .tqw-hero__details)")).toMatch(/opacity:\s*1/);
    // A still hero is never given the rest offsets or the breath.
    expect(declarationsOf(".tqw-hero[data-arrive='done']:not([data-motion='still']) .tqw-hero__arrive")).toMatch(/transform:\s*translate3d/);
    expect(declarationsOf(".tqw-hero[data-arrive='done']:not([data-motion='still']) .tqw-hero__glyph")).toMatch(/animation:\s*tqw-breathe/);
  });
});

describe('the poster and the seam', () => {
  it('lays the poster over the canvas and under the chamber, the veil and the chrome, and never lets it catch the pointer', () => {
    const poster = declarationsOf('.tqw-poster');
    expect(poster).toMatch(/position:\s*absolute/);
    expect(poster).toMatch(/z-index:\s*0/);
    expect(poster).toMatch(/pointer-events:\s*none/);
    expect(poster).toMatch(/background:\s*var\(--coal\)/);
    expect(declarationsOf('.tqw-poster img')).toMatch(/object-fit:\s*cover/);
  });

  it('dissolves the poster over 400 ms, and over the short dissolve under reduced motion (outranking the base layer)', () => {
    expect(declarationsOf('.tqw-poster')).toMatch(/transition:\s*opacity 400ms ease-out/);
    expect(declarationsOf(".tqw-poster[data-ready='true']")).toMatch(/opacity:\s*0/);
    const override = declarationsOf('.tqw-site .tqw-poster');
    expect(override).toMatch(/transition-duration:\s*var\(--tqw-poster-ms, 400ms\) !important/);
    expect(override).toMatch(/transition-property:\s*opacity !important/);
  });

  it('keeps a chamber invisible and out of reach until it is ready, and fades it in over the seam', () => {
    const hidden = declarationsOf(".tqw-chamber-host[data-ready='false'],\n.tqw-chamber-host[data-seam='false']");
    expect(hidden).toMatch(/opacity:\s*0/);
    expect(hidden).toMatch(/pointer-events:\s*none/);
    expect(declarationsOf('.tqw-chamber-host')).toMatch(/transition:\s*opacity var\(--tqw-seam-ms, 400ms\) cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)/);
  });

  it('holds a coal veil under the chamber while it is not ready, and lets it go as the room comes in', () => {
    const veil = declarationsOf('.tqw-seam-veil');
    expect(veil).toMatch(/background:\s*var\(--coal\)/);
    expect(veil).toMatch(/z-index:\s*1/);
    expect(veil).toMatch(/pointer-events:\s*none/);
    expect(declarationsOf(".tqw-seam-veil[data-held='false']")).toMatch(/opacity:\s*0/);
    expect(declarationsOf('.tqw-game .tqw-corridor-canvas,\n.tqw-game .tqw-chamber-host')).toMatch(/z-index:\s*0/);
    expect(declarationsOf('.tqw-game .tqw-chamber-host')).toMatch(/z-index:\s*1/);
  });

  it('crosses the veil and the room over the seam, outranking the base layer\'s ban on transitions under reduced motion', () => {
    const override = declarationsOf('.tqw-site .tqw-seam-veil,\n.tqw-site .tqw-chamber-host');
    expect(override).toMatch(/transition-duration:\s*var\(--tqw-seam-ms, 400ms\) !important/);
    expect(override).toMatch(/transition-property:\s*opacity, visibility !important/);
  });
});
