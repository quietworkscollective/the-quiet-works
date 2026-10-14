/**
 * The procedural sound desk: lifecycle, bus graph and cue routing. Synthesis lives in
 * `voices.ts`, shared noise in `noise.ts`.
 *
 * Graph: voices -> interaction | music | ambience bus -> master -> limiter -> destination.
 * The limiter is a safety net; levels are staged so nothing should routinely reach it.
 *
 * Rooms: the Office's ventilation and drones play only while the Office is the room. The
 * corridor (its room tone, footsteps, doors and the board) lives in `spineSound.ts`, joins the
 * interaction bus, and is built the first time it is needed. Until a room is set the desk is in
 * the Office, the room it was built for.
 *
 * Timing rule (see `TIMING`): a `contact` cue at T starts the descent; the rubber meets the paper
 * at T + the Office contactMs. A `lift` cue at R peels at max(R, T + contactMs + minDwellMs). The reply
 * processing starts replyDelayMs after the lift; the hatch keeps its shared overload timing. Every
 * event is scheduled on the audio clock (`start(when)`), never with timers. The corridor's
 * footsteps and far sounds are handed to the clock by `spineSound.ts` while active.
 */
import { OFFICE_PRESS_TIMING, type Cue, type SpineCue } from '@tqw/engine';
import { TIMING } from '../timing.ts';
import { createNoiseBuffers, createPrng, type NoiseBuffers } from './noise.ts';
import { crossfade, ROOM_FADE_S, SpineSound } from './spineSound.ts';
import type { SoundDesk, SoundRoom } from './types.ts';
import * as voices from './voices.ts';

/**
 * A Web Audio DynamicsCompressorNode always applies automatic makeup gain, about +3.4 dB at
 * threshold -6 dB / ratio 20, even to signal far below the threshold. So the limiter's effective
 * sub-threshold gain is 1.48 and the net gain from the buses to the speakers is 0.8 * 1.48 = 1.19.
 * Measured offline, the loudest stamp peaks near -7 dBFS and the worst rapid-fire session stays
 * about 2 dB under the limiter threshold, so the limiter only catches freak sums.
 */
const MASTER_LEVEL = 0.8;
const MUTE_RAMP_S = 0.08;
const UNMUTE_RAMP_S = 0.2;
const AMBIENCE_FADE_IN_S = 3;
const RESET_RAMP_S = 0.8;
/** A reset silences anything still scheduled from before it, over this long. */
const EPOCH_FADE_S = 0.025;

/** Overload: ambience ducks during the shared pause, then returns a little lower than before. */
const DUCK_GAIN = voices.dbToGain(-18);
const ROOM_GAIN = voices.dbToGain(-3);
const DUCK_ATTACK_S = 0.08;
const DUCK_HOLD_S = 1.6;
const DUCK_RETURN_S = 1.5;

/** The latch lets go this long before the panel lands, which is `TIMING.overloadMs` after the reply starts. */
const HATCH_LATCH_LEAD_S = TIMING.overloadLatchLeadMs / 1000;

const STILLNESS_GLASS_DELAY_S = 0.45;
const STILLNESS_MEMO_DELAY_S = 0.9;

/** The rooms that have a tone of their own. Every other room id, sealed chambers included, is the corridor. */
type ToneRoom = 'corridor' | 'certification-office';
const toneRoom = (room: SoundRoom): ToneRoom => (room === 'certification-office' ? room : 'corridor');

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
 * Everything scheduled by one run of cues between resets. Resetting fades the whole epoch out
 * in 25 ms so a bell or a hatch scheduled before "Start over" cannot ring into the new room.
 */
interface Epoch {
  readonly interaction: GainNode;
  readonly music: GainNode;
  /** Graphs created in this epoch that have not yet finished. */
  live: number;
  retired: boolean;
}

type BusName = 'interaction' | 'music';

class Engine {
  private readonly noise: NoiseBuffers;
  private readonly rand = createPrng(0x7a11);

  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly buses: Record<BusName | 'ambience', GainNode>;
  private readonly ambienceFade: GainNode;
  /** The Office's ventilation and drones play only while the Office is the room: this gates them. */
  private readonly officeGate: GainNode;
  private ambience: voices.Ambience | null = null;
  private ambienceLevel = 1;
  private room: ToneRoom;
  /** The corridor: built the first time it is needed, so an Office-only session never pays for it. */
  private spine: SpineSound | null = null;
  private spineFailed = false;

