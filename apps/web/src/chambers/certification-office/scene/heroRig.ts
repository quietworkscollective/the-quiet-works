import { Mesh, Object3D, type Material } from 'three';

/** Motion belongs to named authored pivots. Static baking must never replace their descendants. */
export const HERO_MOVING: Readonly<Record<string, readonly string[]>> = {
  machine: ['hatch', 'bell', 'rear_link'],
  press: ['stamp', 'spring_left', 'spring_right'],
  desk: ['drawer_right_1'],
  'application-board': ['lamp-1', 'lamp-2', 'lamp-3', 'lamp-4', 'catch-1', 'catch-2', 'catch-3', 'catch-4'],
  'employee-window': ['speaking-flap'],
};
export function prepareHero(source: Object3D, id: string) {
  const object = source.clone(true), materials = new Map<Material, Material>();
  object.traverse(part => {
    if (!(part instanceof Mesh)) return;
    const own = (material: Material) => {
      let clone = materials.get(material);
      if (!clone) { clone = material.clone(); materials.set(material, clone); }
      return clone;
    };
    part.material = Array.isArray(part.material) ? part.material.map(own) : own(part.material);
    part.castShadow = true; part.receiveShadow = true;
  });
  for (const name of HERO_MOVING[id] ?? []) {
    const node = object.getObjectByName(name);
    if (!node) throw new Error(`Missing Office ${id} pivot ${name}`);
    node.userData['bake'] = 'dynamic';
  }
  if (id === 'machine') {
    const bell=object.getObjectByName('bell');
    if (bell) bell.visible=false;
  }
  if (id === 'press') {
    const target = new Object3D(); target.name = 'office-press-handle';
    const stamp = object.getObjectByName('stamp');
    if (!stamp) throw new Error('Missing Office press carriage');
    stamp.add(target);
  }
  return { object, dispose: () => { object.removeFromParent(); materials.forEach(material => material.dispose()); } };
}
