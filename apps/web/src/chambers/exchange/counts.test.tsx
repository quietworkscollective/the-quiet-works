// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createDiscoveryStore } from '@tqw/engine';
import ExchangeChamber from './ExchangeChamber.tsx';

vi.mock('./scene/ExchangeScene.tsx', () => ({ default: () => null }));

/** No word boundaries: textContent joins adjacent elements, so a count can touch the labels around it. */
const COUNT = /\d+\s*(?:of|out of|\/)\s*\d+/i;

afterEach(cleanup);

it('shows no count in the room or its Archive once findings exist', async () => {
  const discoveries = createDiscoveryStore(null);
  discoveries.record('exchange', { id: 'cardigan', kind: 'line', title: 'Cardigan on the chair' });
  discoveries.record('exchange', { id: 'rule-14', kind: 'secret', title: 'Rule 14' });
  const sound = { unlock: vi.fn(), setMuted: vi.fn(), play: vi.fn(), playSpine: vi.fn(), setWalk: vi.fn(), setRoom: vi.fn(), dispose: vi.fn() };
  await act(async () => {
    render(<ExchangeChamber settings={{ muted: false, reducedMotion: false, captions: true }} text={null} sound={sound}
      caption={vi.fn()} onReady={vi.fn()} onLeave={vi.fn()} onContextLost={vi.fn()} onSceneError={vi.fn()} discoveries={discoveries} />);
  });
  expect(document.body.textContent).not.toMatch(COUNT);
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  expect(screen.getByRole('heading', { name: 'Archive' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Rule 14' })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(COUNT);
});
