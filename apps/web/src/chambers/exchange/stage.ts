/**
 * The room's fixed stage: three stations, five framed views, and nothing a visitor can steer.
 * Set coordinates are the script's Blender metres (x right, y toward the board, z up); poses here
 * are already in stage space, where stage z is minus Blender y.
 */

export type ExchangeStationId = 'board' | 'desk-underside' | 'ticket-shelf';
export type ExchangeViewId = 'wide' | 'jacks' | 'desk-top' | 'kneehole' | 'shelf';
export type StagePoint = readonly [x: number, y: number, z: number];

export type ExchangeLineHotspot = `line-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;
export type ExchangeHotspot =
  | 'sign' | 'desk-lamp' | 'clerestory' | 'cord' | 'plate' | 'socket' | 'lead' | 'docket' | 'ticket-lip'
  | 'drawer' | 'form' | 'rota' | 'index' | 'telephone' | 'rulebook' | 'bell' | 'flask' | 'cardigan'
  | 'diagram' | 'plug' | 'lever' | 'door' | ExchangeLineHotspot;

export interface ExchangeView {
  readonly id: ExchangeViewId;
  readonly station: ExchangeStationId;
  readonly position: StagePoint;
  readonly target: StagePoint;
}

export interface CameraPose {
  readonly position: StagePoint;
  readonly target: StagePoint;
}

/** Script coordinates to stage coordinates. */
export function fromSet(x: number, y: number, z: number): StagePoint {
  return [x, z, -y];
}

const radians = (degrees: number) => degrees * Math.PI / 180;

function aimed(id: ExchangeViewId, station: ExchangeStationId, eye: StagePoint, target: StagePoint): ExchangeView {
  return { id, station, position: fromSet(...eye), target: fromSet(...target) };
}

export const EXCHANGE_VIEWS: Readonly<Record<ExchangeViewId, ExchangeView>> = {
  wide: aimed('wide', 'board', [-0.10, 1.60, 1.62], [-0.10, 1.60 + Math.cos(radians(10)), 1.62 + Math.sin(radians(10))]),
  // Held back from the board so the open drawer stays in frame; half a degree up clears the top lamps.
  jacks: aimed('jacks', 'board', [0, 5.20, 2.00], [0, 6.20, 2.00 + Math.tan(radians(0.5))]),
  // Aimed slightly further back than the desk's centre so the sheave on the cord post stays in frame.
  'desk-top': aimed('desk-top', 'board', [0.10, 4.35, 1.85], [0.10, 5.42, 1.10]),
  kneehole: aimed('kneehole', 'desk-underside', [0.30, 4.72, 0.42], [0.30, 5.75, 0.38]),
  shelf: aimed('shelf', 'ticket-shelf', [-1.15, 7.35, 1.35], [-1.15, 8.50, 0.98]),
};

export const EXCHANGE_STAGE = {
  width: 4.2,
  depth: 9,
  height: 12.6,
  stations: [
    { id: 'board', title: 'Board', view: 'wide' },
    { id: 'desk-underside', title: 'Desk underside', view: 'kneehole' },
    { id: 'ticket-shelf', title: 'Ticket shelf', view: 'shelf' },
  ],
} as const satisfies {
  width: number; depth: number; height: number;
  stations: readonly { id: ExchangeStationId; title: string; view: ExchangeViewId }[];
};

export const EXCHANGE_DEFAULT_VIEW: Readonly<Record<ExchangeStationId, ExchangeViewId>> = {
  board: 'wide', 'desk-underside': 'kneehole', 'ticket-shelf': 'shelf',
};

export const EXCHANGE_VIEW_MS = 600;
export const EXCHANGE_FOLLOW_MS = 1600;

/** Authored horizontal coverage comes from the phone's 1.625 strip at 48 degrees vertical. */
export const EXCHANGE_FOV = { landscape: 48, portrait: 76, authoredAspect: 1.625 } as const;

export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan(radians(verticalFovDeg) / 2) * aspect) * 180 / Math.PI;
}

/** Narrower canvases open the lens until the authored width fits, up to the portrait limit. */
export function verticalFov(aspect: number): number {
  const safe = Math.max(aspect, 0.01);
  if (safe >= EXCHANGE_FOV.authoredAspect) return EXCHANGE_FOV.landscape;
  const wanted = 2 * Math.atan(Math.tan(radians(EXCHANGE_FOV.landscape) / 2) * EXCHANGE_FOV.authoredAspect / safe) * 180 / Math.PI;
  return Math.min(EXCHANGE_FOV.portrait, wanted);
}

export function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function mix(a: StagePoint, b: StagePoint, t: number): StagePoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function bezier(points: readonly [StagePoint, StagePoint, StagePoint, StagePoint], t: number): StagePoint {
  const [a, b, c, d] = points;
  const ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t);
  return mix(mix(ab, bc, t), mix(bc, cd, t), t);
}

export function poseBetween(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const eased = easeInOut(t);
  return { position: mix(from.position, to.position, eased), target: mix(from.target, to.target, eased) };
}

const FOLLOW_EYE: readonly [StagePoint, StagePoint, StagePoint, StagePoint] = [
  EXCHANGE_VIEWS.jacks.position, fromSet(0.12, 4.70, 1.75), fromSet(0.28, 4.70, 1.00), EXCHANGE_VIEWS.kneehole.position,
];
const FOLLOW_AIM: readonly [StagePoint, StagePoint, StagePoint, StagePoint] = [
  EXCHANGE_VIEWS.jacks.target, fromSet(0.10, 6.60, 1.20), fromSet(0.30, 5.75, 0.70), EXCHANGE_VIEWS.kneehole.target,
];

/** The one tracking shot: back past the desk's front edge, then down into the kneehole. */
export function followPose(t: number): CameraPose {
  const eased = easeInOut(t);
  return { position: bezier(FOLLOW_EYE, eased), target: bezier(FOLLOW_AIM, eased) };
}

const SHELF_LEG = 0.35;

/**
 * The camera's route between two views at progress t. Most pairs are clear in a straight line. The
 * kneehole is reached from the far side of the desk only by the tracking shot's arc, so the camera
 * never passes through the desk or the panel.
 */
export function travelPose(from: ExchangeViewId, to: ExchangeViewId, t: number): CameraPose {
  if (from === 'jacks' && to === 'kneehole') return followPose(t);
  if (from === 'kneehole' && to === 'jacks') return followPose(1 - t);
  if (from === 'shelf' && to === 'kneehole') {
    return t < SHELF_LEG ? poseBetween(EXCHANGE_VIEWS.shelf, EXCHANGE_VIEWS.jacks, t / SHELF_LEG) : followPose((t - SHELF_LEG) / (1 - SHELF_LEG));
  }
  if (from === 'kneehole' && to === 'shelf') return travelPose('shelf', 'kneehole', 1 - t);
  return poseBetween(EXCHANGE_VIEWS[from], EXCHANGE_VIEWS[to], t);
}
