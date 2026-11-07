import { EXCHANGE_LAMP } from './lighting.ts';
import { describe, expect, it } from 'vitest';
import type { ExchangeState } from '../state.ts';
import { fromSet } from '../stage.ts';
import {
  CARD_TIP_RADIANS, EXCHANGE_MOTION_MS, SET_CHANNELS, cardPulse, channelMs, cordPoseFor, exchangeSetChannels, handsetPose, heldCardTip,
  lineLampLevels, plugPosition, ticketPose,
} from './pose.ts';

const arrival: ExchangeState = { service: 'day', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle', cardRead: false, discoveries: [] };
const state = (changes: Partial<ExchangeState>): ExchangeState => ({ ...arrival, ...changes });

describe('Exchange set pose', () => {
  it('arrives with everything at rest', () => {
    expect(exchangeSetChannels(arrival)).toEqual({ plug: 0, drawer: 0, plate: 0, operator: 0, handset: 0, ticket: 0, lever: 0 });
  });

  it('opens the drawer in the same step that seats the plug', () => {
    expect(exchangeSetChannels(state({ plug: 'guide' }))).toMatchObject({ plug: 1, drawer: 0 });
    expect(exchangeSetChannels(state({ plug: 'seated' }))).toMatchObject({ plug: 2, drawer: 1 });
  });

  it('runs the plug rest, guide, seated along the fittings', () => {
    expect(plugPosition(0)).toEqual(fromSet(0.455, 8.46, 1.02));
    expect(plugPosition(1)).toEqual(fromSet(0.455, 8.46, 1.14));
    expect(plugPosition(2)).toEqual(fromSet(0.455, 8.495, 1.52));
    expect(['rest', 'guide', 'seated'].map((_, value) => cordPoseFor(value))).toEqual(['rest', 'guide', 'seated']);
  });

  it('holds the script timings for every moving part', () => {
    expect(channelMs('plug', 0, 1)).toBe(400);
    expect(channelMs('plug', 1, 2)).toBe(500);
    expect(channelMs('drawer', 0, 1)).toBe(500);
    expect(channelMs('plate', 0, 1)).toBe(700);
    expect(channelMs('operator', 0, 1)).toBe(500);
    expect(channelMs('handset', 0, 1)).toBe(500);
    expect(channelMs('ticket', 0, 1)).toBe(800);
    for (const channel of SET_CHANNELS) expect(channelMs(channel, 0, 1)).toBeGreaterThan(0);
  });

  it('lights CERTIFICATION full and the eleven others dim', () => {
    const levels = lineLampLevels(arrival);
    expect(levels[2]).toBe(1);
    expect(levels.filter((_, index) => index !== 2).every(level => level === EXCHANGE_LAMP.dim)).toBe(true);
  });

  it('steps every lamp to the night level in night service, and back on resume', () => {
    expect(new Set(lineLampLevels(state({ service: 'night', plug: 'seated' })))).toEqual(new Set([EXCHANGE_LAMP.night]));
    expect(lineLampLevels(state({ service: 'day', plug: 'seated' }))[2]).toBe(1);
  });

  it('keeps connections through night service', () => {
    expect(exchangeSetChannels(state({ plug: 'seated', service: 'night' }))).toMatchObject({ plug: 2, drawer: 1, lever: 1 });
  });

  it('shows the older ticket once the plate opens, with no fresh ticket until the handset is lifted', () => {
    expect(ticketPose(0, arrival)).toMatchObject({ oldVisible: false, freshVisible: false });
    expect(ticketPose(0, state({ plate: 'open' }))).toMatchObject({ oldVisible: true, freshVisible: false });
    const fed = ticketPose(1, state({ plate: 'open', handset: 'off-hook' }));
    expect(fed).toMatchObject({ oldVisible: true, freshVisible: true });
    expect(fed.old[2]).toBeCloseTo(fed.fresh[2]);
    expect(fed.old[1]).toBeCloseTo(fed.fresh[1]);
  });

  it('lays the receiver on the blotter and rests it there', () => {
    expect(handsetPose(0).position).toEqual(fromSet(0.42, 5.23, 1.30));
    const laid = handsetPose(1);
    expect(laid.position[0]).toBeCloseTo(0.62);
    expect(laid.position[1]).toBeCloseTo(1.186);
    expect(laid.position[2]).toBeCloseTo(-5.60);
    expect(handsetPose(0.5).position[1]).toBeGreaterThan(1.30);
  });

  it('tips a card and returns it, and holds the tip when motion is reduced', () => {
    expect(cardPulse(0)).toBeCloseTo(0);
    expect(cardPulse(0.5)).toBeCloseTo(CARD_TIP_RADIANS);
    expect(cardPulse(1)).toBeCloseTo(0);
    expect(heldCardTip(7, arrival, 7, false)).toBe(0);
    expect(heldCardTip(7, arrival, 7, true)).toBe(CARD_TIP_RADIANS);
    expect(heldCardTip(5, arrival, 7, true)).toBe(0);
    expect(EXCHANGE_MOTION_MS.cardTip).toBeGreaterThan(0);
  });

  it('holds the CERTIFICATION card tipped once the plug is seated', () => {
    expect(heldCardTip(3, state({ plug: 'seated' }), null, false)).toBe(CARD_TIP_RADIANS);
    expect(heldCardTip(3, state({ plug: 'guide' }), null, false)).toBe(0);
  });
});
