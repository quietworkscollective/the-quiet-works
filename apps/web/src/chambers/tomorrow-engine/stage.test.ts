import { describe, expect, it } from 'vitest';
import { cameraForViewport, DEFAULT_STATION, STATIONS, TOMORROW_STAGE, stationById } from './stage.ts';

describe('Tomorrow Engine fixed stage stations', () => {
  it('exposes the four script stations in reading order', () => {
    expect(STATIONS.map(({ id, label }) => [id, label])).toEqual([
      ['winding-control', 'Winding control'],
      ['date-display', 'Date display'],
      ['carriage', 'Carriage'],
      ['service-hatch', 'Service hatch'],
    ]);
    expect(TOMORROW_STAGE.visibleHalfArcDeg).toBe(90);
    expect(TOMORROW_STAGE.visibleSectorDeg).toBe(60);
  });

  it('uses the authored desktop and phone frames from the approved script', () => {
    const expected = [
      {
        desktop: { position: [0, 1.35, 1], target: [0, 1.25, 4.2], verticalFovDeg: 42 },
        phone: { position: [0, 1.35, 0.4], target: [0, 1.25, 4.2], verticalFovDeg: 46 },
      },
      {
        desktop: { position: [0, 1.3, 2.4], target: [0, 1.3, 4.3], verticalFovDeg: 40 },
        phone: { position: [0, 1.3, 1.8], target: [0, 1.3, 4.3], verticalFovDeg: 44 },
      },
      {
        desktop: { position: [0, 0.95, 2.6], target: [0, 0.95, 4.2], verticalFovDeg: 40 },
        phone: { position: [0, 0.95, 2], target: [0, 0.95, 4.2], verticalFovDeg: 44 },
      },
      {
        desktop: { position: [0.55, 1.05, 2.3], target: [0.55, 1.05, 4.3], verticalFovDeg: 40 },
        phone: { position: [0.55, 1.05, 1.6], target: [0.55, 1.05, 4.3], verticalFovDeg: 44 },
      },
    ] as const;
    STATIONS.forEach((station, index) => {
      expect(cameraForViewport(station, 1440, 900)).toEqual(expected[index]!.desktop);
      expect(cameraForViewport(station, 390, 844)).toEqual(expected[index]!.phone);
    });
  });

  it('falls back to the winding station when an authored station is unknown', () => {
    expect(DEFAULT_STATION.id).toBe('winding-control');
    expect(stationById('service-hatch').label).toBe('Service hatch');
  });
});

describe('phone framing', () => {
  it('uses a close camera on the short, wide canvas a phone gives the scene', () => {
    for (const station of STATIONS) {
      const camera = cameraForViewport(station, 390, 190);
      expect(camera, station.id).not.toBe(station.desktop);
      const distance = Math.hypot(...camera.position.map((value, axis) => value - camera.target[axis]!) as [number, number, number]);
      const desktopDistance = Math.hypot(...station.desktop.position.map((value, axis) => value - station.desktop.target[axis]!) as [number, number, number]);
      expect(distance, station.id).toBeLessThan(desktopDistance);
    }
  });

  it('keeps the desktop camera on a wide desktop canvas', () => {
    for (const station of STATIONS) expect(cameraForViewport(station, 1035, 844)).toBe(station.desktop);
  });
});
