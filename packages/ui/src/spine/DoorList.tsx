import { CORRIDOR_COPY } from '@tqw/engine';
import { publicDoorDescription } from './chamberCopy.ts';
import type { DoorListProps } from './types.ts';

/** The accessible name of a door's DOM equivalent. Fixed: e2e and assistive tech rely on it. */
export function doorLabel(title: string, status: 'open' | 'sealed'): string {
  return `${title}, ${status === 'open' ? CORRIDOR_COPY.doorOpen : CORRIDOR_COPY.doorSealed}`;
}

/**
 * Every chamber door in corridor order as a focusable button. Focusing one asks the corridor to
 * turn to it; activating opens it (sealed doors rattle).
 *
 * Over the 3D corridor (`overlay`) the buttons are invisible until one takes keyboard focus, and
 * then it shows as a plaque near the foot of the screen: the door's title and its status, in text.
 * In text mode (`list`) they are a readable list, each door with its description. Either way the
 * button's text is exactly its accessible name, "<title>, open the door" or "<title>, not yet
 * open": the comma is real text, hidden from the eye in the layouts that set title and status on
 * separate lines.
 */
export function DoorList({ doors, focus, onFocusDoor, onOpenDoor, variant, guidance }: DoorListProps) {
  return (
    <nav aria-label="Doors" className={`tqw-doors tqw-doors--${variant}`}>
      {guidance?.enabled ? (
        <p className="tqw-door-guidance">
          <span>{guidance.content}</span>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path className="tqw-door-guidance__pointer" d="M4 2v14l4-4 2.5 5 2-1-2.5-5 5-.5z" />
            <path className="tqw-door-guidance__touch" d="M7 5.5c0-1.2 2-1.2 2 0v4l1.5-1.3c.6-.5 1.5-.1 1.5.6v1l1.6-.4c.7-.2 1.3.4 1.2 1.2l-.4 3.1a4 4 0 0 1-4 3.5h-.7a4 4 0 0 1-3.3-1.7L4.8 13c-.5-.8.5-1.7 1.3-1.2L7 12.4z" />
          </svg>
        </p>
      ) : null}
      <ul>
        {doors.map((door) => (
          <li key={door.id} className="tqw-doors__item" data-status={door.status}>
            <button
              type="button"
              className="tqw-door"
              data-door={door.id}
              data-status={door.status}
              aria-label={doorLabel(door.title, door.status)}
              aria-current={focus === door.id ? 'true' : undefined}
              onFocus={() => onFocusDoor(door.id)}
              onClick={() => onOpenDoor(door.id)}
            >
              <span className="tqw-door__title">{door.title}</span>
              <span className="tqw-door__sep">, </span>
              <span className="tqw-door__status">
                {door.status === 'open' ? CORRIDOR_COPY.doorOpen : CORRIDOR_COPY.doorSealed}
              </span>
            </button>
            {variant === 'list' ? <p className="tqw-door__description">{publicDoorDescription(door, !import.meta.env.DEV)}</p> : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
