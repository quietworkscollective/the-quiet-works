import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MenuPanel } from './MenuPanel.tsx';
import { SETTINGS } from './testHelpers.ts';

function setup(open = true, settings = SETTINGS, canLeaveTextMode = true) {
  const handlers = { onToggle: vi.fn(), onOpenBoard: vi.fn(), onOpenPage: vi.fn(), onClose: vi.fn() };
  const props = { open, settings, canLeaveTextMode, ...handlers };
  const view = render(<MenuPanel {...props} />);
  return { ...handlers, view, props };
}

afterEach(() => cleanup());

describe('MenuPanel', () => {
  it('is a modal dialog named Menu', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Menu' })).toBeTruthy();
  });

  it('is shut until it is opened', () => {
    setup(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the places the page can go: the notice board, About, Credits and Privacy', () => {
    setup();
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(pages.getAllByRole('button').map((b) => b.textContent)).toEqual(['Notice board']);
    expect(pages.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/about', '/credits', '/privacy']);
    expect(pages.getAllByRole('link').map((a) => a.textContent)).toEqual(['About', 'Credits', 'Privacy']);
  });

  it('opens a page or the board from its links without navigating', () => {
    const { onOpenBoard, onOpenPage } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Notice board' }));
    expect(onOpenBoard).toHaveBeenCalledTimes(1);
    const credits = screen.getByRole('link', { name: 'Credits' });
    expect(fireEvent.click(credits)).toBe(false);
    expect(onOpenPage).toHaveBeenCalledWith('credits');
  });

  it('holds Settings, with sound, reduced motion, captions and text mode, as a labelled group', () => {
    const { onToggle } = setup();
    const group = screen.getByRole('group', { name: 'Settings' });
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('title'))).toEqual(['Sound', 'Reduced motion', 'Captions', 'Text mode']);
    fireEvent.click(within(group).getByRole('button', { name: 'Captions' }));
    expect(onToggle).toHaveBeenCalledWith('captions');
  });

  it('shows the current settings in aria-pressed (sound is the inverse of muted)', () => {
    setup(true, { muted: true, reducedMotion: true, captions: false, textMode: false });
    const group = screen.getByRole('group', { name: 'Settings' });
    const pressed = (name: string) => within(group).getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Sound')).toBe('false');
    expect(pressed('Reduced motion')).toBe('true');
    expect(pressed('Captions')).toBe('false');
  });

  it('asks to close from its own button, once', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close the menu' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports the dialog\'s own close (Escape) once, and does not echo a close the page asked for', () => {
    const { onClose, view, props } = setup();
    const dialog = screen.getByRole('dialog');
    (dialog as HTMLDialogElement).close();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.rerender(<MenuPanel {...props} open />);
    view.rerender(<MenuPanel {...props} open={false} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
