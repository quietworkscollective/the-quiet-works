import { isValidElement, type ReactElement } from 'react';
import { Group, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';
import { beforeEach, expect, it, vi } from 'vitest';
import { isStatic } from '../../../baked/contract.ts';
import { Application } from './Application.tsx';

const harness = vi.hoisted(() => ({ step: 0, frame: null as (() => void) | null }));
vi.mock('react', async importActual => ({ ...await importActual<typeof import('react')>(),
  useMemo: (build: () => unknown) => build(), useRef: (value: unknown) => ({ current: value }), useEffect: () => {},
}));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: () => void) => { harness.frame = frame; }, useThree: () => () => {} }));
vi.mock('./textures.ts', () => ({ FONT_COND: 'sans-serif', createCanvas: (width: number, height: number) => ({ width, height }), context2d: () => ({fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn()}), makeTexture: (image: unknown) => new Texture(image as HTMLCanvasElement) }));
vi.mock('./context.ts', () => ({ useScene: () => ({
  store: { getState: () => ({ stamps: harness.step, memo: { revealed: harness.step > 0 } }) }, director: {}, motion: { reduced: true },
  materials: { wood: new MeshStandardMaterial(), enamelDark: new MeshStandardMaterial(), frame: new MeshStandardMaterial(), brass: new MeshStandardMaterial() },
}) }));

/** Material classification uses the actual component tree, including every ancestor's bake flag. */
function mount(element: unknown, parent = new Group()): Group {
  if (Array.isArray(element)) { element.forEach(child => mount(child, parent)); return parent; }
  if (!isValidElement(element)) return parent;
  const { type, props } = element as ReactElement<Record<string, unknown>>;
  const object = type === 'mesh' ? new Mesh(props['geometry'] as Mesh['geometry'], props['material'] as Mesh['material']) : new Group();
  object.name = props['name'] as string ?? '';
  object.userData = props['userData'] as Object3D['userData'] ?? {};
  if (props['position']) object.position.fromArray(props['position'] as number[]);
  if (props['rotation']) object.rotation.fromArray(props['rotation'] as [number, number, number]);
  parent.add(object);
  const ref = props['ref'];
  if (typeof ref === 'function') ref(object);
  else if (ref && typeof ref === 'object') (ref as { current: Object3D }).current = object;
  mount(props['children'], object as Group);
  return parent;
}
beforeEach(() => { harness.step = 0; harness.frame = null; });
it('keeps the officer and lamp/catch animation live when the static room is replaced by its bake', () => {
  harness.step = 5;
  const room = mount(Application());
  const officer = room.getObjectByName('office-officer-nameplate') as Mesh;
  expect(isStatic(officer), 'the baked copy must never freeze the face-down initial pose').toBe(false);
  const board = room.getObjectByName('office-application-board')!;
  const moving: Mesh[] = [];
  for (const group of board.children.filter(child => child.type === 'Group')) group.traverse(child => {if (child instanceof Mesh) moving.push(child);});
  expect(moving.length).toBeGreaterThan(8);
  expect(moving.every(mesh => !isStatic(mesh as Mesh)), 'bulbs and catch tabs must remain live').toBe(true);
  harness.frame?.();
  expect(officer.rotation.x).toBeCloseTo(0);
  expect((officer.material as MeshStandardMaterial).emissiveIntensity).toBe(.55);
});
