import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsBar } from './SettingsBar.tsx';
import type { Settings } from './types.ts';

const base: Settings = { muted: false, reducedMotion: false, captions: false, textMode: false };

function setup(settings: Partial<Settings> = {}, canLeaveTextMode = true) {
  const onToggle = vi.fn();
  render(<SettingsBar settings={{ ...base, ...settings }} onToggle={onToggle} canLeaveTextMode={canLeaveTextMode} />);
  const group = screen.getByRole('group', { name: 'Settings' });
  const toggle = (name: string) => within(group).getByRole('button', { name });
  return { onToggle, group, toggle };
}

describe('SettingsBar', () => {
  it('is a labelled group of four toggle buttons', () => {
    const { group } = setup();
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['Sound', 'Reduced motion', 'Captions', 'Text mode']);
  });

  it('Sound is pressed when sound is on, which is when it is not muted', () => {
    const on = setup({ muted: false });
    expect(on.toggle('Sound').getAttribute('aria-pressed')).toBe('true');
  });

  it('Sound is not pressed when muted', () => {
    const off = setup({ muted: true });
    expect(off.toggle('Sound').getAttribute('aria-pressed')).toBe('false');
  });

  it('the other toggles mirror their settings directly', () => {
    const { toggle } = setup({ reducedMotion: true, captions: false, textMode: true });
    expect(toggle('Reduced motion').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('Captions').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('Text mode').getAttribute('aria-pressed')).toBe('true');
  });

  it('reports each toggle by its setting key', () => {
    const { toggle, onToggle } = setup();
    fireEvent.click(toggle('Sound'));
    fireEvent.click(toggle('Reduced motion'));
    fireEvent.click(toggle('Captions'));
    fireEvent.click(toggle('Text mode'));
    expect(onToggle.mock.calls.map(([key]) => key)).toEqual(['muted', 'reducedMotion', 'captions', 'textMode']);
  });

  it('keeps the exact accessible names, with the icon contributing no text', () => {
    const { group } = setup();
    for (const name of ['Sound', 'Reduced motion', 'Captions', 'Text mode']) {
      const button = within(group).getByRole('button', { name });
      expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(button.querySelector('.tqw-toggle__label')?.textContent).toBe(name);
    }
  });

  it('gives every toggle a tooltip equal to its name, for the icon-only layout', () => {
    const { toggle } = setup();
    for (const name of ['Sound', 'Reduced motion', 'Captions']) {
      expect((toggle(name) as HTMLButtonElement).title).toBe(name);
    }
    expect((toggle('Text mode') as HTMLButtonElement).title).toBe('Text mode');
  });

  it('when the 3D view is unavailable, Text mode is pressed, disabled and explains itself', () => {
    const { toggle, onToggle } = setup({ textMode: false }, false);
    const textMode = toggle('Text mode') as HTMLButtonElement;
    expect(textMode.getAttribute('aria-pressed')).toBe('true');
    expect(textMode.disabled).toBe(true);
    expect(textMode.title).toBe('The 3D view is unavailable on this device.');
    fireEvent.click(textMode);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('leaves Text mode enabled, with its plain tooltip, when the 3D view is available', () => {
    const { toggle } = setup({}, true);
    const textMode = toggle('Text mode') as HTMLButtonElement;
    expect(textMode.disabled).toBe(false);
    expect(textMode.title).toBe('Text mode');
  });

  it('keeps the other toggles usable when Text mode is locked', () => {
    const { toggle } = setup({}, false);
    expect((toggle('Sound') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('SettingsBar icons', () => {
  // The state must be readable without colour: each icon changes SHAPE between off and on.
  const cases: Array<[string, Partial<Settings>, Partial<Settings>]> = [
    ['Sound', { muted: true }, { muted: false }],
    ['Reduced motion', { reducedMotion: false }, { reducedMotion: true }],
    ['Captions', { captions: false }, { captions: true }],
    ['Text mode', { textMode: false }, { textMode: true }],
  ];

  it.each(cases)('%s draws a different icon when off and when on', (name, off, on) => {
    const offView = setup(off);
    const offIcon = offView.toggle(name).querySelector('svg')!;
    const offMarkup = offIcon.innerHTML;
    const offTag = offIcon.getAttribute('data-icon');
    cleanup();
    const onView = setup(on);
    const onIcon = onView.toggle(name).querySelector('svg')!;
    expect(onIcon.innerHTML).not.toBe(offMarkup);
    expect(onIcon.getAttribute('data-icon')).not.toBe(offTag);
    expect(offTag).toMatch(/-off$/);
    expect(onIcon.getAttribute('data-icon')).toMatch(/-on$/);
  });

  it('draws the four icons differently from one another', () => {
    const { group } = setup();
    const kinds = Array.from(group.querySelectorAll('svg')).map((svg) => svg.innerHTML);
    expect(new Set(kinds).size).toBe(4);
  });
});
