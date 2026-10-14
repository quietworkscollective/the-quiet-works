import { useEffect, useRef, useState } from 'react';
import { GAME_WINDOW_COPY } from '@tqw/engine';
import { smokeTextureUrl } from './smokeNoise.ts';
import type { SmokeVeilProps } from './types.ts';
import { VEIL_FULL, veilCoverage } from './veil.ts';

/**
 * The smoke between the hero and the game window (ADR 0003): a dark veil that rises as the visitor
 * scrolls, hides the camera's walk-in and the seam, and clears onto the game window. It is a
 * foreground veil only; the corridor's own fog is untouched.
 *
 * Cheap by construction. One 256 x 256 texture is sampled by two layers at slightly different
 * scales; every frame of scrolling is one custom property (`--tqw-veil`) written to the root, and
 * the CSS turns it into transforms and opacities, which the compositor does without repainting.
 * An opaque backing makes full coverage certain at the seam. No WebGL, no live blur.
 *
 * Reduced motion drops the texture and the movement: the veil is plain coal and only changes
 * opacity, with a short dissolve (CSS).
 *
 * If the game is not ready by the time the veil is full, a quiet "Loading" holds there, after a
 * short delay so a fast load never flashes it. It holds the visual veil, never the page's scroll.
 */
export function SmokeVeil({ progress, keyframes, reducedMotion, ready, loadingDelayMs }: SmokeVeilProps) {
  const root = useRef<HTMLDivElement>(null);
  const [dense, setDense] = useState(false);
  const [waited, setWaited] = useState(false);

  // One write per scroll: the coverage, as a property for the CSS and an attribute for tests.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const paint = (value: number) => {
      const coverage = veilCoverage(value, keyframes);
      node.style.setProperty('--tqw-veil', coverage.toFixed(4));
      node.dataset['coverage'] = coverage.toFixed(3);
      setDense(coverage >= VEIL_FULL);
    };
    paint(progress.get());
    return progress.subscribe(paint);
  }, [progress, keyframes]);

  // The texture, once; nothing to draw in reduced motion.
  useEffect(() => {
    const node = root.current;
    if (!node || reducedMotion) return;
    let url: string | null = null;
    let cancelled = false;
    void smokeTextureUrl().then((made) => {
      if (cancelled || !made) {
        if (made) URL.revokeObjectURL(made);
        return;
      }
      url = made;
      node.style.setProperty('--tqw-smoke', `url("${made}")`);
      node.dataset['textured'] = 'true';
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      node.style.removeProperty('--tqw-smoke');
      delete node.dataset['textured'];
    };
  }, [reducedMotion]);

  // "Loading" only if the game is still not ready this long after the veil is full.
  useEffect(() => {
    if (!dense || ready) return;
    const timer = window.setTimeout(() => setWaited(true), loadingDelayMs);
    return () => {
      window.clearTimeout(timer);
      setWaited(false);
    };
  }, [dense, ready, loadingDelayMs]);
  const loading = dense && !ready && waited;

  return (
    <div ref={root} className="tqw-veil" data-coverage="0" data-reduced={reducedMotion} data-loading={loading}>
      <div className="tqw-veil__backing" aria-hidden="true" />
      <div className="tqw-veil__layer tqw-veil__layer--a" aria-hidden="true" />
      <div className="tqw-veil__layer tqw-veil__layer--b" aria-hidden="true" />
      {loading ? (
        <p className="tqw-veil__loading" role="status">
          {GAME_WINDOW_COPY.loading}
        </p>
      ) : null}
    </div>
  );
}
