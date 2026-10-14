// React hooks over the stores. Both release on unmount, so a space that mounts and unmounts leaves
// no GPU handle behind. Neither uses drei's loaders: drei's defaults fetch decoders and HDRs from
// third-party CDNs, which the site's policy forbids.
import { useEffect, useState } from 'react';
import type { MeshStandardMaterial, Object3D } from 'three';
import { loadModel } from './modelStore.ts';
import { surface, type SurfaceOptions } from './surfaces.ts';

/** The model's clone once decoded (null until then). A failed load throws to the nearest error boundary. */
export function useModel(id: string): Object3D | null {
  const [loaded, setLoaded] = useState<{ id: string; object: Object3D } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    loadModel(id).then(
      (handle) => {
        if (cancelled) {
          handle.release();
          return;
        }
        release = () => handle.release();
        setLoaded({ id, object: handle.object });
      },
      (error: unknown) => {
        if (!cancelled) setFailure(error);
      },
    );
    return () => {
      cancelled = true;
      release?.();
    };
  }, [id]);

  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  return loaded && loaded.id === id ? loaded.object : null;
}

/** Options `useSurface` accepts: plain values, so they can be compared by content between renders. */
export type SurfaceHookOptions = Omit<SurfaceOptions, 'colour'> & { readonly colour?: number | string };

/**
 * A configured surface material, returned once its maps are decoded (null until then, so a surface
 * never flashes untextured). A failed load throws to the nearest error boundary.
 */
export function useSurface(id: string, options: SurfaceHookOptions = {}): MeshStandardMaterial | null {
  const [created, setCreated] = useState<{ key: string; material: MeshStandardMaterial } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const key = JSON.stringify([id, options]);

  useEffect(() => {
    const [surfaceId, surfaceOptions] = JSON.parse(key) as [string, SurfaceHookOptions];
    const handle = surface(surfaceId, surfaceOptions);
    let cancelled = false;
    handle.ready.then(
      () => {
        if (!cancelled) setCreated({ key, material: handle.material });
      },
      (error: unknown) => {
        if (!cancelled) setFailure(error);
      },
    );
    return () => {
      cancelled = true;
      handle.release();
    };
  }, [key]);

  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  return created && created.key === key ? created.material : null;
}
