/**
 * Things to touch in the lobby and corridor (ADR 0004). Each prop is anchored in a bay (or the
 * lobby) on a wall; the props lane may adjust `along` and `height` by up to 0.5 m after checking
 * real frames, keeping a 1.5 m clear walking route. Verbs and labels live in siteCopy
 * (CORRIDOR_PROPS) and are drafts for editorial review.
 */
export type PropId =
  | 'trophy-cabinet'
  | 'team-photo'
  | 'watering-can'
  | 'football'
  | 'cricket-bat'
  | 'team-shirts'
  | 'walking-boots'
  | 'repair-kit'
  | 'bicycle-wheel'
  | 'recipe-drawer'
  | 'chess'
  | 'work-glove';

export type PropAction = 'inspect' | 'read' | 'open' | 'turn' | 'tilt' | 'move';

export interface PropSpec {
  id: PropId;
  /** 'lobby', or a corridor bay index (0 is nearest the inner doors). */
  bay: 'lobby' | number;
  side: 'left' | 'right';
  /** Metres along the corridor from the bay centre (lobby: from LOBBY's mid-depth), + toward the entrance. */
  along: number;
  /** Centre height above the floor, metres; 0 means standing on the floor against the wall. */
  height: number;
  /** Approximate size: width × height × depth, metres. */
  size: readonly [number, number, number];
  action: PropAction;
  /** Competition, care, play or making: the set keeps competition to about a third. */
  register: 'competition' | 'care' | 'play' | 'making';
}

export const PROPS: readonly PropSpec[] = [
  { id: 'trophy-cabinet', bay: 'lobby', side: 'right', along: -0.6, height: 0.725, size: [1.0, 1.45, 0.28], action: 'open', register: 'competition' },
  { id: 'team-photo', bay: 'lobby', side: 'right', along: 0.9, height: 1.55, size: [0.42, 0.3, 0.03], action: 'read', register: 'competition' },
  { id: 'watering-can', bay: 'lobby', side: 'left', along: 1.6, height: 0, size: [0.3, 0.3, 0.18], action: 'tilt', register: 'care' },
  { id: 'football', bay: 1, side: 'left', along: 1.3, height: 1.1, size: [0.22, 0.22, 0.22], action: 'turn', register: 'play' },
  { id: 'cricket-bat', bay: 1, side: 'left', along: -1.3, height: 0.6, size: [0.11, 0.85, 0.06], action: 'turn', register: 'competition' },
  { id: 'team-shirts', bay: 'lobby', side: 'right', along: -0.6, height: 0.18, size: [0.35, 0.12, 0.3], action: 'inspect', register: 'competition' },
  { id: 'walking-boots', bay: 3, side: 'right', along: 1.4, height: 0, size: [0.35, 0.3, 0.4], action: 'inspect', register: 'care' },
  { id: 'repair-kit', bay: 3, side: 'right', along: -1.2, height: 0.85, size: [0.65, 0.12, 0.3], action: 'open', register: 'making' },
  { id: 'bicycle-wheel', bay: 3, side: 'left', along: -1.4, height: 1.5, size: [0.68, 0.68, 0.05], action: 'turn', register: 'play' },
  { id: 'recipe-drawer', bay: 5, side: 'left', along: 1.3, height: 1.2, size: [0.45, 0.35, 0.16], action: 'read', register: 'care' },
  { id: 'chess', bay: 5, side: 'left', along: -1.3, height: 0.95, size: [0.32, 0.08, 0.32], action: 'move', register: 'play' },
  { id: 'work-glove', bay: 5, side: 'right', along: 1.3, height: 1.25, size: [0.25, 0.12, 0.05], action: 'inspect', register: 'making' },
];

/** Per-frame prop state, written by the camera/interaction lane, read by the props lane. */
export interface PropMotion {
  /** 0..1: hover or focus emphasis on the prop's ivory fitting. */
  attention: number;
  /** 0..1: the prop's own action in progress (a drawer opening, a wheel spinning down). */
  action: number;
  /** 0..1: a rare idle highlight on the fitting (at most ~8% local brightness). */
  glint: number;
}

export type PropAnimation = Record<PropId, PropMotion>;

export function createPropAnimation(): PropAnimation {
  return Object.fromEntries(PROPS.map((p) => [p.id, { attention: 0, action: 0, glint: 0 }])) as PropAnimation;
}
