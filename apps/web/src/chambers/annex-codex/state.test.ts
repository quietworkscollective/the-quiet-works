import { describe, expect, it } from 'vitest';
import { OBJECTS, initialRoomState, reduceRoom } from './state.ts';

const trace = (guide: 'tin-a' | 'tin-b') => ({ type: 'TRACE_COMPLETE' as const, guide });
const traced = (state: ReturnType<typeof initialRoomState>, guide: 'tin-a' | 'tin-b') =>
  reduceRoom(
    reduceRoom(
      reduceRoom(state, { type: 'TRACE_BEGIN', guide }),
      { type: 'TRACE_PROGRESS', guide, progress: 0.5 },
    ),
    trace(guide),
  );

describe('Outline Room visit state', () => {
  it('reaches the same comparison by tracing both specimens', () => {
    const first = traced(traced(initialRoomState(), 'tin-a'), 'tin-b');
    expect(first.comparisonRevealed).toBe(true);
    expect(first.hoodOpen).toBe(true);
    expect(first.tracedTinA && first.tracedTinB).toBe(true);
    expect(first.discoveryPath).toBe('engage');
  });

  it('opens the comparison directly from the visible hood tab', () => {
    const state = reduceRoom(initialRoomState(), { type: 'OPEN_HOOD' });
    expect(state.comparisonRevealed).toBe(true);
    expect(state.hoodOpen).toBe(true);
    expect(state.tracedTinA || state.tracedTinB).toBe(false);
  });

  it('offers the stop path immediately and leaves the follower parked', () => {
    const state = reduceRoom(initialRoomState(), { type: 'LEAVE_UNTRACED' });
    expect(state.discoveryPath).toBe('stop');
    expect(state.followerParked).toBe(true);
    expect(state.hoodOpen).toBe(true);
  });

  it('keeps each specimen line when the selector changes and removes only the selected line on wipe', () => {
    let state = reduceRoom(initialRoomState(), trace('tin-a'));
    state = reduceRoom(state, { type: 'SELECT_GUIDE', guide: 'tin-b' });
    state = reduceRoom(state, trace('tin-b'));
    state = reduceRoom(state, { type: 'SELECT_GUIDE', guide: 'tin-a' });
    state = reduceRoom(state, { type: 'WIPE_SELECTED_LINE' });
    expect(state.lines.tinA).toBe('empty');
    expect(state.lines.tinB).toBe('full');
    expect(state.tracedTinA && state.tracedTinB).toBe(true);
    expect(state.comparisonRevealed).toBe(true);
  });

  it('emits the guide-shoe discovery only after opening the drawer and tracing its guide', () => {
    const closed = reduceRoom(initialRoomState(), { type: 'TRACE_GUIDE_SHOE' });
    expect(closed.discoveryTokens).not.toContain('annex-codex/v1/service-shoe/traced');
    const open = reduceRoom(initialRoomState(), { type: 'OPEN_SERVICE_DRAWER' });
    const traced = reduceRoom(open, { type: 'TRACE_GUIDE_SHOE' });
    expect(traced.discoveryTokens).toContain('annex-codex/v1/service-shoe/traced');
  });

  it('keeps a partial outline when a trace is interrupted before it reveals the comparison', () => {
    let state = reduceRoom(initialRoomState(), { type: 'TRACE_BEGIN', guide: 'tin-a' });
    state = reduceRoom(state, { type: 'TRACE_PROGRESS', guide: 'tin-a', progress: 0.42 });
    state = reduceRoom(state, { type: 'CANCEL_TRACE', guide: 'tin-a' });
    expect(state.lines.tinA).toBe('partial');
    expect(state.lineProgress.tinA).toBe(0.42);
    expect(state.activeTrace).toBeNull();
    expect(state.comparisonRevealed).toBe(false);
    expect(state.discoveryPath).toBeNull();
  });

  it('emits the boat discovery only after the hood, lift and underside inspection', () => {
    const closed = reduceRoom(initialRoomState(), { type: 'INSPECT_BOAT_UNDERSIDE' });
    expect(closed.discoveryTokens).not.toContain('annex-codex/v1/boat/underside-read');
    let state = reduceRoom(initialRoomState(), { type: 'OPEN_HOOD' });
    state = reduceRoom(state, { type: 'LIFT_BOAT' });
    state = reduceRoom(state, { type: 'INSPECT_BOAT_UNDERSIDE' });
    expect(state.discoveryTokens).toContain('annex-codex/v1/boat/underside-read');
  });

  it('keeps all twelve scene objects represented by named DOM actions', () => {
    expect(OBJECTS).toHaveLength(12);
    expect(new Set(OBJECTS.map((object) => object.id)).size).toBe(12);
    for (const object of OBJECTS) {
      expect(object.action.trim(), object.id).not.toBe('');
      expect(object.node.trim(), object.id).not.toBe('');
    }
  });
});
