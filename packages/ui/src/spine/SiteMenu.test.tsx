import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SiteMenu } from './SiteMenu.tsx';
import type { SoundControl } from './types.ts';

function setup(variant: 'hero' | 'footer' = 'hero', sound?: SoundControl) {
  const handlers = { onOpenBoard: vi.fn(), onOpenPage: vi.fn(), onOpenMenu: vi.fn() };
  render(<SiteMenu variant={variant} sound={sound} {...handlers} />);
  return handlers;
}

afterEach(() => cleanup());

describe('SiteMenu', () => {
  it('is a navigation named for where it sits', () => {
    setup('hero');
    expect(screen.getByRole('navigation', { name: 'Top links' })).toBeTruthy();
    cleanup();
    setup('footer');
    expect(screen.getByRole('navigation', { name: 'Footer menu' })).toBeTruthy();
  });

  it('lists Notice board, About and Menu, in that order', () => {
    setup();
    const nav = screen.getByRole('navigation');
    const names = [...nav.querySelectorAll('button, a')].map((el) => el.textContent);
    expect(names).toEqual(['Notice board', 'About', 'Menu']);
  });

  it('opens the notice board, the About page and the menu from the three items', () => {
    const { onOpenBoard, onOpenPage, onOpenMenu } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Notice board' }));
    expect(onOpenBoard).toHaveBeenCalledTimes(1);
    const about = screen.getByRole('link', { name: 'About' });
    expect(about.getAttribute('href')).toBe('/about');
    // Cancelled: the shell opens the page as a dialog, not by navigating away.
    expect(fireEvent.click(about)).toBe(false);
    expect(onOpenPage).toHaveBeenCalledWith('about');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('says the Menu opens a dialog', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('has no sound control until audio is on', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Sound' })).toBeNull();
  });

  it('puts mute one press away once audio is on: pressed means sound is on', () => {
    const onToggle = vi.fn();
    setup('hero', { muted: false, onToggle });
    const sound = screen.getByRole('button', { name: 'Sound' });
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sound);
    expect(onToggle).toHaveBeenCalledTimes(1);
    cleanup();
    setup('hero', { muted: true, onToggle });
    expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the sound control beside the menu items, not inside the Menu dialog', () => {
    setup('hero', { muted: false, onToggle: vi.fn() });
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: 'Sound' })).toBeTruthy();
    expect(nav.firstElementChild?.className).toContain('tqw-menu__sound');
  });
});
