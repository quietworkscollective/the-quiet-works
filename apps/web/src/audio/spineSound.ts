/**
 * The corridor's sound: room tone, footsteps, doors and the board, behind one object the sound
 * desk's engine owns. It takes a destination bus and nothing else from the desk, so the desk's
 * graph is unchanged until the first time the visitor is in the corridor.
 *
 *   voices -> spineOut -------------------------------------------> destination
 *   voices -> send -> convolver -> return --------------------------^
 *   room tone, far sounds -> gate (dry and send, in step) -> the above
 *
 * Every sound is scheduled on the audio clock (`start(when)`). Timers only decide when to hand
 * the next footstep or far sound to the clock: they run while the visitor is walking (every 50
 * ms) or the corridor is the room (every 2 s), and never otherwise.
 */
import { chamberById, type ChamberId, type SpineCue } from '@tqw/engine';
import { CHAMBER_MODULES } from '../chambers/registry.ts';
import { SPINE_TIMING } from '../timing.ts';
import { createPrng, type NoiseBuffers } from './noise.ts';
import { AIR, closureOf, doorFeel } from './spineDoors.ts';
import { createCorridorImpulse, FarEvents, startCorridorTone, type FarEvent } from './spineRoom.ts';
import * as voices from './spineVoices.ts';
import { Cadence, type Step } from './spineWalk.ts';

/** Rooms cross-fade over this long (the brief: about 1.2 s). */
export const ROOM_FADE_S = 1.2;
const WALK_TICK_MS = 50;
const ROOM_TICK_MS = 2000;
/** Footsteps are handed to the clock this far ahead; a step inside this window is committed. */
const LOOKAHEAD_S = 0.2;
const FAR_HORIZON_S = 12;

const seconds = (ms: number): number => ms / 1000;

/** Freeze `param` at its current value from `at`, discarding automation scheduled after it. */
function settle(param: AudioParam, at: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(at);
    return;
  }
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
}

/**
 * Move `param` to `to` over `duration` on an equal-power curve (sine up, cosine down), so two
 * uncorrelated room tones crossfaded with it keep a steady loudness. Safe to call mid-fade: it
 * starts from wherever the last one had got to.
 */
export function crossfade(param: AudioParam, to: number, at: number, duration: number): void {
  settle(param, at);
  const from = param.value;
  if (from === to) return;
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps;
    const shape = to > from ? Math.sin((u * Math.PI) / 2) : 1 - Math.cos((u * Math.PI) / 2);
    param.linearRampToValueAtTime(from + (to - from) * shape, at + duration * u);
  }
}

/** What was scheduled, for tests: the voice's name, its start on the audio clock and its length. */
export interface SpineTraceEvent {
  readonly voice: string;
  readonly at: number;
  readonly length?: number;
}

export interface SpineOptions {
  /** Whether the corridor is the room the visitor is in. */
  corridor: boolean;
  /** How long the first arrival of the room tone takes. */
  fadeInS: number;
  trace?: (event: SpineTraceEvent) => void;
}

