/**
 * Shared presentation timing. The scene animates and the sound desk schedules against the
 * same numbers, so a stamp's thud lands on the frame the rubber meets the paper.
 *
 * Rule for both consumers: a 'contact' cue at time T means the stamp starts falling at T and
 * touches the paper at T + descendMs. A 'lift' cue at time R starts the lift at
 * max(R, T + descendMs + minDwellMs), so a quick tap still shows a complete strike.
 */
export const TIMING = {
  /** Fall from rest to paper. Ease-in: the hand accelerates into the strike. */
  descendMs: 90,
  /** Shortest time the rubber stays on the paper, even for the fastest tap. */
  minDwellMs: 70,
  /** Spring return from paper to rest. */
  liftMs: 480,
  /** Time to reach full compression while held. */
  compressMs: 650,
  /** Delay from lift to the machine starting to print its reply. */
  replyDelayMs: 360,
  /** Printer chatter and receipt feed duration. */
  printMs: 700,
  /**
   * The fifth-stamp overload sequence, from the printer starting (lift + replyDelayMs) to the
   * hatch landing open. Canonical choreography, as offsets from that printer start S:
   *   S + printMs (700)          display stutter; Bell of Approval rings, whine rises
   *   S + printMs + bellRingMs   bell and whine cut dead; near-silence
   *   S + overloadMs − overloadLatchLeadMs   latch lets go; hatch hangs, then falls
   *   S + overloadMs (2200)      hatch lands open (thump + clangs); interior light rises
   *   S + overloadMs + memoAfterLandMs   memo starts sliding out, for memoSlideMs
   * The sound desk schedules exactly these; the scene must land the hatch on the same frame.
   */
  overloadMs: 2200,
  /** The Bell of Approval rings from the printer finishing until it is cut dead. */
  bellRingMs: 700,
  /**
   * The latch lets go this long before the hatch lands: a mechanical hesitation (200–300 ms,
   * owned by the scene), then a weighted fall (400–600 ms). Latch clack at
   * S + overloadMs − overloadLatchLeadMs; landing at S + overloadMs.
   */
  overloadLatchLeadMs: 700,
  /** The memo starts sliding out this long after the hatch lands: reveal, beat, invitation. */
  memoAfterLandMs: 350,
  /** Memo sliding out of the open hatch onto the desk. */
  memoSlideMs: 1100,
} as const;

/**
 * Spine choreography (ADR 0001): the landing walk, corridor movement and door thresholds. The
 * corridor scene animates and the sound desk schedules against these same numbers.
 *
 * Door opening, as offsets from the 'door-open' cue at D:
 *   D                                handle starts turning (handleTurnMs)
 *   D + handleTurnMs                 latch releases (latchMs)
 *   D + handleTurnMs + latchMs       door swings swingDeg over swingMs
 *   D + handleTurnMs + latchMs + entryDelayMs   camera advances entryAdvanceM over entryMs
 *   end of the advance               the seam: the chamber shows behind the jamb (seamMs)
 */
export const SPINE_TIMING = {
  /** Landing: viewport heights of native scroll that walk the camera entranceDistanceM. */
  entranceViewports: 2.5,
  entranceDistanceM: 5,
  /** Scroll input is smoothed by at most this; there is no automatic travel. */
  scrollSmoothingMs: 120,

  walkMps: 1.1,
  glideMps: 0.8,
  accelerateMs: 300,
  stopMs: 180,
  /** Turning with keys (A/D, left/right). */
  turnDegPerS: 75,

  /** Selecting a door glides to this distance in front of it, framing by at most focusMaxDeg. */
  focusDistanceM: 1.4,
  focusFramingMs: 350,
  focusMaxDeg: 12,

  handleTurnMs: 140,
  handleTurnDeg: 25,
  latchMs: 80,
  swingMs: 800,
  swingDeg: 82,
  /** The camera starts walking through once the door is this far into its swing. */
  entryDelayMs: 300,
  entryAdvanceM: 1.6,
  entryMs: 1400,
  /** Chamber and corridor overlap behind the jamb for at most this long. */
  seamMs: 400,
  /** Leaving: the door closes in front of the visitor. */
  closeMs: 600,
  /** Reduced motion replaces travel and swings with a dissolve. */
  dissolveMs: 120,
  /** A sealed door's handle rattle. */
  rattleMs: 420,
} as const;

/** Movement easing shared by the corridor camera: cubic-bezier(0.22, 0.61, 0.36, 1). */
export const WALK_EASING = [0.22, 0.61, 0.36, 1] as const;
/** Door swing easing: cubic-bezier(0.4, 0, 0.2, 1). */
export const SWING_EASING = [0.4, 0, 0.2, 1] as const;

/**
 * The page scroll from the hero's top to the game window's top (ADR 0003; art consult 4).
 * `progress` (corridor/progress.ts) runs 0..1 over `runViewports` viewport heights. The DOM lane
 * writes it and draws the veil; the camera lane reads it.
 */
export const SITE_SCROLL = {
  runViewports: 2.5,
  /** The walk-in reaches HANDOVER here: ENTRANCE_KEYS are read at t = min(1, progress / handoverAt). */
  handoverAt: 0.65,
  /** The hero's ambient drift blends back to the authored walk-in pose over 0..driftBlendOut. */
  driftBlendOut: 0.1,
  /** The hero's ambient drift: one shallow lateral arc, no forward creep, no vertical, no roll. */
  ambient: { lateralM: 0.04, periodS: 40, yawDeg: 0.3 },
  /** Smoke veil coverage (0..1) at progress keyframes, linearly interpolated. */
  veil: [
    [0, 0],
    [0.2, 0.15],
    [0.55, 0.85],
    [0.65, 1],
    [0.8, 1],
    [1, 0],
  ] as const,
  /** "Loading" appears only if the game is still not ready this long after the veil is full. */
  loadingDelayMs: 300,
  /** Leaving the resting state: the scrim fades with WALK_EASING over this long. */
  engageMs: 180,
  /** Mobile: a gesture travels this far before it is read as a scroll, walk or look. */
  gestureThresholdPx: 12,
} as const;
