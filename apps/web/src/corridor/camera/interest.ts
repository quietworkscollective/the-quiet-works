import type { ChamberId, SpineStore } from '@tqw/engine';
import type { Bounds } from '../../firstPerson/bounds.ts';
import type { FirstPerson } from '../../firstPerson/controller.ts';
import type { AmbientClock } from '../ambient.ts';
import { CHAMBER_SLOTS, CORRIDOR } from '../layout.ts';
import { PROPS, type PropAnimation, type PropId } from '../props.ts';
import type { BoardMotion } from './boardMotion.ts';
import { sameCueTarget, targetId as targetKey, type CueTarget } from './cueText.ts';
import { candidates as findable, gazeAngleDeg, reachOf, unobstructed, type Candidate } from './context.ts';
import { CUE_TUNING } from './cueTuning.ts';
import { boardPoint, project, type Lens } from './framing.ts';
import { createGlintScheduler, type GlintFrame, type GlintScheduler, type GlintTarget } from './glint.ts';
import { createPropMotion, type PropMotion } from './propMotion.ts';
import { boardAnchor, propAnchor, propById, stationFor } from './stations.ts';

/**
 * What the visitor can touch besides doors (ADR 0004, "Things to touch" and "Interactive cues"):
 * the twelve props and the notice board. This keeps the pointer's state (hover, focus, framed),
 * sends the camera to a framing station for a distant target, runs a near target's action, drives
 * the props' `attention`, `action` and `glint`, and chooses what glints. It knows nothing of the
 * DOM or three.js: the rig feeds it pointer events and reads what to show.
 *
 * The rules are the doors' rules: a click on something far glides to a place to stand and look at
 * it; a click on something near, or already framed, does it.
 */

/** Standing this close to a target's station counts as being at it (and, with `FACING_DEG`, seeing it). */
export const NEAR_M = 0.9;
/** Standing this far from a framed target's station means the visitor has walked away from it. */
const WALKED_AWAY_M = 0.35;
/** From the list, a prop is looked at (and its action seen) only within this many degrees of its station's heading. */
const FACING_DEG = 20;
const GLINT_RANGE_M = 8;
/** How much of the picture a glint candidate must be well inside, as a fraction of the half-width. */
const IN_VIEW = 0.85;
/** A door's glint is a gentler `attention` than a hover's. */
export const DOOR_GLINT_LEVEL = 0.45;

export interface InterestOptions {
  controller: FirstPerson;
  bounds: Bounds;
  spine: SpineStore;
  animation: PropAnimation;
  lens(): Lens;
  reduced(): boolean;
  /** The visitor may act now: in the corridor, free to move, nothing scripted, nothing covering the scene. */
  canAct(): boolean;
  /** Called before the camera is sent anywhere: take it from the scroll, forget a framed door. */
  beforeMove(): void;
  requestFrame(): void;
  /** The chamber doors that could glint. */
  doorIds(): readonly ChamberId[];
  /** Whether a door is hovered, focused or framed (it then needs no glint). */
  doorBusy(id: ChamberId): boolean;
  ambient?: AmbientClock | undefined;
  boardMotion?: BoardMotion | undefined;
  /** A prop's action has begun (the shell may show what it reveals). */
  onAct?(id: PropId): void;
  nowMs?: () => number;
  random?: () => number;
  /** For tests: a glint scheduler of their own. */
  glint?: GlintScheduler;
}

export type Place = { kind: 'board' } | { kind: 'prop'; id: PropId };

export interface Interest {
  readonly motion: PropMotion;
  hoverProp(id: PropId | null): void;
  hoverBoard(on: boolean): void;
  /** Keyboard (or assistive) focus is on a prop's DOM equivalent. */
  focusProp(id: PropId | null): void;
  clickProp(id: PropId): void;
  clickBoard(): void;
  /**
   * A click on one of the board's clippings: if the visitor is not yet at the board, glide to it
   * (true, and the click is spent); if they are, false, and the clipping's own action goes ahead.
   */
  frameBoard(): boolean;
  /** The "Things nearby" list: glide to it and do its action. */
  actProp(id: PropId): void;
  readonly hovered: CueTarget | null;
  readonly focused: CueTarget | null;
  /** The prop or board the visitor was sent to or is standing at, until they walk away. */
  readonly framed: CueTarget | null;
  forgetFramed(): void;
  /**
   * Every place the visitor can be taken to and every action they can do there, nearest first: the
   * twelve props and the notice board. The "Places and actions" list is made from this; it does not
   * depend on where the visitor is looking.
   */
  places(): Place[];
  /** The "Places and actions" list: glide to the notice board and open it. */
  actBoard(): void;
  /** The glint showing now, if any. */
  readonly glint: GlintFrame | null;
  /** The visitor has the view at the starting position: the board pin's glint is due. */
  arrived(): void;
  /** Advances by `dtMs`; true while another frame is needed. */
  step(dtMs: number): boolean;
  /** Milliseconds until something would change with no frame drawn (a hold ends, a glint is due). */
  nextWakeMs(): number | null;
  /** Everything to rest. */
  reset(): void;
}

