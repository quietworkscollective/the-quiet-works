/**
 * The plaster scan's tile in metres (SCANS['plaster-worn'].tile in scanned.ts; scanned.test.ts holds the
 * two equal). A texture's `repeat` is 1 / tile, because the builders write metre UVs, and each bay's UV
 * offset is drawn within one tile, so neighbouring bays show different parts of the plaster.
 */
export const TILE = { plaster: 4.0 } as const;
