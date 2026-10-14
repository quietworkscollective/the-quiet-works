import { ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import { BLANK_DOORS, CHAMBER_SLOTS, CORRIDOR } from '../layout.ts';
import { fogAt } from './fog.ts';
import { buildLamps, corridorSconceSlots, doorExtents, MAX_LAMPS, packLamps } from './lighting.ts';
import { FOG_ANCHOR, FOG_CODE, LAMP_LOOP, LAMP_LOOP_LAMBERT, LAMP_PARS, LIGHT_ANCHOR, LIGHT_PARS_ANCHOR } from './shader.ts';

describe('sconce layout', () => {
  const slots = corridorSconceSlots();
  const left = slots.filter((s) => s.side === 'left');
  const right = slots.filter((s) => s.side === 'right');

  it('is every 7.2 m per wall, the right wall staggered 3.6 m behind the left', () => {
    for (const side of [left, right]) {
      for (let i = 1; i < side.length; i += 1) expect(side[i - 1]!.z - side[i]!.z).toBeCloseTo(CORRIDOR.sconce.spacing, 9);
    }
    for (let i = 0; i < right.length; i += 1) expect(left[i]!.z - right[i]!.z).toBeCloseTo(CORRIDOR.sconce.stagger, 9);
  });

  it('never lands on a door, its surround or its architrave, in the walkable bays or beyond', () => {
    const spec = (key: string) => {
      const chamber = CHAMBER_SLOTS.find((s) => s.key === key);
      if (chamber?.chamber) return CHAMBER_MODULES[chamber.chamber].door;
      return BLANK_DOORS.find((d) => d.key === key)?.spec ?? null;
    };
    for (const [side, list] of [['left', left], ['right', right]] as const) {
      const extents = doorExtents(side, spec);
      for (const s of list) {
        for (const [z0, z1] of extents) {
          // The architrave adds about 0.1 m each side and the fixture is about 0.2 m wide.
          expect(s.z < z0 - 0.2 || s.z > z1 + 0.2, `${s.id} at z=${s.z} against a door spanning ${z0.toFixed(2)}..${z1.toFixed(2)}`).toBe(true);
        }
      }
    }
  });

  it('lights the Office door from the near pier, not from inside its architrave', () => {
    const office = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
    const nearest = right.reduce((a, b) => (Math.abs(a.z - office.z) < Math.abs(b.z - office.z) ? a : b));
    expect(Math.abs(nearest.z - office.z)).toBeLessThan(2.5);
  });
});

describe('lamps', () => {
  it('never exceeds the shader array, and packs (position, range) and (colour, soft)', () => {
    const lamps = buildLamps([{ key: 'office', side: 'right', z: -4.4, top: 2.9, kelvin: 3000, strength: 0.35 }]);
    expect(lamps.length).toBeLessThanOrEqual(MAX_LAMPS);
    const packed = packLamps(lamps);
    expect(packed.position.length).toBe(MAX_LAMPS * 4);
    expect(packed.position[3]).toBeCloseTo(lamps[0]!.range, 5);
    expect(packed.colour[3]).toBeCloseTo(lamps[0]!.soft, 5);
  });

  it('sconces are warm: 2700 K, red above green above blue', () => {
    const sconce = buildLamps([]).find((l) => l.kind === 'sconce')!;
    expect(sconce.colour[0]).toBeGreaterThan(sconce.colour[1]);
    expect(sconce.colour[1]).toBeGreaterThan(sconce.colour[2]);
  });
});

describe('fog curve', () => {
  it('is negligible before 12 m, about 50% at 28 m and 90% at 50 m', () => {
    expect(fogAt(0)).toBe(0);
    expect(fogAt(CORRIDOR.fog.near)).toBe(0);
    expect(fogAt(CORRIDOR.fog.half)).toBeCloseTo(0.5, 3);
    expect(fogAt(CORRIDOR.fog.far)).toBeCloseTo(0.9, 3);
    expect(fogAt(75)).toBeGreaterThan(0.97);
  });

  it('only ever increases', () => {
    let previous = -1;
    for (let d = 0; d <= 90; d += 0.5) {
      expect(fogAt(d)).toBeGreaterThanOrEqual(previous);
      previous = fogAt(d);
    }
  });
});

describe('shader injection anchors', () => {
  // A three.js upgrade that renames a chunk would otherwise render an unlit, unfogged corridor.
  const fragments = [ShaderLib.standard.fragmentShader, ShaderLib.physical.fragmentShader];

  it('finds the fog and light anchors the patch replaces in every fragment shader it patches', () => {
    // The anchors are the patch's own constants, so a typo there cannot pass by matching a copy.
    for (const fragment of [...fragments, ShaderLib.lambert.fragmentShader]) {
      expect(fragment).toContain(FOG_ANCHOR);
      expect(fragment).toContain(LIGHT_PARS_ANCHOR);
      expect(fragment).toContain(LIGHT_ANCHOR);
    }
    expect(ShaderLib.basic.fragmentShader).toContain(FOG_ANCHOR);
  });

  it('the lamp loop relies on names that three still defines in its light chunks', async () => {
    const { ShaderChunk } = await import('three');
    expect(ShaderChunk.lights_fragment_begin).toContain('IncidentLight directLight');
    expect(ShaderChunk.lights_fragment_begin).toContain('geometryPosition');
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('BRDF_GGX');
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('diffuseContribution');
    expect(LAMP_LOOP).toContain('BRDF_GGX');
    expect(LAMP_PARS).toContain(`TQW_LAMPS ${MAX_LAMPS}`);
    expect(FOG_CODE).toContain('vFogDepth');
  });

  it('the lite tier\'s Lambert lamp loop is diffuse only: no specular term', () => {
    expect(LAMP_LOOP_LAMBERT).not.toContain('BRDF_GGX');
    expect(LAMP_LOOP_LAMBERT).not.toContain('directSpecular');
    expect(LAMP_LOOP_LAMBERT).toContain('BRDF_Lambert( material.diffuseColor )');
    // It is the same loop otherwise: same lamps, same falloff.
    expect(LAMP_LOOP_LAMBERT).toContain('tqwLampPos[ i ]');
    expect(LAMP_LOOP).toContain('BRDF_GGX');
  });

  it('floors the roughness a lamp is reflected with, so glass and gloss never show a pinpoint', () => {
    expect(LAMP_PARS).toMatch(/#define TQW_MIN_LAMP_ROUGHNESS 0\.\d+/);
    expect(LAMP_LOOP).toContain('max( material.roughness, TQW_MIN_LAMP_ROUGHNESS )');
  });
});