  private epoch: Epoch;
  private envs: Record<BusName, voices.VoiceEnv>;

  private strikes = 0;
  private contactAt: number | null = null;
  private liftAt: number | null = null;
  private replyAt: number | null = null;
  private overloadAt: number | null = null;
  private hold: voices.HoldVoice | null = null;

  constructor(
    readonly ctx: AudioContext,
    room: SoundRoom,
  ) {
    this.noise = createNoiseBuffers(ctx);
    this.room = toneRoom(room);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = MASTER_LEVEL;
    this.master.connect(this.limiter);

    const bus = (): GainNode => {
      const node = ctx.createGain();
      node.gain.value = 1;
      node.connect(this.master);
      return node;
    };
    this.buses = { interaction: bus(), music: bus(), ambience: bus() };

    const now = ctx.currentTime;
    this.ambienceFade = ctx.createGain();
    this.ambienceFade.gain.setValueAtTime(0.0005, now);
    this.ambienceFade.gain.exponentialRampToValueAtTime(1, now + AMBIENCE_FADE_IN_S);
    this.ambienceFade.connect(this.buses.ambience);
    this.officeGate = ctx.createGain();
    this.officeGate.gain.value = this.room === 'certification-office' ? 1 : 0;
    this.officeGate.connect(this.ambienceFade);
    if (this.room === 'certification-office') {
      this.ambience = voices.startAmbience(ctx, this.noise, this.officeGate, now);
    } else {
      this.spine = this.createSpine(true, AMBIENCE_FADE_IN_S);
    }

    this.epoch = this.createEpoch();
    this.envs = this.createEnvs(this.epoch);
  }

  // Lifecycle ---------------------------------------------------------------------------------

  wake(): void {
    if (this.ctx.state === 'running' || this.ctx.state === 'closed') return;
    try {
      void Promise.resolve(this.ctx.resume()).catch(() => undefined);
    } catch {
      // A rejected or throwing resume must never surface; the next gesture tries again.
    }
  }

  setMuted(muted: boolean): void {
    const now = this.ctx.currentTime;
    settle(this.master.gain, now);
    this.master.gain.linearRampToValueAtTime(
      muted ? 0 : MASTER_LEVEL,
      now + (muted ? MUTE_RAMP_S : UNMUTE_RAMP_S),
    );
    if (muted) this.spine?.pause();
    else this.spine?.resume();
  }

  dispose(): void {
    this.spine?.dispose();
    for (const source of this.ambience?.sources ?? []) {
      try {
        source.stop();
      } catch {
        // Not started, or already stopped.
      }
    }
    const nodes: AudioNode[] = [
      ...(this.ambience?.nodes ?? []),
      this.officeGate,
      this.ambienceFade,
      this.epoch.interaction,
      this.epoch.music,
      ...Object.values(this.buses),
      this.master,
      this.limiter,
    ];
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    try {
      void Promise.resolve(this.ctx.close()).catch(() => undefined);
    } catch {
      // Already closed.
    }
  }

  // Rooms and the corridor ----------------------------------------------------------------------

  /** Crossfade to `next`'s tone. The Office's ventilation belongs to the Office; everywhere else is the corridor. */
  setRoom(next: SoundRoom): void {
    const room = toneRoom(next);
    if (room === this.room) return;
    this.room = room;
    const now = this.ctx.currentTime;
    const inOffice = room === 'certification-office';
    if (inOffice) this.ambience ??= voices.startAmbience(this.ctx, this.noise, this.officeGate, now);
    crossfade(this.officeGate.gain, inOffice ? 1 : 0, now, ROOM_FADE_S);
    if (inOffice) this.spine?.setCorridor(false);
    else (this.spine ?? this.createSpine(true, ROOM_FADE_S))?.setCorridor(true);
  }

  playSpine(cue: SpineCue): void {
    this.spineSound()?.play(cue);
  }

  setWalk(speedMps: number): void {
    // Standing still must not build a corridor just to be told there is nothing to do.
    if (speedMps > 0) this.spineSound()?.setWalk(speedMps);
    else this.spine?.setWalk(0);
  }

  private spineSound(): SpineSound | null {
    return this.spine ?? this.createSpine(this.room === 'corridor', ROOM_FADE_S);
  }

