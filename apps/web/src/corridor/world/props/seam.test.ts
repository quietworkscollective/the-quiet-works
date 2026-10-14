import { BoxGeometry, Group, Matrix4, Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createPropAnimation, PROPS } from '../../props.ts';
import { buildProps } from './build.ts';
import { ATTENTION_GAIN, GLINT_GAIN, fittingGain } from './glow.ts';
import { hitBoxes } from './hit.ts';
import { createPropMaterials } from './materials.ts';
import type { PropVisual } from './model.ts';
import { MODELS } from './models/index.ts';
import { NO_AMBIENT } from './motion.ts';
import { Assembly } from './parts.ts';
import { placementOf, toWorld } from './placement.ts';
import { createPropsRig } from './rig.ts';
import { displacement, poseOf } from './testkit.ts';
import type { ExternalFactory, ExternalInstance } from './visuals.ts';

const placement = placementOf('football');
const model = MODELS.find((m) => m.id === 'football');
if (!model) throw new Error('no football');

/** A stand-in for a real model's scene graph: one node per part at the part's world pivot, a box in each. */
function fakeExternal(dispose = vi.fn(), setGlow = vi.fn()): { factory: ExternalFactory; dispose: typeof dispose; setGlow: typeof setGlow } {
  const factory: ExternalFactory = (p, parts) => {
    const root = new Group();
    const nodes = new Map<string, Object3D>();
    for (const part of parts) {
      const node = new Object3D();
      const [x, y, z] = toWorld(p, part.pivot);
      node.position.set(x, y, z);
      root.add(node);
      nodes.set(part.name, node);
    }
    const made: ExternalInstance = { root, part: (name) => nodes.get(name), setGlow, dispose };
    return made;
  };
  return { factory, dispose, setGlow };
}

describe('behaviour and visual are separate', () => {
  it('has the procedural visual attach geometry to exactly the parts its behaviour names, at their pivots', () => {
    const assembly = buildProps();
    for (const m of MODELS) {
      const p = placementOf(m.id);
      const named = m.parts(p).map((s) => s.name).sort();
      const built = assembly.bones.filter((b) => b.prop === m.id).map((b) => b.part).sort();
      expect(built, `${m.id}: parts built and parts named`).toEqual(named);
      for (const spec of m.parts(p)) {
        const bone = assembly.bones.find((b) => b.prop === m.id && b.part === spec.name);
        const [x, y, z] = toWorld(p, spec.pivot);
        expect(bone?.pivot[0]).toBeCloseTo(x, 9);
        expect(bone?.pivot[1]).toBeCloseTo(y, 9);
        expect(bone?.pivot[2]).toBeCloseTo(z, 9);
      }
    }
  });

  it('refuses a visual that attaches geometry to a part the behaviour does not have', () => {
    const a = new Assembly();
    a.begin(placement, model.parts(placement));
    expect(() => a.part('wing')).toThrow(/no part called wing/);
  });
});

describe('another procedural visual replaces the geometry and leaves the behaviour alone', () => {
  // A plain box on the ball's part, standing where the football's rack is.
  const box: PropVisual = {
    build(a) {
      a.on(a.part('ball'), () => a.mesh('matte', new BoxGeometry(0.2, 0.2, 0.2), new Matrix4().makeTranslation(0, placement.height, 0.15), [0.5, 0.5, 0.5]));
    },
  };
  const swapped = buildProps({ procedural: { football: box } });
  const original = buildProps();

  it('builds the replacement in place of the football, and nothing else changes', () => {
    expect(swapped.trianglesBy.get('football')).toBe(12);
    expect(original.trianglesBy.get('football')).toBeGreaterThan(500);
    for (const m of MODELS) if (m.id !== 'football') expect(swapped.trianglesBy.get(m.id), m.id).toBe(original.trianglesBy.get(m.id));
    const b = swapped.bounds.get('football');
    expect(b?.min[1]).toBeCloseTo(placement.height - 0.1, 6);
  });

  it('moves the replacement with the football\'s own pose: the behaviour is the same code', () => {
    expect(displacement(swapped, 'football', poseOf('football', 0.5), {})).toBeGreaterThan(0.01);
    expect(displacement(swapped, 'football', poseOf('football', 1), {})).toBeLessThan(1e-4);
  });

  it('keeps the football\'s hit area, which comes from the box now, at least as generous as before', () => {
    const swappedBoxes = hitBoxes(swapped);
    for (const b of swappedBoxes) {
      expect(b.size[1], `${b.id} height`).toBeGreaterThanOrEqual(0.42 - 1e-9);
      expect(b.size[2], `${b.id} along`).toBeGreaterThanOrEqual(0.42 - 1e-9);
    }
  });
});

