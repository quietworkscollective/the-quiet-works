import { describe, expect, it } from 'vitest';
import type { ExchangeState } from '../state.ts';
import { EXCHANGE_VIEWS, fromSet, type ExchangeHotspot, type ExchangeViewId, type StagePoint } from '../stage.ts';
import { hitVolumes, outlineNodes, pickHotspot } from './hotspots.ts';

const arrival: ExchangeState = { service: 'day', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle', cardRead: false, discoveries: [] };
const open: ExchangeState = { ...arrival, plate: 'open' };

function aimAt(view: ExchangeViewId, state: ExchangeState, x: number, y: number, z: number): ExchangeHotspot | null {
  const origin = EXCHANGE_VIEWS[view].position;
  const point = fromSet(x, y, z);
  const direction: StagePoint = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return pickHotspot(origin, direction, hitVolumes(view, state));
}

const ids = (view: ExchangeViewId, state: ExchangeState) => new Set(hitVolumes(view, state).map(volume => volume.id));

describe('Exchange hit volumes', () => {
  it('reaches all twelve lines from the jacks view, in reading order', () => {
    expect(aimAt('jacks', arrival, -1.375, 8.62, 1.60)).toBe('line-1');
    expect(aimAt('jacks', arrival, 0.455, 8.62, 1.60)).toBe('line-3');
    expect(aimAt('jacks', arrival, 1.37, 8.62, 2.44)).toBe('line-8');
    expect(aimAt('jacks', arrival, 1.37, 8.62, 3.36)).toBe('line-12');
  });

  it('fills each grid cell, so a tap between the jack and the card still lands', () => {
    expect(aimAt('jacks', arrival, 0.80, 8.62, 1.90)).toBe('line-3');
    expect(aimAt('jacks', arrival, -0.90, 8.62, 2.90)).toBe('line-6');
  });

  it('answers the shelf fittings from the shelf view', () => {
    expect(aimAt('shelf', arrival, -0.92, 8.63, 1.10)).toBe('rota');
    expect(aimAt('shelf', arrival, -0.55, 8.63, 1.06)).toBe('index');
    expect(aimAt('shelf', arrival, -1.40, 8.40, 0.88)).toBe('drawer');
  });

  it('has no form to touch until the drawer has run out', () => {
    expect(ids('shelf', arrival).has('form')).toBe(false);
    expect(aimAt('shelf', { ...arrival, plug: 'seated' }, -1.40, 8.29, 0.94)).toBe('form');
  });

  it('lands every tap on the shut plate, with no socket, lead or docket to reach', () => {
    for (const [x, z] of [[0.68, 0.38], [0.79, 0.36], [0.55, 0.40]] as const) expect(aimAt('kneehole', arrival, x, 5.74, z)).toBe('plate');
    for (const hidden of ['socket', 'lead', 'docket'] as const) expect(ids('kneehole', arrival).has(hidden)).toBe(false);
  });

  it('opens the recess when the plate opens and moves the plate to its open leaf', () => {
    expect(aimAt('kneehole', open, 0.68, 5.74, 0.38)).toBe('socket');
    expect(aimAt('kneehole', open, 0.79, 5.74, 0.36)).toBe('docket');
    expect(aimAt('kneehole', open, 0.56, 5.74, 0.34)).toBe('lead');
    expect(aimAt('kneehole', open, 0.32, 5.66, 0.36)).toBe('plate');
  });

  it('keeps the ticket lip reachable in every state', () => {
    expect(aimAt('kneehole', arrival, 0.68, 5.72, 0.205)).toBe('ticket-lip');
    expect(aimAt('kneehole', { ...open, lead: 'seated', handset: 'off-hook' }, 0.68, 5.70, 0.24)).toBe('ticket-lip');
  });

  it('finds the desk top objects and the telephone wherever the receiver lies', () => {
    expect(aimAt('desk-top', arrival, 0.42, 5.23, 1.20)).toBe('telephone');
    expect(aimAt('desk-top', arrival, -0.19, 5.35, 1.13)).toBe('rulebook');
    expect(aimAt('desk-top', arrival, 0.84, 5.34, 1.15)).toBe('bell');
    expect(aimAt('desk-top', arrival, -0.68, 5.63, 1.25)).toBe('flask');
    const overBlotter = fromSet(0.62, 5.60, 2);
    expect(pickHotspot(overBlotter, [0, -1, 0], hitVolumes('desk-top', arrival))).toBeNull();
    expect(pickHotspot(overBlotter, [0, -1, 0], hitVolumes('desk-top', { ...arrival, handset: 'off-hook' }))).toBe('telephone');
  });

  it('answers the sign, the cardigan and the seated cord from the wide view', () => {
    expect(aimAt('wide', arrival, 0, 8.60, 4.30)).toBe('sign');
    expect(aimAt('wide', arrival, -0.70, 4.14, 1.20)).toBe('cardigan');
    expect(aimAt('wide', arrival, 1.2, 8.62, 5.6)).toBe('clerestory');
    expect(aimAt('wide', { ...arrival, plug: 'seated' }, 0.02, 7.2, 1.11)).toBe('cord');
  });

  it('offers no hotspot outside the frame of a view', () => {
    expect(ids('kneehole', arrival).has('sign')).toBe(false);
    expect(ids('desk-top', arrival).has('plate')).toBe(false);
    expect(ids('shelf', arrival).has('telephone')).toBe(false);
  });

  it('names real nodes for the outline of a live hotspot', () => {
    expect(outlineNodes('line-3', 'jacks', arrival)).toEqual(['certification_jack', 'line_lamp_03', 'line_card_03']);
    expect(outlineNodes('plate', 'kneehole', open)).toContain('operator_plate_inner');
    expect(outlineNodes('form', 'shelf', arrival)).toEqual([]);
  });
});
