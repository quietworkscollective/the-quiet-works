import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../../chambers/registry.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { BLANK_DOORS } from '../../layout.ts';
import { PlaqueLayout } from '../artLayout.ts';
import { BUCKET_KEYS } from '../buckets.ts';
import { MarksLayout } from '../marksLayout.ts';
import { buildDoor } from './build.ts';
import { createCtx } from './ctx.ts';
import { buildChips, buildMarks, buildWear } from './dress.ts';
import { buildLocks } from './locks.ts';
import { keyOfSpec, lookOf } from './look.ts';
import { LEAF_GAP, planDoor } from './plan.ts';
import { buildSignature } from './signatures.ts';

const chambers = CHAMBERS.map((c) => ({ key: c.id as string, spec: CHAMBER_MODULES[c.id].door }));
const blanks = BLANK_DOORS.map((d) => ({ key: d.key, spec: d.spec }));
const all = [...chambers, ...blanks];

const plaques = new PlaqueLayout(chambers.flatMap((c) => (c.spec.plaque ? [c.spec.plaque] : [])));
const marks = new MarksLayout(all.flatMap((d) => (d.spec.character?.marks ?? []).flatMap((m) => (m.text ? [m.text] : []))));
const build = (spec: DoorSpec, lod: 'near' | 'far' = 'near') => buildDoor(spec, { lod, plaques, marks, animated: false, seed: 7 });

