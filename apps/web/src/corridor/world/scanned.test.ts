import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { budget, getSurface } from '../../assets/catalogue.ts';
import { BUDGET_BYTES } from '../../assets/policy.ts';
import { CORRIDOR } from '../layout.ts';
import { CORRIDOR_SCAN_IDS, gradedColour, SCAN_FILES, SCANS, type ScanMap } from './scanned.ts';
import { TILE } from './tiles.ts';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const MAPS: readonly ScanMap[] = ['albedo', 'normal', 'orm'];

describe('the corridor\'s scans agree with the library they come from', () => {
  it.each(CORRIDOR_SCAN_IDS)('%s: tile size and metalness are the catalogue\'s', (id) => {
    const entry = getSurface(id);
    expect(SCANS[id].tile).toBe(entry.tileMetres);
    expect(SCANS[id].metalness).toBe(entry.metalness ?? 0);
  });

  it.each(CORRIDOR_SCAN_IDS)('%s: asks only for maps the scan has, and has a loader for each it asks for', (id) => {
    const entry = getSurface(id);
    const spec = SCANS[id];
    expect(spec.maps).toContain('albedo');
    for (const map of spec.maps) {
      if (map === 'normal') expect(entry.maps.normal, `${id} has no normal map`).toBe(true);
      if (map === 'orm') expect(entry.maps.orm, `${id} has no orm map`).toBe(true);
    }
    expect(Object.keys(SCAN_FILES[id]).sort()).toEqual([...spec.maps].sort());
  });

  it('keeps the plaster\'s bay offsets in the plaster scan\'s own tile', () => {
    expect(TILE.plaster).toBe(SCANS['plaster-worn'].tile);
  });
});

describe('what the corridor ships of the library', () => {
  const shipped = (id: string): number =>
    MAPS.filter((map) => (SCANS[id as keyof typeof SCANS]?.maps ?? []).includes(map)).reduce(
      (sum, map) => sum + statSync(here(`../../assets/surfaces/${id}-${map}.webp`)).size,
      0,
    );

  it('holds the files it imports to the corridor\'s 0.95 MB allocation', () => {
    const total = CORRIDOR_SCAN_IDS.reduce((sum, id) => sum + shipped(id), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(BUDGET_BYTES.corridorSurfaces);
  });

  it('would hold the allocation even if every map of every scan were shipped', () => {
    expect(budget([...CORRIDOR_SCAN_IDS]).downloadBytes).toBeLessThanOrEqual(BUDGET_BYTES.corridorSurfaces);
  });

  it('imports library files by name and never the catalogue, whose registry names the whole library', () => {
    // One import of the catalogue (surface(), useModel(), anything that reaches registry.generated.ts)
    // makes the build emit every model and every surface map: 10.9 MB in dist against the audit's 8 MB.
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = `${directory}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8');
          for (const line of source.split('\n')) {
            const match = /(?:from|import\()\s*['"]([^'"]*\/assets\/[^'"]*)['"]/.exec(line);
            const target = match?.[1];
            if (target && !/\/assets\/(surfaces\/[a-z-]+\.webp\?url|models\/[a-z0-9-]+\.glb\?url&inline|outline-door\.glb\.gz\?url&inline|gltf\.ts|dispose\.ts)$/.test(target)) offenders.push(`${full.split('/src/')[1]}: ${target}`);
          }
        }
      }
    };
    walk(here('..'));
    expect(offenders).toEqual([]);
  });
});

describe('gradedColour', () => {
  const linear = (hex: string): number[] => {
    const c = new Color(hex);
    return [c.r, c.g, c.b];
  };

  it('lands a scan on the art direction\'s colour once the scan\'s own mean is multiplied back in', () => {
    const mean: [number, number, number] = [0.382, 0.38, 0.359];
    const graded = gradedColour(CORRIDOR.colours.plaster, mean);
    const target = linear(CORRIDOR.colours.plaster);
    expect(graded.r * mean[0]).toBeCloseTo(target[0] ?? NaN, 6);
    expect(graded.g * mean[1]).toBeCloseTo(target[1] ?? NaN, 6);
    expect(graded.b * mean[2]).toBeCloseTo(target[2] ?? NaN, 6);
  });

  it('never divides by zero for a black scan', () => {
    const graded = gradedColour('#ffffff', [0, 0, 0]);
    for (const channel of [graded.r, graded.g, graded.b]) expect(Number.isFinite(channel)).toBe(true);
  });
});
