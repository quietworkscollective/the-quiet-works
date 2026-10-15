import { CHAMBERS, createSpineStore, spineInitial, type ChamberId, type Route, type SpineStore } from '@tqw/engine';
import { createCorridorAnimation } from '../animation.ts';
import { createPropAnimation, type PropAnimation, type PropId } from '../props.ts';
import { createProgress } from '../progress.ts';
import { createBoardMotion, type BoardMotion } from './boardMotion.ts';
import { createDirector, type Director } from './director.ts';
import type { Lens } from './framing.ts';

/** A director against the real spine machine and a fake clock, for the director's tests. */
export const FRAME = 1000 / 60;
export const OFFICE: ChamberId = 'certification-office';
const IDS = CHAMBERS.map((c) => c.id);

export interface Rig {
  d: Director;
  spine: SpineStore;
  progress: ReturnType<typeof createProgress>;
  animation: ReturnType<typeof createCorridorAnimation>;
  props: PropAnimation;
  boardMotion: BoardMotion;
  log: { seams: number[]; walk: number[]; intents: ChamberId[]; cuts: number; frames: number; acts: PropId[]; arrivals: number };
  now(): number;
  /** Steps for `ms`; returns the frames in which the director said it needed another. */
  run(ms: number, each?: () => void): void;
  /** Steps until the director is idle (or gives up). */
  settle(limitMs?: number): number;
}

export function rig(
  options: {
    route?: Route;
    reduced?: boolean;
    portrait?: boolean;
    enter?: boolean;
    progress?: number;
    before?: (spine: SpineStore) => void;
    /** The screen's lens, asked for every frame as a real screen is; by default the typical one for the shape. */
    lens?: () => Lens;
  } = {},
): Rig {
  const spine = createSpineStore(spineInitial(options.route ?? { kind: 'home' }));
  if (options.enter) spine.dispatch({ type: 'ENTRANCE_DONE' });
  options.before?.(spine);
  const progress = createProgress(options.progress ?? 0);
  const animation = createCorridorAnimation(IDS);
  const props = createPropAnimation();
  const boardMotion = createBoardMotion();
  let clock = 0;
  const log: Rig['log'] = { seams: [], walk: [], intents: [], cuts: 0, frames: 0, acts: [], arrivals: 0 };
  const d = createDirector({
    spine,
    progress,
    animation,
    reducedMotion: options.reduced ?? false,
    portrait: () => options.portrait ?? false,
    ...(options.lens ? { lens: options.lens } : {}),
    onSeam: () => log.seams.push(clock),
    onWalk: (mps) => log.walk.push(mps),
    onDoorIntent: (id) => log.intents.push(id),
    beforeCut: () => (log.cuts += 1),
    requestFrame: () => (log.frames += 1),
    propAnimation: props,
    boardMotion,
    nowMs: () => clock,
    random: () => 0.5,
    onPropAct: (id) => log.acts.push(id),
    onArrive: () => (log.arrivals += 1),
  });
  // The fake clock is the frames: every step is that many milliseconds, however it is called.
  const advance = d.step;
  d.step = (dtMs: number) => {
    clock += dtMs;
    return advance(dtMs);
  };
  return {
    d,
    spine,
    progress,
    animation,
    props,
    boardMotion,
    log,
    now: () => clock,
    run(ms, each) {
      const end = clock + ms;
      while (clock < end - 1e-6) {
        d.step(Math.min(FRAME, end - clock));
        each?.();
      }
    },
    settle(limitMs = 30_000) {
      const start = clock;
      while (clock - start < limitMs) {
        if (!d.step(FRAME) || d.ambientOnly) break;
      }
      return clock - start;
    },
  };
}

/** A corridor with the visitor at the hand-over, as after the landing. */
export const inCorridor = (o: Parameters<typeof rig>[0] = {}) => rig({ enter: true, progress: 1, ...o });
