// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gramophone } from '../../../../audio/music/index.ts';
import { LEAD_IN_MS } from '../../../../audio/music/needle.ts';
import { GramophoneActions } from './GramophoneActions.tsx';
import { gramophoneUi } from './ui.ts';

beforeEach(() => {
  vi.useFakeTimers();
  gramophone.reset();
  gramophoneUi.setFocus(null);
  gramophoneUi.setHover(null);
});
afterEach(() => {
  cleanup();
  gramophone.reset();
  vi.useRealTimers();
});

const group = () => screen.getByRole('region', { name: 'The gramophone' });

describe('the gramophone\'s DOM equivalent', () => {
  it('reads as text: "A gramophone. ..." with the record on the platter, for a screen reader and for text mode', () => {
    render(<GramophoneActions />);
    expect(group().textContent).toContain('A gramophone. The needle is up. On the platter: Gymnopédie No. 1, Erik Satie.');
  });

  it('offers real buttons for the verbs: Play and Change the record at rest, Lift the needle once it is down', () => {
    render(<GramophoneActions />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change the record' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lift the needle' })).toBeNull();
    act(() => gramophone.act('play'));
    expect(screen.getByRole('button', { name: 'Lift the needle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(group().textContent).toContain('The needle has come down on Gymnopédie No. 1, Erik Satie.');
    act(() => vi.advanceTimersByTime(LEAD_IN_MS));
    expect(group().textContent).toContain('Playing: Gymnopédie No. 1, Erik Satie.');
  });

  it('acts on the shared gramophone when pressed, and a press can be the very first gesture: it unlocks the desk first', () => {
    const unlock = vi.fn();
    gramophone.setUnlocker(unlock);
    render(<GramophoneActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(gramophone.getState().needle).toBe('lead-in');
    fireEvent.click(screen.getByRole('button', { name: 'Change the record' }));
    expect(gramophone.getState()).toEqual({ needle: 'swap', record: 1 });
    expect(group().textContent).toContain('Changing the record. Next: Waltz in A minor, Frédéric Chopin.');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lift the needle' }));
    expect(gramophone.getState()).toEqual({ needle: 'up', record: 1 });
  });

  it('keeps a press\'s verb through the first gesture: Play pressed as the very first gesture must not undo itself', () => {
    // The press is the gesture that unlocks the desk, which starts the first record, which turns the
    // button into "Lift the needle" before the click lands. The click must still mean what it was pressed as.
    render(<GramophoneActions />);
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.pointerDown(play);
    act(() => gramophone.autostart());
    expect(gramophone.getState().needle).toBe('lead-in');
    fireEvent.click(screen.getByRole('button', { name: 'Lift the needle' }));
    expect(gramophone.getState().needle).toBe('lead-in');

    // The same from the keyboard.
    cleanup();
    gramophone.reset();
    render(<GramophoneActions />);
    const key = screen.getByRole('button', { name: 'Play' });
    fireEvent.keyDown(key, { key: 'Enter' });
    act(() => gramophone.autostart());
    fireEvent.click(screen.getByRole('button', { name: 'Lift the needle' }));
    expect(gramophone.getState().needle).toBe('lead-in');
  });

  it('presses the verb on the button when nothing was noted: a click on its own means what the label says', () => {
    render(<GramophoneActions />);
    act(() => gramophone.act('play'));
    fireEvent.click(screen.getByRole('button', { name: 'Lift the needle' }));
    expect(gramophone.getState().needle).toBe('up');
  });

  it('tells the scene which control has the keyboard, so the matching fitting can light and the label sit beside it', () => {
    render(<GramophoneActions />);
    fireEvent.focus(screen.getByRole('button', { name: 'Play' }));
    expect(gramophoneUi.state.focus).toBe('needle');
    fireEvent.blur(screen.getByRole('button', { name: 'Play' }));
    expect(gramophoneUi.state.focus).toBeNull();
    fireEvent.focus(screen.getByRole('button', { name: 'Change the record' }));
    expect(gramophoneUi.state.focus).toBe('records');
  });

  it('says when the sound is off', () => {
    render(<GramophoneActions />);
    expect(group().textContent).not.toContain('The sound is off.');
    act(() => gramophone.setMuted(true));
    expect(group().textContent).toContain('The sound is off.');
    act(() => gramophone.setMuted(false));
    expect(group().textContent).not.toContain('The sound is off.');
  });

  it('draws the cue labels for the pointer with the same words, hidden from screen readers and out of the tab order', () => {
    const { container } = render(<GramophoneActions />);
    const cues = [...container.querySelectorAll<HTMLElement>('.tqw-gramophone__cue')];
    expect(cues.map((c) => c.textContent)).toEqual(['Play', 'Change the record']);
    for (const cue of cues) {
      expect(cue.getAttribute('aria-hidden')).toBe('true');
      expect(cue.getAttribute('data-shown')).toBe('false');
      expect(cue.tabIndex).toBe(-1);
    }
    // The real buttons are in the tab order.
    for (const button of container.querySelectorAll<HTMLButtonElement>('button')) expect(button.tabIndex).toBe(0);
  });
});
