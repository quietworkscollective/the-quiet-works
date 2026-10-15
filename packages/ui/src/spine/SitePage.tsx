import { Fragment, useEffect, useId, useRef } from 'react';
import {
  ABOUT,
  AUTHOR,
  BOARD,
  CORRIDOR_COPY,
  CREDITS,
  FOOTER_COPY,
  NOT_FOUND,
  PAGE_NAV,
  PRIVACY,
  THIRD_PARTY_COPY,
  type PageId,
  type SitePage as Page,
} from '@tqw/engine';
import { BRAND } from './brand.ts';
import { Mark } from './Mark.tsx';
import { useModalDialog } from './useModalDialog.ts';
import type { SitePageProps } from './types.ts';

const PAGES: Record<PageId, Page> = { about: ABOUT, credits: CREDITS, privacy: PRIVACY, 'not-found': NOT_FOUND };
const LINKS = [
  ['about', '/about'],
  ['credits', '/credits'],
  ['privacy', '/privacy'],
] as const;

function splitCreditLabel(copy: string): { label: string; body: string } {
  const separator = copy.indexOf(': ');
  if (separator < 0) return { label: '', body: copy };
  return { label: copy.slice(0, separator + 1), body: copy.slice(separator + 2) };
}

const TYPEFACES = splitCreditLabel(CREDITS.body[2] as string);
const SOFTWARE = splitCreditLabel(CREDITS.body[3] as string);
const NOTICE_LINK_TEXT = 'The full licence texts for everything bundled';
const NOTICE_LINK_START = SOFTWARE.body.indexOf(NOTICE_LINK_TEXT);

/**
 * A site page over the scene: an opaque reading surface with a 720 px column. The
 * not-found page keeps the same page and adds a cropped blank plaque (a door with nothing to say)
 * and the two ways back, the entrance and the board.
 */
export function SitePage({ page, onClose, onNavigate, onOpenBoard, authorUrl, thirdParty }: SitePageProps) {
  const ref = useModalDialog(true, onClose);
  const titleId = useId();
  const assetsId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const content = PAGES[page];
  const lost = page === 'not-found';
  const closePage = () => {
    const dialog = ref.current;
    if (dialog?.open) dialog.close();
    else onClose();
  };
  // A page is something to read: focus lands on its heading (as the memo's does), not on the first
  // link of the navigation, and moves to the new heading when one page leads to another.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <dialog
      ref={ref}
      className="tqw-page"
      data-page={page}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="tqw-page__header">
        {!lost ? (
          <button type="button" className="tqw-page__link tqw-page__close" aria-label={PAGE_NAV.close} onClick={closePage}>
            <span>{PAGE_NAV.close}</span>
            {' '}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        <nav aria-label="Site" className="tqw-page__nav">
          {LINKS.map(([id, href]) => (
            <a
              key={id}
              className="tqw-page__link"
              href={href}
              aria-current={page === id ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(id);
              }}
            >
              {PAGE_NAV[id]}
            </a>
          ))}
        </nav>
      </header>
      <div className="tqw-page__sheet">
        <p className="tqw-page__masthead" aria-hidden="true">
          <Mark size={18} className="tqw-mark tqw-page__mark" />
          <span>{BRAND.name}</span>
        </p>
        {lost ? <div className="tqw-plaque" aria-hidden="true" /> : null}
        <article className="tqw-page__article">
          <h1 id={titleId} ref={title} tabIndex={-1} className="tqw-page__title">
            {content.title}
          </h1>
          {page === 'credits' ? (
            <div className="tqw-page__credits">
              <section className="tqw-page__credits-section">
                <h2 className="tqw-page__credits-label">Authorship</h2>
                <p>{CREDITS.body[0]}</p>
              </section>
              <section className="tqw-page__credits-section">
                <h2 className="tqw-page__credits-label">{FOOTER_COPY.licences}</h2>
                <p>{CREDITS.body[1]}</p>
              </section>
              <section className="tqw-page__credits-section">
                <h2 className="tqw-page__credits-label">{TYPEFACES.label}</h2>
                <p>{TYPEFACES.body}</p>
              </section>
              <section className="tqw-page__credits-section">
                <h2 className="tqw-page__credits-label">{SOFTWARE.label}</h2>
                <p>
                  {NOTICE_LINK_START < 0 ? SOFTWARE.body : SOFTWARE.body.slice(0, NOTICE_LINK_START)}
                  {NOTICE_LINK_START >= 0 ? (
                    <>
                      <a href="/third-party-notices.txt">{NOTICE_LINK_TEXT}</a>
                      {SOFTWARE.body.slice(NOTICE_LINK_START + NOTICE_LINK_TEXT.length)}
                    </>
                  ) : null}
                </p>
              </section>
            </div>
          ) : content.body.map((paragraph, index) => (
            <Fragment key={paragraph}>
              {/* The maker, and his own site, before the last line (the one about immediate danger stays last). */}
              {page === 'about' && authorUrl && index === content.body.length - 1 ? (
                <p className="tqw-page__author">
                  {AUTHOR.line}{' '}
                  <a href={authorUrl} rel="noopener noreferrer">
                    {AUTHOR.linkLabel}
                  </a>
                </p>
              ) : null}
              <p>{paragraph}</p>
            </Fragment>
          ))}
          {lost ? (
            <div className="tqw-page__recovery">
              <a
                className="tqw-page__link"
                href="/"
                onClick={(event) => {
                  event.preventDefault();
                  closePage();
                }}
              >
                {CORRIDOR_COPY.backToEntrance}
              </a>
              {onOpenBoard ? (
                <button type="button" className="tqw-page__link" onClick={onOpenBoard}>
                  {BOARD.title}
                </button>
              ) : null}
            </div>
          ) : null}
          {/* The models and surfaces made by other people: credited by provider, each linked to its own page. */}
          {page === 'credits' && thirdParty && thirdParty.length > 0 ? (
            <section className="tqw-page__assets" aria-labelledby={assetsId}>
              <h2 id={assetsId} className="tqw-page__assets-title">
                {THIRD_PARTY_COPY.heading}
              </h2>
              <p>{THIRD_PARTY_COPY.intro}</p>
              {thirdParty.map((group) => (
                <div key={group.provider} className="tqw-page__assets-group">
                  <h3 className="tqw-page__assets-provider">{group.provider}</h3>
                  <ul className="tqw-page__assets-list">
                    {group.items.map((item) => (
                      <li key={`${item.source} ${item.title}`}>
                        <a href={item.source} rel="noopener noreferrer">
                          {item.title}
                        </a>
                        {`, ${THIRD_PARTY_COPY.by.replace('{author}', item.author)}, ${item.licence}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p>{THIRD_PARTY_COPY.original}</p>
            </section>
          ) : null}
        </article>
      </div>
    </dialog>
  );
}
