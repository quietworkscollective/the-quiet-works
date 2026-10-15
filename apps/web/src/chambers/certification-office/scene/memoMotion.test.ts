import { isValidElement, type ReactElement } from 'react';
import { Group, Texture } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoSheet } from './MemoSheet.tsx';
import type { DirectorEvent } from './director.ts';

const harness = vi.hoisted(() => ({ reduced: true, frame: null as ((state: { invalidate: () => void }, delta: number) => void) | null, event: null as ((event: DirectorEvent) => void) | null }));
vi.mock('react', async actual => ({ ...await actual<typeof import('react')>(), useCallback: (callback: unknown) => callback, useMemo: (build: () => unknown) => build(), useRef: (current: unknown) => ({ current }), useEffect: (effect: () => unknown) => { effect(); } }));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: typeof harness.frame) => { harness.frame = frame; }, useThree: () => () => {} }));
vi.mock('./canvasArt.ts', () => ({ drawMemoFace: () => {}, MEMO_PX_H: 64, MEMO_PX_W: 64 }));
vi.mock('./textures.ts', () => ({ createCanvas: () => ({}), makeTexture: () => new Texture(), drawPoolGlow: () => new Texture(), drawRimGlow: () => new Texture() }));
vi.mock('./context.ts', () => ({ facingYaw: () => 0, useFontsReady: () => false, useScene: () => ({ store: { getState: () => ({ memo: { revealed: false } }) }, director: { subscribe: (event: typeof harness.event) => { harness.event = event; } }, materials: { anisotropy: 1 }, motion: { get reduced() { return harness.reduced; } }, cursor: { hover: () => {} }, view: {} }) }));

function mount(element: unknown, groups: Group[] = []): Group[] {
  if (Array.isArray(element)) { element.forEach(child => mount(child, groups)); return groups; }
  if (!isValidElement(element)) return groups;
  const { type, props } = element as ReactElement<Record<string, unknown>>;
  if (type === 'group') {
    const group = new Group();
    (props['ref'] as { current: Group }).current = group;
    groups.push(group);
  }
  mount(props['children'], groups);
  return groups;
}
afterEach(() => vi.restoreAllMocks());
it.each([true, false])('lands the memo without idle rendering after its reduced=%s reveal window', reduced => {
  harness.reduced = reduced;
  const [memo] = mount(MemoSheet());
  harness.event?.({ type: 'memo-revealed', source: 'overload', hatchAt: 650, slideAt: 1000 });
  const now = vi.spyOn(performance, 'now').mockReturnValue(999);
  const invalidate = vi.fn();
  harness.frame?.({ invalidate }, 1 / 60);
  expect(memo?.visible).toBe(false);
  expect(invalidate).toHaveBeenCalled();
  invalidate.mockClear();
  now.mockReturnValue(reduced ? 1000 : 2801);
  harness.frame?.({ invalidate }, 1 / 60);
  expect(memo?.visible).toBe(true);
  expect(memo?.rotation.x).toBe(0);
  expect(invalidate, 'the landed paper and its light pool must not request another frame').not.toHaveBeenCalled();
});