describe('door character, rendered from data', () => {
  it('every chamber door and every authored blank door carries a character in its plan', () => {
    expect(all).toHaveLength(chambers.length + blanks.length);
    for (const d of all) expect(planDoor(d.spec).character, d.key).not.toBeNull();
  });

  it('each chamber door has its principal lock, its marks and its lamp, as its data names them', () => {
    for (const { key, spec } of chambers) {
      const data = spec.character;
      const plan = planDoor(spec).character;
      if (!data || !plan) throw new Error(`${key} has no character`);
      const principal = plan.locks.find((l) => l.role === 'principal');
      expect(principal?.kind, `${key} principal lock`).toBe(data.lock);
      if (data.extraLock) expect(plan.locks.find((l) => l.role === 'extra')?.kind, `${key} extra lock`).toBe(data.extraLock);
      else expect(plan.locks.some((l) => l.role === 'extra'), `${key} has no extra lock`).toBe(false);
      expect(plan.marks.map((m) => m.kind), `${key} marks`).toEqual(data.marks.map((m) => m.kind));
      expect(plan.marks.map((m) => m.text), `${key} mark text`).toEqual(data.marks.map((m) => m.text));
      expect(plan.lamp, `${key} lamp`).toEqual(data.lamp ?? null);
      expect(data.lamp, `${key} names a lamp wash`).toBeDefined();
    }
  });

  it('builds a lock fitting wherever the character names one that the handle does not already provide', () => {
    for (const { key, spec } of all) {
      const plan = planDoor(spec);
      const names = plan.character?.locks.filter((l) => l.build === 'rim-lock' || l.build === 'thumb-latch' || l.build === 'padlock' || l.build === 'sliding-bolt') ?? [];
      const c = createCtx(plan, 'near', plaques, 7, marks);
      const before = c.leaf.reduce((n, b) => n + BUCKET_KEYS.reduce((m, k) => m + b[k].triangleCount, 0), 0);
      buildLocks(c);
      const after = c.leaf.reduce((n, b) => n + BUCKET_KEYS.reduce((m, k) => m + b[k].triangleCount, 0), 0);
      if (names.length > 0) expect(after, `${key} builds its ${names.map((l) => l.build).join(' and ')}`).toBeGreaterThan(before);
      else expect(after, `${key} has no lock fitting beyond its handle`).toBe(before);
    }
    // The Atrium's padlock and the Apartment's bolt are the closures the spec already builds: not built twice.
    expect(planDoor(CHAMBER_MODULES['great-atrium'].door).character?.locks.find((l) => l.role === 'extra')?.build).toBe('closure');
    expect(planDoor(CHAMBER_MODULES.apartment.door).character?.locks.find((l) => l.role === 'extra')?.build).toBe('closure');
  });

  it('draws every mark the data names: each becomes decal geometry on its leaf, and a door with none draws none', () => {
    for (const { key, spec } of all) {
      const plan = planDoor(spec);
      const named = plan.character?.marks.length ?? 0;
      const c = createCtx(plan, 'near', plaques, 7, marks);
      buildMarks(c);
      const drawn = c.leaf.reduce((n, b) => n + b.marks.triangleCount, 0);
      // A mark is at least one quad (two triangles); text strips and the stripe are more.
      if (named > 0) expect(drawn, `${key} draws its ${named} marks`).toBeGreaterThanOrEqual(named * 2);
      else expect(drawn, `${key} names none`).toBe(0);
    }
  });

  it('exposed substrate is 2 to 12% of the leaf face, near what the data states', () => {
    for (const { key, spec } of all) {
      const data = spec.character;
      const plan = planDoor(spec).character;
      if (!data || !plan) continue;
      expect(plan.exposure, `${key} exposure`).toBeGreaterThanOrEqual(0.02 * 0.85);
      expect(plan.exposure, `${key} exposure`).toBeLessThanOrEqual(0.12 * 1.15);
      expect(Math.abs(plan.exposure - data.exposure), `${key} exposure against its data`).toBeLessThan(data.exposure * 0.5);
    }
  });

  it('marks cover under 8% of the leaf together', () => {
    for (const { key, spec } of all) {
      const plan = planDoor(spec).character;
      expect(plan?.markCoverage ?? 0, key).toBeLessThan(0.08);
    }
  });

  it('every decal sits on its leaf: nothing hangs over an edge into the frame', () => {
    for (const { key, spec } of all) {
      const plan = planDoor(spec);
      const c = createCtx(plan, 'near', plaques, 7, marks);
      buildSignature(c);
      buildWear(c);
      buildChips(c);
      buildMarks(c);
      plan.leaves.forEach((leaf, i) => {
        const m = (c.leaf[i] as (typeof c.leaf)[number]).marks;
        const x0 = Math.min(leaf.x0, leaf.x1) - 1e-6;
        const x1 = Math.max(leaf.x0, leaf.x1) + 1e-6;
        for (let v = 0; v < m.pos.length; v += 3) {
          const x = m.pos[v] ?? 0;
          const y = m.pos[v + 1] ?? 0;
          expect(x, `${key} leaf ${i} decal x`).toBeGreaterThanOrEqual(x0);
          expect(x, `${key} leaf ${i} decal x`).toBeLessThanOrEqual(x1);
          expect(y, `${key} leaf ${i} decal y`).toBeGreaterThanOrEqual(LEAF_GAP.bottom - 1e-6);
          expect(y, `${key} leaf ${i} decal y`).toBeLessThanOrEqual(LEAF_GAP.bottom + leaf.height + 1e-6);
        }
      });
    }
  });

  it('no two doors share a look: every door differs in dominant colour or motif, and in signature', () => {
    const looks = all.map((d) => `${d.spec.material.primary}|${d.spec.character?.motif}|${lookOf(d.spec).signature}`);
    expect(new Set(looks).size).toBe(all.length);
    expect(new Set(all.map((d) => lookOf(d.spec).signature)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.spec.material.primary)).size).toBe(all.length);
    for (const d of all) expect(keyOfSpec(d.spec), d.key).toBe(d.key);
  });

  it('uses each of the seven motifs somewhere in the corridor', () => {
    const motifs = new Set(all.map((d) => d.spec.character?.motif));
    for (const m of ['vertical-ribs', 'round-aperture', 'gridded-glazing', 'inset-panels', 'diagonal-bracing', 'curved-joinery', 'oval-panels']) {
      expect(motifs.has(m as never), m).toBe(true);
    }
  });

  it('foliage stays inside 150 mm of the wall, and at most two doors carry any', () => {
    const planted = all.filter((d) => planDoor(d.spec).character?.foliage || planDoor(d.spec).character?.pot);
    expect(planted.length).toBeGreaterThan(0);
    expect(planted.length).toBeLessThanOrEqual(2);
    for (const { key, spec } of planted) {
      const f = build(spec).flat.foliage;
      expect(f.triangleCount, `${key} has leaves`).toBeGreaterThan(0);
      expect(f.bounds().max[2], `${key} foliage projection`).toBeLessThanOrEqual(0.15);
    }
  });

  it('far doors are drawn without the dressing: no chips, marks, wear or plants', () => {
    for (const { key, spec } of all) {
      const far = build(spec, 'far');
      expect(far.flat.marks.triangleCount, key).toBe(0);
      expect(far.flat.foliage.triangleCount, key).toBe(0);
    }
  });
});
