import { describe, expect, it } from 'vitest';
import {
  GAP_MS,
  LEAD_IN_MS,
  needleDown,
  needleVerb,
  platterTurns,
  RUN_OUT_MS,
  step,
  SWAP_MS,
  type Effect,
  type GramophoneState,
  type NeedleEvent,
  type NeedleState,
} from './needle.ts';

/** Three records on the shelf, and a gap drawn from the middle of the allowed range. */
const RECORDS = 3;
const GAP = 11_000;

const at = (needle: NeedleState, record = 0): GramophoneState => ({ needle, record });
const go = (state: GramophoneState, type: NeedleEvent['type']) => step(state, { type } as NeedleEvent, RECORDS, GAP);
const types = (effects: readonly Effect[]): string[] => effects.map((e) => e.type);
const after = (effects: readonly Effect[]): { event: string; afterMs: number } | undefined => {
  const e = effects.find((x) => x.type === 'after');
  return e?.type === 'after' ? { event: e.event, afterMs: e.afterMs } : undefined;
};

describe('the needle and the record', () => {
  it('starts at rest: needle up, nothing playing', () => {
    expect(needleDown('up')).toBe(false);
    expect(platterTurns('up')).toBe(false);
    expect(needleVerb('up')).toBe('play');
  });

  it('Play drops the needle on the record on the platter: a drop, then music after the lead-in', () => {
    const dropped = go(at('up', 1), 'play');
    expect(dropped.state).toEqual({ needle: 'lead-in', record: 1 });
    expect(types(dropped.effects)).toEqual(['cancel-timer', 'drop', 'after']);
    expect(dropped.effects).toContainEqual({ type: 'drop', record: 1 });
    expect(after(dropped.effects)).toEqual({ event: 'lead-in-done', afterMs: LEAD_IN_MS });

    const playing = go(dropped.state, 'lead-in-done');
    expect(playing.state).toEqual({ needle: 'playing', record: 1 });
    expect(playing.effects).toEqual([{ type: 'start-music', record: 1 }]);
  });

  it('Play while the needle is already down does nothing', () => {
    for (const needle of ['lead-in', 'playing', 'run-out'] as const) {
      const result = go(at(needle), 'play');
      expect(result.state).toEqual(at(needle));
      expect(result.effects).toEqual([]);
    }
  });

  it('Lift the needle stops the music with a lift, from every state in which the needle is down', () => {
    for (const needle of ['lead-in', 'playing', 'run-out'] as const) {
      const result = go(at(needle, 2), 'lift');
      expect(result.state).toEqual({ needle: 'up', record: 2 });
      expect(result.effects).toContainEqual({ type: 'lift', byHand: true });
      expect(result.effects).toContainEqual({ type: 'cancel-timer' });
    }
  });

  it('Lift during the pause between records, or at rest, makes no lift sound and nothing starts by itself afterwards', () => {
    const gap = go(at('gap', 1), 'lift');
    expect(gap.state).toEqual({ needle: 'up', record: 1 });
    expect(types(gap.effects)).toEqual(['cancel-timer']);
    expect(go(at('up'), 'lift')).toEqual({ state: at('up'), effects: [] });
    // The gap's timer is cancelled, so the late 'gap-done' finds the needle up and starts nothing.
    expect(go(gap.state, 'gap-done').effects).toEqual([]);
  });

  it('a record that ends runs into the groove, then the needle lifts by itself and the next record waits 8 to 15 s', () => {
    const ended = go(at('playing', 0), 'ended');
    expect(ended.state).toEqual({ needle: 'run-out', record: 0 });
    expect(types(ended.effects)).toEqual(['run-out', 'after']);
    expect(after(ended.effects)).toEqual({ event: 'run-out-done', afterMs: RUN_OUT_MS });
    // A few seconds of groove, not a pause that reads as a fault.
    expect(RUN_OUT_MS).toBeGreaterThanOrEqual(3000);
    expect(RUN_OUT_MS).toBeLessThanOrEqual(6000);

    const lifted = go(ended.state, 'run-out-done');
    expect(lifted.state).toEqual({ needle: 'gap', record: 1 });
    expect(lifted.effects).toContainEqual({ type: 'lift', byHand: false });
    expect(after(lifted.effects)).toEqual({ event: 'gap-done', afterMs: GAP });

    const next = go(lifted.state, 'gap-done');
    expect(next.state).toEqual({ needle: 'lead-in', record: 1 });
    expect(next.effects).toContainEqual({ type: 'drop', record: 1 });
  });

  it('draws the pause between records from 8 to 15 s', () => {
    expect(GAP_MS).toEqual({ min: 8000, max: 15000 });
  });

  it('cycles the shelf after the last record: no endless playlist, one record at a time', () => {
    let state = at('playing', RECORDS - 1);
    state = go(state, 'ended').state;
    state = go(state, 'run-out-done').state;
    expect(state).toEqual({ needle: 'gap', record: 0 });
  });

  it('only a record that is playing can end', () => {
    for (const needle of ['up', 'lead-in', 'run-out', 'gap', 'swap'] as const) {
      expect(go(at(needle), 'ended')).toEqual({ state: at(needle), effects: [] });
    }
  });

  it('Change the record at rest puts the next one on and leaves the needle up, in silence', () => {
    const changed = go(at('up', 0), 'change');
    expect(changed.state).toEqual({ needle: 'up', record: 1 });
    expect(changed.effects).toEqual([{ type: 'swap', record: 1 }]);
  });

  it('Change the record while playing lifts the needle, swaps, then drops it on the new record', () => {
    const swapping = go(at('playing', 0), 'change');
    expect(swapping.state).toEqual({ needle: 'swap', record: 1 });
    expect(types(swapping.effects)).toEqual(['cancel-timer', 'lift', 'swap', 'after']);
    expect(after(swapping.effects)).toEqual({ event: 'swap-done', afterMs: SWAP_MS });

    const dropped = go(swapping.state, 'swap-done');
    expect(dropped.state).toEqual({ needle: 'lead-in', record: 1 });
    expect(dropped.effects).toContainEqual({ type: 'drop', record: 1 });
  });

  it('Change the record in the pause between records makes no lift sound, and a second change moves on again', () => {
    const swapping = go(at('gap', 1), 'change');
    expect(swapping.effects.map((e) => e.type)).not.toContain('lift');
    expect(swapping.state).toEqual({ needle: 'swap', record: 2 });
    expect(go(swapping.state, 'change').state).toEqual({ needle: 'swap', record: 0 });
  });

  it('a swap that the visitor stops with Lift ends at rest; the late swap-done starts nothing', () => {
    const swapping = go(at('playing', 0), 'change');
    const stopped = go(swapping.state, 'lift');
    expect(stopped.state).toEqual({ needle: 'up', record: 1 });
    expect(go(stopped.state, 'swap-done').effects).toEqual([]);
  });

  it('a record that cannot be played sends the needle back to rest', () => {
    const failed = go(at('lead-in', 2), 'failed');
    expect(failed.state).toEqual({ needle: 'up', record: 2 });
    expect(failed.effects).toContainEqual({ type: 'lift', byHand: false });
    expect(go(at('up'), 'failed')).toEqual({ state: at('up'), effects: [] });
  });

  it('a late timer for a state the machine has left does nothing', () => {
    expect(go(at('up'), 'lead-in-done').effects).toEqual([]);
    expect(go(at('playing'), 'run-out-done').effects).toEqual([]);
    expect(go(at('playing'), 'gap-done').effects).toEqual([]);
    expect(go(at('up'), 'swap-done').effects).toEqual([]);
  });

  it('offers Lift while the needle is down, and Play otherwise; the platter turns only while it is down', () => {
    const verbs = (['up', 'lead-in', 'playing', 'run-out', 'gap', 'swap'] as const).map((n) => [n, needleVerb(n), platterTurns(n)]);
    expect(verbs).toEqual([
      ['up', 'play', false],
      ['lead-in', 'lift', true],
      ['playing', 'lift', true],
      ['run-out', 'lift', true],
      ['gap', 'play', false],
      ['swap', 'play', false],
    ]);
  });

  it('with an empty shelf, nothing happens', () => {
    for (const type of ['play', 'change'] as const) expect(step(at('up'), { type }, 0, GAP)).toEqual({ state: at('up'), effects: [] });
  });
});
