import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_DEFAULT_VIEW, EXCHANGE_FOLLOW_MS, EXCHANGE_FOV, EXCHANGE_STAGE, EXCHANGE_VIEWS, EXCHANGE_VIEW_MS,
  followPose, fromSet, horizontalFov, poseBetween, travelPose, verticalFov, type ExchangeViewId, type StagePoint,
} from './stage.ts';

const pitchOf = (position: StagePoint, target: StagePoint) =>
  Math.atan2(target[1] - position[1], Math.hypot(target[0] - position[0], target[2] - position[2])) * 180 / Math.PI;

describe('The Exchange stage', () => {
  it('holds three canon stations and five views, with no look, turn or walk', async () => {
    expect(EXCHANGE_STAGE.stations.map(({ id, title }) => [id, title])).toEqual([
      ['board', 'Board'], ['desk-underside', 'Desk underside'], ['ticket-shelf', 'Ticket shelf'],
    ]);
    expect(Object.keys(EXCHANGE_VIEWS).sort()).toEqual(['desk-top', 'jacks', 'kneehole', 'shelf', 'wide']);
    const stage = await import('./stage.ts') as Record<string, unknown>;
    for (const removed of ['EXCHANGE_LOOK', 'applyStageYaw', 'stageYawLimit', 'limitStagePose', 'turnScaleAtLimit']) expect(stage[removed], removed).toBeUndefined();
  });

  it('places each view at its authored pose, in stage coordinates', () => {
    expect(EXCHANGE_VIEWS.wide.position).toEqual(fromSet(-0.10, 1.60, 1.62));
    expect(pitchOf(EXCHANGE_VIEWS.wide.position, EXCHANGE_VIEWS.wide.target)).toBeCloseTo(10);
    expect(EXCHANGE_VIEWS.jacks.position).toEqual(fromSet(0, 5.20, 2.00));
    expect(pitchOf(EXCHANGE_VIEWS.jacks.position, EXCHANGE_VIEWS.jacks.target)).toBeCloseTo(0.5);
    expect(EXCHANGE_VIEWS['desk-top'].position).toEqual(fromSet(0.10, 4.35, 1.85));
    expect(EXCHANGE_VIEWS.kneehole).toMatchObject({ position: fromSet(0.30, 4.72, 0.42), target: fromSet(0.30, 5.75, 0.38) });
    expect(EXCHANGE_VIEWS.shelf).toMatchObject({ position: fromSet(-1.15, 7.35, 1.35), target: fromSet(-1.15, 8.50, 0.98) });
  });

  it('keeps the sheave on the cord post inside the desk top frame', () => {
    const { position, target } = EXCHANGE_VIEWS['desk-top'];
    const toward = (a: StagePoint, b: StagePoint): StagePoint => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const dot = (a: StagePoint, b: StagePoint) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const aim = toward(position, target);
    const length = Math.hypot(...aim);
    const forward: StagePoint = [aim[0] / length, aim[1] / length, aim[2] / length];
    const up: StagePoint = [0, -forward[2], forward[1]];
    const sheave = toward(position, fromSet(-0.60, 5.76, 1.55));
    expect(Math.abs(forward[0])).toBeLessThan(1e-9);
    expect(dot(sheave, up) / dot(sheave, forward)).toBeLessThan(Math.tan(EXCHANGE_FOV.landscape * Math.PI / 360));
  });

  it('sends each station to its own view', () => {
    expect(EXCHANGE_DEFAULT_VIEW).toEqual({ board: 'wide', 'desk-underside': 'kneehole', 'ticket-shelf': 'shelf' });
    for (const station of EXCHANGE_STAGE.stations) expect(EXCHANGE_VIEWS[station.view].station).toBe(station.id);
  });

  it('keeps the authored lens on a phone strip and opens it on narrower canvases', () => {
    expect(verticalFov(390 / 240)).toBe(48);
    expect(verticalFov(2.2)).toBe(48);
    expect(horizontalFov(verticalFov(890 / 744), 890 / 744)).toBeCloseTo(horizontalFov(48, EXCHANGE_FOV.authoredAspect));
    expect(verticalFov(0.5)).toBe(EXCHANGE_FOV.portrait);
  });

  it('times the view change and the one tracking shot as the script does', () => {
    expect(EXCHANGE_VIEW_MS).toBe(600);
    expect(EXCHANGE_FOLLOW_MS).toBe(1600);
  });

  it('eases between view poses and lands exactly', () => {
    const { wide, shelf } = EXCHANGE_VIEWS;
    expect(poseBetween(wide, shelf, 0).position).toEqual(wide.position);
    expect(poseBetween(wide, shelf, 1).position).toEqual(shelf.position);
  });

  it('starts and ends the tracking shot on its two views', () => {
    const same = (a: StagePoint, b: StagePoint) => a.forEach((value, axis) => expect(value).toBeCloseTo(b[axis]!, 9));
    same(followPose(0).position, EXCHANGE_VIEWS.jacks.position);
    same(followPose(1).position, EXCHANGE_VIEWS.kneehole.position);
    same(followPose(1).target, EXCHANGE_VIEWS.kneehole.target);
  });

  it('never takes the camera through the desk, its panel or the chair, on any route', () => {
    const near = 0.06;
    const desk = { minX: -0.885, maxX: 1.365, minY: 4.865, maxY: 5.81, maxZ: 1.08 };
    const chair = { minX: -1.0, maxX: -0.42, minY: 4.05, maxY: 4.70, maxZ: 1.40 };
    const views = Object.keys(EXCHANGE_VIEWS) as ExchangeViewId[];
    for (const from of views) {
      for (const to of views) {
        for (let step = 0; step <= 200; step += 1) {
          const [x, height, stageZ] = travelPose(from, to, step / 200).position;
          const y = -stageZ;
          for (const solid of [desk, chair]) {
            const inside = x > solid.minX - near && x < solid.maxX + near && y > solid.minY - near && y < solid.maxY + near && height < solid.maxZ + near;
            expect(inside, `${from} to ${to} at ${x.toFixed(3)}, ${y.toFixed(3)}, ${height.toFixed(3)}`).toBe(false);
          }
        }
      }
    }
  });
});
