import { useId } from 'react';
import { BOARD, MENU_COPY, PAGE_NAV, type PageId } from '@tqw/engine';
import { SettingsBar } from '../SettingsBar.tsx';
import type { MenuPanelProps } from './types.ts';
import { useModalDialog } from './useModalDialog.ts';

const PAGE_LINKS: readonly (readonly [PageId, string])[] = [
  ['about', '/about'],
  ['credits', '/credits'],
  ['privacy', '/privacy'],
];

/**
 * The menu as a modal dialog: the places the page can go, and Settings (sound, captions, reduced
 * motion, text mode), which no longer sit on every screen. A dialog, so Escape closes it before it
 * does anything else, including releasing the game window.
 */
export function MenuPanel({ open, settings, onToggle, canLeaveTextMode, onOpenBoard, onOpenPage, onClose }: MenuPanelProps) {
  const ref = useModalDialog(open, onClose);
  const titleId = useId();
  const settingsId = useId();
  return (
    <dialog ref={ref} className="tqw-menu-panel" aria-labelledby={titleId}>
      <div className="tqw-menu-panel__sheet">
        <header className="tqw-menu-panel__head">
          <h2 id={titleId} className="tqw-menu-panel__title">
            {MENU_COPY.menu}
          </h2>
          <button type="button" className="tqw-menu-panel__close" onClick={onClose}>
            {MENU_COPY.close}
          </button>
        </header>
        <nav aria-label="Pages" className="tqw-menu-panel__nav">
          <button type="button" className="tqw-menu-panel__link" onClick={onOpenBoard}>
            {BOARD.title}
          </button>
          {PAGE_LINKS.map(([id, href]) => (
            <a
              key={id}
              className="tqw-menu-panel__link"
              href={href}
              onClick={(event) => {
                event.preventDefault();
                onOpenPage(id);
              }}
            >
              {PAGE_NAV[id as Exclude<PageId, 'not-found'>]}
            </a>
          ))}
        </nav>
        <section aria-labelledby={settingsId} className="tqw-menu-panel__settings">
          <h3 id={settingsId} className="tqw-menu-panel__heading">
            {MENU_COPY.settings}
          </h3>
          <SettingsBar settings={settings} onToggle={onToggle} canLeaveTextMode={canLeaveTextMode} />
        </section>
      </div>
    </dialog>
  );
}
