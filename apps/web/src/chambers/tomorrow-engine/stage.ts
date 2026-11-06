export type TomorrowStationId = 'winding-control' | 'date-display' | 'carriage' | 'service-hatch';

export type CameraPoint = readonly [x: number, y: number, z: number];

export interface StationCamera {
  position: CameraPoint;
  target: CameraPoint;
  verticalFovDeg: number;
}

export interface StageStation {
  id: TomorrowStationId;
  label: string;
  desktop: StationCamera;
  phone: StationCamera;
  /** The phone layout gives the scene a short, wide strip, so the object needs a closer frame. */
  compact: StationCamera;
}

export const STATIONS: readonly StageStation[] = [
  {
    id: 'winding-control',
    label: 'Winding control',
    desktop: { position: [0, 1.35, 1], target: [0, 1.25, 4.2], verticalFovDeg: 42 },
    phone: { position: [0, 1.35, 0.4], target: [0, 1.25, 4.2], verticalFovDeg: 46 },
    compact: { position: [0, 1.5, 1.75], target: [0, 1.47, 4.2], verticalFovDeg: 40 },
  },
  {
    id: 'date-display',
    label: 'Date display',
    desktop: { position: [0, 1.3, 2.4], target: [0, 1.3, 4.3], verticalFovDeg: 40 },
    phone: { position: [0, 1.3, 1.8], target: [0, 1.3, 4.3], verticalFovDeg: 44 },
    compact: { position: [0, 1.72, 3.2], target: [0, 1.72, 4.3], verticalFovDeg: 40 },
  },
  {
    id: 'carriage',
    label: 'Carriage',
    desktop: { position: [0, 0.95, 2.6], target: [0, 0.95, 4.2], verticalFovDeg: 40 },
    phone: { position: [0, 0.95, 2], target: [0, 0.95, 4.2], verticalFovDeg: 44 },
    compact: { position: [0, 0.95, 2.9], target: [0, 0.95, 4.2], verticalFovDeg: 40 },
  },
  {
    id: 'service-hatch',
    label: 'Service hatch',
    desktop: { position: [0.55, 1.05, 2.3], target: [0.55, 1.05, 4.3], verticalFovDeg: 40 },
    phone: { position: [0.55, 1.05, 1.6], target: [0.55, 1.05, 4.3], verticalFovDeg: 44 },
    compact: { position: [0.55, 1.05, 3], target: [0.55, 1.05, 4.3], verticalFovDeg: 40 },
  },
];

export const DEFAULT_STATION: StageStation = STATIONS[0] as StageStation;

export const TOMORROW_STAGE = {
  forwardAxis: [0, 0, 1] as const,
  visibleHalfArcDeg: 90,
  visibleSectorDeg: 60,
  stations: STATIONS,
} as const;

export function stationById(id: TomorrowStationId): StageStation {
  return STATIONS.find((station) => station.id === id) ?? DEFAULT_STATION;
}

export function cameraForViewport(station: StageStation, width: number, height: number): StationCamera {
  if (height > width) return station.phone;
  return width <= 560 ? station.compact : station.desktop;
}
