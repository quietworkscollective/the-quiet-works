import { describe, expect, it } from 'vitest';
import { CHAMBERS, chamberBySlug, type ChamberId } from './chambers.ts';
import {
  routeOf,
  sameRoute,
  spineInitial,
  spineTransition,
  type SpineCue,
  type SpineEvent,
  type SpineState,
} from './spine.ts';
import { createSpineStore } from './spineStore.ts';

const OPEN: ChamberId = 'certification-office';
const SEALED: ChamberId = 'tomorrow-engine';

function run(events: readonly SpineEvent[], from: SpineState = spineInitial({ kind: 'home' })) {
  let state = from;
  const cues: SpineCue[] = [];
  for (const event of events) {
    const result = spineTransition(state, event);
    state = result.state;
    cues.push(...result.cues);
  }
  return { state, cues };
}

const inCorridor = () => run([{ type: 'ENTRANCE_DONE' }]).state;
const inOffice = () =>
  run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }, { type: 'THRESHOLD_DONE' }], inCorridor()).state;

describe('chamber registry', () => {
  it('has unique ids and slugs, and exactly one open chamber in this build', () => {
    expect(new Set(CHAMBERS.map((c) => c.id)).size).toBe(CHAMBERS.length);
    expect(new Set(CHAMBERS.map((c) => c.slug)).size).toBe(CHAMBERS.length);
    expect(CHAMBERS.filter((c) => c.status === 'open').map((c) => c.id)).toEqual([OPEN]);
    expect(chamberBySlug('certification-office')?.id).toBe(OPEN);
    expect(chamberBySlug('nowhere')).toBeUndefined();
  });
});

describe('arrival', () => {
  it('the home URL starts at the landing entrance', () => {
    expect(spineInitial({ kind: 'home' }).phase).toBe('entrance');
  });

  it('a deep link to an open chamber goes straight through its threshold', () => {
    const state = spineInitial({ kind: 'chamber', id: OPEN });
    expect(state).toMatchObject({ phase: 'threshold', chamber: OPEN, via: 'link' });
    expect(run([{ type: 'THRESHOLD_DONE' }], state).state.phase).toBe('chamber');
  });

  it('a deep link to a sealed chamber stands the visitor at its door in the corridor', () => {
    expect(spineInitial({ kind: 'chamber', id: SEALED })).toMatchObject({
      phase: 'corridor',
      focus: SEALED,
      chamber: null,
    });
  });

  it('a page URL shows the page over the entrance', () => {
    expect(spineInitial({ kind: 'page', page: 'about' })).toMatchObject({ phase: 'entrance', page: 'about' });
  });
});

describe('entrance and corridor', () => {
  it('finishing the landing scroll enters the corridor once', () => {
    const { state } = run([{ type: 'ENTRANCE_DONE' }, { type: 'ENTRANCE_DONE' }]);
    expect(state.phase).toBe('corridor');
  });

  it('doors cannot be opened by walking before the entrance is done', () => {
    const { state, cues } = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }]);
    expect(state.phase).toBe('entrance');
    expect(cues).toEqual([]);
  });

  it('looking at a door focuses it once; looking away clears it', () => {
    const { state, cues } = run(
      [
        { type: 'FOCUS_DOOR', id: OPEN },
        { type: 'FOCUS_DOOR', id: OPEN },
      ],
      inCorridor(),
    );
    expect(state.focus).toBe(OPEN);
    expect(cues).toEqual([{ type: 'door-focus', id: OPEN }]);
    expect(run([{ type: 'BLUR_DOOR' }], state).state.focus).toBeNull();
  });
});

