import { useEffect, useMemo, useRef } from 'react';
import { useScene } from './context.ts';
import { prepareHero } from './heroRig.ts';

/** A visit owns transforms and materials; the asset store owns shared geometry and textures. */
export function useHeroModel(id: string) {
  const { assets } = useScene();
  const source = assets?.models.get(`office-hero-${id}`);
  const rig = useMemo(() => source ? prepareHero(source, id) : null, [source, id]);
  const cleanupGeneration = useRef(0);
  useEffect(() => {
    const generation = ++cleanupGeneration.current;
    return () => {
      // React StrictMode replays effect cleanup while keeping the primitive mounted. Defer
      // disposal until the replay's second setup has had a chance to claim this rig again.
      queueMicrotask(() => {
        if (cleanupGeneration.current === generation) rig?.dispose();
      });
    };
  }, [rig]);
  return rig?.object ?? null;
}
