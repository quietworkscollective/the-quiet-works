// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { it, vi, expect } from 'vitest';
import type { SceneContextValue } from './context.ts';
import { SceneContext } from './context.ts';
import { useHeroModel } from './HeroModel.tsx';

it('keeps hero geometry mounted through StrictMode effect replay and disposes it on unmount', async () => {
  const source = new Group();
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial();
  for (const name of ['hatch', 'bell', 'rear_link']) {
    const pivot = new Group(); pivot.name = name; pivot.add(new Mesh(geometry, material)); source.add(pivot);
  }
  source.add(new Mesh(geometry, material));
  const context = { assets: { models: new Map([['office-hero-machine', source]]) } } as unknown as SceneContextValue;
  const hero = { current: null as Group | null };
  function Probe() { hero.current = useHeroModel('machine') as Group | null; return null; }
  const view = render(<StrictMode><SceneContext.Provider value={context}><Probe /></SceneContext.Provider></StrictMode>);
  const ownedMaterial = (hero.current?.children[0]?.children[0] as Mesh).material as MeshStandardMaterial;
  const dispose = vi.spyOn(ownedMaterial, 'dispose');

  await act(async () => { await Promise.resolve(); });
  expect(dispose).not.toHaveBeenCalled();

  view.unmount();
  await act(async () => { await Promise.resolve(); });
  expect(dispose).toHaveBeenCalledOnce();
  geometry.dispose(); material.dispose();
});
