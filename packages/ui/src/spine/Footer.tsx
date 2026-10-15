import { FOOTER_COPY, MENU_COPY, PAGE_NAV } from '@tqw/engine';
import { Mark } from './Mark.tsx';
import { BRAND } from './brand.ts';
import type { FooterProps } from './types.ts';

const PAGES = [
  ['about', '/about'],
  ['credits', '/credits'],
  ['privacy', '/privacy'],
] as const;

/**
 * The footer (ADR 0003): a colophon with the UNHELD lockup, its tagline, creator credit, one group
 * of site links, the licence lines and the copyright. Its height follows its content.
 */
export function Footer({ onOpenPage, onOpenMenu }: FooterProps) {
  const licenceLines = FOOTER_COPY.licencesNote.split(/(?<=\.)\s+(?=[A-Z])/);
  return (
    <footer className="tqw-footer" aria-label={FOOTER_COPY.label}>
      <div className="tqw-footer__inner">
        <div className="tqw-footer__identity">
          <div className="tqw-footer__lockup">
            <Mark size={18} className="tqw-mark tqw-footer__lockup-mark" />
            <span>{BRAND.name}</span>
          </div>
          <p className="tqw-footer__tagline">{BRAND.tagline}</p>
          <p className="tqw-footer__creator">Created by Siri (Asiri) Dalugoda</p>
        </div>
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
          <a className="tqw-footer__link" href="/agents">Agents</a>
          <a className="tqw-footer__link" href="/third-party-notices.txt">
            {FOOTER_COPY.licences}
          </a>
          {onOpenMenu ? (
            <button type="button" className="tqw-footer__link" aria-haspopup="dialog" onClick={onOpenMenu}>
              {MENU_COPY.menu}
            </button>
          ) : null}
        </nav>
        <div className="tqw-footer__base">
          <p className="tqw-footer__note">
            {licenceLines.map((line, index) => (
              <span key={line} className="tqw-footer__licence-line">
                {line}
                {index < licenceLines.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
          <p className="tqw-footer__copyright">
            <Mark size={14} className="tqw-mark tqw-footer__mark" />
            <span>{FOOTER_COPY.copyright}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
