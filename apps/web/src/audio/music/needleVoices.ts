/**
 * The small mechanical sounds of the gramophone: the needle meeting the record, leaving it, and a
 * record being changed. Same craft as `voices.ts` (each function schedules one sound at an absolute
 * `AudioContext` time, every source has a stop time, the graph disconnects itself when its last
 * source ends), and they go in through the shared `Shot`.
 *
 * Levels are linear peaks at the gramophone's own bus, before the distance, the room and the master:
 * the loudest of them sits well under the music's peaks, so a needle never startles. Nothing here
 * is a click track or a bell; they are the sounds of a light arm and shellac.
 */
import { FLOOR, shot, type VoiceEnv } from '../voices.ts';
import { NEEDLE_TRAVEL_S } from './needle.ts';

export const NEEDLE_LEVEL = {
  /** The arm's weight meeting the disc. */
  dropThump: 0.09,
  dropTick: 0.05,
  dropScuff: 0.02,
  /** The needle leaving: a tick and a small scrape of the groove. */
  liftTick: 0.04,
  liftScrape: 0.016,
  /** The arm settling on its rest: a tiny metal tink. */
  liftTink: 0.012,
  /** A record changed: the old one slid off, the new one seated on the spindle. */
  swapSlide: 0.03,
  swapSeat: 0.07,
} as const;

/** Near-instant attack, exponential fall to the floor. */
function burst(param: AudioParam, when: number, peak: number, decay: number, attack = 0.002): void {
  param.setValueAtTime(FLOOR, when);
  param.linearRampToValueAtTime(peak, when + attack);
  param.exponentialRampToValueAtTime(FLOOR, when + attack + decay);
}

/** Rise to `peak` over `rise`, then fall to the floor by `total`. */
function swell(param: AudioParam, when: number, peak: number, rise: number, total: number): void {
  param.setValueAtTime(FLOOR, when);
  param.exponentialRampToValueAtTime(peak, when + rise);
  param.exponentialRampToValueAtTime(FLOOR, when + total);
}

/**
 * The needle lands: a soft weight, a faint tick, and a breath of scuff as it settles into the groove.
 * `when` is the moment it lands, which is the arm's journey after the verb.
 */
export function needleDrop(env: VoiceEnv, when: number): void {
  const s = shot(env);

  const thump = s.osc('sine', 95, when, when + 0.3);
  thump.frequency.setValueAtTime(95, when);
  thump.frequency.exponentialRampToValueAtTime(52, when + 0.08);
  const thumpAmp = s.gain(0);
  burst(thumpAmp.gain, when, NEEDLE_LEVEL.dropThump, 0.16, 0.004);
  s.chain(thump, thumpAmp);
  s.toOut(thumpAmp);

  const tick = s.noise('white', when, when + 0.03);
  const tickAmp = s.gain(0);
  burst(tickAmp.gain, when, NEEDLE_LEVEL.dropTick, 0.008, 0.0008);
  s.chain(tick, s.filter('highpass', 1800, 0.7), tickAmp);
  s.toOut(tickAmp);

  const scuff = s.noise('white', when + 0.01, when + 0.2);
  const band = s.filter('bandpass', 2600, 1.2);
  const scuffAmp = s.gain(0);
  swell(scuffAmp.gain, when + 0.01, NEEDLE_LEVEL.dropScuff, 0.03, 0.18);
  s.chain(scuff, band, scuffAmp);
  s.toOut(scuffAmp);
}

/**
 * The needle lifts: a tick as it leaves the groove and a small scrape at once, and the arm's tink as
 * it settles on its rest when its journey ends (`NEEDLE_TRAVEL_S` later).
 */
export function needleLift(env: VoiceEnv, when: number): void {
  const s = shot(env);

  const tick = s.noise('white', when, when + 0.03);
  const tickAmp = s.gain(0);
  burst(tickAmp.gain, when, NEEDLE_LEVEL.liftTick, 0.01, 0.0008);
  s.chain(tick, s.filter('bandpass', 2400, 1.5), tickAmp);
  s.toOut(tickAmp);

  const scrape = s.noise('white', when + 0.005, when + 0.16);
  const band = s.filter('bandpass', 1700, 1.4);
  band.frequency.setValueAtTime(1700, when);
  band.frequency.linearRampToValueAtTime(3100, when + 0.14);
  const scrapeAmp = s.gain(0);
  swell(scrapeAmp.gain, when + 0.005, NEEDLE_LEVEL.liftScrape, 0.025, 0.14);
  s.chain(scrape, band, scrapeAmp);
  s.toOut(scrapeAmp);

  // The rest is brass and a little ring.
  const tinkAt = when + NEEDLE_TRAVEL_S;
  const tink = s.osc('sine', 1650, tinkAt, tinkAt + 0.12);
  const tinkAmp = s.gain(0);
  burst(tinkAmp.gain, tinkAt, NEEDLE_LEVEL.liftTink, 0.07, 0.001);
  s.chain(tink, tinkAmp);
  s.toOut(tinkAmp);
}

/** A record changed: the old one slides off the platter, and the new one settles onto the spindle. */
export function recordSwap(env: VoiceEnv, when: number): void {
  const s = shot(env);

  const slide = s.noise('white', when, when + 0.34);
  const band = s.filter('bandpass', 1300, 0.9);
  band.frequency.setValueAtTime(1300, when);
  band.frequency.linearRampToValueAtTime(2100, when + 0.3);
  const slideAmp = s.gain(0);
  swell(slideAmp.gain, when, NEEDLE_LEVEL.swapSlide, 0.1, 0.3);
  s.chain(slide, band, slideAmp);
  s.toOut(slideAmp);

  const seatAt = when + 0.46;
  const seat = s.osc('sine', 120, seatAt, seatAt + 0.2);
  seat.frequency.setValueAtTime(120, seatAt);
  seat.frequency.exponentialRampToValueAtTime(66, seatAt + 0.07);
  const seatAmp = s.gain(0);
  burst(seatAmp.gain, seatAt, NEEDLE_LEVEL.swapSeat, 0.1, 0.003);
  s.chain(seat, seatAmp);
  s.toOut(seatAmp);
}
