// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CueLayer } from './CueLayer.tsx';
import { createCueStore } from './cues.ts';

afterEach(cleanup);

describe('the corridor cue accessibility routes', () => {
  it('keeps Places and actions in the tab order when page focus scrolls away from the scene', () => {
    const store = createCueStore();
    store.set({ shown: false, places: [{ key: 'board', text: 'Read notices', target: { kind: 'board' } }] });
    render(<CueLayer store={store} reducedMotion={false} />);
    expect(screen.getByText('Places and actions').closest('[hidden]')).toBeNull();
  });

  it('leaves one accessible door action while its pointer label still works', () => {
    const store = createCueStore();
    const activateCue = vi.fn();
    store.bind({ activateCue, activatePlace: vi.fn(), dismissHint: vi.fn(), closeReader: vi.fn() });
    const text = 'The Certification Office, open the door';
    store.set({ shown: true, cue: { key: 'door:certification-office', text, asButton: true, visible: true } });
    const { container } = render(<><button>{text}</button><CueLayer store={store} reducedMotion={false} /></>);
    expect(screen.getAllByRole('button', { name: text })).toHaveLength(1);
    const pointer = container.querySelector<HTMLButtonElement>('.tqw-cue--button')!;
    expect(pointer.tabIndex).toBe(-1);
    fireEvent.click(pointer);
    expect(activateCue).toHaveBeenCalledOnce();
  });
});
