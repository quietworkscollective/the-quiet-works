import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type { LookProfile } from '../profiles.ts';
import { applyEnvironment, buildLookEnvironment, type AppliedEnvironment } from './build.ts';

/**
 * The generated environment for a space: built once with PMREM, applied to the scene at the
 * profile's intensity, and on unmount the scene's previous environment is put back and the cube
 * map freed. `enabled` is false in the lite tier, which gets none, as the corridor's lite tier has
 * none today. A change of intensity updates the scene in place; a change to the layout's own
 * numbers (colour temperatures, weights) builds a new one. It asks for one frame when it is
 * applied, removed or retuned, because the picture changes, and never otherwise.
 */
export function useLookEnvironment(profile: LookProfile, enabled = true): void {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const { intensity, ceilingKelvin, windowKelvin, windowWeight, floorBounceWeight } = profile.environment;
  // The intensity is applied in place and never rebuilds the cube map, so it is not a dependency
  // of the build: the build reads it from here.
  const current = useRef({ intensity, applied: null as AppliedEnvironment | null });

  useLayoutEffect(() => {
    const state = current.current;
    if (state.applied && state.intensity !== intensity) {
      state.applied.setIntensity(intensity);
      invalidate();
    }
    state.intensity = intensity;
  }, [intensity, invalidate]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const state = current.current;
    const built = buildLookEnvironment(gl, { intensity: state.intensity, ceilingKelvin, windowKelvin, windowWeight, floorBounceWeight });
    const environment = applyEnvironment(scene, built, state.intensity);
    state.applied = environment;
    invalidate();
    return () => {
      state.applied = null;
      environment.dispose();
      invalidate();
    };
  }, [gl, scene, enabled, ceilingKelvin, windowKelvin, windowWeight, floorBounceWeight, invalidate]);
}
