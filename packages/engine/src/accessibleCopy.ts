/**
 * Copy for the non-visual and text-mode paths: sound captions and the text-mode scene.
 * Fictional, institutional, dry. Subject to founder editorial review.
 */
import type { Cue } from './certification.ts';

/** One caption per cue type that makes a sound. `null` means the cue is silent. */
export const CAPTIONS: Readonly<Record<Cue['type'], string | null>> = {
  object: null,
  contact: '[rubber stamp hits paper with a thud]',
  lift: '[stamp lifts off with a soft peel]',
  reply: '[paper feeds; relay clicks; weight settles]',
  overload: '[motor stops; hatch unlatches; loose paper falls]',
  stillness: '[a slow hiss, then quiet]',
  'memo-revealed': '[paper slides out of the hatch]',
  'memo-opened': null,
  'memo-closed': null,
  reset: '[a fresh form feeds in, rollers whirring]',
};

/** The later replies make less certain material sounds. */
export const CAPTION_REPLY_SAGGING = '[carbon rasps; feed ticks hesitate; relay clicks]';

/** The text-mode description of the room, shown above the controls. 2–3 short paragraphs. */
export const TEXT_MODE_SCENE: readonly string[] = [
  'One lamp makes a pool of light on an industrial desk. Past its edge, the office runs on, too large to see the end of. A paper stack climbs out of the dark, taller than paper has any business being.',
  'Across the floor, a clerk\'s window is still lit, with no one behind it. On the desk, a form sits under a brass press that holds a wooden-handled rubber stamp, beside a teal machine with an amber display.',
];

/** Notices shown at the top of text mode, keyed by why text mode is active. */
export const TEXT_MODE_NOTICE = {
  chosen: 'Text mode. The whole office is written out here.',
  unsupported: 'The 3D view is not available here. Nothing is lost; the full office is here, in text.',
  contextLost: 'The 3D view has stopped responding. Nothing is lost; the full office is here, in text.',
} as const;

/** Material actions are also readable with sound off or WebGL unavailable. Draft for editorial review. */
export const OFFICE_PAPER_BEATS = [
  'The application waits beneath the brass press.',
  'The press leaves one HELD impression. The machine holds approval and prints an inspection route.',
] as const;

export { OFFICE_PRESS_TIMING } from './office/beats.ts';
