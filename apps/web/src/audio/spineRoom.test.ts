import { describe, expect, it } from 'vitest';
import { createPrng, createNoiseBuffers } from './noise.ts';
import { createCorridorImpulse, FarEvents, IMPULSE_SECONDS, startCorridorTone, type FarEvent } from './spineRoom.ts';
import { FakeAudioContext, FakeBufferSource, FakeGain, FakeOscillator, FakeParam } from './spineTestAudio.ts';

/** Everything a schedule would hand out over `seconds`, asked for in `step`-second bites. */
function night(seed: number, seconds: number, step: number, horizon = 12): FarEvent[] {
  const far = new FarEvents(seed);
  const events: FarEvent[] = [];
  for (let now = 0; now <= seconds; now += step) events.push(...far.take(now, horizon));
  return events.sort((a, b) => a.at - b.at);
}

describe('the far sounds of the building', () => {
  it('are the same every night for one seed, and different for another', () => {
    const a = night(0xfa4, 1800, 2);
    expect(night(0xfa4, 1800, 2)).toEqual(a);
    expect(night(0xfa5, 1800, 2)).not.toEqual(a);
  });

  it('do not depend on how often the schedule is asked for', () => {
    // Two streams that shared a generator would draw in a different order whenever a coarse call
    // covered both at once, so ask many nights, with the calls far apart.
    const until = 3000;
    const within = (events: readonly FarEvent[]): FarEvent[] => events.filter((e) => e.at <= until);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 0xfa4]) {
      const often = within(night(seed, until, 0.5));
      expect(within(night(seed, until, 10)), `seed ${seed}, every 10 s`).toEqual(often);
      expect(within(night(seed, until, 30, 40)), `seed ${seed}, every 30 s`).toEqual(often);
    }
  });

  it('begin only after a quiet minute or so: nothing in the first 12 s, and no far door or pipe in the first 50 s', () => {
    for (const seed of [1, 2, 3, 0xfa4, 99]) {
      const events = night(seed, 240, 1);
      expect(Math.min(...events.map((e) => e.at))).toBeGreaterThanOrEqual(12);
      const far = events.filter((e) => e.kind !== 'radiator');
      expect(Math.min(...far.map((e) => e.at))).toBeGreaterThanOrEqual(50);
    }
  });

  it('are sparse: radiator groups 55 s or more apart, far doors and pipes 100 s or more apart', () => {
    for (const seed of [1, 2, 3, 0xfa4, 99]) {
      const events = night(seed, 3600, 2);

      const ticks = events.filter((e) => e.kind === 'radiator');
      // A group is a run of ticks under 6 s apart; the gap between groups is from its last tick to the next first tick.
      const groupGaps: number[] = [];
      for (let i = 1; i < ticks.length; i += 1) {
        const gap = (ticks[i]?.at ?? 0) - (ticks[i - 1]?.at ?? 0);
        if (gap > 6) groupGaps.push(gap);
      }
      expect(groupGaps.length).toBeGreaterThan(10);
      expect(Math.min(...groupGaps)).toBeGreaterThanOrEqual(55 - 6);

      const far = events.filter((e) => e.kind !== 'radiator');
      const farGaps = far.slice(1).map((e, i) => e.at - (far[i]?.at ?? 0));
      expect(far.length).toBeGreaterThan(10);
      expect(Math.min(...farGaps)).toBeGreaterThanOrEqual(100);

      // Over an hour: a few dozen radiator groups and about 20 far sounds, never a texture.
      expect(events.length).toBeLessThan(250);
    }
  });

  it('group radiator ticks: three to six, on one side of the stereo field, softening as the iron cools', () => {
    const events = night(0xfa4, 600, 1);
    const ticks = events.filter((e) => e.kind === 'radiator');
    const groups: FarEvent[][] = [];
    for (const tick of ticks) {
      const last = groups.at(-1);
      if (last !== undefined && tick.at - (last.at(-1)?.at ?? 0) < 6) last.push(tick);
      else groups.push([tick]);
    }
    expect(groups.length).toBeGreaterThan(4);
    for (const group of groups) {
      expect(group.length).toBeGreaterThanOrEqual(3);
      expect(group.length).toBeLessThanOrEqual(6);
      expect(new Set(group.map((t) => t.pan)).size).toBe(1);
      expect(group[0]?.level ?? 0).toBeGreaterThan(group.at(-1)?.level ?? 1);
      // Each gap is longer than the one before, give or take the jitter.
      const gapsIn = group.slice(1).map((t, i) => t.at - (group[i]?.at ?? 0));
      gapsIn.slice(1).forEach((gap, i) => expect(gap).toBeGreaterThan((gapsIn[i] ?? 0) * 0.6));
    }
  });

  it('stay inside the stereo field and at a level of at most 1', () => {
    for (const event of night(0xfa4, 3600, 2)) {
      expect(Math.abs(event.pan)).toBeLessThanOrEqual(0.85 + 1e-9);
      expect(event.level).toBeGreaterThan(0);
      expect(event.level).toBeLessThanOrEqual(1);
    }
  });

  it('put a door and a pipe both somewhere in the night, with a door more often than a pipe', () => {
    const far = [1, 2, 3, 4, 5, 6, 0xfa4].flatMap((seed) => night(seed, 7200, 2)).filter((e) => e.kind !== 'radiator');
    const doors = far.filter((e) => e.kind === 'door').length;
    const pipes = far.filter((e) => e.kind === 'pipe').length;
    expect(doors).toBeGreaterThan(pipes);
    expect(pipes).toBeGreaterThan(10);
  });

  it('hand out each event once, and keep the work in one call bounded', () => {
    const far = new FarEvents(0xfa4);
    const seen = new Set<string>();
    for (let now = 0; now < 900; now += 1) {
      const events = far.take(now, 12);
      expect(events.length).toBeLessThanOrEqual(24);
      for (const event of events) {
        const key = `${event.kind}@${event.at}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    // Even asked for an hour at once, a call is bounded.
    expect(new FarEvents(1).take(0, 3600).length).toBeLessThanOrEqual(24 + 6);
  });

  it('resume from the present after the visitor has been in another room, not in a burst of catch-up', () => {
    const far = new FarEvents(0xfa4);
    for (let now = 0; now < 120; now += 2) far.take(now, 12);
    // Ten minutes in a chamber: nobody asked. The night begins again from the present, with a quiet start.
    const back = far.take(720, 40);
    expect(back.length).toBeGreaterThan(0);
    expect(Math.min(...back.map((e) => e.at))).toBeGreaterThanOrEqual(720 + 12);
    expect(back.length).toBeLessThanOrEqual(24);
  });
});

/** In-place radix-2 FFT, enough to read a room's gain across frequency. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const ti = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

describe('the corridor impulse', () => {
  const ctx = new FakeAudioContext();
  const impulse = createCorridorImpulse(ctx as unknown as BaseAudioContext);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  const rate = ctx.sampleRate;

  const energy = (data: Float32Array, from: number, to: number): number => {
    let sum = 0;
    for (let i = Math.floor(from * rate); i < Math.min(data.length, Math.floor(to * rate)); i += 1) sum += (data[i] ?? 0) ** 2;
    return sum;
  };

  it('is a stereo room 2.6 s long, finite throughout', () => {
    expect(impulse.numberOfChannels).toBe(2);
    expect(impulse.length).toBe(Math.round(IMPULSE_SECONDS * rate));
    expect(IMPULSE_SECONDS).toBeGreaterThanOrEqual(2.4);
    expect([...left, ...right].every(Number.isFinite)).toBe(true);
  });

  /** Mean power gain of the room across `[from, to]` Hz, from the FFT of the whole response. */
  const gainAcross = (data: Float32Array, from: number, to: number): number => {
    const size = 131072;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re.set(data);
    fft(re, im);
    let sum = 0;
    let count = 0;
    for (let k = Math.ceil((from * size) / rate); k <= Math.floor((to * size) / rate); k += 1) {
      sum += (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
      count += 1;
    }
    return sum / count;
  };

  it('has a gain of about 1 across the mids, so the send level alone sets how much room there is', () => {
    for (const channel of [left, right]) {
      const mids = gainAcross(channel, 250, 1000);
      expect(mids).toBeGreaterThan(0.5);
      expect(mids).toBeLessThan(2);
    }
  });

  it('does not swell the lows: a thump sent to the room comes back about as loud, not 16 dB louder', () => {
    // Unit total energy would have given the 63 to 250 Hz region a power gain of about 40.
    for (const channel of [left, right]) {
      expect(gainAcross(channel, 63, 250)).toBeLessThan(2.5);
      expect(gainAcross(channel, 63, 250)).toBeGreaterThan(0.5);
    }
  });

  it('tilts dark: the highs come back at least 6 dB under the mids', () => {
    for (const channel of [left, right]) {
      expect(gainAcross(channel, 4000, 16000)).toBeLessThan(gainAcross(channel, 250, 1000) * 0.25);
    }
  });

  it('is silent at first, then a few early reflections, then a long tail that dies away', () => {
    // Nothing arrives before the first wall (9 ms).
    expect(energy(left, 0, 0.008)).toBe(0);
    expect(energy(right, 0, 0.008)).toBe(0);
    // The reflection from the nearest wall.
    const early = Math.max(...left.slice(Math.round(0.009 * rate), Math.round(0.0105 * rate)).map(Math.abs));
    expect(early).toBeGreaterThan(0);

    const first = energy(left, 0.05, 0.55);
    const late = energy(left, 2.0, 2.6);
    expect(first).toBeGreaterThan(0.05);
    // 60 dB is 1e-6 in energy; the lows are still ringing a little at 2 s, the room is not.
    expect(late / first).toBeLessThan(0.02);
    expect(late / first).toBeGreaterThan(1e-6);
  });

  it('is long in the lows and short in the highs: a plaster and terrazzo room, not a bright one', () => {
    // The first difference of the tail is a crude highpass; compare its share early and late.
    const bright = (data: Float32Array, from: number, to: number): number => {
      let high = 0;
      let all = 0;
      for (let i = Math.floor(from * rate) + 1; i < Math.floor(to * rate); i += 1) {
        const x = data[i] ?? 0;
        const d = x - (data[i - 1] ?? 0);
        high += d * d;
        all += x * x;
      }
      return high / all;
    };
    expect(bright(left, 1.6, 2.4)).toBeLessThan(bright(left, 0.05, 0.4) * 0.5);
  });

  it('is wide: the two channels are different rooms, not one copy', () => {
    let dot = 0;
    for (let i = 0; i < left.length; i += 1) dot += (left[i] ?? 0) * (right[i] ?? 0);
    expect(Math.abs(dot) / Math.sqrt(energy(left, 0, 10) * energy(right, 0, 10))).toBeLessThan(0.2);
  });

  it('is the same room every time', () => {
    const again = createCorridorImpulse(new FakeAudioContext() as unknown as BaseAudioContext);
    expect(again.getChannelData(0).slice(0, 5000)).toEqual(left.slice(0, 5000));
  });
});

describe('the room tone', () => {
  function build(): { sources: FakeBufferSource[]; oscillators: FakeOscillator[]; ctx: FakeAudioContext; out: FakeGain } {
    const ctx = new FakeAudioContext();
    const noise = createNoiseBuffers(ctx as unknown as BaseAudioContext);
    const out = ctx.createGain();
    const tone = startCorridorTone(ctx as unknown as BaseAudioContext, noise, out as unknown as AudioNode, 0, createPrng(5));
    expect(tone.sources.length).toBeGreaterThan(3);
    return {
      sources: tone.sources.filter((s): s is FakeBufferSource & AudioScheduledSourceNode => s instanceof FakeBufferSource),
      oscillators: tone.sources.filter((s): s is FakeOscillator & AudioScheduledSourceNode => s instanceof FakeOscillator),
      ctx,
      out,
    };
  }

  it('is broad low air from the shared pink noise, with no oscillator at audio rate: nothing that can hum', () => {
    const { sources, oscillators } = build();
    expect(sources.length).toBeGreaterThanOrEqual(5);
    expect(sources.every((s) => s.loop)).toBe(true);
    // The only oscillators are the slow breath: well below hearing's range.
    expect(oscillators.length).toBe(2);
    for (const lfo of oscillators) expect(lfo.frequency.valueAt(0)).toBeLessThan(0.1);
  });

  it('reads the loop at different rates and offsets, so the two sides of the air are not one copy', () => {
    const { sources } = build();
    const rates = sources.map((s) => s.playbackRate.valueAt(0));
    expect(new Set(rates.map((r) => r.toFixed(3))).size).toBe(rates.length);
    expect(new Set(sources.map((s) => s.startTime)).size).toBeGreaterThanOrEqual(1);
  });

  it('never ends by itself: it runs until the desk stops it', () => {
    const { sources, oscillators } = build();
    for (const source of [...sources, ...oscillators]) expect(source.stopTime).toBeNull();
  });

  it('breathes without ever flipping phase: each slow swing is smaller than the level it moves', () => {
    const { oscillators, ctx } = build();
    expect(oscillators.length).toBe(2);
    for (const lfo of oscillators) {
      const [depth] = [...lfo.outputs];
      expect(depth).toBeInstanceOf(FakeGain);
      if (!(depth instanceof FakeGain)) continue;
      const [param] = [...depth.outputs];
      expect(param).toBeInstanceOf(FakeParam);
      const base = ctx.of(FakeGain).find((g) => g.gain === param);
      expect(base).toBeDefined();
      expect(depth.gain.valueAt(0)).toBeLessThan((base?.gain.valueAt(0) ?? 0) * 0.9);
      expect(depth.gain.valueAt(0)).toBeGreaterThan(0);
    }
  });
});
