import { chamberById, type ChamberId } from './chambers.ts';

/**
 * The spine: where the visitor is in UNHELD. The landing scroll (entrance), the corridor, the
 * threshold of a door, inside a chamber, plus two overlays that can sit over any of those: the
 * notice board and a site page. Deterministic like the certification machine:
 * `spineTransition(state, event) → { state, cues }`. Continuous values (scroll progress, camera
 * position) live in the scene, never here.
 *
 * The URL is a projection of this state (`routeOf`); arriving by URL or by the browser's back
 * and forward buttons is a ROUTE event.
 */

export type PageId = 'about' | 'credits' | 'privacy' | 'not-found';

export type Route =
  | { kind: 'home' }
  | { kind: 'chamber'; id: ChamberId }
  | { kind: 'page'; page: PageId };

/**
 * - `entrance`: the branded landing; scrolling walks the visitor in.
 * - `corridor`: free first-person walking among the doors.
 * - `threshold`: a door is opening and the chamber is loading behind it.
 * - `chamber`: inside a chamber.
 */
export type SpinePhase = 'entrance' | 'corridor' | 'threshold' | 'chamber';

/** How the visitor reached a chamber: walking up to its door, the notice board, or a URL. */
export type ThresholdVia = 'door' | 'board' | 'link';

export interface SpineState {
  phase: SpinePhase;
  /** The door being looked at or holding keyboard focus. Kept on leaving, so the visitor stands at it. */
  focus: ChamberId | null;
  /** The chamber being entered (threshold) or occupied (chamber); null otherwise. */
  chamber: ChamberId | null;
  via: ThresholdVia | null;
  /** A site page shown over everything else. */
  page: PageId | null;
  boardOpen: boolean;
}

export type SpineEvent =
  /** The landing scroll reached its end, or the visitor skipped it. */
  | { type: 'ENTRANCE_DONE' }
  /**
   * The visitor scrolled the page back up out of the game window into the smoke and hero
   * (ADR 0003). The door they faced stays their focus for when they return.
   */
  | { type: 'RETURN_TO_ENTRANCE' }
  | { type: 'FOCUS_DOOR'; id: ChamberId }
  | { type: 'BLUR_DOOR' }
  | { type: 'OPEN_DOOR'; id: ChamberId; via: 'door' | 'board' }
  /** The chamber has drawn its first frame (or mounted its text mode) and the door transition ended. */
  | { type: 'THRESHOLD_DONE' }
  | { type: 'LEAVE_CHAMBER' }
  | { type: 'OPEN_BOARD' }
  | { type: 'CLOSE_BOARD' }
  | { type: 'OPEN_PAGE'; page: PageId }
  | { type: 'CLOSE_PAGE' }
  /** The URL changed underneath the app: back/forward navigation. */
  | { type: 'ROUTE'; route: Route };

export type SpineCue =
  | { type: 'door-focus'; id: ChamberId }
  | { type: 'door-open'; id: ChamberId; via: ThresholdVia }
  /** A sealed door was tried: it rattles and stays shut. */
  | { type: 'door-sealed'; id: ChamberId }
  | { type: 'chamber-enter'; id: ChamberId }
  | { type: 'chamber-leave'; id: ChamberId }
  | { type: 'board-open' }
  | { type: 'board-close' };

export interface SpineResult {
  state: SpineState;
  cues: SpineCue[];
}

const BASE: SpineState = {
  phase: 'entrance',
  focus: null,
  chamber: null,
  via: null,
  page: null,
  boardOpen: false,
};

/**
 * The state for a fresh page load at `route`. The landing plays only for the home URL; a deep
 * link to a chamber goes straight through its threshold, and a deep link to a sealed chamber
 * stands the visitor in the corridor in front of its door.
 */
export function spineInitial(route: Route): SpineState {
  switch (route.kind) {
    case 'home':
      return BASE;
    case 'page':
      return { ...BASE, page: route.page };
    case 'chamber':
      return chamberById(route.id).status === 'open'
        ? { ...BASE, phase: 'threshold', chamber: route.id, focus: route.id, via: 'link' }
        : { ...BASE, phase: 'corridor', focus: route.id };
  }
}

/** The URL route that represents `state`. */
export function routeOf(state: SpineState): Route {
  if (state.page) return { kind: 'page', page: state.page };
  if ((state.phase === 'threshold' || state.phase === 'chamber') && state.chamber) {
    return { kind: 'chamber', id: state.chamber };
  }
  return { kind: 'home' };
}

