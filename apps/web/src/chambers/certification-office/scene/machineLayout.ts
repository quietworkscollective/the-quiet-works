/**
 * The Certification machine's dimensions, shared by the body, the receipt, the spilled receipts
 * and the memo so their coordinates agree. Machine-local metres: x right, y up from the desk,
 * +z out of the front face. The face is at z = 0.19.
 */
export const MACHINE = {
  width: 0.7,
  height: 0.46,
  depth: 0.38,
  faceZ: 0.19,
  /** Body spans y = 0.015 (on its feet) to 0.475. */
  bodyBottom: 0.015,
  bodyTop: 0.475,

  display: { y: 0.377, openW: 0.6, openH: 0.13, frameW: 0.64, frameH: 0.17, planeW: 0.56, planeH: 0.1 },

  slot: { x: -0.12, y: 0.272, w: 0.22, h: 0.01 },
  lamps: { y: 0.272, xs: [0.1, 0.138, 0.176] as const, radius: 0.0065 },

  hatch: {
    w: 0.5,
    h: 0.19,
    thickness: 0.01,
    hingeY: 0.042,
    hingeZ: 0.196,
    /** Open angle: just past horizontal, like a drawbridge settling on its chains. */
    openRad: (100 * Math.PI) / 180,
  },

  bell: { x: 0.2, z: -0.02 },

  /** Where the memo comes to rest, machine-local: in front of the machine, toward the camera's right. */
  memoRest: { x: 0.31, z: 0.62, yaw: 0.28 },
} as const;

/**
 * The opened hatch is a ramp: its upward face runs from the hinge, sloping down 10 degrees to
 * the desk. These are the ramp's endpoints in machine-local (z, y) and its slope dy/dz.
 */
export const RAMP = (() => {
  const { openRad, thickness, hingeY, hingeZ, h } = MACHINE.hatch;
  const half = thickness / 2;
  const z0 = hingeZ - half * Math.cos(openRad);
  const y0 = hingeY + half * Math.sin(openRad);
  return {
    z0,
    y0,
    z1: z0 + h * Math.sin(openRad),
    slope: Math.cos(openRad) / Math.sin(openRad),
  };
})();

/** Height of the surface under the memo at machine-local depth z: the ramp, or the desk past it. */
export function ramp(z: number): number {
  if (z <= RAMP.z0) return RAMP.y0;
  if (z <= RAMP.z1) return RAMP.y0 + RAMP.slope * (z - RAMP.z0);
  return 0;
}
