import { BufferGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, Scene, Texture, type Material } from 'three';
import { describe, expect, it } from 'vitest';
import { buildProps } from './build.ts';
import { createPropMaterials, findDonors } from './materials.ts';
import { CHANNELS } from './parts.ts';
import { createPropsRig } from './rig.ts';

const assembly = buildProps();

/** A scene with the world's oak and brass, patched the way the world patches them. */
function worldWith(kind: 'standard' | 'lambert'): { scene: Scene; patch: () => void } {
  const patch = (): void => undefined;
  const oak = kind === 'standard' ? new MeshStandardMaterial({ color: '#302B25' }) : new MeshLambertMaterial({ color: '#302B25' });
  oak.onBeforeCompile = patch;
  oak.customProgramCacheKey = () => `tqw-corridor-${kind}`;
  const scene = new Scene();
  const oakMesh = new Mesh(new BufferGeometry(), oak);
  oakMesh.name = 'oak';
  const brassMesh = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
  brassMesh.name = 'brass';
  scene.add(oakMesh, brassMesh);
  return { scene, patch };
}

describe('the props borrow the world\'s light and fog', () => {
  it('finds the world\'s oak and brass by mesh name, and nothing in an empty scene', () => {
    expect(findDonors(new Scene())).toBeNull();
    const { scene } = worldWith('standard');
    const donors = findDonors(scene);
    expect(donors?.oak).toBeInstanceOf(MeshStandardMaterial);
    expect(donors?.glossy).toBeInstanceOf(MeshStandardMaterial);
  });

  it('gives every channel the world\'s shader patch, so the lamps and the fog curve apply', () => {
    const { scene, patch } = worldWith('standard');
    const materials = createPropMaterials(findDonors(scene), null);
    for (const channel of CHANNELS) {
      const m = materials.byChannel[channel];
      expect(m.onBeforeCompile, channel).toBe(patch);
      expect((m as MeshStandardMaterial).vertexColors, `${channel} takes vertex colours`).toBe(true);
      expect((m.customProgramCacheKey as () => string)()).toBe('tqw-corridor-standard');
    }
    materials.dispose();
  });

  it('follows the world into its lite tier: Lambert materials when the world\'s are Lambert', () => {
    const { scene } = worldWith('lambert');
    const materials = createPropMaterials(findDonors(scene), null);
    for (const channel of CHANNELS) expect(materials.byChannel[channel], channel).toBeInstanceOf(MeshLambertMaterial);
    materials.dispose();
  });

  it('hands every glossy material the world\'s reflection environment once it is bound, and takes it back', () => {
    const { scene } = worldWith('standard');
    const donors = findDonors(scene);
    const materials = createPropMaterials(donors, null);
    expect(materials.syncEnvironment()).toBe(false);
    const environment = new Texture();
    if (donors?.glossy) donors.glossy.envMap = environment;
    expect(materials.syncEnvironment()).toBe(true);
    for (const channel of ['brass', 'steel', 'enamel', 'glass'] as const) expect((materials.byChannel[channel] as MeshStandardMaterial).envMap, channel).toBe(environment);
    if (donors?.glossy) donors.glossy.envMap = null;
    expect(materials.syncEnvironment()).toBe(true);
    expect((materials.byChannel.brass as MeshStandardMaterial).envMap).toBeNull();
    materials.dispose();
  });

  it('draws in plain materials when there is no world to borrow from', () => {
    const materials = createPropMaterials(null, null);
    for (const channel of CHANNELS) expect(materials.byChannel[channel], channel).toBeInstanceOf(MeshStandardMaterial);
    materials.dispose();
  });
});

describe('disposal', () => {
  /** Count 'dispose' events on anything that raises them. */
  function watch(items: readonly { addEventListener(type: 'dispose', listener: () => void): void }[]): { disposed: () => number } {
    let n = 0;
    for (const item of items) item.addEventListener('dispose', () => (n += 1));
    return { disposed: () => n };
  }

  it('frees every geometry, the skeleton\'s bone texture, every material and the atlas', () => {
    const { scene } = worldWith('standard');
    const atlas = new Texture();
    const materials = createPropMaterials(findDonors(scene), atlas);
    const rig = createPropsRig(assembly, materials);
    const geometries = rig.meshes.map((m) => m.geometry);
    const mats: Material[] = Object.values(materials.byChannel);
    const g = watch(geometries);
    const m = watch(mats);
    const t = watch([atlas]);
    expect(rig.meshes.length).toBe(CHANNELS.filter((c) => assembly.channels[c].bucket.triangleCount > 0).length);
    rig.dispose();
    expect(g.disposed(), 'geometries').toBe(geometries.length);
    expect(rig.root.parent, 'the rig leaves the scene').toBeNull();
    expect(m.disposed(), 'materials not yet').toBe(0);
    materials.dispose();
    expect(m.disposed(), 'materials').toBe(mats.length);
    expect(t.disposed(), 'atlas').toBe(1);
  });

  it('does not touch the world\'s own materials when it frees its clones', () => {
    const { scene } = worldWith('standard');
    const donors = findDonors(scene);
    if (!donors) throw new Error('no donors');
    const own = watch([donors.oak]);
    const materials = createPropMaterials(donors, null);
    materials.dispose();
    expect(own.disposed()).toBe(0);
  });
});
