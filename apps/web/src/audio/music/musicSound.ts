/**
 * The gramophone's sound, behind one object the sound desk's engine owns. It takes the desk's music
 * bus and its noise, and joins the gramophone store: the store's machine says what the needle is
 * doing, and this plays it.
 *
 *   <audio> -> trim -> playGain -> wow -> saturation -> band (character.ts) -> voiceIn
 *   needle voices, surface crackle ----------------------------------------> voiceIn
 *   voiceIn -> fade -> air -+-> pan -> dry -> the music bus
 *                           +-> wet -> the corridor's room (when there is one)
 *
 * The record is played by an `<audio>` element whose `src` is the bundled asset's URL, routed into
 * the graph with a `MediaElementAudioSourceNode`. The page's policy is `connect-src 'none'`, so
 * nothing here may `fetch` a file or `decodeAudioData` a fetched buffer; media loads under
 * `media-src 'self'` and that is all this uses. No element exists, and no file is requested, before
 * the first sound unlock (this object is built by it), and none is requested for a record until the
 * visitor is where it can be heard.
 *
 * Whether the music is sounding is decided in one place (`sync`): the needle wants a record to be
 * playing, and the visitor is in the corridor, the sound is on, and the page is in view. Rooms, mute
 * and a hidden tab all reach the music through that. Entering a chamber fades it out over 1.5 s and
 * pauses the element after; coming back to the corridor fades it in over 3 s.
 */
import { createPrng, type NoiseBuffers } from '../noise.ts';
import { crossfade } from '../spineSound.ts';
import { dbToGain, type VoiceEnv } from '../voices.ts';
import { playableSources, type RecordInfo } from './catalogue.ts';
import { createCharacter, type Character } from './character.ts';
import { needleDrop, needleLift, recordSwap } from './needleVoices.ts';
import { mixAt } from './space.ts';
import type { Effect, GramophoneState } from './needle.ts';
import { needleDown, NEEDLE_TRAVEL_S } from './needle.ts';
import type { GramophoneStore, ListenerPose, Timers } from './store.ts';
import { createSurfaceBuffers, Surface, type SurfaceBuffers } from './surfaceVoice.ts';

/** The first record after the first gesture comes up over this long (the brief: 3 s). */
export const FIRST_FADE_IN_S = 3;
/** A record started by hand comes up over this long, after its lead-in. */
export const PLAY_FADE_IN_S = 0.6;
/** The music stops over this long when the needle lifts. */
export const LIFT_FADE_OUT_S = 0.25;
/** Entering a chamber takes the music away over this long (chambers have their own soundscapes). */
export const ROOM_FADE_OUT_S = 1.5;
/** Back in the corridor, it returns over this long. */
export const ROOM_FADE_IN_S = 3;
/** The needle, gone, lets its surface sound die away over this long. */
const SURFACE_OUT_S = 0.7;
/** The listener's movement reaches the sound over this long, so a step never clicks. */
const POSE_GLIDE_S = 0.12;

/**
 * The music's gain, in dB, between the decoded file and the gramophone's bus. The records are
 * normalised to -20 LUFS. With the listener facing the horn from 1.6 m, headless Chromium measured
 * the output at the destination (a mono downmix) at -20.4, -22.3 and -20.8 dBFS RMS for the three
 * records at a trim of -1.5 dB, with peaks to -2.4 dBFS, over the limiter's -6 dB threshold. This
 * lands the music about 2.5 dB lower: near -23 dBFS RMS on average, with its peaks under the
 * threshold, so the limiter is a safety net and not a part of the sound.
 */
export const MUSIC_TRIM_DB = -4;

export interface MusicTraceEvent {
  readonly type: 'drop' | 'lift' | 'swap' | 'run-out' | 'play' | 'pause' | 'blocked' | 'error';
  /** The audio clock when it was asked for. */
  readonly at: number;
  readonly record?: number;
}

export interface Visibility {
  hidden(): boolean;
  onChange(listener: () => void): () => void;
}