export function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'chamber' && b.kind === 'chamber') return a.id === b.id;
  if (a.kind === 'page' && b.kind === 'page') return a.page === b.page;
  return true;
}

const unchanged = (state: SpineState): SpineResult => ({ state, cues: [] });

/** Opening a door from anywhere: the shared path for doors, the board and URLs. */
function openDoor(state: SpineState, id: ChamberId, via: ThresholdVia): SpineResult {
  if (state.phase === 'threshold') return unchanged(state);
  const cues: SpineCue[] = [];

  if (chamberById(id).status === 'sealed') {
    // Trying the handle means standing at the door; a clipping on the board moves nobody.
    const focus = via === 'door' ? id : state.focus;
    return { state: focus === state.focus ? state : { ...state, focus }, cues: [{ type: 'door-sealed', id }] };
  }

  if (state.phase === 'chamber' && state.chamber === id) {
    if (!state.boardOpen && !state.page) return unchanged(state);
    if (state.boardOpen) cues.push({ type: 'board-close' });
    return { state: { ...state, boardOpen: false, page: null }, cues };
  }

  if (state.boardOpen) cues.push({ type: 'board-close' });
  if (state.phase === 'chamber' && state.chamber) cues.push({ type: 'chamber-leave', id: state.chamber });
  cues.push({ type: 'door-open', id, via });
  return {
    state: { ...state, phase: 'threshold', chamber: id, focus: id, via, boardOpen: false, page: null },
    cues,
  };
}

function leaveChamber(state: SpineState): SpineResult {
  if (state.phase !== 'chamber' && state.phase !== 'threshold') return unchanged(state);
  const cues: SpineCue[] =
    state.phase === 'chamber' && state.chamber ? [{ type: 'chamber-leave', id: state.chamber }] : [];
  return {
    state: { ...state, phase: 'corridor', focus: state.chamber ?? state.focus, chamber: null, via: null },
    cues,
  };
}

export function spineTransition(state: SpineState, event: SpineEvent): SpineResult {
  switch (event.type) {
    case 'ENTRANCE_DONE':
      return state.phase === 'entrance' ? { state: { ...state, phase: 'corridor' }, cues: [] } : unchanged(state);

    case 'RETURN_TO_ENTRANCE':
      return state.phase === 'corridor' ? { state: { ...state, phase: 'entrance' }, cues: [] } : unchanged(state);

    case 'FOCUS_DOOR':
      if (state.phase !== 'corridor' || state.focus === event.id) return unchanged(state);
      return { state: { ...state, focus: event.id }, cues: [{ type: 'door-focus', id: event.id }] };

    case 'BLUR_DOOR':
      if (state.phase !== 'corridor' || state.focus === null) return unchanged(state);
      return { state: { ...state, focus: null }, cues: [] };

    case 'OPEN_DOOR':
      // Doors are only within reach in the corridor; the board reaches every chamber from anywhere.
      if (event.via === 'door' && state.phase !== 'corridor') return unchanged(state);
      return openDoor(state, event.id, event.via);

    case 'THRESHOLD_DONE':
      if (state.phase !== 'threshold' || !state.chamber) return unchanged(state);
      return { state: { ...state, phase: 'chamber' }, cues: [{ type: 'chamber-enter', id: state.chamber }] };

    case 'LEAVE_CHAMBER':
      return leaveChamber(state);

    case 'OPEN_BOARD':
      if (state.boardOpen || state.phase === 'threshold') return unchanged(state);
      return { state: { ...state, boardOpen: true }, cues: [{ type: 'board-open' }] };

    case 'CLOSE_BOARD':
      if (!state.boardOpen) return unchanged(state);
      return { state: { ...state, boardOpen: false }, cues: [{ type: 'board-close' }] };

    case 'OPEN_PAGE':
      if (state.page === event.page) return unchanged(state);
      return { state: { ...state, page: event.page, boardOpen: false }, cues: [] };

    case 'CLOSE_PAGE':
      return state.page ? { state: { ...state, page: null }, cues: [] } : unchanged(state);

    case 'ROUTE': {
      const { route } = event;
      if (route.kind === 'page') return spineTransition(state, { type: 'OPEN_PAGE', page: route.page });
      const base = state.page ? { ...state, page: null } : state;
      if (route.kind === 'home') {
        const left = leaveChamber(base);
        return left.state === base && base !== state ? { state: base, cues: [] } : left;
      }
      const opened = openDoor(base, route.id, 'link');
      return opened.state === base && base !== state ? { state: base, cues: opened.cues } : opened;
    }
  }
}
