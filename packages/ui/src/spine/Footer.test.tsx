import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FOOTER_COPY } from '@tqw/engine';
import { Details } from './Details.tsx';
import { Footer } from './Footer.tsx';
import { BRAND } from './brand.ts';
import { SiteMenu } from './SiteMenu.tsx';

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

  it('opens as a colophon with the lockup, tagline and approved creator credit', () => {
    const { view } = setup();
    const footer = view.container.querySelector('footer') as HTMLElement;
    expect(within(footer).getByText(BRAND.name)).toBeTruthy();
    expect(within(footer).getByText(BRAND.tagline)).toBeTruthy();
    expect(within(footer).getByText('Created by Siri (Asiri) Dalugoda')).toBeTruthy();
  });

  it('does not add a detached menu or trivia block to the colophon', () => {
    const { view } = setup('The old trivia slot is ignored.');
    const footer = view.container.querySelector('footer') as HTMLElement;
    expect(within(footer).queryByRole('navigation', { name: 'Test menu' })).toBeNull();
    expect(footer.querySelector('.tqw-footer__menu, .tqw-footer__trivia')).toBeNull();
  });

  it('renders About, Credits, Privacy and Licences exactly once, at the footer', () => {
    const onOpenPage = vi.fn();
    render(
      <>
        <SiteMenu variant="hero" onOpenBoard={vi.fn()} onOpenPage={onOpenPage} onOpenMenu={vi.fn()} />
        <Details onOpenPage={onOpenPage} />
        <Footer menu={<nav aria-label="Test menu">menu</nav>} onOpenPage={onOpenPage} />
      </>,
    );
    const footer = screen.getByRole('contentinfo', { name: FOOTER_COPY.label });
    for (const name of ['About', 'Credits', 'Privacy', 'Licences']) {
      const links = screen.getAllByRole('link', { name });
      expect(links).toHaveLength(1);
      expect(links[0]?.closest('footer')).toBe(footer);
    }
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
    expect(view.container.querySelector('.tqw-footer__note')?.textContent).toBe(FOOTER_COPY.licencesNote);
    expect(screen.getByText(FOOTER_COPY.copyright)).toBeTruthy();
    // The maker's name in full, written out here so the constant cannot change it unseen.
    expect(FOOTER_COPY.copyright).toBe('© 2026 Siri (Asiri) Dalugoda');
    expect(view.container.querySelector('.tqw-footer__copyright svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not render the removed trivia slot', () => {
    const { view } = setup('The corridor is exactly as long as it needs to be.');
    expect(view.container.querySelector('.tqw-footer__trivia')).toBeNull();
  });

  it('ships no trivia in the draft pool until the editor approves some', () => {
    expect(FOOTER_COPY.trivia).toEqual([]);
  });
});