describe('an external visual brings its own scene graph', () => {
  it('declares the prop\'s parts and builds no geometry, and the hit area comes from the contract\'s size', () => {
    const { factory } = fakeExternal();
    const assembly = buildProps({ external: { football: factory } });
    expect(assembly.bounds.has('football')).toBe(false);
    expect(assembly.trianglesBy.has('football')).toBe(false);
    expect(assembly.bones.some((b) => b.prop === 'football' && b.part === 'ball')).toBe(true);
    const boxes = hitBoxes(assembly);
    expect(boxes.length).toBe(PROPS.length);
    const ball = boxes.find((b) => b.id === 'football');
    if (!ball) throw new Error('no hit area');
    const p = placementOf('football');
    expect(ball.centre[2]).toBeCloseTo(p.z, 6);
    expect(ball.size[1]).toBeGreaterThanOrEqual(0.42 - 1e-9);
    expect(ball.size[2]).toBeGreaterThanOrEqual(0.42 - 1e-9);
    // The football's wall is the left: its box stands in the room from the wall.
    expect(ball.centre[0] - ball.size[0] / 2).toBeLessThanOrEqual(p.wallX + 1e-9);
  });

  it('poses its part nodes exactly as it poses bones, and sets its fitting glow', () => {
    const ext = fakeExternal();
    const assembly = buildProps({ external: { football: ext.factory } });
    const materials = createPropMaterials(null, null);
    // The component calls the factory when it mounts; the rig takes what it made.
    const instance = ext.factory(placement, model.parts(placement));
    const rig = createPropsRig(assembly, materials, { football: instance });
    expect(rig.root.children).toContain(instance.root);
    const node = instance.part('ball');
    if (!node) throw new Error('no node');
    const rest = node.position.clone();
    const animation = createPropAnimation();
    animation.football.action = 0.5;
    animation.football.glint = 1;
    rig.update(animation, NO_AMBIENT, false);
    // The ball's pose moves it out from the wall and turns it.
    expect(node.position.distanceTo(rest)).toBeGreaterThan(0.001);
    expect(node.quaternion.angleTo(new Object3D().quaternion)).toBeGreaterThan(0.5);
    expect(ext.setGlow).toHaveBeenLastCalledWith(fittingGain(0, 1));
    expect(ext.setGlow.mock.lastCall?.[0]).toBeLessThanOrEqual(GLINT_GAIN + 1e-9);
    animation.football.attention = 1;
    rig.update(animation, NO_AMBIENT, false);
    expect(ext.setGlow.mock.lastCall?.[0]).toBeCloseTo(ATTENTION_GAIN + GLINT_GAIN, 9);
    // Let go: back at rest exactly.
    animation.football.action = 0;
    animation.football.attention = 0;
    animation.football.glint = 0;
    rig.update(animation, NO_AMBIENT, false);
    expect(node.position.distanceTo(rest)).toBeLessThan(1e-9);
    expect(ext.setGlow.mock.lastCall?.[0]).toBe(0);
    rig.dispose();
    materials.dispose();
  });

  it('frees the instance with the rig, and leaves the scene', () => {
    const ext = fakeExternal();
    const assembly = buildProps({ external: { football: ext.factory } });
    const materials = createPropMaterials(null, null);
    const instance = ext.factory(placement, model.parts(placement));
    const rig = createPropsRig(assembly, materials, { football: instance });
    const host = new Group();
    host.add(rig.root);
    rig.dispose();
    expect(ext.dispose).toHaveBeenCalledTimes(1);
    expect(instance.root.parent).toBeNull();
    materials.dispose();
  });

  it('hands the factory the placement and the behaviour\'s own parts', () => {
    const seen: string[] = [];
    const factory: ExternalFactory = (p, parts) => {
      seen.push(...parts.map((s) => s.name));
      expect(p.id).toBe('football');
      return { root: new Group(), part: () => undefined, dispose: () => undefined };
    };
    buildProps({ external: { football: factory } });
    // buildProps only declares: the factory is the rig's to call, so nothing was made here.
    expect(seen).toEqual([]);
    expect(model.parts(placement).map((s) => s.name)).toEqual(['ball']);
  });
});

describe('ingesting a ready-made geometry', () => {
  it('takes a mesh into a channel, tinted, in prop-local metres, on the current bone', () => {
    const a = new Assembly();
    a.begin(placement, model.parts(placement));
    const ball = a.part('ball');
    a.on(ball, () => a.mesh('matte', new BoxGeometry(1, 1, 1), new Matrix4().makeScale(0.1, 0.1, 0.1), [0.2, 0.4, 0.6]));
    expect(a.channels.matte.bucket.triangleCount).toBe(12);
    expect(a.channels.matte.bone.every((b) => b === ball)).toBe(true);
    expect(a.channels.matte.owner.every((o) => o === 'football')).toBe(true);
    const bounds = a.bounds.get('football');
    const size = new Vector3((bounds?.max[0] ?? 0) - (bounds?.min[0] ?? 0), (bounds?.max[1] ?? 0) - (bounds?.min[1] ?? 0), (bounds?.max[2] ?? 0) - (bounds?.min[2] ?? 0));
    expect(size.x).toBeCloseTo(0.1, 9);
    expect(size.y).toBeCloseTo(0.1, 9);
    expect(size.z).toBeCloseTo(0.1, 9);
    expect(a.channels.matte.bucket.col[0]).toBeCloseTo(0.2, 9);
  });
});
