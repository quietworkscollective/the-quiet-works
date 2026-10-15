import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ABOUT, CREDITS, NOT_FOUND, PRIVACY, THIRD_PARTY_COPY, type PageId } from '@tqw/engine';
import { SitePage } from './SitePage.tsx';
import type { SitePageProps, ThirdPartyGroup } from './types.ts';

function setup(page: PageId, extra: Partial<SitePageProps> = {}) {
  const handlers = { onClose: vi.fn(), onNavigate: vi.fn() };
  const view = render(<SitePage page={page} {...handlers} {...extra} />);
  return { ...handlers, view };
}

afterEach(() => cleanup());

describe('SitePage', () => {
  it.each([
    ['about', ABOUT],
    ['credits', CREDITS],
    ['privacy', PRIVACY],
    ['not-found', NOT_FOUND],
  ] as const)('%s is a dialog named by its heading, with every paragraph', (page, content) => {
    setup(page);
    const dialog = screen.getByRole('dialog', { name: content.title });
    expect(within(dialog).getByRole('heading', { level: 1, name: content.title })).toBeTruthy();
    if (page === 'credits') {
      expect(within(dialog).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent))
        .toEqual(['Authorship', 'Licences', 'Typefaces:', 'Software:']);
      expect(within(dialog).getByText(CREDITS.body[0] as string)).toBeTruthy();
      expect(within(dialog).getByText(CREDITS.body[1] as string)).toBeTruthy();
      expect(within(dialog).getByText((CREDITS.body[2] as string).slice('Typefaces: '.length))).toBeTruthy();
      const softwareBody = (CREDITS.body[3] as string).slice('Software: '.length);
      expect(dialog.querySelector('.tqw-page__credits-section:last-child')?.textContent).toContain(softwareBody);
    } else {
      for (const paragraph of content.body) expect(within(dialog).getByText(paragraph)).toBeTruthy();
    }
  });

  describe('the maker', () => {
    const AUTHOR_URL = 'https://dalugoda.com/';

    it('is named on the About page, with a link to his own site that opens safely', () => {
      setup('about', { authorUrl: AUTHOR_URL });
      const dialog = screen.getByRole('dialog', { name: 'About UNHELD' });
      const line = within(dialog).getByText(/UNHELD is made by Siri \(Asiri\) Dalugoda\./);
      const link = within(line).getByRole('link', { name: 'dalugoda.com' });
      expect(link.getAttribute('href')).toBe(AUTHOR_URL);
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('lets the link do what a link does: the shell does not take the click', () => {
      setup('about', { authorUrl: AUTHOR_URL });
      // Not cancelled, so the browser follows it (jsdom does not navigate).
      expect(fireEvent.click(screen.getByRole('link', { name: 'dalugoda.com' }))).toBe(true);
    });

    it('comes before the line about immediate danger, which stays last', () => {
      setup('about', { authorUrl: AUTHOR_URL });
      const paragraphs = [...screen.getByRole('dialog').querySelectorAll('.tqw-page__article p')].map((p) => p.textContent);
      expect(paragraphs.at(-1)).toBe(ABOUT.body.at(-1));
      expect(paragraphs.at(-2)).toContain('UNHELD is made by Siri (Asiri) Dalugoda.');
      expect(paragraphs).toHaveLength(ABOUT.body.length + 1);
    });

    it('is shown only where the shell gives the address, and only on the About page', () => {
      setup('about');
      expect(screen.queryByRole('link', { name: 'dalugoda.com' })).toBeNull();
      // Nor the line that introduces it: without an address there is no maker's line to leave dangling.
      expect(screen.getByRole('dialog').textContent).not.toContain('UNHELD is made by');
      cleanup();
      for (const page of ['credits', 'privacy', 'not-found'] as const) {
        setup(page, { authorUrl: AUTHOR_URL });
        expect(screen.queryByRole('link', { name: 'dalugoda.com' }), page).toBeNull();
        cleanup();
      }
    });

    it('holds no address in its copy: the link comes from the shell', () => {
      expect(JSON.stringify(ABOUT)).not.toMatch(/https?:|\.com/i);
    });

    it('is named in full on the Credits page', () => {
      setup('credits');
      expect(screen.getByRole('dialog').textContent).toContain('an independent artwork by Siri (Asiri) Dalugoda');
      expect(screen.getByRole('dialog').textContent).toContain('© 2026 Siri (Asiri) Dalugoda');
    });

  it('links the existing descriptive licence phrase to the bundled notice file', () => {
    setup('credits');
    const link = screen.getByRole('link', { name: 'The full licence texts for everything bundled' });
    expect(link.getAttribute('href')).toBe('/third-party-notices.txt');
  });
  });

  describe('the third-party assets', () => {
    const GROUPS: ThirdPartyGroup[] = [
      {
        provider: 'Poly Haven',
        items: [
          { title: 'Metal office desk', author: 'Ulan Cabanilla', licence: 'CC0 1.0 Universal', source: 'https://polyhaven.com/a/metal_office_desk' },
          { title: 'Wall clock', author: 'PierreB3D', licence: 'CC0 1.0 Universal', source: 'https://polyhaven.com/a/wall_clock' },
        ],
      },
      {
        provider: 'ambientCG',
        items: [{ title: 'Paper', author: 'ambientCG', licence: 'CC0 1.0 Universal', source: 'https://ambientcg.com/a/Paper002' }],
      },
    ];
    const section = () => screen.getByRole('region', { name: THIRD_PARTY_COPY.heading });

    it('is a section of the Credits page, named by its heading, with the introduction', () => {
      setup('credits', { thirdParty: GROUPS });
      const dialog = screen.getByRole('dialog', { name: CREDITS.title });
      expect(within(dialog).getByRole('heading', { level: 2, name: THIRD_PARTY_COPY.heading })).toBeTruthy();
      expect(within(section()).getByText(THIRD_PARTY_COPY.intro)).toBeTruthy();
    });

    it('comes after the Credits paragraphs while the site navigation stays at the top', () => {
      setup('credits', { thirdParty: GROUPS });
      const dialog = screen.getByRole('dialog');
      const software = dialog.querySelector('.tqw-page__credits-section:last-child') as HTMLElement;
      expect(software.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Site' }).compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('groups by provider, each under its own heading, in the order given', () => {
      setup('credits', { thirdParty: GROUPS });
      const headings = within(section()).getAllByRole('heading', { level: 3 });
      expect(headings.map((h) => h.textContent)).toEqual(['Poly Haven', 'ambientCG']);
      const lists = within(section()).getAllByRole('list');
      expect(lists).toHaveLength(2);
      expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
      expect(within(lists[1] as HTMLElement).getAllByRole('listitem')).toHaveLength(1);
    });

    it('credits each asset with its title as a link to its page, its author and its licence', () => {
      setup('credits', { thirdParty: GROUPS });
      const item = within(section()).getByRole('link', { name: 'Metal office desk' }).closest('li') as HTMLElement;
      expect(item.textContent).toContain(THIRD_PARTY_COPY.by.replace('{author}', 'Ulan Cabanilla'));
      expect(item.textContent).toContain('CC0 1.0 Universal');
      const links = within(section()).getAllByRole('link');
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'https://polyhaven.com/a/metal_office_desk',
        'https://polyhaven.com/a/wall_clock',
        'https://ambientcg.com/a/Paper002',
      ]);
    });

    it('opens its links safely and lets the browser follow them: the shell does not take the click', () => {
      setup('credits', { thirdParty: GROUPS });
      for (const link of within(section()).getAllByRole('link')) {
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link.getAttribute('target')).toBeNull();
        expect(fireEvent.click(link)).toBe(true);
      }
    });

    it('says that the project\'s own models are CC BY 4.0, once, after the groups', () => {
      setup('credits', { thirdParty: GROUPS });
      const original = within(section()).getByText(THIRD_PARTY_COPY.original);
      expect(screen.getAllByText(THIRD_PARTY_COPY.original)).toHaveLength(1);
      const lastList = within(section()).getAllByRole('list').at(-1) as HTMLElement;
      expect(lastList.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(THIRD_PARTY_COPY.original).toContain('CC BY 4.0');
    });

    it('lists two assets from one page, each once, without a duplicate-key warning', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      setup('credits', {
        thirdParty: [
          {
            provider: 'Poly Haven',
            items: [
              { title: 'Desk', author: 'A', licence: 'CC0 1.0 Universal', source: 'https://polyhaven.com/a/set' },
              { title: 'Chair', author: 'A', licence: 'CC0 1.0 Universal', source: 'https://polyhaven.com/a/set' },
            ],
          },
        ],
      });
      expect(within(section()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Desk', 'Chair']);
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });

    it('is on the Credits page only', () => {
      for (const page of ['about', 'privacy', 'not-found'] as const) {
        setup(page, { thirdParty: GROUPS });
        expect(screen.queryByRole('region', { name: THIRD_PARTY_COPY.heading })).toBeNull();
        expect(screen.queryByText(THIRD_PARTY_COPY.original)).toBeNull();
        cleanup();
      }
    });

    it('is left out when there is nothing to list, rather than shown empty', () => {
      setup('credits');
      expect(screen.queryByRole('region', { name: THIRD_PARTY_COPY.heading })).toBeNull();
      cleanup();
      setup('credits', { thirdParty: [] });
      expect(screen.queryByRole('region', { name: THIRD_PARTY_COPY.heading })).toBeNull();
      expect(screen.queryByText(THIRD_PARTY_COPY.original)).toBeNull();
    });

    it('holds no address in its copy: every link comes from the data', () => {
      expect(JSON.stringify(THIRD_PARTY_COPY)).not.toMatch(/https?:|www\.|\.com\b|\.org\b/);
    });
  });

  it('puts programmatic focus on the heading so the page is read from its start', () => {
    setup('about');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'About UNHELD' }));
  });

  it('moves focus to the new heading when one page leads to another', () => {
    const { view, onClose, onNavigate } = setup('about');
    // The visitor is on the Privacy link when the shell swaps the page: focus has to come back to
    // the (same, re-used) heading, which it would not if it were only set on first mount.
    screen.getByRole('link', { name: 'Privacy' }).focus();
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }));
    view.rerender(<SitePage page="privacy" onClose={onClose} onNavigate={onNavigate} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Privacy' }));
  });

  it('links About, Credits and Privacy, marking the one in view, and closes', () => {
    const { onNavigate, onClose } = setup('credits');
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['About', 'Credits', 'Privacy']);
    expect(within(nav).getByRole('link', { name: 'Credits' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'About' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(within(nav).getByRole('link', { name: 'Privacy' }));
    expect(onNavigate).toHaveBeenCalledWith('privacy');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard focus inside the reading page at both ends of its tab order', () => {
    setup('about');
    const dialog = screen.getByRole('dialog');
    const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    const rect = {} as DOMRect;
    const visibleRects: DOMRectList = {
      0: rect,
      length: 1,
      item: () => rect,
      [Symbol.iterator]: [rect][Symbol.iterator],
    };
    for (const element of focusable) {
      vi.spyOn(element, 'getClientRects').mockReturnValue(visibleRects);
    }
    const first = focusable[0] as HTMLElement;
    const last = focusable.at(-1) as HTMLElement;

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('keeps the browser from following a link: the shell owns the URL', () => {
    setup('about');
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Privacy' }));
    expect(notPrevented).toBe(false);
  });

  it('closes when the dialog reports its own close (Escape)', () => {
    const { onClose } = setup('about');
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('the not-found page', () => {
    it('shows a blank plaque, hidden from assistive technology, and no lettering in it', () => {
      setup('not-found');
      const plaque = document.querySelector('.tqw-plaque');
      expect(plaque).not.toBeNull();
      expect(plaque?.getAttribute('aria-hidden')).toBe('true');
      expect(plaque?.textContent).toBe('');
      expect(document.querySelector('.tqw-plaque')).not.toBeNull();
    });

    it('shows no plaque on the other pages', () => {
      setup('about');
      expect(document.querySelector('.tqw-plaque')).toBeNull();
    });

    it('links back to the entrance, which closes the page', () => {
      const { onClose } = setup('not-found');
      const back = screen.getByRole('link', { name: 'Back to the entrance' });
      expect(back.getAttribute('href')).toBe('/');
      expect(fireEvent.click(back)).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('offers the notice board when the shell can open it', () => {
      const onOpenBoard = vi.fn();
      setup('not-found', { onOpenBoard });
      fireEvent.click(screen.getByRole('button', { name: 'Notice board' }));
      expect(onOpenBoard).toHaveBeenCalledTimes(1);
    });

    it('offers only the entrance when it cannot open the board', () => {
      setup('not-found');
      expect(screen.queryByRole('button', { name: 'Notice board' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Back to the entrance' })).toBeTruthy();
    });

    it('has no separate Close: the entrance link is the way out (Escape still works)', () => {
      setup('not-found');
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('does not mark any of the site links as the current page', () => {
      setup('not-found');
      for (const link of within(screen.getByRole('navigation', { name: 'Site' })).getAllByRole('link')) {
        expect(link.getAttribute('aria-current')).toBeNull();
      }
    });
  });
});
