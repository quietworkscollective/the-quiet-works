import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HERO_COPY, LANDING } from '@tqw/engine';
import { Hero } from './Hero.tsx';

function setup(details: readonly string[] = [], text?: boolean) {
  const handlers = { onScrollCue: vi.fn(), onEnter: vi.fn() };
  const view = render(<Hero menu={<nav aria-label="Test menu">menu</nav>} details={details} text={text} {...handlers} />);
  return { ...handlers, view };
}

afterEach(() => cleanup());

describe('Hero', () => {
  it('is a section named by one h1, UNHELD, with .space kept out of the name', () => {
    setup();
    const section = screen.getByRole('region', { name: 'UNHELD' });
    const heading = within(section).getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('UNHELD');
    expect(screen.getByRole('heading', { level: 1, name: 'UNHELD' })).toBe(heading);
    const space = heading.querySelector('.tqw-hero__space');
    expect(space?.textContent?.trim()).toBe('.space');
    expect(space?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the live text in reading order: the name, tagline, then details', () => {
    setup(['1 door open']);
    const heading = screen.getByRole('heading', { level: 1 });
    const tagline = screen.getByText('A space for everything we carry.');
    const details = screen.getByText('1 door open');
    expect(heading.compareDocumentPosition(tagline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tagline.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the menu it is given in its own slot, and the scrim out of the accessibility tree', () => {
    const { view } = setup();
    expect(within(view.container.querySelector('.tqw-hero__menu') as HTMLElement).getByRole('navigation', { name: 'Test menu' })).toBeTruthy();
    expect(view.container.querySelector('.tqw-hero__scrim')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the details line out when there is nothing quiet to say', () => {
    const { view } = setup([]);
    expect(view.container.querySelector('.tqw-hero__details')).toBeNull();
  });

  it('sets the details side by side as one paragraph, each its own span, with decorative separators', () => {
    const { view } = setup(['2 doors open', '3 discoveries this visit']);
    const line = view.container.querySelector('.tqw-hero__details') as HTMLElement;
    expect(line.tagName).toBe('P');
    expect(within(line).getByText('2 doors open')).toBeTruthy();
    expect(within(line).getByText('3 discoveries this visit')).toBeTruthy();
    const separators = line.querySelectorAll('.tqw-hero__sep');
    expect(separators).toHaveLength(1);
    expect(separators[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('offers the scroll cue as a named button, and calls back on press', () => {
    const { onScrollCue, onEnter } = setup();
    fireEvent.click(screen.getByRole('button', { name: HERO_COPY.scrollCue }));
    expect(onScrollCue).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('offers a direct link in: a real #game link that enters without following the fragment', () => {
    const { onEnter, onScrollCue } = setup();
    const link = screen.getByRole('link', { name: LANDING.enter });
    expect(link.getAttribute('href')).toBe('#game');
    // Cancelled: the shell scrolls and engages itself, so the browser must not also jump.
    expect(fireEvent.click(link)).toBe(false);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onScrollCue).not.toHaveBeenCalled();
  });

  it('keeps the scroll cue before the quieter direct link in reading and tab order', () => {
    setup();
    const cue = screen.getByRole('button', { name: HERO_COPY.scrollCue });
    const link = screen.getByRole('link', { name: LANDING.enter });
    expect(cue.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks text mode, where no world sits behind it', () => {
    const { view } = setup([], true);
    expect(view.container.querySelector('.tqw-hero')?.getAttribute('data-text')).toBe('true');
    cleanup();
    const plain = setup([]).view;
    expect(plain.container.querySelector('.tqw-hero')?.hasAttribute('data-text')).toBe(false);
  });
});
