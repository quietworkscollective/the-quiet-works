// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gramophone } from '../../../../audio/music/index.ts';
import { mountGramophoneIsland } from './island.tsx';

// React asks for this flag so that updates made outside a test renderer are flushed inside `act`.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => gramophone.reset());
afterEach(() => {
  gramophone.reset();
  document.body.replaceChildren();
});

describe('the gramophone mounted on its own (text mode, no scene)', () => {
  it('puts the text reading and the verbs on the page, and takes them away again', async () => {
    let island = mountGramophoneIsland();
    await act(async () => {});
    expect(island.host.parentElement).toBe(document.body);
    expect(island.host.textContent).toContain('A gramophone. The needle is up.');
    expect([...island.host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Play', 'Change the record']);
    // It works without a scene: a press moves the needle and the reading follows.
    await act(async () => {
      island.host.querySelector<HTMLButtonElement>('button[data-target="needle"]')?.click();
    });
    expect(gramophone.getState().needle).toBe('lead-in');
    expect(island.host.textContent).toContain('The needle has come down');
    island.unmount();
    island.unmount();
    await act(async () => {});
    expect(document.querySelector('.tqw-gramophone-island')).toBeNull();
    island = mountGramophoneIsland();
    await act(async () => {});
    expect(document.querySelectorAll('.tqw-gramophone-island')).toHaveLength(1);
    island.unmount();
  });
});
