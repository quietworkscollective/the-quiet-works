import type { ChamberId } from '@tqw/engine';
import type { Vec2 } from '../../firstPerson/bounds.ts';

/**
 * Where a click or tap in the scene goes (ADR 0003). Engaged, it does what it always did: a door
 * glides or opens, the board opens a chamber, the floor walks. At rest it only asks to engage,
 * and is consumed doing so: the click that engages must never also glide, open a door or press
 * anything, or the first touch on a phone would walk the visitor into a room.
 *
 * Every deliberate click is also a gesture, so the core can unlock audio; the core decides whether
 * the request engages.
 */
export interface ClickRouterOptions {
  engaged(): boolean;
  onGesture(): void;
  onEngageRequest(): void;
  clickDoor(id: ChamberId): void;
  clickClipping(id: ChamberId): void;
  clickFloor(point: Vec2): void;
}

export interface ClickRouter {
  door(id: ChamberId): void;
  clipping(id: ChamberId): void;
  floor(point: Vec2): void;
  /** A click on nothing in particular (not a door, the board or a floor point): only ever an engage request. */
  background(): void;
}

export function createClickRouter(options: ClickRouterOptions): ClickRouter {
  const resting = (): boolean => {
    options.onGesture();
    if (options.engaged()) return false;
    options.onEngageRequest();
    return true;
  };
  return {
    door(id) {
      if (!resting()) options.clickDoor(id);
    },
    clipping(id) {
      if (!resting()) options.clickClipping(id);
    },
    floor(point) {
      if (!resting()) options.clickFloor(point);
    },
    background() {
      resting();
    },
  };
}
