import { describe, expect, it } from 'vitest';
import { DOOR } from '../../../chambers/annex-codex/door.ts';
import { buildInterior } from './interior.ts';

describe('Outline Room doorway proxy', () => {
  it('keeps the open doorway warm, readable, and free of the Office teal cue', () => {
    const room = buildInterior(DOOR, 'outline-room');
    expect(Math.max(...room.glow.col)).toBeGreaterThan(0.3);
    expect(room.lamp.triangleCount).toBeGreaterThan(buildInterior(DOOR).lamp.triangleCount + 20);
    for (let index = 0; index < room.glow.col.length; index += 3) {
      expect(room.glow.col[index]).toBeGreaterThanOrEqual(room.glow.col[index + 2] ?? 0);
    }
  });

  it('warms the back wall and shows the task lamp as a light source', () => {
    const room = buildInterior(DOOR, 'outline-room');
    const backWallRed = room.lamp.col[72] ?? 0;
    const backWallBlue = room.lamp.col[74] ?? 0;
    expect(backWallRed).toBeGreaterThan(backWallBlue * 1.2);
    expect(room.glow.pos.some((_, index) => index % 3 === 0 && (room.glow.pos[index] ?? 0) > 0.6 && (room.glow.pos[index + 1] ?? 0) > 2.4)).toBe(true);
    const wallWashVertex = room.glow.pos.findIndex((_, index) => index % 3 === 2 && Math.abs((room.glow.pos[index] ?? 0) + 6.98) < 0.001);
    expect(wallWashVertex).toBeGreaterThanOrEqual(0);
    expect(room.glow.col[wallWashVertex - 2]).toBeGreaterThan(0.35);
  });
});
