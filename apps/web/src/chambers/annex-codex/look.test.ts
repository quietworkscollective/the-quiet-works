import { describe, expect, it } from 'vitest';
import { opticalDepth } from '../../look/atmosphere/data.ts';
import { CODEX_ROOM_LAMPS, CODEX_ROOM_LOOK } from './look.ts';

describe('Outline Room light profile', () => {
  it('keeps the work surface readable with barely perceptible white-grey air', () => {
    const air = CODEX_ROOM_LOOK.atmosphere;
    const opacity = 1 - Math.exp(-opticalDepth(air.heightFog, 1.62, 6));
    expect(CODEX_ROOM_LOOK.space).toBe('codex-room');
    expect(opacity).toBeGreaterThanOrEqual(0.01);
    expect(opacity).toBeLessThanOrEqual(0.02);
    expect(air.heightFog.every((layer) => layer.colour === '#D5D5CF')).toBe(true);
  });

  it('keeps the lamp core below bloom and disables bloom on phones', () => {
    expect(CODEX_ROOM_LOOK.bloom.threshold).toBeGreaterThanOrEqual(2.0);
    expect(CODEX_ROOM_LOOK.bloom.strength).toBeGreaterThanOrEqual(0.02);
    expect(CODEX_ROOM_LOOK.bloom.strength).toBeLessThanOrEqual(0.05);
    expect(CODEX_ROOM_LOOK.bloom.mobile.enabled).toBe(false);
  });

  it('keeps the work light free of a visible cone at its moved lamp source', () => {
    expect(CODEX_ROOM_LOOK.atmosphere.cones.specs).toHaveLength(0);
    expect(CODEX_ROOM_LAMPS.find((lamp) => lamp.id === 'codex-task-lamp')?.position).toEqual([0.82, 2.58, 4.1]);
  });
});
