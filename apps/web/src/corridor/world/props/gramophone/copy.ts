/**
 * What the gramophone says, as words: the verbs on its cues and controls, and its text reading for
 * screen readers and text mode. These are drafts for the clarity and editorial pass (the lead owns
 * `CORRIDOR_PROPS`, which has no entry for this prop); keep them short, plain and unadorned. The
 * captions for the music itself are in `audio/music/catalogue.ts`.
 */
export const GRAMOPHONE_COPY = {
  /** What a screen reader finds first. */
  name: 'A gramophone',
  /** The group of its controls. */
  group: 'The gramophone',
  /** The three verbs. */
  verbs: {
    play: 'Play',
    lift: 'Lift the needle',
    change: 'Change the record',
  },
  /** Said when the Sound setting is off: the needle and the platter still work, silently. */
  soundOff: 'The sound is off.',
} as const;