  /** Sound is decoration: a platform that cannot build the corridor gets no corridor, once, not a retry per frame. */
  private createSpine(corridor: boolean, fadeInS: number): SpineSound | null {
    if (this.spine !== null || this.spineFailed) return this.spine;
    try {
      this.spine = new SpineSound(this.ctx, this.noise, this.buses.interaction, { corridor, fadeInS });
    } catch {
      this.spineFailed = true;
    }
    return this.spine;
  }

  // Epochs ------------------------------------------------------------------------------------

  private createEpoch(): Epoch {
    const gain = (target: GainNode): GainNode => {
      const node = this.ctx.createGain();
      node.connect(target);
      return node;
    };
    return {
      interaction: gain(this.buses.interaction),
      music: gain(this.buses.music),
      live: 0,
      retired: false,
    };
  }

  private createEnvs(epoch: Epoch): Record<BusName, voices.VoiceEnv> {
    const env = (bus: BusName): voices.VoiceEnv => ({
      ctx: this.ctx,
      noise: this.noise,
      rand: this.rand,
      out: epoch[bus],
      begin: () => {
        epoch.live += 1;
        let finished = false;
        return () => {
          if (finished) return;
          finished = true;
          epoch.live -= 1;
          this.reap(epoch);
        };
      },
    });
    return { interaction: env('interaction'), music: env('music') };
  }

  private reap(epoch: Epoch): void {
    if (!epoch.retired || epoch.live > 0) return;
    epoch.interaction.disconnect();
    epoch.music.disconnect();
  }

  private retire(epoch: Epoch, at: number): void {
    epoch.retired = true;
    for (const node of [epoch.interaction, epoch.music]) {
      node.gain.setValueAtTime(1, at);
      node.gain.linearRampToValueAtTime(0, at + EPOCH_FADE_S);
    }
    this.reap(epoch);
  }

  // Cues --------------------------------------------------------------------------------------

  play(cue: Cue): void {
    const now = this.ctx.currentTime;
    switch (cue.type) {
      case 'object':
        return voices.objectSound(this.envs.interaction, now, cue.kind);
      case 'contact':
        return this.onContact(now);
      case 'lift':
        return this.onLift(now);
      case 'reply':
        return this.onReply(now, cue.step);
      case 'overload':
        return this.onOverload(now);
      case 'stillness':
        return this.onStillness(now);
      case 'memo-revealed':
        return this.onMemoRevealed(now, cue.source);
      case 'memo-opened':
        return voices.memoHandle(this.envs.interaction, now, true);
      case 'memo-closed':
        return voices.memoHandle(this.envs.interaction, now, false);
      case 'reset':
        return this.onReset(now);
    }
  }

  private onContact(now: number): void {
    const strikeAt = now + seconds(OFFICE_PRESS_TIMING.contactMs);
    this.strikes += 1;
    this.contactAt = now;
    this.hold?.release(now);
    voices.carriageSlide(this.envs.interaction, now);
    voices.strike(this.envs.interaction, strikeAt, this.strikes);
    this.hold = voices.holdCreak(this.envs.interaction, strikeAt + 0.03);
  }

  private onLift(now: number): void {
    const liftAt =
      this.contactAt === null
        ? now
        : Math.max(now, this.contactAt + seconds(OFFICE_PRESS_TIMING.contactMs + TIMING.minDwellMs));
    this.contactAt = null;
    this.hold?.release(liftAt);
    this.hold = null;
    this.liftAt = liftAt;
    voices.peel(this.envs.interaction, liftAt);
  }

  private onReply(now: number, step: number): void {
    const startAt = (this.liftAt ?? now) + seconds(TIMING.replyDelayMs);
    this.liftAt = null;
    this.replyAt = startAt;
    voices.processing(this.envs.interaction, startAt, step);
    if (step <= 5) voices.applicationRelay(this.envs.interaction, startAt);
  }

  private onOverload(now: number): void {
    const startAt = this.replyAt ?? now + seconds(TIMING.replyDelayMs);
    this.replyAt = null;
    this.overloadAt = startAt;

    const cutAt = startAt + seconds(TIMING.printMs + TIMING.bellRingMs);
    this.duckAmbience(cutAt);

    const landAt = startAt + seconds(TIMING.overloadMs);
    voices.hatch(this.envs.interaction, landAt - HATCH_LATCH_LEAD_S, landAt);
    if (this.ambience) {
      settle(this.ambience.tone.gain, landAt);
      this.ambience.tone.gain.linearRampToValueAtTime(0, landAt + 1.5);
    }
  }