const BROWSER_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const BROWSER_VISIBILITY: Visibility = {
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  onChange(listener) {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

export interface MusicOptions {
  readonly store: GramophoneStore;
  readonly records: readonly RecordInfo[];
  /** Makes the one `<audio>` element. Called once, by the engine's construction, after the first unlock. */
  readonly createElement: () => HTMLAudioElement;
  /** Whether the corridor is the room when the engine is built. */
  readonly corridor: boolean;
  /** Input of the corridor's reverb, when the desk has built it. */
  readonly roomSend?: AudioNode | null;
  readonly timers?: Timers;
  readonly visibility?: Visibility;
  readonly trace?: (event: MusicTraceEvent) => void;
}

/**
 * Move `param` to `to` over `seconds` from `at`, from wherever it is.
 *
 * The start is read back with `param.value` rather than held with `cancelAndHoldAtTime`. The two are
 * the same on a gain, but the music's low-pass is retargeted on every frame the camera draws, and
 * measured in Chrome a held-then-ramped biquad frequency makes the filter's output swing up to about
 * 33 dB over its input (a burst through the limiter on every step of a walk), where this form is
 * clean.
 */
function glide(param: AudioParam, to: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.linearRampToValueAtTime(to, at + seconds);
}

/** Take `param` to nothing at once (5 ms), then up to full over `seconds`: a record begins from silence. */
function riseFromSilence(param: AudioParam, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.linearRampToValueAtTime(0, at + 0.005);
  param.linearRampToValueAtTime(1, at + 0.005 + seconds);
}

export class MusicSound {
  private readonly nodes: AudioNode[] = [];
  private readonly timers: Timers;
  private readonly visibility: Visibility;
  private readonly rand = createPrng(0x6a3d);
  private readonly element: HTMLAudioElement;
  private readonly elementSource: MediaElementAudioSourceNode;
  private readonly character: Character;
  private readonly playGain: GainNode;
  private readonly voiceIn: GainNode;
  private readonly air: BiquadFilterNode;
  private readonly panner: StereoPannerNode | null;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly fade: GainNode;
  private readonly buffers: SurfaceBuffers;
  private readonly voiceEnv: VoiceEnv;
  private readonly unbind: (() => void)[] = [];

  private surface: Surface | null = null;
  private readonly retiring = new Set<Surface>();

  private record = 0;
  /** The needle wants a record to be playing. */
  private wantPlaying = false;
  private corridor: boolean;
  private muted = false;
  private away = false;
  /** The browser refused to play without a gesture: the next unlock tries again. */
  private blocked = false;
  private disposed = false;

  /** Where the element is: not started, asked to play, or playing. */
  private state: 'idle' | 'starting' | 'playing' = 'idle';
  /** The record whose playback began and has not been lifted: set when a record starts from the top. */
  private startedRecord: number | null = null;
  /** Whether any record has started this session: the first one comes up slowly. */
  private firstDone = false;
  /** A record has been started from the top and is yet to be announced to the captions. */
  private announcePending = false;
  /** Which encoding of the record on the element has been tried. */
  private sourceIndex = 0;
  /** The URL last given to the element: reading `src` back would give the resolved address, not this. */
  private loadedUrl: string | null = null;
  private pauseTimer: unknown = null;

  constructor(
    readonly ctx: AudioContext,
    noise: NoiseBuffers,
    out: AudioNode,
    private readonly options: MusicOptions,
  ) {
    this.timers = options.timers ?? BROWSER_TIMERS;
    this.visibility = options.visibility ?? BROWSER_VISIBILITY;
    this.corridor = options.corridor;
    this.away = this.visibility.hidden();
    const now = ctx.currentTime;

    const gain = (value: number): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      this.nodes.push(node);
      return node;
    };

    this.element = options.createElement();
    this.element.preload = 'none';
    this.element.loop = false;
    this.elementSource = ctx.createMediaElementSource(this.element);
    this.nodes.push(this.elementSource);

    const trim = gain(dbToGain(MUSIC_TRIM_DB));
    this.playGain = gain(0);
    this.character = createCharacter(ctx, now);
    this.nodes.push(...this.character.nodes);
    this.voiceIn = gain(1);
    this.elementSource.connect(trim);
    trim.connect(this.playGain);
    this.playGain.connect(this.character.input);
    this.character.output.connect(this.voiceIn);

    // The room fade comes first, so a chamber takes away the sound's reverb with it.
    this.fade = gain(this.corridor ? 1 : 0);
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.frequency.value = 5200;
    this.air.Q.value = Math.SQRT1_2;
    this.nodes.push(this.air);
    this.voiceIn.connect(this.fade);
    this.fade.connect(this.air);

    this.dry = gain(0);
    this.wet = gain(0);
    if (typeof ctx.createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.nodes.push(this.panner);
      this.air.connect(this.panner);
      this.panner.connect(this.dry);
    } else {
      this.panner = null;
      this.air.connect(this.dry);
    }
    this.dry.connect(out);
    this.air.connect(this.wet);
    this.setRoomSend(options.roomSend ?? null);

    this.buffers = createSurfaceBuffers(ctx, noise);
    this.voiceEnv = { ctx, noise, rand: this.rand, out: this.voiceIn, begin: () => () => undefined };

    this.place(options.store.getListener(), true);

    const onEnded = (): void => {
      this.state = 'idle';
      options.store.report('ended');
    };
    const onError = (): void => this.onElementError();
    this.element.addEventListener('ended', onEnded);
    this.element.addEventListener('error', onError);
    this.unbind.push(() => this.element.removeEventListener('ended', onEnded));
    this.unbind.push(() => this.element.removeEventListener('error', onError));
    this.unbind.push(options.store.onListener((pose) => this.place(pose, false)));
    this.unbind.push(this.visibility.onChange(() => this.setAway(this.visibility.hidden())));
    this.unbind.push(
      options.store.bindAudio({
        attach: (state) => this.attach(state),
        effect: (effect, state) => this.effect(effect, state),
      }),
    );
    // The first deliberate gesture has just unlocked the desk: the first record may begin.
    options.store.autostart();
  }

  // The listener --------------------------------------------------------------------------------

  /** Where the visitor stands: how loud, how dark and how wet the gramophone is, and which side it is on. */
  private place(pose: ListenerPose, immediate: boolean): void {
    if (this.disposed) return;
    const mix = mixAt(pose);
    const now = this.ctx.currentTime;
    const move = (param: AudioParam, value: number): void => {
      if (immediate) param.value = value;
      else glide(param, value, now, POSE_GLIDE_S);
    };
    move(this.dry.gain, mix.dry);
    move(this.wet.gain, mix.wet);
    move(this.air.frequency, mix.lowpassHz);
    if (this.panner) move(this.panner.pan, mix.pan);
  }

  /** Where the corridor's reverb is, once the desk has built it; the music's wet share goes there. */
  setRoomSend(node: AudioNode | null): void {
    if (this.disposed) return;
    try {
      this.wet.disconnect();
    } catch {
      // Not connected yet.
    }
    if (node) this.wet.connect(node);
  }

  // Rooms, mute and the page ----------------------------------------------------------------------

  /** Whether the corridor is the room. In a chamber the music fades out; back in the corridor it returns. */
  setCorridor(active: boolean): void {
    if (this.disposed || active === this.corridor) return;
    this.corridor = active;
    crossfade(this.fade.gain, active ? 1 : 0, this.ctx.currentTime, active ? ROOM_FADE_IN_S : ROOM_FADE_OUT_S);
    this.sync();
  }

  /** The Sound setting: off pauses the record where it is, on lets it go on. */
  setMuted(muted: boolean): void {
    if (this.disposed || muted === this.muted) return;
    this.muted = muted;
    this.sync();
  }

  private setAway(away: boolean): void {
    if (this.disposed || away === this.away) return;
    this.away = away;
    this.sync();
  }

  /** A fresh gesture: if the browser had refused to play, ask again now, inside it. */
  nudge(): void {
    if (this.disposed || !this.blocked) return;
    this.blocked = false;
    // The needle may be on the shellac still, with the music yet to begin: start the element in this gesture.
    if (this.options.store.getState().needle === 'lead-in') this.prime();
    else this.sync();
  }

  private get audible(): boolean {
    return this.corridor && !this.muted && !this.away && !this.disposed;
  }

  // The needle ----------------------------------------------------------------------------------

  private attach(state: GramophoneState): void {
    this.record = state.record;
    if (!needleDown(state.needle)) return;
    this.beginSurface();
    const now = this.ctx.currentTime;
    if (state.needle === 'lead-in') this.surface?.lead(now);
    else {
      this.surface?.underMusic(now);
      if (state.needle === 'playing') {
        this.wantPlaying = true;
        this.sync();
      }
    }
  }

  private effect(effect: Effect, state: GramophoneState): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    switch (effect.type) {
      case 'drop':
        this.record = effect.record;
        this.startedRecord = null;
        this.sourceIndex = 0;
        this.beginSurface();
        // The arm is on its way down: the needle lands, and the crackle begins, when its journey ends.
        this.surface?.lead(now + NEEDLE_TRAVEL_S);
        if (this.audible) needleDrop(this.voiceEnv, now + NEEDLE_TRAVEL_S);
        this.trace('drop', effect.record);
        this.prime();
        break;
      case 'start-music':
        this.record = effect.record;
        this.surface?.underMusic(now);
        this.wantPlaying = true;
        this.sync();
        break;
      case 'lift':
        this.wantPlaying = false;
        this.startedRecord = null;
        this.endSurface(now);
        if (this.audible) needleLift(this.voiceEnv, now);
        this.trace('lift', state.record);
        this.sync();
        break;
      case 'run-out':
        this.wantPlaying = false;
        this.state = 'idle';
        this.surface?.runOut(now);
        this.trace('run-out', state.record);
        break;
      case 'swap':
        this.record = effect.record;
        this.startedRecord = null;
        this.sourceIndex = 0;
        if (this.audible) recordSwap(this.voiceEnv, now);
        this.trace('swap', effect.record);
        break;
      case 'after':
      case 'cancel-timer':
        break;
    }
  }

  private beginSurface(): void {
    if (this.surface) return;
    this.surface = new Surface(this.ctx, this.voiceEnv.noise, this.buffers, this.voiceIn, this.ctx.currentTime, this.rand);
  }

  private endSurface(now: number): void {
    const surface = this.surface;
    if (!surface) return;
    this.surface = null;
    this.retiring.add(surface);
    const gone = surface.end(now, SURFACE_OUT_S);
    this.timers.set(() => {
      surface.dispose();
      this.retiring.delete(surface);
    }, Math.max(0, (gone - now) * 1000) + 50);
  }

  // The record ----------------------------------------------------------------------------------

  /**
   * Bring the element into step with what is wanted: playing when the needle wants a record and the
   * visitor is where it can be heard, paused when not. One place, so rooms, mute and the page's
   * visibility cannot disagree about it.
   */
  private sync(): void {
    if (this.disposed) return;
    if (this.wantPlaying && this.audible) this.ensurePlaying();
    else this.ensureStopped();
  }

  private ensurePlaying(): void {
    this.cancelPause();
    if (this.blocked) return;
    const record = this.options.records[this.record];
    if (!record) return;
    const now = this.ctx.currentTime;

    if (this.startedRecord !== this.record) {
      // A record starts from its first groove, and comes up from silence. If the element was started
      // already, silently, through the lead-in (see `prime`), this is where the music begins.
      this.startedRecord = this.record;
      if (!this.load(record)) {
        this.trace('error', this.record);
        this.options.store.report('failed');
        return;
      }
      try {
        this.element.currentTime = 0;
      } catch {
        // Not loaded enough to seek: it starts from the top anyway.
      }
      riseFromSilence(this.playGain.gain, now, this.firstDone ? PLAY_FADE_IN_S : FIRST_FADE_IN_S);
      this.announcePending = true;
    }
    if (this.state === 'idle') this.begin();
    else if (this.state === 'playing') this.announce(this.record);
  }

  /**
   * Start the element now, while the needle is still on its way down, and keep it silent until the
   * lead-in ends. The needle drops inside the gesture that asked for it (the first unlock, or a
   * press), and a browser decides whether a page may play sound by whether `play()` is called inside a
   * gesture: Safari gives the call only about a second after one, and the lead-in is longer than that.
   * An element that has played once with permission is not asked again, and this one serves every
   * record, so the first `play()` is made here, inside the gesture, with the volume at nothing.
   */
  private prime(): void {
    if (!this.audible || this.blocked || this.state !== 'idle') return;
    const record = this.options.records[this.record];
    if (!record) return;
    if (!this.load(record)) {
      this.trace('error', this.record);
      this.options.store.report('failed');
      return;
    }
    glide(this.playGain.gain, 0, this.ctx.currentTime, 0.005);
    this.begin();
  }

  /** Ask the element to play, and answer what it says. */
  private begin(): void {
    this.state = 'starting';
    this.trace('play', this.record);
    const record = this.record;
    const played = (() => {
      try {
        return Promise.resolve(this.element.play());
      } catch (error) {
        return Promise.reject(error);
      }
    })();
    played.then(
      () => {
        if (this.disposed || this.state !== 'starting') return;
        this.state = 'playing';
        this.announce(record);
      },
      (error: unknown) => {
        if (this.disposed) return;
        this.state = 'idle';
        const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
        // A pause or a new source while it was starting: whatever asked for that decides what happens next.
        if (name === 'AbortError') return;
        if (name === 'NotAllowedError') {
          this.blocked = true;
          // The retry begins the record afresh: it comes up from silence and is announced then.
          this.startedRecord = null;
          this.announcePending = false;
          this.trace('blocked', record);
          return;
        }
        this.onElementError();
      },
    );
  }

  /** A record has begun to sound: tell the captions, once, when it has. */
  private announce(record: number): void {
    if (!this.announcePending) return;
    this.announcePending = false;
    this.firstDone = true;
    this.options.store.announce(record);
  }

  private ensureStopped(): void {
    if (this.state === 'idle' && this.pauseTimer === null) {
      // Nothing playing; a stale pending pause has nothing left to do.
      return;
    }
    const now = this.ctx.currentTime;
    if (!this.wantPlaying) {
      // The needle lifted: the music dies away quickly, then the element is paused.
      glide(this.playGain.gain, 0, now, LIFT_FADE_OUT_S);
      this.pauseAfter((LIFT_FADE_OUT_S + 0.05) * 1000);
    } else if (this.muted || this.away || this.disposed) {
      this.pauseNow();
    } else {
      // Left the corridor: the room fade is already taking it away; pause when it is gone.
      this.pauseAfter((ROOM_FADE_OUT_S + 0.1) * 1000);
    }
  }

  private pauseNow(): void {
    this.cancelPause();
    if (this.state !== 'idle') this.trace('pause', this.record);
    this.state = 'idle';
    this.element.pause();
  }

  private pauseAfter(ms: number): void {
    if (this.pauseTimer !== null) return;
    this.pauseTimer = this.timers.set(() => {
      this.pauseTimer = null;
      this.pauseNow();
    }, ms);
  }

  private cancelPause(): void {
    if (this.pauseTimer !== null) this.timers.clear(this.pauseTimer);
    this.pauseTimer = null;
  }

  /** Point the element at the record's best encoding the browser claims to play. False if there is none. */
  private load(record: RecordInfo): boolean {
    const sources = playableSources(record, (mime) => this.element.canPlayType(mime));
    const source = sources[this.sourceIndex];
    if (!source) return false;
    if (this.loadedUrl !== source.url) {
      this.element.src = source.url;
      this.loadedUrl = source.url;
    }
    return true;
  }

  /** The element could not load or play this encoding: try the next, or give the record up. */
  private onElementError(): void {
    if (this.disposed) return;
    this.state = 'idle';
    this.sourceIndex += 1;
    this.trace('error', this.record);
    const record = this.options.records[this.record];
    if (record && this.wantPlaying && this.load(record)) {
      this.startedRecord = null;
      this.sync();
      return;
    }
    this.options.store.report('failed');
  }

  private trace(type: MusicTraceEvent['type'], record?: number): void {
    this.options.trace?.(record === undefined ? { type, at: this.ctx.currentTime } : { type, at: this.ctx.currentTime, record });
  }

  // Lifecycle -----------------------------------------------------------------------------------

  /** Stop the element and take every node out of the graph. The object is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPause();
    for (const undo of this.unbind) undo();
    this.unbind.length = 0;
    try {
      this.element.pause();
      // Nothing is asked of the network after this: an empty source and a reload cancel any request in flight.
      this.element.removeAttribute('src');
      this.element.load();
    } catch {
      // The element is already gone.
    }
    this.surface?.dispose();
    for (const surface of this.retiring) surface.dispose();
    this.retiring.clear();
    for (const source of this.character.sources) {
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
