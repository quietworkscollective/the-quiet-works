// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChamberProps } from '../types.ts';
import { OBJECTS } from './state.ts';

vi.mock('./OutlineScene.tsx', () => ({ OutlineScene: () => null }));

import OutlineChamber from './OutlineChamber.tsx';

afterEach(cleanup);

function chamberProps(onReady: () => void): ChamberProps {
  return {
    settings: { muted: false, reducedMotion: false, captions: true },
    text: { reason: 'chosen' },
    sound: {
      unlock: vi.fn(),
      setMuted: vi.fn(),
      play: vi.fn(),
      playSpine: vi.fn(),
      setWalk: vi.fn(),
      setRoom: vi.fn(),
      dispose: vi.fn(),
    },
    caption: vi.fn(),
    onReady,
    onLeave: vi.fn(),
    onContextLost: vi.fn(),
    onSceneError: vi.fn(),
  };
}

describe('Outline Room accessible catalogue', () => {
  it('renders a keyboard and screen-reader action for every scene object in text mode', () => {
    const onReady = vi.fn();
    const { container, getByRole } = render(<OutlineChamber {...chamberProps(onReady)} />);
    expect(onReady).toHaveBeenCalled();
    expect(getByRole('region', { name: 'Workshop catalogue' })).toBeTruthy();
    expect(getByRole('navigation', { name: 'Room stations' })).toBeTruthy();

    for (const object of OBJECTS) {
      const row = container.querySelector(`[data-room-object="${object.id}"]`);
      expect(row, object.id).not.toBeNull();
      expect(within(row as HTMLElement).getAllByRole('button').length, object.id).toBeGreaterThan(0);
    }
  });
});
