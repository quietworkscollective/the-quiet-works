/** The form has room for twelve imprints; later stamps keep landing on the last one. */
export const MAX_IMPRINTS = 12;

export interface ImprintPose {
  /** Rotation in degrees. Never close to level: a rubber stamp is never pressed true. */
  tilt: number;
  /** Offset from the centre of the imprint's cell, in px. */
  dx: number;
  dy: number;
}

/** Integer hash to [0, 1). Pure arithmetic, so a given index looks the same on every device. */
function unit(index: number, salt: number): number {
  let h = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 2 ** 32;
}

/** Where and how the `index`th imprint lies. Deterministic: same index, same pose. */
export function imprintPose(index: number): ImprintPose {
  const raw = (unit(index, 1) - 0.5) * 14;
  const tilt = Math.abs(raw) < 1.5 ? Math.sign(raw || 1) * 1.5 : raw;
  return {
    tilt: Math.round(tilt * 10) / 10,
    dx: Math.round((unit(index, 2) - 0.5) * 12),
    dy: Math.round((unit(index, 3) - 0.5) * 10),
  };
}
