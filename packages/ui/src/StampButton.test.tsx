import { fireEvent, render, screen } from '@testing-library/react';
import { StampButton } from './StampButton.tsx';

function setup(props: { pressing?: boolean; variant?: 'dock' | 'desk' } = {}) {
  const onPressStart = vi.fn();
  const onPressEnd = vi.fn();
  const view = render(
    <StampButton
      pressing={props.pressing ?? false}
      variant={props.variant ?? 'dock'}
      onPressStart={onPressStart}
      onPressEnd={onPressEnd}
    />,
  );
  const button = screen.getByRole('button', { name: 'Hold to stamp the form' });
  return { button, onPressStart, onPressEnd, ...view };
}

const touch = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 } as const;

describe('StampButton semantics', () => {
  it('is a native button named "Hold to stamp the form" with a visible hold hint', () => {
    const { button } = setup();
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveProperty('type', 'button');
    expect(button.textContent).toContain('Hold to stamp');
    expect(button.textContent).toContain('Space');
  });

  it('has an accessible name that contains its visible label (WCAG 2.5.3 label in name)', () => {
    const { button } = setup();
    const visible = button.querySelector('.tqw-stamp__label')?.textContent ?? '';
    const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
    expect(visible).not.toBe('');
    expect(name.toLowerCase()).toContain(visible.toLowerCase());
  });

  it('describes itself with the hidden press-and-hold hint', () => {
    const { button } = setup();
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint?.textContent).toBe('Press and hold to stamp the paper. Release to lift the stamp.');
    expect(hint?.className).toContain('tqw-visually-hidden');
  });

  it('reflects `pressing` and `variant` as data attributes', () => {
    const { button, rerender, onPressStart, onPressEnd } = setup({ pressing: false, variant: 'desk' });
    expect(button.getAttribute('data-pressing')).toBe('false');
    expect(button.getAttribute('data-variant')).toBe('desk');
    rerender(<StampButton pressing variant="desk" onPressStart={onPressStart} onPressEnd={onPressEnd} />);
    expect(button.getAttribute('data-pressing')).toBe('true');
  });

  it('suppresses the touch long-press context menu', () => {
    const { button } = setup();
    expect(fireEvent.contextMenu(button)).toBe(false);
  });
});

describe('StampButton pointer input', () => {
  it('pointer down then up dispatches exactly one press and one release', () => {
    const { button, onPressStart, onPressEnd } = setup();
    button.setPointerCapture = vi.fn();

    fireEvent.pointerDown(button, touch);
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();
    expect(button.setPointerCapture).toHaveBeenCalledWith(7);

    fireEvent.pointerUp(button, touch);
    // The browser follows pointerup with lostpointercapture; it must not release twice.
    fireEvent.lostPointerCapture(button, touch);
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('pointercancel releases', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.pointerDown(button, touch);
    fireEvent.pointerCancel(button, touch);
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('losing pointer capture releases when no pointerup arrived', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.pointerDown(button, touch);
    fireEvent.lostPointerCapture(button, touch);
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores secondary mouse buttons', () => {
    const { button, onPressStart } = setup();
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', button: 2 });
    expect(onPressStart).not.toHaveBeenCalled();
  });

  it('only the pointer that started the press can end it', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.pointerDown(button, touch);
    fireEvent.pointerDown(button, { ...touch, pointerId: 8 });
    fireEvent.pointerUp(button, { ...touch, pointerId: 8 });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, touch);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('the click that follows a pointer gesture adds no extra press', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(button, { pointerId: 1, pointerType: 'mouse', button: 0 });
    fireEvent.click(button, { detail: 1 });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  { name: 'Space', key: ' ', code: 'Space' },
  { name: 'Enter', key: 'Enter', code: 'Enter' },
])('StampButton $name key', ({ key, code }) => {
  it('keydown (with auto-repeat) then keyup dispatches exactly one press and one release', () => {
    const { button, onPressStart, onPressEnd } = setup();

    fireEvent.keyDown(button, { key, code });
    fireEvent.keyDown(button, { key, code, repeat: true });
    fireEvent.keyDown(button, { key, code, repeat: true });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();

    fireEvent.keyUp(button, { key, code });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('prevents the default of keydown, repeats and keyup so the browser sends no synthetic click', () => {
    const { button } = setup();
    expect(fireEvent.keyDown(button, { key, code })).toBe(false);
    expect(fireEvent.keyDown(button, { key, code, repeat: true })).toBe(false);
    expect(fireEvent.keyUp(button, { key, code })).toBe(false);
  });

  it('an auto-repeat keydown on its own never starts a press (the key went down before focus arrived)', () => {
    const { button, onPressStart } = setup();
    fireEvent.keyDown(button, { key, code, repeat: true });
    expect(onPressStart).not.toHaveBeenCalled();
  });

  it('a second key pressed during a hold does not start another press', () => {
    const { button, onPressStart, onPressEnd } = setup();
    const other = key === ' ' ? { key: 'Enter', code: 'Enter' } : { key: ' ', code: 'Space' };
    fireEvent.keyDown(button, { key, code });
    fireEvent.keyDown(button, other);
    fireEvent.keyUp(button, other);
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key, code });
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('losing focus while the key is held releases the stamp once', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.keyDown(button, { key, code });
    fireEvent.blur(button);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
    // The key coming up later, elsewhere or here, must not release a second time.
    fireEvent.keyUp(button, { key, code });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('leaves shortcuts alone: Ctrl or Cmd with the key neither presses nor is prevented', () => {
    const { button, onPressStart } = setup();
    expect(fireEvent.keyDown(button, { key, code, ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(button, { key, code, metaKey: true })).toBe(true);
    expect(onPressStart).not.toHaveBeenCalled();
  });
});

describe('StampButton assistive-technology activation', () => {
  it('a click with detail 0 (VoiceOver, Switch Control) presses and releases once', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.click(button, { detail: 0 });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
    expect(onPressStart.mock.invocationCallOrder[0]).toBeLessThan(onPressEnd.mock.invocationCallOrder[0]!);
  });

  it('a mouse click (detail 1) on its own does nothing', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.click(button, { detail: 1 });
    expect(onPressStart).not.toHaveBeenCalled();
    expect(onPressEnd).not.toHaveBeenCalled();
  });

  it('a detail-0 click during a held key does not double-fire', () => {
    const { button, onPressStart, onPressEnd } = setup();
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });
    fireEvent.click(button, { detail: 0 });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();
  });
});

describe('StampButton lifetime', () => {
  it('releases a held stamp when it unmounts, so the stamp cannot stick down', () => {
    const { button, unmount, onPressStart, onPressEnd } = setup();
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });
    expect(onPressEnd).not.toHaveBeenCalled();
    unmount();
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('does not release on unmount when nothing is held', () => {
    const { unmount, onPressEnd } = setup();
    unmount();
    expect(onPressEnd).not.toHaveBeenCalled();
  });
});
