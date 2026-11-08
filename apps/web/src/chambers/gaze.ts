/** A point in a room's stage, metres. */
export type StagePoint = readonly [x: number, y: number, z: number];

/**
 * Looking around from a station: a drag turns the camera within a small arc about its fixed
 * position, so a visitor can glance along the board or down at the desk without leaving the
 * script's views. Yaw is a turn to the left about world up; pitch is a tilt upward. Shared by the
 * rooms with fixed stations (the Exchange, the Tomorrow Engine); each room sets its own arc.
 */
export interface Gaze {
  readonly yaw: number;
  readonly pitch: number;
}

export const LEVEL_GAZE: Gaze = { yaw: 0, pitch: 0 };

export interface GazeLimit {
  readonly yaw: number;
  readonly pitch: number;
}

/** About 20° either side and 10° up or down: enough to look, never enough to lose the station. */
export const GAZE_LIMIT: GazeLimit = { yaw: 0.35, pitch: 0.18 };

/** A full-width drag on a phone (about 390 px) sweeps the whole arc. */
export const GAZE_RADIANS_PER_PIXEL = 0.0018;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** The gaze after dragging `dx`, `dy` pixels from `start`: the view follows the finger. */
export function dragGaze(start: Gaze, dx: number, dy: number, limit: GazeLimit = GAZE_LIMIT): Gaze {
  return {
    yaw: clamp(start.yaw + dx * GAZE_RADIANS_PER_PIXEL, limit.yaw),
    pitch: clamp(start.pitch + dy * GAZE_RADIANS_PER_PIXEL, limit.pitch),
  };
}

/** The point the camera looks at once `gaze` turns it from `position` toward `target`. */
export function gazeTarget(position: StagePoint, target: StagePoint, gaze: Gaze): StagePoint {
  if (gaze.yaw === 0 && gaze.pitch === 0) return target;
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const flat = Math.hypot(dx, dz);
  const length = Math.hypot(flat, dy);
  const heading = Math.atan2(dx, dz) + gaze.yaw;
  const limit = Math.PI / 2 - 0.05;
  const elevation = Math.max(-limit, Math.min(limit, Math.atan2(dy, flat) + gaze.pitch));
  const reach = Math.cos(elevation) * length;
  return [
    position[0] + Math.sin(heading) * reach,
    position[1] + Math.sin(elevation) * length,
    position[2] + Math.cos(heading) * reach,
  ];
}
