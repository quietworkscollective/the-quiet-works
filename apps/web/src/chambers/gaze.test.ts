import { describe, expect, it } from 'vitest';
import { dragGaze, GAZE_LIMIT, gazeTarget, LEVEL_GAZE } from './gaze.ts';

const position = [0, 1.5, 2] as const;
const target = [0, 1.5, 0] as const;

describe('gaze', () => {
  it('a level gaze looks exactly where the view does', () => {
    expect(gazeTarget(position, target, LEVEL_GAZE)).toEqual(target);
  });

  it('turns about the camera, keeping the distance to the target', () => {
    const turned = gazeTarget(position, target, { yaw: 0.3, pitch: 0.1 });
    const distance = Math.hypot(turned[0] - position[0], turned[1] - position[1], turned[2] - position[2]);
    expect(distance).toBeCloseTo(2, 9);
    expect(turned[0]).toBeLessThan(0); // a positive yaw turns to the left of a camera facing -z
    expect(turned[1]).toBeGreaterThan(1.5);
  });

  it('follows the finger and stops at the edge of the arc', () => {
    expect(dragGaze(LEVEL_GAZE, 50, -20).yaw).toBeGreaterThan(0);
    expect(dragGaze(LEVEL_GAZE, 50, -20).pitch).toBeLessThan(0);
    expect(dragGaze(LEVEL_GAZE, 10_000, 10_000)).toEqual({ yaw: GAZE_LIMIT.yaw, pitch: GAZE_LIMIT.pitch });
    expect(dragGaze(LEVEL_GAZE, -10_000, -10_000)).toEqual({ yaw: -GAZE_LIMIT.yaw, pitch: -GAZE_LIMIT.pitch });
  });
});
