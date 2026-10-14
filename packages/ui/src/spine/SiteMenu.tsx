import { BOARD, MENU_COPY, PAGE_NAV } from '@tqw/engine';
import { ToggleIcon } from '../ToggleIcon.tsx';
import type { SiteMenuProps } from './types.ts';

/**
 * Notice board, About and Menu, small, at the top right of the hero and again above the footer.
 * On a phone only Menu shows (it holds the rest). Once audio is on, mute is a control of its own
 * beside them, never buried in the menu.
 */
export function SiteMenu({ variant, onOpenBoard, onOpenPage, onOpenMenu, sound }: SiteMenuProps) {
  return (
    <nav className={`tqw-menu tqw-menu--${variant}`} aria-label={variant === 'hero' ? 'Top links' : 'Footer menu'}>
      {sound ? (
        <button
          type="button"
          className="tqw-menu__sound"
          // Pressed means sound is on, as in Settings. The tooltip equals the name.
          aria-pressed={!sound.muted}
          title={MENU_COPY.sound}
          onClick={sound.onToggle}
        >
          <ToggleIcon kind="muted" pressed={!sound.muted} />
          <span className="tqw-visually-hidden">{MENU_COPY.sound}</span>
        </button>
      ) : null}
      <button type="button" className="tqw-menu__item tqw-menu__item--board" onClick={onOpenBoard}>
        {BOARD.title}
      </button>
      <a
        className="tqw-menu__item tqw-menu__item--about"
        href="/about"
        onClick={(event) => {
          event.preventDefault();
          onOpenPage('about');
        }}
      >
        {PAGE_NAV.about}
      </a>
      <button type="button" className="tqw-menu__item tqw-menu__item--menu" aria-haspopup="dialog" onClick={onOpenMenu}>
        {MENU_COPY.menu}
      </button>
    </nav>
  );
}
