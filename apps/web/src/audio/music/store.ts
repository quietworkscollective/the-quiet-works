/**
 * The gramophone's shared state: the needle and the record (the machine in `needle.ts`), where the
 * listener stands, and the few things that pass between the 3D prop, the page and the sound desk
 * without any of them importing the others.
 *
 * It is a plain module-level object, not React state, because three separate worlds read it: the
 * prop inside the Canvas (which draws the needle and the platter and reports the camera), the
 * page's own DOM (the verbs, the text reading), and the audio engine inside the sound desk (which
 * plays the record and reports that it ended). None of them owns the others' lifetimes, so the
 * store outlives each of them: a desk disposed and rebuilt (React's development remount, a page
 * that mounts twice) finds the gramophone where it was left.
 *
 * Time here is only the machine's own timers (the lead-in, the run-out groove, the pause between
 * records): one timer at a time, set and cleared with the machine's state, running only while the
 * needle is doing something.
 */
import { createPrng } from '../noise.ts';
import { GAP_MS, step, type Effect, type GramophoneState, type NeedleEvent, type Verb } from './needle.ts';

export interface ListenerPose {
  /** World metres: x to the visitor's right, z along the corridor (the lobby is positive). */
  readonly x: number;
  readonly z: number;
  /** Degrees; 0 looks down the corridor (toward negative z), negative turns left. */
  readonly yawDeg: number;
}

/** Where a visitor stands before any camera has reported: the corridor's starting view. */
export const DEFAULT_LISTENER: ListenerPose = { x: 0.35, z: 6.5, yawDeg: -12 };

/** What the audio engine offers the store: it is told every effect, and the state it joins in. */
export interface AudioSink {
  /** The engine has just joined: bring it in step with `state`, as if the effects up to now had reached it. */
  attach(state: GramophoneState): void;
  effect(effect: Effect, state: GramophoneState): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const BROWSER_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface GramophoneStoreOptions {
  /** How many records are on the shelf. */
  records: number;
  timers?: Timers;
  /** A stream in [0, 1) for the pause between records. */
  random?: () => number;
}

export interface CaptionLine {
  readonly record: number;
}

export interface GramophoneStore {
  getState(): GramophoneState;
  subscribe(listener: () => void): () => void;
  /** Carry a verb out: the machine moves, and the sound follows if there is any. */
  act(verb: Verb): void;
  /** `act`, from a deliberate gesture that may be the very first one: asks the desk to unlock first. */
  press(verb: Verb): void;
  /** The engine's word on the record: it ended, or it could not be played. */
  report(kind: 'ended' | 'failed'): void;
  /** Start the first record, once, when the sound desk first unlocks. */
  autostart(): void;
  /** Join the audio engine to the machine. Returns the way out. */
  bindAudio(sink: AudioSink): () => void;
  /** Sound off: the machine runs on, silently. */
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Told when the Sound setting changes: the page's text reading says whether the sound is on. */
  onMuted(listener: () => void): () => void;
  /** The listener's pose: written by the scene's camera, read by the engine. */
  setListener(pose: ListenerPose): void;
  getListener(): ListenerPose;
  onListener(listener: (pose: ListenerPose) => void): () => void;
  /** A record has begun to sound: for the caption. */
  announce(record: number): void;
  onAnnounce(listener: (line: CaptionLine) => void): () => void;
  /**
   * The desk registers how to unlock itself, so a verb pressed in the DOM can be the first gesture.
   * Returns the way out, which only clears the registration if it is still this one.
   */
  setUnlocker(unlock: () => void): () => void;
  /** Return to the beginning (tests, and a page that starts over). */
  reset(): void;
}

export function createGramophoneStore(options: GramophoneStoreOptions): GramophoneStore {
  const timers = options.timers ?? BROWSER_TIMERS;
  const random = options.random ?? createPrng(0x67a3);
  const initial: GramophoneState = { needle: 'up', record: 0 };

  let state = initial;
  let muted = false;
  let started = false;
  let listener: ListenerPose = DEFAULT_LISTENER;
  let sink: AudioSink | null = null;
  let unlocker: (() => void) | null = null;
  let timer: unknown = null;
  const subscribers = new Set<() => void>();
  const poseListeners = new Set<(pose: ListenerPose) => void>();
  const announcers = new Set<(line: CaptionLine) => void>();
  const muteListeners = new Set<() => void>();

  const clearTimer = (): void => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const gapMs = (): number => GAP_MS.min + random() * (GAP_MS.max - GAP_MS.min);

  function dispatch(event: NeedleEvent): void {
    // The pause is drawn once, when a record's groove ends and the machine will wait.
    const result = step(state, event, options.records, event.type === 'run-out-done' ? gapMs() : 0);
    const changed = result.state.needle !== state.needle || result.state.record !== state.record;
    if (changed) state = result.state;
    for (const effect of result.effects) {
      if (effect.type === 'cancel-timer') clearTimer();
      else if (effect.type === 'after') {
        clearTimer();
        const due = effect.event;
        timer = timers.set(() => {
          timer = null;
          dispatch({ type: due } as NeedleEvent);
        }, effect.afterMs);
      } else sink?.effect(effect, state);
    }
    if (changed) for (const notify of [...subscribers]) notify();
  }

  return {
    getState: () => state,
    subscribe(fn) {
      subscribers.add(fn);
      return () => void subscribers.delete(fn);
    },
    act: (verb) => dispatch({ type: verb }),
    press(verb) {
      unlocker?.();
      dispatch({ type: verb });
    },
    report: (kind) => dispatch({ type: kind }),
    autostart() {
      if (started || muted) return;
      started = true;
      if (state.needle === 'up') dispatch({ type: 'play' });
    },
    bindAudio(next) {
      sink = next;
      next.attach(state);
      return () => {
        if (sink === next) sink = null;
      };
    },
    setMuted(next) {
      if (next === muted) return;
      muted = next;
      for (const notify of [...muteListeners]) notify();
    },
    isMuted: () => muted,
    onMuted(fn) {
      muteListeners.add(fn);
      return () => void muteListeners.delete(fn);
    },
    setListener(pose) {
      listener = pose;
      for (const notify of [...poseListeners]) notify(pose);
    },
    getListener: () => listener,
    onListener(fn) {
      poseListeners.add(fn);
      return () => void poseListeners.delete(fn);
    },
    announce(record) {
      for (const notify of [...announcers]) notify({ record });
    },
    onAnnounce(fn) {
      announcers.add(fn);
      return () => void announcers.delete(fn);
    },
    setUnlocker(fn) {
      unlocker = fn;
      return () => {
        if (unlocker === fn) unlocker = null;
      };
    },
    reset() {
      clearTimer();
      state = initial;
      muted = false;
      started = false;
      listener = DEFAULT_LISTENER;
      sink = null;
      for (const notify of [...subscribers]) notify();
    },
  };
}
