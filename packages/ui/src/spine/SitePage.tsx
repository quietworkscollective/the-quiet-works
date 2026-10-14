import { Fragment, useEffect, useId, useRef } from 'react';
import {
  ABOUT,
  AUTHOR,
  BOARD,
  CORRIDOR_COPY,
  CREDITS,
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

/**
 * A site page over the dimmed scene: a quiet coal page with a 680 px reading column. The
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
  // A page is something to read: focus lands on its heading (as the memo's does), not on the first
  // link of the navigation, and moves to the new heading when one page leads to another.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <dialog ref={ref} className="tqw-page" data-page={page} aria-labelledby={titleId}>
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
          {content.body.map((paragraph, index) => (
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
        <nav aria-label="Site" className="tqw-page__nav">
          {lost ? (
            <>
              <a
                className="tqw-page__link"
                href="/"
                onClick={(event) => {
                  event.preventDefault();
                  onClose();
                }}
              >
                {CORRIDOR_COPY.backToEntrance}
              </a>
              {onOpenBoard ? (
                <button type="button" className="tqw-page__link" onClick={onOpenBoard}>
                  {BOARD.title}
                </button>
              ) : null}
            </>
          ) : null}
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
          {lost ? null : (
            <button type="button" className="tqw-page__link tqw-page__close" onClick={onClose}>
              {PAGE_NAV.close}
            </button>
          )}
        </nav>
      </div>
    </dialog>
  );
}
