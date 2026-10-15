import { useEffect, useMemo } from 'react';
import { useScene } from './context.ts';
import { prepareHero } from './heroRig.ts';

/** A visit owns transforms and materials; the asset store owns shared geometry and textures. */
export function useHeroModel(id: string) {
  const { assets } = useScene();
  const source = assets?.models.get(`office-hero-${id}`);
  const rig = useMemo(() => source ? prepareHero(source, id) : null, [source, id]);
  useEffect(() => () => rig?.dispose(), [rig]);
  return rig?.object ?? null;
}
