/** Shared timing and geometry contract for fitting-adjacent cues. Walking distances are horizontal metres; view angles include pitch. */
export const CONTEXTUAL_CUES = Object.freeze({
  enterDistance: 2.2, enterHalfAngle: 25, leaveDistance: 2.7, leaveHalfAngle: 35,
  appearMs: 250, fadeMs: 120, occludedMs: 350, offsetPx: 20, labelPx: 17, targetPx: 44,
});
