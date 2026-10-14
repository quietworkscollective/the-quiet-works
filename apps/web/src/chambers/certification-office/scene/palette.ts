/**
 * Colours and surface constants for the Certification Office (blueprint §6).
 * Colour is semantic here: teal is the institution and its ink, amber is approval and the lamp,
 * coral is held back entirely for this room.
 */
export const PALETTE = {
  coal: '#151A20',
  bone: '#DDD5C8',
  teal: '#3C7775',
  amber: '#D59B4A',
  coral: '#D78D79',
  dawn: '#B8C6A4',

  brass: '#B08A4E',
  linoleum: '#2A3130',
  steelFrame: '#1E2326',
  floor: '#1A1E22',
  wood: '#5A3A22',
  lacquer: '#7A4A26',
  rubber: '#2B1A17',
  ink: '#24504E',
  lampWarm: '#FFD7A0',
  hemiSky: '#2A3A40',
  hemiGround: '#0B0D10',
  rim: '#5E8C8A',
  displayBg: '#120D07',
  paperInk: '#2D2A26',
} as const;

/** Desk-local layout in metres. The desk top surface is y = 0 and +z points toward the camera. */
export const LAYOUT = {
  desk: { width: 2.2, depth: 1.1, thickness: 0.05 },
  floorY: -0.76,
  press: { x: -0.16, z: 0.14, yaw: 0.06 },
  machine: { x: 0.46, z: -0.3, yaw: -0.22 },
  lamp: { x: -0.78, z: -0.34 },
  lookAt: { x: 0.08, y: 0.06, z: -0.06 },
} as const;

/** The form sits on the platen; its top surface height above the desk. */
export const PAPER_TOP = 0.0115;
/** Rubber underside height above the paper while the stamp rests. */
export const REST_HEIGHT = 0.065;
