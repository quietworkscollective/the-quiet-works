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
export function DoorList({ doors, focus, onFocusDoor, onOpenDoor, variant }: DoorListProps) {
  return (
    <nav aria-label="Doors" className={`tqw-doors tqw-doors--${variant}`}>
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
