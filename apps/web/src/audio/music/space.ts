/**
 * Where the gramophone is and how the lobby and corridor carry its sound to the visitor: how loud,
 * how dark, how much of it is the room, and where in the stereo field. Pure arithmetic on two
 * positions, so the fall-off is testable without a graph and the same function serves the audio and
 * the tests that hold it to the brief.
 *
 * The brief: near the gramophone the music sits comfortably under footsteps (about -22 dBFS RMS).
 * A soft diffuse reflection of the same record carries it down the corridor. Air takes the top
 * end off with distance, and the corridor's long room carries the bed.
 */
import { LOBBY } from '../../corridor/layout.ts';
import type { ListenerPose } from './store.ts';

/**
 * The gramophone stands on a small table against the lobby's left wall, on the corridor side of the
 * notice board (the board's edge is at z = 2.58 m), so that it is in the starting view and clear of
 * the 1.5 m route. `x` and `z` are the horn's mouth, where the sound leaves: half a metre out from
 * the wall, which is the plane the prop stands on.
 */
export const GRAMOPHONE = {
  wallX: -LOBBY.width / 2,
  /** Centre of the table along the wall. */
  z: 2.0,
  /** The horn's mouth. */
  mouth: { x: -LOBBY.width / 2 + 0.5, y: 1.22, z: 2.05 },
} as const;

export interface Source {
  readonly x: number;
  readonly z: number;
}

export const GRAMOPHONE_SOURCE: Source = { x: GRAMOPHONE.mouth.x, z: GRAMOPHONE.mouth.z };

/** Within this many metres the music is at its loudest and does not rise any further. */
export const NEAR_M = 1.4;
/** Decibels lost per doubling of distance: a little more than free air, for a long soft room. */
const DB_PER_DOUBLING = 7;
/** The fall-off bends toward this, so it is never silent: the most the music ever loses, in dB. */
const FLOOR_DB = 32;
/** The diffuse record bed begins beyond the gramophone's local listening space. */
export const BED_START_M = 1.6;
export const BED_FULL_M = 3.2;
/** A quiet-passage lift into the corridor bed's level control, followed by soft makeup gain. */
export const BED_DRIVE_DB = 12;
export const BED_THRESHOLD_DB = -26;
export const BED_RATIO = 10;
/** Chromium's automatic makeup at the bed's threshold/ratio, measured from the compressor output. */
export const BED_AUTO_MAKEUP_DB = 12;
export const BED_GAIN = 0.16;
const BED_WET_SHARE = 0.18;
/** A little extra horn presence nearby brings the local record up to the brief's -22 dBFS target. */
const NEAR_BONUS_DB = 3.5;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export interface Mix {
  /** Metres from the horn. */
  readonly distance: number;
  /** Level at this distance relative to standing at the gramophone: 0 near, negative far. */
  readonly gainDb: number;
  /** Linear gain for `gainDb`. */
  readonly gain: number;
  /** The air's low-pass: bright near, dull far. */
  readonly lowpassHz: number;
  /** Linear gain of the direct sound and of the send to the room, equal-power around `gain`. */
  readonly dry: number;
  readonly wet: number;
  /** A steady, filtered reflection of the record through the corridor. */
  readonly bed: number;
  /** A small portion of that reflection sent through the corridor's reverb. */
  readonly bedWet: number;
  /** -1 left to 1 right, as the visitor faces. */
  readonly pan: number;
}

const toGain = (db: number): number => 10 ** (db / 20);

/** The level, in dB below standing at the gramophone, at `distance` metres. Strictly falling beyond `NEAR_M`. */
export function levelDb(distance: number): number {
  const doublings = Math.log2(Math.max(distance, NEAR_M) / NEAR_M);
  // tanh bends the straight 7 dB a doubling toward the floor without ever reaching it.
  return 0 - FLOOR_DB * Math.tanh((DB_PER_DOUBLING * doublings) / FLOOR_DB);
}

/** The listener's position and the horn's, to what reaches the ear. */
export function mixAt(pose: ListenerPose, source: Source = GRAMOPHONE_SOURCE): Mix {
  const dx = source.x - pose.x;
  const dz = source.z - pose.z;
  const distance = Math.hypot(dx, dz);
  const far = 1 - Math.exp(-Math.max(0, distance - NEAR_M) / 8);

  const nearProgress = clamp((distance - NEAR_M) / (BED_START_M - NEAR_M), 0, 1);
  const nearFade = nearProgress * nearProgress * (3 - 2 * nearProgress);
  const gainDb = levelDb(distance) + NEAR_BONUS_DB * (1 - nearFade);
  const gain = toGain(gainDb);
  const bedProgress = clamp((distance - BED_START_M) / (BED_FULL_M - BED_START_M), 0, 1);
  const bedShape = bedProgress * bedProgress * (3 - 2 * bedProgress);
  const bed = BED_GAIN * bedShape;
  // Near: a little of the room. Far: mostly the room.
  const wetShare = 0.12 + 0.5 * far;
  const lowpassHz = 5200 - 2700 * far;

  // Yaw 0 looks down the corridor (toward negative z); positive yaw turns toward +x.
  const yaw = (pose.yawDeg * Math.PI) / 180;
  const ahead = dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const lateral = dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const azimuth = Math.atan2(lateral, ahead);
  // Right at the horn a position has no direction worth panning to.
  const pan = clamp(0.85 * Math.sin(azimuth) * Math.min(1, distance / 0.8), -1, 1);

  return {
    distance,
    gainDb,
    gain,
    lowpassHz,
    dry: gain * Math.sqrt(1 - wetShare),
    wet: gain * Math.sqrt(wetShare),
    bed,
    bedWet: bed * BED_WET_SHARE,
    pan,
  };
}

/** The corridor's parallel record level, including the compressor's measured automatic makeup. */
export function bedLevelDbfs(sourceDbfs: number, mix: Mix): number {
  if (mix.bed <= 0) return Number.NEGATIVE_INFINITY;
  const driven = sourceDbfs + BED_DRIVE_DB;
  const compressed = driven > BED_THRESHOLD_DB
    ? BED_THRESHOLD_DB + (driven - BED_THRESHOLD_DB) / BED_RATIO
    : driven;
  return compressed + BED_AUTO_MAKEUP_DB + 20 * Math.log10(mix.bed);
}

/** Direct horn and diffuse bed, combined as uncorrelated acoustic paths at a modeled source level. */
export function modeledMusicDbfs(sourceDbfs: number, pose: ListenerPose): number {
  const mix = mixAt(pose);
  const direct = sourceDbfs + mix.gainDb;
  const bed = bedLevelDbfs(sourceDbfs, mix);
  const totalPower = 10 ** (direct / 10) + 10 ** (bed / 10);
  return 10 * Math.log10(totalPower);
}
