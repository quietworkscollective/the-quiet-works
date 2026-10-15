import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chooseQuality, rendererName, type Quality } from '../corridor/world/quality.ts';
import type { AtmosphereLamp } from './atmosphere/lamps.ts';
import { useLookEnvironment } from './environment/useLookEnvironment.ts';
import type { LookProfile } from './profiles.ts';
import { registerLookDriver } from './render.ts';
import type { LookDriver } from './stack/driver.ts';
import { chooseTier, detectDevice, type LookDevice } from './tier.ts';

/**
 * The shared finishing stack, as one tag inside a `<Canvas>`. It takes over the final render so
 * the scene is drawn once, then finished (contact shadow and air on a desktop, then bloom, tone
 * mapping, grade, vignette and grain), and it does so from `useFrame(…, 1)`: the canvas's own
 * `frameloop="demand"` still decides when a frame happens, and the stack never asks for one.
 *
 * - `quality` defaults to the corridor's own detection (`?quality=high|low`, software renderers
 *   are `lite`). A lite canvas renders exactly as it does without the stack, gets no environment,
 *   and never downloads the stack's code: the pipeline is a lazily imported chunk.
 * - `device` defaults to a coarse pointer on a small viewport (`mobile`), else `desktop`.
 * - `profile` is a space's numbers (`LOOK_PROFILES`); a changed profile is applied in place and
 *   asks for one frame.
 * - `lamps` are the lamps that carry a cone; see `AtmosphereLamp`.
 */
export interface LookStackProps {
  readonly profile: LookProfile;
  readonly reducedMotion: boolean;
  readonly quality?: Quality;
  readonly device?: LookDevice;
  readonly lamps?: readonly AtmosphereLamp[];
}

const NO_LAMPS: readonly AtmosphereLamp[] = [];

declare global {
  interface Window {
    /** Development only: the running stack, so a capture script can retune it and draw one frame. */
    __tqwLook?: { readonly driver: LookDriver; redraw(): void };
  }
}

function deviceNow(): LookDevice {
  return detectDevice({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    width: window.innerWidth,
    height: window.innerHeight,
  });
}

export function LookStack({ profile, reducedMotion, quality, device, lamps = NO_LAMPS }: LookStackProps) {
  const gl = useThree((s) => s.gl);
  const detected = useMemo(() => chooseQuality(rendererName(gl.getContext())), [gl]);
  const [detectedDevice] = useState(deviceNow);
  const tier = chooseTier(quality ?? detected, device ?? detectedDevice);
  useLookEnvironment(profile, tier !== 'lite');
  if (tier === 'lite') return null;
  return <ActiveStack tier={tier} profile={profile} reducedMotion={reducedMotion} lamps={lamps} />;
}

interface ActiveProps {
  readonly tier: 'mobile' | 'desktop';
  readonly profile: LookProfile;
  readonly reducedMotion: boolean;
  readonly lamps: readonly AtmosphereLamp[];
}

function ActiveStack({ tier, profile, reducedMotion, lamps }: ActiveProps) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const driver = useRef<LookDriver | null>(null);
  const [ready, setReady] = useState(false);
  // True while this component's frame callback holds the render (priority 1): it must then draw
  // something every frame, because fiber's own render is switched off.
  const owns = useRef(false);
  const latest = useRef({ profile, reducedMotion, lamps });

  useEffect(() => {
    latest.current = { profile, reducedMotion, lamps };
  });

  useLayoutEffect(() => {
    let cancelled = false;
    let release = (): void => undefined;
    // The pipeline is its own chunk: it carries postprocessing and N8AO, which a lite canvas, and
    // the landing's first paint, never need.
    void import('./stack/driver.ts').then(({ LookDriver: Driver }) => {
      if (cancelled) return;
      const { scene, camera } = get();
      const created = new Driver({ renderer: gl, scene, camera, tier, ...latest.current });
      driver.current = created;
      release = registerLookDriver(gl, created);
      if (import.meta.env.DEV) window.__tqwLook = { driver: created, redraw: () => created.frame(get().scene, get().camera, 0) };
      setReady(true);
      invalidate();
    });
    return () => {
      cancelled = true;
      release();
      if (import.meta.env.DEV && window.__tqwLook?.driver === driver.current) delete window.__tqwLook;
      const old = driver.current;
      driver.current = null;
      old?.dispose();
      setReady(false);
    };
  }, [gl, get, invalidate, tier]);

  // When the driver goes, `ready` falls on the next commit; until then the callback still holds
  // the render and draws directly, so there is never a frame with nothing drawn.
  useLayoutEffect(() => {
    owns.current = ready;
  }, [ready]);

  useEffect(() => {
    const current = driver.current;
    if (!current) return;
    let changed = current.setProfile(profile);
    changed = current.setReducedMotion(reducedMotion) || changed;
    current.setLamps(lamps);
    if (changed) invalidate();
  }, [profile, reducedMotion, lamps, invalidate]);

  useFrame((state, delta) => {
    if (!owns.current) return;
    const current = driver.current;
    if (current) current.frame(state.scene, state.camera, delta);
    else state.gl.render(state.scene, state.camera);
  }, ready ? 1 : 0);

  return null;
}
