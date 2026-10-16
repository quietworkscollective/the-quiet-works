import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { HERO_COPY, LANDING } from '@tqw/engine';
import { BRAND } from './brand.ts';
import { HELD_MS, letterStyle, releaseAt, visibilityAt } from './heroMotion.ts';
import type { HeroProps } from './types.ts';
import { veilCoverage } from './veil.ts';

/** The arrival plays once per page load, whatever remounts the hero (a text-mode toggle, say). */
let arrivedThisLoad = false;

/** If the fonts have not said they are ready by now, the arrival begins anyway. */
const FONTS_TIMEOUT_MS = 1500;

/**
 * The first screen (ADR 0003): a bold, centred UNHELD with a small .space under its last letter,
 * the tagline, one quiet line of live details from this visit, a scroll cue, and a direct way in.
 * The 3D world is behind it (the same renderer as the game); a full-height coal scrim and a slow,
 * light smoke plane keep the lettering clear over each frame of the camera's drift.
 *
 * The document is real: the heading is "UNHELD", the details are one paragraph, and both ways
 * onward are controls with names. `.space` is secondary notation, not part of the heading's name.
 *
 * The word moves, and means it (the founder's direction: the word is about being let go). HELD
 * arrives first, set tight and still; UN joins it; then the word is released: each of the six
 * letters takes its own small offset and breathes slowly around it, never in unison. Scrolling into
 * the smoke lets the letters go upward and apart, reversibly. Touched, the letters gather back for a
 * moment. Everything is a CSS transform or an opacity (the timeline is in the stylesheet; each
 * letter's numbers are in heroMotion.ts); the only script is the clock that starts it after the
 * fonts are ready, one custom property per scroll, and a pause when the hero is off screen. Under
 * reduced motion none of it happens: the lockup fades in over 200 ms and stays still.
 *
 * The letters are aria-hidden decoration over one visually hidden "UNHELD", so the heading's name
 * is the word, whole.
 */
export function Hero({ menu, details, onScrollCue, onEnter, text, progress, keyframes, reducedMotion }: HeroProps) {
  const root = useRef<HTMLElement>(null);
  const lockup = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const held = useRef(0);
  const still = Boolean(reducedMotion || text);
  // Once per load: a hero that mounts again after the arrival has played is simply at rest.
  const [initial] = useState<'wait' | 'done'>(() => (arrivedThisLoad ? 'done' : 'wait'));

  // The arrival starts when the fonts are ready, so the word never arrives in a fallback face.
  useLayoutEffect(() => {
    const node = root.current;
    const letters = word.current;
    if (!node || still) return;
    if (initial === 'done') {
      node.dataset['arrive'] = 'done';
      return;
    }
    let cancelled = false;
    let timer = 0;
    const begin = () => {
      // Already running (effects run twice in development) or abandoned: nothing to start.
      if (cancelled || node.dataset['arrive'] === 'run') return;
      arrivedThisLoad = true;
      // HELD is centred while UN is not there yet: the word is laid out whole, so shift it by half
      // of UN's width, and the CSS eases that shift away as UN lands. Measured, so any width works.
      const first = letters?.children[0] as HTMLElement | undefined;
      const third = letters?.children[2] as HTMLElement | undefined;
      if (letters && first && third) letters.style.setProperty('--tqw-lead', `${(third.offsetLeft - first.offsetLeft) / 2}px`);
      node.dataset['arrive'] = 'run';
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || fonts.status === 'loaded') begin();
    else {
      void fonts.ready.then(begin, begin);
      timer = window.setTimeout(begin, FONTS_TIMEOUT_MS);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [still, initial]);

  // Scrolling into the smoke lets the word go: two custom properties per scroll, nothing else.
  useEffect(() => {
    const node = root.current;
    if (!node || !progress || still) return;
    const paint = (value: number) => {
      node.style.setProperty('--tqw-rel', releaseAt(value).toFixed(4));
      node.style.setProperty('--tqw-fade', visibilityAt(keyframes ? veilCoverage(value, keyframes) : 0).toFixed(4));
    };
    paint(progress.get());
    const stop = progress.subscribe(paint);
    return () => {
      stop();
      node.style.removeProperty('--tqw-rel');
      node.style.removeProperty('--tqw-fade');
    };
  }, [progress, keyframes, still]);

  // Nothing animates while the hero is off screen: the paused animations make no frames at all.
  useEffect(() => {
    const node = root.current;
    if (!node || still || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) node.dataset['visible'] = String(last.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [still]);

  // Touched, the letters gather back for a moment, as if briefly held again.
  const gather = (event: PointerEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    const node = lockup.current;
    if (!node || still || ('pointerType' in event && event.pointerType === 'touch')) return;
    node.dataset['held'] = 'true';
    window.clearTimeout(held.current);
    held.current = window.setTimeout(() => {
      node.dataset['held'] = 'false';
    }, HELD_MS);
  };
  useEffect(() => () => window.clearTimeout(held.current), []);

  return (
    <section
      ref={root}
      className="tqw-hero"
      aria-labelledby="tqw-hero-title"
      data-text={text ? 'true' : undefined}
      data-motion={still ? 'still' : 'live'}
      data-arrive={still ? 'done' : initial}
    >
      <div className="tqw-hero__scrim" aria-hidden="true" />
      {text ? null : <div className="tqw-hero__smoke" aria-hidden="true" />}
      <div className="tqw-hero__menu">{menu}</div>
      <div ref={lockup} className="tqw-hero__lockup" onPointerEnter={gather} onFocus={gather}>
        <h1 id="tqw-hero-title" className="tqw-hero__name">
          <span className="tqw-visually-hidden">{BRAND.name}</span>
          <span ref={word} className="tqw-hero__word" aria-hidden="true">
            {[...BRAND.name].map((letter, index) => (
              <span key={index} className="tqw-hero__letter" style={letterStyle(index) as CSSProperties}>
                <span className="tqw-hero__arrive">
                  <span className="tqw-hero__glyph">{letter}</span>
                </span>
              </span>
            ))}
          </span>
          <span className="tqw-hero__space" aria-hidden="true">
            .space
          </span>
        </h1>
        <p className="tqw-hero__tagline">{BRAND.tagline}</p>
      </div>
      <div className="tqw-hero__foot">
        {details.length > 0 ? (
          <p className="tqw-hero__details">
            {details.map((detail, index) => (
              <Fragment key={detail}>
                {index > 0 ? (
                  <span className="tqw-hero__sep" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                <span>{detail}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
        <button type="button" className="tqw-hero__cue" onClick={onScrollCue}>
          <span>{HERO_COPY.scrollCue}</span>
          <svg viewBox="0 0 10 28" width="10" height="28" aria-hidden="true" focusable="false">
            <path d="M5 0v26M1 22l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <a
          className="tqw-hero__enter"
          href="#game"
          onClick={(event) => {
            event.preventDefault();
            onEnter();
          }}
        >
          {LANDING.enter}
        </a>
      </div>
    </section>
  );
}
