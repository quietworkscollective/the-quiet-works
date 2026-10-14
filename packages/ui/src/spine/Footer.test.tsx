import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FOOTER_COPY } from '@tqw/engine';
import { Footer } from './Footer.tsx';

function setup(trivia?: string) {
  const onOpenPage = vi.fn();
  const view = render(<Footer menu={<nav aria-label="Test menu">menu</nav>} onOpenPage={onOpenPage} trivia={trivia} />);
  return { onOpenPage, view };
}

afterEach(() => cleanup());

describe('Footer', () => {
  it("is the page's footer landmark, named", () => {
    setup();
    expect(screen.getByRole('contentinfo', { name: FOOTER_COPY.label })).toBeTruthy();
  });

  it('repeats the menu it is given, above the links', () => {
    const { view } = setup();
    const footer = view.container.querySelector('footer') as HTMLElement;
    const menu = within(footer).getByRole('navigation', { name: 'Test menu' });
    const links = within(footer).getByRole('navigation', { name: 'Footer links' });
    expect(menu.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links About, Credits and Privacy as pages, and the licences as the notices file', () => {
    const { onOpenPage } = setup();
    const links = within(screen.getByRole('navigation', { name: 'Footer links' })).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['About', 'Credits', 'Privacy', FOOTER_COPY.licences]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/about', '/credits', '/privacy', '/third-party-notices.txt']);
    expect(fireEvent.click(links[0] as HTMLElement)).toBe(false);
    expect(onOpenPage).toHaveBeenCalledWith('about');
    // The licences link is a plain link to a file, not an app page.
    expect(fireEvent.click(links[3] as HTMLElement)).toBe(true);
    expect(onOpenPage).toHaveBeenCalledTimes(1);
  });

  it('states the licences and the copyright, with the mark as decoration', () => {
    const { view } = setup();
    expect(screen.getByText(FOOTER_COPY.licencesNote)).toBeTruthy();
    expect(screen.getByText(FOOTER_COPY.copyright)).toBeTruthy();
    // The maker's name in full, written out here so the constant cannot change it unseen.
    expect(FOOTER_COPY.copyright).toBe('© 2026 Siri (Asiri) Dalugoda');
    expect(view.container.querySelector('.tqw-footer__copyright svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves trivia out until there is some, then sets exactly that line', () => {
    const { view } = setup();
    expect(view.container.querySelector('.tqw-footer__trivia')).toBeNull();
    cleanup();
    setup('The corridor is exactly as long as it needs to be.');
    expect(screen.getByText('The corridor is exactly as long as it needs to be.').className).toContain('tqw-footer__trivia');
  });

  it('ships no trivia in the draft pool until the editor approves some', () => {
    expect(FOOTER_COPY.trivia).toEqual([]);
  });
});
