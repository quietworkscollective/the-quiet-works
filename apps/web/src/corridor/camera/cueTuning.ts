/**
 * When a cue appears (founder direction, round 4: "visual cues should appear when you find the
 * locations or move to those places"; no floating menus; art consult 6, binding). A door, the notice
 * board or a prop shows its verb only while the visitor is within reach of it AND it is near the
 * centre of the view, once the targeting has been steady for a moment, fading in; and nothing shows
 * otherwise. Every number that decides this is here, in one place, so the art direction can tune
 * them without touching the mechanism (`context.ts`, `cueTracker.ts`, `place.ts`, `cues.css`).
 */
export const CUE_TUNING = {
  /** A thing is within reach nearer than this, in metres along the floor (art consult 6: 2.2 m)... */
  reachM: 2.2,
  /** ...doors and other large destinations (the board, a prop at least `largeMinM` across) from this far (3 m)... */
  reachLargeM: 3.0,
  /** ...inside this half-angle around the view direction (25 degrees), visible on screen and unobstructed. */
  gazeDeg: 25,
  /** Hysteresis, so a label does not flicker at the edge: it is dropped beyond this distance (2.7 m)... */
  leaveReachM: 2.7,
  /** ...(large destinations, the same half metre further: the consult gives only the 2.7 m for small things)... */
  leaveReachLargeM: 3.5,
  /** ...or outside this half-angle (35 degrees)... */
  leaveGazeDeg: 35,
  /** ...or when it has been occluded this long (350 ms). */
  occludedMs: 350,
  /** A prop is a "large destination" when its face is at least this big (the trophy cabinet, 1.45 m). */
  largeMinM: 0.9,
  /** Hand the label to another thing only when it is this many degrees closer to the centre of view. */
  switchGainDeg: 6,
  /** A thing must be the target for this long, unbroken, before its label appears (250 ms)... */
  dwellMs: 250,
  /** ...then fades in over this long (120 ms), and out over the same; under reduced motion it does neither. */
  fadeInMs: 120,
  fadeOutMs: 120,
  /** The label stands this many CSS px beside the projected fitting (16 to 24). */
  labelOffsetPx: 20,
  /** And is set in the condensed grotesk at this size (16 to 18 CSS px), in a 44 px target. */
  labelFontPx: 17,
  labelMinTargetPx: 44,
} as const;

export type CueTuning = typeof CUE_TUNING;
