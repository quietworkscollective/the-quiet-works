export const OFFICE_PRESS_TIMING = { contactMs: 180, returnMs: 240, compressionMs: 1200 } as const;

/** Finite presentation only: the certification state machine remains the validity owner. */
export type ImpressionPosition = 'left' | 'centre' | 'right';
export const SPILL_STEPS = [4, 3, 2] as const;
const DURATIONS = [0, 1100, 1400, 2000, 2200, 3000, 800, 900, 1000] as const;
const KINDS = ['idle', 'receive', 'expire', 'witness', 'fold', 'authority', 'shuffle', 'curl', 'slip'] as const;
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const ease = (n: number): number => { const t = clamp(n); return t * t * (3 - 2 * t); };
const index = (step: number): number => step <= 5 ? Math.max(0, Math.floor(step)) : 6 + ((Math.floor(step) - 6) % 3);
export const beatDuration = (step: number): number => DURATIONS[index(step)] ?? 0;
export const beatKind = (step: number): string => KINDS[index(step)] ?? 'idle';

export interface PaperPose {
  travel: number;
  overlay: number;
  expired: boolean;
  duplicate: number;
  unsigned: boolean;
  folds: number;
  drape: number;
  rearRelease: number;
  shuffle: number;
  curl: number;
  active: boolean;
}

export function beatAt(step: number, elapsed: number, reduced = false): PaperPose {
  const i = index(step);
  const duration = beatDuration(step);
  const t = reduced ? duration : Math.max(0, Math.min(duration, elapsed));
  const pose: PaperPose = {
    travel: 0, overlay: i === 2 ? 0.32 : 0, expired: false,
    duplicate: 0, unsigned: true, folds: i === 4 ? 5 : 0, drape: 0,
    rearRelease: i > 5 ? 1 : 0, shuffle: 0, curl: 0,
    active: duration > 0 && (reduced ? elapsed < 120 : elapsed < duration),
  };
  switch (i) {
    case 1:
      pose.travel = 0.35 * (ease(t / 450) - ease((t - 650) / 450));
      break;
    case 2:
      pose.travel = 0.35 * (ease(t / 450) - ease((t - 750) / 650));
      pose.expired = t >= 750;
      break;
    case 3:
      pose.duplicate = ease((t - 200) / 650) - ease((t - 1450) / 550);
      break;
    case 4:
      pose.folds = 5 + ease(t / 1800);
      pose.drape = 0.32 * ease((t - 1400) / 800);
      break;
    case 5:
      pose.travel = 0.35 * ease(t / 450);
      pose.rearRelease = ease((t - 1500) / 500);
      break;
    case 6:
      pose.shuffle = 0.04 * Math.sin(Math.PI * t / duration);
      break;
    case 7:
      pose.curl = 0.025 * Math.sin(Math.PI * t / duration);
      break;
    case 8:
      pose.travel = 0.045 * Math.sin(Math.PI * t / duration);
      break;
  }
  // Exact resting poses avoid tiny residuals that would keep demand frames alive.
  if (t === duration && i > 5) pose.travel = pose.shuffle = pose.curl = 0;
  return pose;
}

export function pressAt(elapsed: number, hold: number): { travel: number; compression: number } {
  const takeup = 0.045 * ease(elapsed / 100);
  const compressionTravel = 0.020 * ease((elapsed - 100) / 80);
  return { travel: takeup + compressionTravel, compression: clamp((hold - 150) / 1050) };
}

export function impression(position: ImpressionPosition, fresh: boolean, hold: number) {
  const compression = pressAt(180, hold).compression;
  return {
    offset: position === 'left' ? -0.055 : position === 'right' ? 0.055 : 0,
    spread: 1 + 0.09 * compression,
    opacity: fresh ? 1 : 0.72,
    valid: true,
  };
}
