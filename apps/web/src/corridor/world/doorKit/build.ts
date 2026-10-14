import { Matrix4 } from 'three';
import type { DoorSpec, Handle } from '../../doorKit.ts';
import type { PlaqueLayout } from '../artLayout.ts';
import type { MarksLayout } from '../marksLayout.ts';
import { BUCKET_KEYS, createBuckets, type Buckets } from '../buckets.ts';
import { buildClosure } from './closures.ts';
import { buildChips, buildMarks, buildWear } from './dress.ts';
import { buildFoliage } from './foliage.ts';
import { buildLocks } from './locks.ts';
import { buildSignature } from './signatures.ts';
import { createCtx, zFace, type Ctx } from './ctx.ts';
import { buildCeremonial, buildGlazedOffice, buildPanelled, buildSteel, buildTransom } from './families.ts';
import {
  buildDoormat,
  buildGauge,
  buildHatch,
  buildLamp,
  buildLetterbox,
  buildNumeral4,
  buildPlaque,
  buildRivets,
} from './fittings.ts';
import { handleDir, buildHandle } from './handles.ts';
import { LEAF_THICKNESS, planDoor, type DoorPlan, type PlanPart } from './plan.ts';
import { buildPatch } from './opening.ts';
import type { Vec3 } from '../math.ts';
import { nth } from '../math.ts';

/**
 * A door spec turned into geometry, in door-local space (see plan.ts). `flat` is every part at
 * rest, for doors that never move (blank doors are baked into the world with it). `leaves` holds
 * each leaf and its handle again with their origins at their pivots, for the four chamber doors
 * whose leaf swings and whose handle turns.
 */
export interface DoorBuild {
  plan: DoorPlan;
  flat: Buckets;
  fixed: Buckets;
  leaves: LeafBuild[];
}

export interface LeafBuild {
  index: number;
  /** The hinge's vertical axis, door-local: x at the hinge edge, z mid-thickness. */
  pivot: Vec3;
  hinge: 'left' | 'right';
  /** Leaf geometry with its origin at `pivot`. */
  body: Buckets;
  handle: {
    kind: Handle;
    /** Door-local pivot of the turning part, and its offset from the leaf pivot. */
    pivot: Vec3;
    offset: Vec3;
    /** Which way the lever points along the leaf (see handles.ts). */
    dir: 1 | -1;
    /** Handle geometry with its origin at its own pivot. */
    geo: Buckets;
  } | null;
}

export interface DoorOptions {
  lod: 'near' | 'far';
  plaques: PlaqueLayout;
  /** Where each stencil string sits on the marks atlas (derived from the spec when omitted). */
  marks?: MarksLayout;
  /** Build pivot-relative leaves too (the chamber doors). */
  animated: boolean;
  seed: number;
}

function addAll(into: Buckets, from: Buckets, matrix: Matrix4): void {
  for (const key of BUCKET_KEYS) if (from[key].triangleCount > 0) into[key].append(from[key], matrix);
}

function shifted(from: Buckets, by: Vec3): Buckets {
  const out = createBuckets();
  addAll(out, from, new Matrix4().makeTranslation(-by[0], -by[1], -by[2]));
  return out;
}

export function buildDoor(spec: DoorSpec, options: DoorOptions): DoorBuild {
  const plan = planDoor(spec);
  const c: Ctx = createCtx(plan, options.lod, options.plaques, options.seed, options.marks);

  switch (spec.family) {
    case 'panelled-timber':
      buildPanelled(c);
      break;
    case 'glazed-office':
      buildGlazedOffice(c);
      break;
    case 'steel-insertion':
      buildSteel(c);
      break;
    case 'ceremonial-double':
      buildCeremonial(c);
      break;
  }
  buildTransom(c);
  buildPatch(
    c.fixed,
    spec,
    { colour: [1.1, 1.04, 0.95], uv: { du: 0.9, dv: 0.3 } },
    { colour: [0.78, 0.76, 0.72] },
  );

  const handles: PlanPart[] = [];
  for (const part of plan.parts) {
    switch (part.kind) {
      case 'plaque':
        buildPlaque(c, part);
        break;
      case 'hatch':
        buildHatch(c, part);
        break;
      case 'lamp':
        buildLamp(c, part);
        break;
      case 'handle':
        handles.push(part);
        buildHandle(c, part, spec.handle);
        break;
      case 'closure-chain':
      case 'closure-padlock':
      case 'closure-seal':
      case 'closure-bolt':
        buildClosure(c, part);
        break;
      case 'fitting-number-4':
        buildNumeral4(c, part);
        break;
      case 'fitting-doormat':
        buildDoormat(c, part);
        break;
      case 'fitting-letterbox':
        buildLetterbox(c, part);
        break;
      case 'fitting-pressure-gauge':
        buildGauge(c, part);
        break;
      case 'fitting-rivets':
        buildRivets(c, part);
        break;
      default:
    }
  }

  // The character: locks and its signature first (they add relief), then the dressing: wear,
  // then chips over it, then marks on top.
  buildLocks(c);
  buildSignature(c);
  buildFoliage(c);
  buildWear(c);
  buildChips(c);
  buildMarks(c);

  const flat = createBuckets();
  const identity = new Matrix4();
  addAll(flat, c.fixed, identity);
  for (const lb of c.leaf) addAll(flat, lb, identity);
  for (const hb of c.handle) addAll(flat, hb, identity);

  const leaves: LeafBuild[] = [];
  if (options.animated) {
    plan.leaves.forEach((leaf, i) => {
      const t = LEAF_THICKNESS[spec.family];
      const pivot: Vec3 = [leaf.x0, 0, zFace - t / 2];
      const handlePart = handles.find((h) => h.leaf === i);
      const handleBuilt = nth(c.handle, i);
      const hasHandle = handlePart !== undefined && BUCKET_KEYS.some((k) => handleBuilt[k].triangleCount > 0);
      let handle: LeafBuild['handle'] = null;
      if (handlePart && hasHandle) {
        const hp: Vec3 = [handlePart.centre[0], handlePart.centre[1], zFace];
        handle = {
          kind: spec.handle,
          pivot: hp,
          offset: [hp[0] - pivot[0], hp[1] - pivot[1], hp[2] - pivot[2]],
          dir: handleDir(c, i),
          geo: shifted(handleBuilt, hp),
        };
      }
      leaves.push({ index: i, pivot, hinge: leaf.hinge, body: shifted(nth(c.leaf, i), pivot), handle });
    });
  }
  return { plan, flat, fixed: c.fixed, leaves };
}
