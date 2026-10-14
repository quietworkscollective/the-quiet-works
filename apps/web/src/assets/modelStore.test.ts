import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { collectResources } from './dispose.ts';
import { createModelStore } from './modelStore.ts';

/** A decoded "model": two meshes sharing one geometry and one material that holds two textures. */
function fakeModel() {
  const geometry = new BoxGeometry(1, 1, 1);
  const albedo = new Texture();
  const normal = new Texture();
  const material = new MeshStandardMaterial({ map: albedo, normalMap: normal });
  const scene = new Group();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const spies = {
    geometry: vi.spyOn(geometry, 'dispose'),
    material: vi.spyOn(material, 'dispose'),
    albedo: vi.spyOn(albedo, 'dispose'),
    normal: vi.spyOn(normal, 'dispose'),
  };
  return { scene, geometry, material, spies };
}

function setup() {
  const models: ReturnType<typeof fakeModel>[] = [];
  const decode = vi.fn(async () => {
    const model = fakeModel();
    models.push(model);
    return model.scene;
  });
  return { store: createModelStore(decode), decode, models };
}

const disposals = (spies: ReturnType<typeof fakeModel>['spies']): number[] => [spies.geometry, spies.material, spies.albedo, spies.normal].map((spy) => spy.mock.calls.length);

describe('reference-counted models', () => {
  it('decodes once and gives each user a clone that shares geometry, material and textures', async () => {
    const { store, decode, models } = setup();
    const a = await store.acquire('desk');
    const b = await store.acquire('desk');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(a.object).not.toBe(b.object);
    const [first] = models;
    expect(first).toBeDefined();
    if (!first) return;
    for (const handle of [a, b]) {
      const resources = collectResources(handle.object);
      expect([...resources.geometries]).toEqual([first.geometry]);
      expect([...resources.materials]).toEqual([first.material]);
      expect(resources.textures.size).toBe(2);
    }
    a.release();
    b.release();
  });

  it('keeps the GPU resources while anyone still uses the model', async () => {
    const { store, models } = setup();
    const a = await store.acquire('desk');
    const b = await store.acquire('desk');
    a.release();
    expect(disposals(models[0]!.spies)).toEqual([0, 0, 0, 0]);
    expect(store.liveIds()).toEqual(['desk']);
    b.release();
  });

  it('releases every geometry, material and texture exactly once when the last user leaves', async () => {
    const { store, models } = setup();
    const a = await store.acquire('desk');
    const b = await store.acquire('desk');
    a.release();
    b.release();
    expect(disposals(models[0]!.spies)).toEqual([1, 1, 1, 1]);
    expect(store.liveIds()).toEqual([]);
    // A second release of the same handle changes nothing.
    b.release();
    a.release();
    expect(disposals(models[0]!.spies)).toEqual([1, 1, 1, 1]);
  });

  it('never lets one handle release twice and take another user\'s reference', async () => {
    const { store, models } = setup();
    const a = await store.acquire('desk');
    const b = await store.acquire('desk');
    a.release();
    a.release();
    expect(disposals(models[0]!.spies)).toEqual([0, 0, 0, 0]);
    b.release();
    expect(disposals(models[0]!.spies)).toEqual([1, 1, 1, 1]);
  });

  it('detaches the clone from its parent on release', async () => {
    const { store } = setup();
    const handle = await store.acquire('desk');
    const parent = new Group();
    parent.add(handle.object);
    handle.release();
    expect(parent.children).toEqual([]);
  });

  it('decodes afresh after everything was released', async () => {
    const { store, decode, models } = setup();
    (await store.acquire('desk')).release();
    const again = await store.acquire('desk');
    expect(decode).toHaveBeenCalledTimes(2);
    expect(disposals(models[1]!.spies)).toEqual([0, 0, 0, 0]);
    again.release();
    expect(disposals(models[1]!.spies)).toEqual([1, 1, 1, 1]);
  });

  it('counts a user whose load is still pending, so a release racing the decode cannot dispose early', async () => {
    const { store, decode, models } = setup();
    const first = store.acquire('desk');
    const second = store.acquire('desk');
    const [a, b] = await Promise.all([first, second]);
    expect(decode).toHaveBeenCalledTimes(1);
    a.release();
    expect(disposals(models[0]!.spies)).toEqual([0, 0, 0, 0]);
    b.release();
    expect(disposals(models[0]!.spies)).toEqual([1, 1, 1, 1]);
  });

  it('leaves nothing behind when a decode fails, and lets the next acquire retry', async () => {
    let attempt = 0;
    const good = fakeModel();
    const store = createModelStore(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('decode failed');
      return good.scene;
    });
    await expect(store.acquire('desk')).rejects.toThrow('decode failed');
    expect(store.liveIds()).toEqual([]);
    const handle = await store.acquire('desk');
    expect(attempt).toBe(2);
    handle.release();
    expect(disposals(good.spies)).toEqual([1, 1, 1, 1]);
  });

  it('keeps different ids apart', async () => {
    const { store, decode, models } = setup();
    const desk = await store.acquire('desk');
    const chair = await store.acquire('chair');
    expect(decode).toHaveBeenCalledTimes(2);
    desk.release();
    expect(disposals(models[0]!.spies)).toEqual([1, 1, 1, 1]);
    expect(disposals(models[1]!.spies)).toEqual([0, 0, 0, 0]);
    chair.release();
  });
});