export function createInterest(options: InterestOptions): Interest {
  const { controller, bounds, animation } = options;
  const nowMs = options.nowMs ?? (() => performance.now());
  let hovered: CueTarget | null = null;
  let focused: CueTarget | null = null;
  let framed: CueTarget | null = null;
  /** A list activation waiting for the glide to arrive. */
  /** A list activation waiting for the glide to arrive. */
  let pending: CueTarget | null = null;
  const everything = new Map<string, Candidate>(findable().map((c) => [targetKey(c.target), c]));
  let showing: GlintFrame | null = null;

  const motion = createPropMotion(animation, {
    reduced: options.reduced,
    nowMs,
    onSettled: () => options.requestFrame(),
  });
  const glint =
    options.glint ??
    createGlintScheduler({ nowMs, ...(options.random ? { random: options.random } : {}) });

  const stationOf = (target: CueTarget) =>
    stationFor(target.kind === 'board' ? boardAnchor() : propAnchor(propById(target.id as PropId)), options.lens(), bounds);

  const distanceTo = (target: CueTarget): number => {
    const s = stationOf(target);
    return Math.hypot(controller.pose.x - s.x, controller.pose.z - s.z);
  };

  /** Standing at the target's framing station and looking at it, near enough that nothing needs to move. */
  const atStation = (target: CueTarget): boolean => {
    const station = stationOf(target);
    const { pose } = controller;
    const turned = Math.abs(((pose.yawDeg - station.yawDeg + 540) % 360) - 180);
    return Math.hypot(pose.x - station.x, pose.z - station.z) <= WALKED_AWAY_M && turned <= FACING_DEG;
  };

  /** Standing within reach of the target (the contextual cue's own limits, a little looser: the label is up). */
  const withinReach = (target: CueTarget): boolean => {
    const c = everything.get(targetKey(target));
    if (!c) return false;
    return reachOf({ ...controller.pose }, c.at) <= (c.large ? CUE_TUNING.leaveReachLargeM : CUE_TUNING.leaveReachM);
  };

  /** Within reach, looking at it, and nothing in the way: the action is seen where it happens. */
  const seen = (target: CueTarget): boolean => {
    const c = everything.get(targetKey(target));
    if (!c) return false;
    const view = { ...controller.pose };
    return withinReach(target) && gazeAngleDeg(view, c.at) <= CUE_TUNING.leaveGazeDeg && unobstructed(view, c.at);
  };

  /** A click is on something in view: it acts when the visitor is within reach of it or was sent to it. */
  const isNear = (target: CueTarget): boolean => sameCueTarget(framed, target) || withinReach(target);

  function frame(target: CueTarget): void {
    options.beforeMove();
    framed = target;
    const station = stationOf(target);
    if (options.reduced()) controller.cutTo(station);
    else controller.glideTo(station);
    options.requestFrame();
  }

  function act(id: PropId): void {
    if (motion.trigger(id)) options.onAct?.(id);
    options.requestFrame();
  }

  const asProp = (id: PropId): CueTarget => ({ kind: 'prop', id });

  /** What is emphasised: hovered, focused or framed props (a lightened fitting, nothing more). */
  function emphasise(): void {
    for (const spec of PROPS) {
      const target = asProp(spec.id);
      motion.setEmphasis(spec.id, sameCueTarget(hovered, target) || sameCueTarget(focused, target) || sameCueTarget(framed, target));
    }
  }

  function inView(point: readonly [number, number, number]): boolean {
    const p = project({ ...controller.pose }, options.lens(), point);
    return p !== null && Math.abs(p.x) < IN_VIEW && Math.abs(p.y) < IN_VIEW;
  }

  function candidates(): GlintTarget[] {
    const out: GlintTarget[] = [];
    const { x, z } = controller.pose;
    for (const spec of PROPS) {
      const target = asProp(spec.id);
      if (sameCueTarget(hovered, target) || sameCueTarget(focused, target) || sameCueTarget(framed, target)) continue;
      if (motion.running(spec.id)) continue;
      const a = propAnchor(spec);
      if (Math.hypot(a.x - x, a.z - z) > GLINT_RANGE_M) continue;
      if (inView([a.x, a.y, a.z])) out.push({ kind: 'prop', id: spec.id });
    }
    for (const id of options.doorIds()) {
      if (options.doorBusy(id)) continue;
      const slot = CHAMBER_SLOTS.find((s) => s.chamber === id);
      if (!slot) continue;
      const wallX = (slot.side === 'right' ? 1 : -1) * (CORRIDOR.width / 2 - 0.05);
      if (Math.hypot(wallX - x, slot.z - z) > GLINT_RANGE_M) continue;
      if (inView([wallX, 1.3, slot.z])) out.push({ kind: 'door', id });
    }
    if (!sameCueTarget(hovered, { kind: 'board' }) && !sameCueTarget(framed, { kind: 'board' })) {
      const b = boardAnchor();
      if (Math.hypot(b.x - x, b.z - z) <= GLINT_RANGE_M && inView(boardPoint(0, 0))) out.push({ kind: 'board' });
    }
    return out;
  }

  /** Writes the glint to the channel its target reads, clearing the one it left. */
  function publish(next: GlintFrame | null): void {
    if (showing && (!next || !sameGlint(showing.target, next.target))) clearChannel(showing.target);
    showing = next;
    if (!next) return;
    if (next.target.kind === 'prop') motion.setGlint(next.target.id as PropId, next.value);
    else if (next.target.kind === 'board' && options.boardMotion) options.boardMotion.glint = next.value;
  }
  function clearChannel(target: GlintTarget): void {
    if (target.kind === 'prop') motion.setGlint(target.id as PropId, 0);
    else if (target.kind === 'board' && options.boardMotion) options.boardMotion.glint = 0;
  }

  function poll(): boolean {
    const enabled =
      options.canAct() &&
      !options.reduced() &&
      !controller.active &&
      hovered === null &&
      focused === null &&
      framed === null &&
      pending === null;
    const frameNow = glint.poll({
      enabled,
      candidates,
      begin: (ms) => (options.ambient ? options.ambient.requestWindow('glint', ms + 150) : true),
    });
    publish(frameNow);
    return frameNow !== null;
  }

  return {
    motion,
    get hovered() {
      return hovered;
    },
    get focused() {
      return focused;
    },
    get framed() {
      return framed;
    },
    get glint() {
      return showing;
    },

    hoverProp(id) {
      const next = id ? asProp(id) : null;
      if (sameCueTarget(hovered, next)) return;
      hovered = next;
      options.requestFrame();
    },
    hoverBoard(on) {
      const next: CueTarget | null = on ? { kind: 'board' } : null;
      if (sameCueTarget(hovered, next)) return;
      hovered = next;
      options.requestFrame();
    },
    focusProp(id) {
      const next = id ? asProp(id) : null;
      if (sameCueTarget(focused, next)) return;
      focused = next;
      options.requestFrame();
    },

    clickProp(id) {
      if (!options.canAct()) return;
      const target = asProp(id);
      pending = null;
      if (isNear(target)) act(id);
      else frame(target);
    },
    clickBoard() {
      if (!options.canAct()) return;
      const target: CueTarget = { kind: 'board' };
      pending = null;
      if (isNear(target)) options.spine.dispatch({ type: 'OPEN_BOARD' });
      else frame(target);
    },
    frameBoard() {
      if (!options.canAct()) return false;
      const target: CueTarget = { kind: 'board' };
      if (isNear(target)) return false;
      pending = null;
      frame(target);
      return true;
    },
    actProp(id) {
      if (!options.canAct()) return;
      const target = asProp(id);
      // From the list the prop may be behind the visitor: unlike a click on something in view, the
      // action waits until they are where it is seen (at its station facing it, or within reach and
      // looking at it).
      if (atStation(target) || seen(target)) {
        pending = null;
        act(id);
        return;
      }
      frame(target);
      // Under reduced motion the cut has already put the visitor there; otherwise act on arrival.
      if (options.reduced()) act(id);
      else pending = target;
    },
    actBoard() {
      if (!options.canAct()) return;
      const target: CueTarget = { kind: 'board' };
      if (atStation(target) || seen(target)) {
        pending = null;
        options.spine.dispatch({ type: 'OPEN_BOARD' });
        return;
      }
      frame(target);
      if (options.reduced()) options.spine.dispatch({ type: 'OPEN_BOARD' });
      else pending = target;
    },

    forgetFramed() {
      framed = null;
      pending = null;
    },

    places() {
      const view = { ...controller.pose };
      const here = (t: CueTarget) => {
        const c = everything.get(targetKey(t));
        return c ? reachOf(view, c.at) : Number.POSITIVE_INFINITY;
      };
      const all: Place[] = [{ kind: 'board' }, ...PROPS.map((p): Place => ({ kind: 'prop', id: p.id }))];
      return all.sort((a, b) => here(a) - here(b));
    },

    arrived() {
      glint.arrived();
    },

    step(dtMs) {
      emphasise();
      let busy = motion.step(dtMs);

      if (framed && !controller.gliding) {
        if (distanceTo(framed) > WALKED_AWAY_M) framed = null;
      }
      if (pending && !controller.gliding) {
        const target = pending;
        pending = null;
        if (distanceTo(target) <= NEAR_M) {
          if (target.kind === 'prop') act(target.id);
          else if (target.kind === 'board') options.spine.dispatch({ type: 'OPEN_BOARD' });
        }
      }
      if (!options.canAct() && (framed || pending)) {
        framed = null;
        pending = null;
      }
      if (poll()) busy = true;
      return busy;
    },

    nextWakeMs() {
      const a = motion.nextWakeMs();
      const b = glint.nextWakeMs();
      if (a === null) return b;
      if (b === null) return a;
      return Math.min(a, b);
    },

    reset() {
      hovered = null;
      focused = null;
      framed = null;
      pending = null;
      if (showing) clearChannel(showing.target);
      showing = null;
      glint.reset();
      motion.reset();
    },
  };
}

function sameGlint(a: GlintTarget, b: GlintTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'board' || (b.kind !== 'board' && a.id === b.id);
}