describe('doors', () => {
  it('opening the open door crosses the threshold, then enters when the chamber is ready', () => {
    const opened = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }], inCorridor());
    expect(opened.state).toMatchObject({ phase: 'threshold', chamber: OPEN, via: 'door' });
    expect(opened.cues).toEqual([{ type: 'door-open', id: OPEN, via: 'door' }]);

    const entered = run([{ type: 'THRESHOLD_DONE' }], opened.state);
    expect(entered.state.phase).toBe('chamber');
    expect(entered.cues).toEqual([{ type: 'chamber-enter', id: OPEN }]);
  });

  it('a sealed door rattles and stays shut, with the visitor still facing it', () => {
    const { state, cues } = run([{ type: 'OPEN_DOOR', id: SEALED, via: 'door' }], inCorridor());
    expect(state).toMatchObject({ phase: 'corridor', focus: SEALED, chamber: null });
    expect(cues).toEqual([{ type: 'door-sealed', id: SEALED }]);
  });

  it('a second open during the threshold is ignored', () => {
    const opened = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }], inCorridor()).state;
    const again = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'board' }], opened);
    expect(again.state).toBe(opened);
    expect(again.cues).toEqual([]);
  });

  it('leaving a chamber returns to the corridor facing its door', () => {
    const { state, cues } = run([{ type: 'LEAVE_CHAMBER' }], inOffice());
    expect(state).toMatchObject({ phase: 'corridor', focus: OPEN, chamber: null, via: null });
    expect(cues).toEqual([{ type: 'chamber-leave', id: OPEN }]);
  });

  it('leaving during the threshold aborts it without a leave cue', () => {
    const opened = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }], inCorridor()).state;
    const { state, cues } = run([{ type: 'LEAVE_CHAMBER' }], opened);
    expect(state.phase).toBe('corridor');
    expect(cues).toEqual([]);
  });
});

describe('notice board', () => {
  it('opens a chamber directly from the landing, without walking', () => {
    const { state, cues } = run([
      { type: 'OPEN_BOARD' },
      { type: 'OPEN_DOOR', id: OPEN, via: 'board' },
    ]);
    expect(state).toMatchObject({ phase: 'threshold', chamber: OPEN, via: 'board', boardOpen: false });
    expect(cues).toEqual([{ type: 'board-open' }, { type: 'board-close' }, { type: 'door-open', id: OPEN, via: 'board' }]);
  });

  it('a sealed clipping leaves the board open and the visitor where they were', () => {
    const board = run([{ type: 'OPEN_BOARD' }], inCorridor()).state;
    const { state, cues } = run([{ type: 'OPEN_DOOR', id: SEALED, via: 'board' }], board);
    expect(state).toBe(board);
    expect(cues).toEqual([{ type: 'door-sealed', id: SEALED }]);
  });

  it('choosing the chamber already occupied just closes the board', () => {
    const board = run([{ type: 'OPEN_BOARD' }], inOffice()).state;
    const { state, cues } = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'board' }], board);
    expect(state).toMatchObject({ phase: 'chamber', chamber: OPEN, boardOpen: false });
    expect(cues).toEqual([{ type: 'board-close' }]);
  });

  it('cannot be opened mid-threshold', () => {
    const opened = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }], inCorridor()).state;
    expect(run([{ type: 'OPEN_BOARD' }], opened).state.boardOpen).toBe(false);
  });
});

