import type { ChamberId } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { createClickRouter } from './engage.ts';

function rig(engaged: boolean) {
  const state = { engaged };
  const calls: string[] = [];
  const router = createClickRouter({
    engaged: () => state.engaged,
    onGesture: () => calls.push('gesture'),
    onEngageRequest: () => calls.push('engage'),
    clickDoor: (id: ChamberId) => calls.push(`door:${id}`),
    clickClipping: (id: ChamberId) => calls.push(`clipping:${id}`),
    clickFloor: (p) => calls.push(`floor:${p.x},${p.z}`),
    clickProp: (id) => calls.push(`prop:${id}`),
    clickBoard: () => calls.push('board'),
    actProp: (id) => calls.push(`act:${id}`),
    actBoard: () => calls.push('act:board'),
  });
  return { state, calls, router };
}

describe('click routing at rest', () => {
  it('asks to engage and does nothing else: a door is not focused, glided to or opened', () => {
    const r = rig(false);
    r.router.door('certification-office');
    expect(r.calls).toEqual(['gesture', 'engage']);
  });

  it('consumes a click on the board and on the floor the same way', () => {
    const r = rig(false);
    r.router.clipping('apartment');
    r.router.floor({ x: 0.5, z: -3 });
    r.router.background();
    expect(r.calls).toEqual(['gesture', 'engage', 'gesture', 'engage', 'gesture', 'engage']);
    expect(r.calls.some((c) => c.startsWith('door:') || c.startsWith('clipping:') || c.startsWith('floor:'))).toBe(
      false,
    );
  });

  it('consumes a click on a prop, on the board\u2019s surface and on the places list the same way', () => {
    const r = rig(false);
    r.router.prop('football');
    r.router.board();
    r.router.place({ kind: 'prop', id: 'chess' });
    expect(r.calls).toEqual(['gesture', 'engage', 'gesture', 'engage', 'gesture', 'engage']);
  });

  it('is a deliberate gesture too, so the core can unlock audio on the engaging click', () => {
    const r = rig(false);
    r.router.door('certification-office');
    expect(r.calls[0]).toBe('gesture');
  });
});

describe('click routing when engaged', () => {
  it('does what the click always did and never asks to engage', () => {
    const r = rig(true);
    r.router.door('certification-office');
    r.router.clipping('apartment');
    r.router.floor({ x: 0.5, z: -3 });
    r.router.background();
    r.router.prop('football');
    r.router.board();
    r.router.place({ kind: 'prop', id: 'chess' });
    r.router.place({ kind: 'board' });
    expect(r.calls).toEqual([
      'gesture',
      'door:certification-office',
      'gesture',
      'clipping:apartment',
      'gesture',
      'floor:0.5,-3',
      'gesture',
      'gesture',
      'prop:football',
      'gesture',
      'board',
      'gesture',
      'act:chess',
      'gesture',
      'act:board',
    ]);
  });

  it('follows the engaged state as it changes: the click after engaging acts, the one before did not', () => {
    const r = rig(false);
    r.router.door('certification-office');
    r.state.engaged = true;
    r.router.door('certification-office');
    r.state.engaged = false;
    r.router.door('certification-office');
    expect(r.calls).toEqual(['gesture', 'engage', 'gesture', 'door:certification-office', 'gesture', 'engage']);
  });
});
