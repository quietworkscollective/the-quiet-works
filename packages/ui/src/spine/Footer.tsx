import { FOOTER_COPY, PAGE_NAV } from '@tqw/engine';
import { Mark } from './Mark.tsx';
import type { FooterProps } from './types.ts';

const PAGES = [
  ['about', '/about'],
  ['credits', '/credits'],
  ['privacy', '/privacy'],
] as const;

/**
 * The footer (ADR 0003): the menu again, one rule, a line of non-spoiler trivia (left empty until
 * suitable copy is approved), About, Credits, Privacy, the licences, and the copyright. A full
 * screen of room to finish on; its height is a minimum, so it grows with large text and zoom.
 */
export function Footer({ menu, onOpenPage, trivia }: FooterProps) {
  return (
    <footer className="tqw-footer" aria-label={FOOTER_COPY.label}>
      <div className="tqw-footer__inner">
        <div className="tqw-footer__menu">{menu}</div>
        {trivia ? <p className="tqw-footer__trivia">{trivia}</p> : null}
        <div className="tqw-footer__base">
          <nav aria-label="Footer links" className="tqw-footer__links">
            {PAGES.map(([id, href]) => (
              <a
                key={id}
                className="tqw-footer__link"
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenPage(id);
                }}
              >
                {PAGE_NAV[id]}
              </a>
            ))}
            <a className="tqw-footer__link" href="/third-party-notices.txt">
              {FOOTER_COPY.licences}
            </a>
          </nav>
          <p className="tqw-footer__note">{FOOTER_COPY.licencesNote}</p>
          <p className="tqw-footer__copyright">
            <Mark size={14} className="tqw-mark tqw-footer__mark" />
            <span>{FOOTER_COPY.copyright}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