describe('routes', () => {
  it('projects state to a URL route', () => {
    expect(routeOf(spineInitial({ kind: 'home' }))).toEqual({ kind: 'home' });
    expect(routeOf(inCorridor())).toEqual({ kind: 'home' });
    expect(routeOf(inOffice())).toEqual({ kind: 'chamber', id: OPEN });
    expect(routeOf(run([{ type: 'OPEN_PAGE', page: 'privacy' }], inOffice()).state)).toEqual({
      kind: 'page',
      page: 'privacy',
    });
  });

  it('back from a chamber to the home URL lands in the corridor, not the entrance', () => {
    const { state, cues } = run([{ type: 'ROUTE', route: { kind: 'home' } }], inOffice());
    expect(state.phase).toBe('corridor');
    expect(cues).toEqual([{ type: 'chamber-leave', id: OPEN }]);
  });

  it('forward to a chamber URL opens it as a link', () => {
    const { state } = run([{ type: 'ROUTE', route: { kind: 'chamber', id: OPEN } }], inCorridor());
    expect(state).toMatchObject({ phase: 'threshold', chamber: OPEN, via: 'link' });
  });

  it('back from a page closes the page and keeps the phase underneath', () => {
    const office = inOffice();
    const paged = run([{ type: 'OPEN_PAGE', page: 'about' }], office).state;
    const back = run([{ type: 'ROUTE', route: { kind: 'chamber', id: OPEN } }], paged);
    expect(back.state).toMatchObject({ phase: 'chamber', chamber: OPEN, page: null });
    expect(back.cues).toEqual([]);
    const home = run([{ type: 'ROUTE', route: { kind: 'home' } }], run([{ type: 'OPEN_PAGE', page: 'about' }], inCorridor()).state);
    expect(home.state).toMatchObject({ phase: 'corridor', page: null });
  });

  it('a route matching the current state changes nothing', () => {
    const office = inOffice();
    expect(run([{ type: 'ROUTE', route: { kind: 'chamber', id: OPEN } }], office).state).toBe(office);
    const corridor = inCorridor();
    expect(run([{ type: 'ROUTE', route: { kind: 'home' } }], corridor).state).toBe(corridor);
  });

  it('compares routes by value', () => {
    expect(sameRoute({ kind: 'chamber', id: OPEN }, { kind: 'chamber', id: OPEN })).toBe(true);
    expect(sameRoute({ kind: 'chamber', id: OPEN }, { kind: 'chamber', id: SEALED })).toBe(false);
    expect(sameRoute({ kind: 'page', page: 'about' }, { kind: 'home' })).toBe(false);
  });
});

describe('spine store', () => {
  it('notifies state listeners on change only, and reports every dispatch', () => {
    const store = createSpineStore(spineInitial({ kind: 'home' }));
    let changes = 0;
    const seen: string[] = [];
    const cues: SpineCue[] = [];
    store.subscribe(() => (changes += 1));
    store.onDispatch((event, state) => seen.push(`${event.type}:${state.phase}`));
    store.onCue((cue) => cues.push(cue));
    store.dispatch({ type: 'ENTRANCE_DONE' });
    store.dispatch({ type: 'ENTRANCE_DONE' });
    store.dispatch({ type: 'FOCUS_DOOR', id: OPEN });
    expect(changes).toBe(2);
    expect(seen).toEqual(['ENTRANCE_DONE:corridor', 'ENTRANCE_DONE:corridor', 'FOCUS_DOOR:corridor']);
    expect(cues).toEqual([{ type: 'door-focus', id: OPEN }]);
  });
});

describe('the page scroll (ADR 0003)', () => {
  it('scrolling back up from the corridor returns to the entrance, keeping the door in focus', () => {
    const corridor = run([{ type: 'FOCUS_DOOR', id: OPEN }], inCorridor()).state;
    const { state, cues } = run([{ type: 'RETURN_TO_ENTRANCE' }], corridor);
    expect(state).toMatchObject({ phase: 'entrance', focus: OPEN });
    expect(cues).toEqual([]);
    expect(run([{ type: 'ENTRANCE_DONE' }], state).state).toMatchObject({ phase: 'corridor', focus: OPEN });
  });

  it('only the corridor can scroll back to the entrance; a chamber or threshold stays put', () => {
    const office = inOffice();
    expect(run([{ type: 'RETURN_TO_ENTRANCE' }], office).state).toBe(office);
    const opened = run([{ type: 'OPEN_DOOR', id: OPEN, via: 'door' }], inCorridor()).state;
    expect(run([{ type: 'RETURN_TO_ENTRANCE' }], opened).state).toBe(opened);
  });
});