export class SpineSound {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly rand = createPrng(0x5b1e);
  private readonly cadence = new Cadence(createPrng(0x57e9));
  private readonly far = new FarEvents(0xfa4);
  private readonly steps = new Map<number, { voice: voices.StepVoice; at: number }>();
  private readonly out: GainNode;
  private readonly gateDry: GainNode;
  private readonly gateSend: GainNode | null;
  private readonly env: voices.SpineEnv;
  private readonly roomEnv: voices.SpineEnv;
  private corridor = false;
  private toneStarted = false;
  private paused = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDelay = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly noise: NoiseBuffers,
    destination: AudioNode,
    private readonly options: SpineOptions,
  ) {
    try {
      this.out = this.gain(1);
      this.out.connect(destination);

      // The long soft room. A platform without a convolver still has a corridor, just a drier one.
      let send: GainNode | null = null;
      let gateSend: GainNode | null = null;
      try {
        const convolver = ctx.createConvolver();
        convolver.normalize = false;
        convolver.buffer = createCorridorImpulse(ctx);
        const lowCut = ctx.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 90;
        lowCut.Q.value = 0.5;
        send = this.gain(1);
        gateSend = this.gain(0);
        gateSend.connect(send);
        send.connect(convolver);
        convolver.connect(lowCut);
        lowCut.connect(this.out);
        this.nodes.push(convolver, lowCut);
      } catch {
        send = null;
        gateSend = null;
      }
      this.gateSend = gateSend;

      this.gateDry = this.gain(0);
      this.gateDry.connect(this.out);
      this.env = { ctx, noise, rand: this.rand, out: this.out, send, begin: () => () => undefined };
      this.roomEnv = { ...this.env, out: this.gateDry, send: gateSend };
      if (options.corridor) this.enterCorridor(options.fadeInS);
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.arm();
  }

  private gain(value: number): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = value;
    this.nodes.push(node);
    return node;
  }

  private note(voice: string, at: number, length?: number): void {
    this.options.trace?.(length === undefined ? { voice, at } : { voice, at, length });
  }

  // The room ----------------------------------------------------------------------------------

  /** Whether the corridor is the room. In a chamber the tone and the far sounds fade out together. */
  setCorridor(active: boolean): void {
    if (this.disposed || active === this.corridor) return;
    if (active) this.enterCorridor(ROOM_FADE_S);
    else {
      this.corridor = false;
      this.fadeGates(0, this.ctx.currentTime, ROOM_FADE_S);
    }
    this.arm();
  }

  /** The tone is built the first time the corridor is the room; a session in a chamber never pays for it. */
  private enterCorridor(fadeInS: number): void {
    const now = this.ctx.currentTime;
    if (!this.toneStarted) {
      this.toneStarted = true;
      const tone = startCorridorTone(this.ctx, this.noise, this.gateDry, now, this.rand);
      this.sources.push(...tone.sources);
      this.nodes.push(...tone.nodes);
    }
    this.corridor = true;
    this.fadeGates(1, now, fadeInS);
  }

  private fadeGates(to: number, at: number, duration: number): void {
    crossfade(this.gateDry.gain, to, at, duration);
    if (this.gateSend !== null) crossfade(this.gateSend.gain, to, at, duration);
  }

  // Walking -----------------------------------------------------------------------------------

  setWalk(mps: number): void {
    if (this.disposed) return;
    this.withdraw(this.cadence.setSpeed(this.ctx.currentTime, mps));
    this.tick();
  }

  private withdraw(ids: readonly number[]): void {
    const now = this.ctx.currentTime;
    for (const id of ids) {
      this.steps.get(id)?.voice.withdraw(now);
      this.steps.delete(id);
    }
  }

  private scheduleStep(step: Step): void {
    const wet = this.corridor ? 0.5 : 0.08;
    const pan = step.foot === 0 ? -0.1 : 0.1;
    const voice = voices.footstep(this.env, step.at, step, { pan, dry: 1, wet });
    this.steps.set(step.id, { voice, at: step.at });
    this.note('footstep', step.at);
  }

  /** Hand the clock whatever is due. Called by the timer, and by every `setWalk`. */
  tick(): void {
    if (this.disposed || this.paused) return;
    const now = this.ctx.currentTime;
    if (!hidden()) {
      for (const step of this.cadence.due(now, LOOKAHEAD_S)) this.scheduleStep(step);
    }
    if (this.corridor) for (const event of this.far.take(now, FAR_HORIZON_S)) this.scheduleFar(event);
    for (const [id, step] of this.steps) if (step.at < now - 1) this.steps.delete(id);
    this.arm();
  }

  private scheduleFar(event: FarEvent): void {
    const place: voices.Placement = { pan: event.pan, dry: 0.3, wet: 1, lowpass: 1100 };
    switch (event.kind) {
      case 'radiator':
        voices.radiatorTick(this.roomEnv, event.at, event.level, place);
        break;
      case 'door':
        voices.farDoor(this.roomEnv, event.at, place);
        break;
      case 'pipe':
        voices.farPipe(this.roomEnv, event.at, place);
        break;
    }
    this.note(`far-${event.kind}`, event.at);
  }

  private arm(): void {
    if (this.disposed || this.paused) return;
    const delay = this.cadence.walking ? WALK_TICK_MS : this.corridor ? ROOM_TICK_MS : null;
    if (delay === null) {
      this.disarm();
      return;
    }
    // A timer already due sooner than this one stays; a walk that begins shortens an idle wait.
    if (this.timer !== null && this.timerDelay <= delay) return;
    this.disarm();
    this.timerDelay = delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delay);
  }

  private disarm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Mute: stop handing anything to the clock and withdraw steps that have not sounded. */
  pause(): void {
    if (this.disposed || this.paused) return;
    this.paused = true;
    this.withdraw(this.cadence.setSpeed(this.ctx.currentTime, 0));
    this.disarm();
  }

  resume(): void {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    this.arm();
  }

  // Cues --------------------------------------------------------------------------------------

  play(cue: SpineCue): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    switch (cue.type) {
      case 'door-open':
        return this.doorOpen(now, cue.id, cue.via);
      case 'door-sealed':
        return this.doorSealed(now, cue.id);
      case 'chamber-leave':
        return this.chamberLeave(now, cue.id);
      case 'board-open':
        return this.board(now, true);
      case 'board-close':
        return this.board(now, false);
      // A door in focus makes no sound: nothing touches it. The room crossfade announces a chamber.
      case 'door-focus':
      case 'chamber-enter':
        return;
    }
  }

  /**
   * Handle, latch, swing, then the chamber's air as the camera walks in, each at its offset in
   * `SPINE_TIMING`. Reached by walking up to the door, the door is dead ahead and near; from the
   * board or a link nobody is at the door, so it is heard down the corridor on its own side.
   */
  private doorOpen(now: number, id: ChamberId, via: 'door' | 'board' | 'link'): void {
    const feel = doorFeel(CHAMBER_MODULES[id].door);
    const place = via === 'door' ? NEAR : distant(chamberById(id).side);
    const turn = seconds(SPINE_TIMING.handleTurnMs);
    const latchAt = now + turn;
    const swingAt = latchAt + seconds(SPINE_TIMING.latchMs);
    const airAt = swingAt + seconds(SPINE_TIMING.entryDelayMs);

    voices.handleTurn(this.env, now, feel, turn, place);
    this.note('handle', now, turn);
    voices.latchRelease(this.env, latchAt, feel, place);
    this.note('latch', latchAt);
    voices.hingeSwing(this.env, swingAt, feel, seconds(SPINE_TIMING.swingMs), 1, place);
    this.note('swing', swingAt, seconds(SPINE_TIMING.swingMs));
    voices.chamberAir(this.env, airAt, AIR[id], seconds(SPINE_TIMING.entryMs), { ...place, wet: AIR[id].wet });
    this.note('chamber-air', airAt, seconds(SPINE_TIMING.entryMs));
  }

  private doorSealed(now: number, id: ChamberId): void {
    const spec = CHAMBER_MODULES[id].door;
    const length = seconds(SPINE_TIMING.rattleMs);
    voices.sealedRattle(this.env, now, doorFeel(spec), closureOf(spec), length, NEAR);
    this.note(`rattle-${closureOf(spec)}`, now, length);
  }

  private chamberLeave(now: number, id: ChamberId): void {
    const length = seconds(SPINE_TIMING.closeMs);
    voices.doorClose(this.env, now, doorFeel(CHAMBER_MODULES[id].door), length, NEAR);
    this.note('door-close', now, length);
  }

  private board(now: number, opening: boolean): void {
    voices.board(this.env, now, opening, BOARD);
    this.note(opening ? 'board-open' : 'board-close', now);
  }

  // Lifecycle ---------------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disarm();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Not started, or already stopped.
      }
    }
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  }
}

/** A door the visitor is standing at: dead ahead, near, mostly direct. */
const NEAR: voices.Placement = { pan: 0, dry: 1, wet: 0.3 };
/** The board is on the lobby's left wall. */
const BOARD: voices.Placement = { pan: -0.2, dry: 1, wet: 0.15 };

/** A door heard from down the corridor: on its side, darker, mostly room. */
function distant(side: 'left' | 'right'): voices.Placement {
  return { pan: side === 'left' ? -0.7 : 0.7, dry: 0.22, wet: 0.7, lowpass: 1400 };
}

/** A hidden tab throttles timers and stops the camera; footsteps must not carry on behind it. */
function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