  /** Preserve the shared pause before the hatch, then return quieter ventilation. */
  private duckAmbience(cutAt: number): void {
    const gain = this.buses.ambience.gain;
    const duckedAt = cutAt + DUCK_ATTACK_S;
    const releaseAt = cutAt + DUCK_HOLD_S;
    gain.setValueAtTime(this.ambienceLevel, cutAt);
    gain.exponentialRampToValueAtTime(DUCK_GAIN, duckedAt);
    gain.setValueAtTime(DUCK_GAIN, releaseAt);
    gain.exponentialRampToValueAtTime(ROOM_GAIN, releaseAt + DUCK_RETURN_S);
    this.ambienceLevel = ROOM_GAIN;
  }

  private onStillness(now: number): void {
    voices.exhale(this.envs.interaction, now);
    voices.glassHarmonic(this.envs.music, now + STILLNESS_GLASS_DELAY_S);
  }

  private onMemoRevealed(now: number, source: 'overload' | 'stillness'): void {
    const at =
      source === 'overload'
        ? (this.overloadAt ?? now) + seconds(TIMING.overloadMs + TIMING.memoAfterLandMs)
        : now + STILLNESS_MEMO_DELAY_S;
    this.overloadAt = null;
    if (source === 'stillness' && this.ambience) {
      const revealAt = Math.max(at, now);
      settle(this.ambience.tone.gain, revealAt);
      this.ambience.tone.gain.linearRampToValueAtTime(0, revealAt + 1.5);
    }
    voices.memoSlide(this.envs.interaction, Math.max(at, now));
  }

  private onReset(now: number): void {
    this.hold?.release(now);
    this.hold = null;
    this.contactAt = null;
    this.liftAt = null;
    this.replyAt = null;
    this.overloadAt = null;

    this.retire(this.epoch, now);
    this.epoch = this.createEpoch();
    this.envs = this.createEnvs(this.epoch);

    const gain = this.buses.ambience.gain;
    settle(gain, now);
    gain.linearRampToValueAtTime(1, now + RESET_RAMP_S);
    this.ambienceLevel = 1;

    if (this.ambience) {
      settle(this.ambience.tone.gain, now);
      this.ambience.tone.gain.linearRampToValueAtTime(1, now + RESET_RAMP_S);
    }

    voices.paperFeed(this.envs.interaction, now);
  }
}

function audioContextConstructor(): typeof AudioContext | undefined {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function createEngine(room: SoundRoom): Engine | null {
  const Constructor = audioContextConstructor();
  if (Constructor === undefined) return null;
  const ctx = new Constructor({ latencyHint: 'interactive' });
  try {
    const engine = new Engine(ctx, room);
    engine.wake();
    return engine;
  } catch (error) {
    void Promise.resolve(ctx.close()).catch(() => undefined);
    throw error;
  }
}

export function createSoundDesk(): SoundDesk {
  let engine: Engine | null = null;
  let muted = false;
  let disposed = false;
  // Remembered across the first gesture and across mute, so the desk is in the right place when
  // it speaks. Before anyone says otherwise the room is the Office the desk was built for.
  let room: SoundRoom = 'certification-office';
  let walk = 0;

  /** Sound is decoration: nothing here may throw into the page or the cue subscribers. */
  const safely = (action: () => void): void => {
    try {
      action();
    } catch {
      // Swallowed on purpose. Captions and visuals carry every beat without audio.
    }
  };

  return {
    unlock() {
      safely(() => {
        if (disposed || muted) return;
        if (engine === null) {
          engine = createEngine(room);
          if (walk > 0) engine?.setWalk(walk);
        } else engine.wake();
      });
    },
    setMuted(next) {
      muted = next;
      safely(() => {
        if (disposed || engine === null) return;
        engine.setMuted(next);
        if (!next) {
          // Rooms and walking that changed while muted are applied now, not lost.
          engine.setRoom(room);
          engine.setWalk(walk);
        }
      });
    },
    play(cue) {
      safely(() => {
        if (disposed || muted) return;
        engine?.play(cue);
      });
    },
    playSpine(cue) {
      safely(() => {
        if (disposed || muted) return;
        engine?.playSpine(cue);
      });
    },
    setWalk(speedMps) {
      walk = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
      safely(() => {
        if (disposed || muted) return;
        engine?.setWalk(walk);
      });
    },
    setRoom(next) {
      room = next;
      safely(() => {
        if (disposed || muted) return;
        engine?.setRoom(room);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const closing = engine;
      engine = null;
      safely(() => closing?.dispose());
    },
  };
}
