import { CERTIFICATION_LINE, type ExchangeState } from '../state.ts';
import { fromSet, type StagePoint } from '../stage.ts';
import { EXCHANGE_LAMP } from './lighting.ts';

/**
 * Where the set rests for a state, as a few scalar channels. The scene eases a channel toward its
 * target for presentation only: nothing reads a channel back, so no motion can change the room.
 */
export type SetChannel = 'plug' | 'drawer' | 'plate' | 'operator' | 'handset' | 'ticket' | 'lever';
export type SetChannels = Readonly<Record<SetChannel, number>>;

export const SET_CHANNELS: readonly SetChannel[] = ['plug', 'drawer', 'plate', 'operator', 'handset', 'ticket', 'lever'];

export const EXCHANGE_MOTION_MS = {
  plugLift: 400, plugSeat: 500, drawer: 500, plate: 700, operator: 500, handset: 500, ticket: 800, lever: 140, cardTip: 360,
} as const;

export const CARD_TIP_RADIANS = 0.22;
export const PLATE_OPEN_RADIANS = -165 * Math.PI / 180;
export const LEVER_NIGHT_RADIANS = 0.84;
export const DRAWER_TRAVEL = 0.22;
export const HANDSET_LAID_YAW = -0.35;

const PLUG_REST = fromSet(0.455, 8.46, 1.02);
const PLUG_GUIDE = fromSet(0.455, 8.46, 1.14);
const PLUG_SEATED = fromSet(0.455, 8.495, 1.52);
const HANDSET_CRADLE = fromSet(0.42, 5.23, 1.30);
const HANDSET_LAID = fromSet(0.62, 5.60, 1.186);
const OLD_TICKET_SLOT = fromSet(0.625, 5.73, 0.2525);
const OLD_TICKET_LIP = fromSet(0.625, 5.705, 0.2315);
const NEW_TICKET_FEED = fromSet(0.745, 5.73, 0.2315);
const NEW_TICKET_LIP = fromSet(0.745, 5.705, 0.2315);

function along(a: StagePoint, b: StagePoint, t: number): StagePoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function exchangeSetChannels(state: ExchangeState): SetChannels {
  const seated = state.plug === 'seated';
  const offHook = state.handset === 'off-hook';
  return {
    plug: seated ? 2 : state.plug === 'guide' ? 1 : 0,
    drawer: seated ? 1 : 0,
    plate: state.plate === 'open' ? 1 : 0,
    operator: state.lead === 'seated' ? 1 : 0,
    handset: offHook ? 1 : 0,
    ticket: offHook ? 1 : 0,
    lever: state.service === 'night' ? 1 : 0,
  };
}

export function channelMs(channel: SetChannel, from: number, to: number): number {
  if (channel !== 'plug') return EXCHANGE_MOTION_MS[channel];
  const lifts = Math.abs(to - from) <= 1 && Math.max(from, to) <= 1;
  return lifts ? EXCHANGE_MOTION_MS.plugLift : EXCHANGE_MOTION_MS.plugSeat;
}

/** The plug moves rest, guide, seated along one path; the plug channel is also the cord morph. */
export function plugPosition(value: number): StagePoint {
  return value <= 1 ? along(PLUG_REST, PLUG_GUIDE, value) : along(PLUG_GUIDE, PLUG_SEATED, value - 1);
}

export function cordPoseFor(value: number): 'rest' | 'guide' | 'seated' {
  return value < 0.5 ? 'rest' : value < 1.5 ? 'guide' : 'seated';
}

/** Stage z runs toward the visitor, so the drawer's run is positive. */
export function drawerOffset(value: number): number {
  return DRAWER_TRAVEL * value;
}

/** A lifted arc from cradle to blotter, so the receiver is never dragged through the telephone. */
export function handsetPose(value: number): { position: StagePoint; yaw: number } {
  const [x, y, z] = along(HANDSET_CRADLE, HANDSET_LAID, value);
  return { position: [x, y + 0.09 * Math.sin(Math.PI * value), z], yaw: HANDSET_LAID_YAW * value };
}

export function ticketPose(value: number, state: ExchangeState): { old: StagePoint; fresh: StagePoint; oldVisible: boolean; freshVisible: boolean } {
  return {
    old: along(OLD_TICKET_SLOT, OLD_TICKET_LIP, value),
    fresh: along(NEW_TICKET_FEED, NEW_TICKET_LIP, value),
    oldVisible: state.plate === 'open' || value > 0,
    freshVisible: value > 0,
  };
}

/** One value per line, index 0 being line 1. Night service steps every lamp down together. */
export function lineLampLevels(state: ExchangeState): readonly number[] {
  return Array.from({ length: 12 }, (_, index) => {
    if (state.service === 'night') return EXCHANGE_LAMP.night;
    return index + 1 === CERTIFICATION_LINE ? EXCHANGE_LAMP.full : EXCHANGE_LAMP.dim;
  });
}

/** The tip a card holds at rest. Full motion plays the tip and return as a pulse on top of this. */
export function heldCardTip(line: number, state: ExchangeState, tippedLine: number | null, reducedMotion: boolean): number {
  if (line === CERTIFICATION_LINE && state.plug === 'seated') return CARD_TIP_RADIANS;
  return reducedMotion && line === tippedLine ? CARD_TIP_RADIANS : 0;
}

export function cardPulse(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return CARD_TIP_RADIANS * Math.sin(Math.PI * t);
}

/** The small nudges a refused action gives: a return to rest, not a change of pose. */
export function nudge(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return Math.sin(Math.PI * t);
}
