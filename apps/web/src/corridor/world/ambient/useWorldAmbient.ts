import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAmbient, type AmbientClock } from '../../ambient.ts';

/**
 * The ambient clock the world's motions read. It is the one the camera lane provides, except in
 * development, where a script may install `window.__tqwAmbient` (a clock it drives by hand) so a
 * frame can be captured mid-motion without waiting for a window: the fan at an angle, a paper
 * corner half lifted, motes in the lamp's pool. The override is looked up at each call, so it can
 * be installed after the scene has mounted, and it is stripped from production builds.
 */
export function useWorldAmbient(): AmbientClock {
  const real = useAmbient();
  return useMemo<AmbientClock>(() => {
    const pick = (): AmbientClock => {
      if (import.meta.env.DEV) {
        const dev = (window as unknown as { __tqwAmbient?: AmbientClock }).__tqwAmbient;
        if (dev) return dev;
      }
      return real;
    };
    return {
      now: () => pick().now(),
      active: (id) => pick().active(id),
      requestWindow: (id, ms) => pick().requestWindow(id, ms),
    };
  }, [real]);
}

/** Dev only: every mounted motion's per-frame update, so a script can pose the world and capture it without the frame loop. */
export const WORLD_UPDATERS = new Set<() => void>();

/** `useFrame`, which in development also registers the update so tooling can run it on demand. */
export function useWorldFrame(update: () => void): void {
  useFrame(update);
  const latest = useRef(update);
  useEffect(() => {
    latest.current = update;
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const run = () => latest.current();
    WORLD_UPDATERS.add(run);
    return () => {
      WORLD_UPDATERS.delete(run);
    };
  }, []);
}
