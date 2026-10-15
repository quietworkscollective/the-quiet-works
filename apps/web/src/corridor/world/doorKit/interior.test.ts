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
});
