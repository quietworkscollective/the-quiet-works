import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, BufferAttribute, Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, Sphere, Vector3, type BufferGeometry, type Object3D } from 'three';
import { gramophone } from '../../../../audio/music/index.ts';
import { needleDown } from '../../../../audio/music/needle.ts';
import { useGramophone } from '../../../../audio/music/useGramophone.ts';
import { useAmbient } from '../../../ambient.ts';
import { loadFonts } from '../../textures/canvas.ts';
import { fittingGain } from '../glow.ts';
import { createPropMaterials, findDonors, type PropMaterials } from '../materials.ts';
import './gramophone.css';
import { CUE, NO_CUE, stepCue, type CueState, type CueViews } from './cue.ts';
import { mountGramophoneIsland } from './island.tsx';
import { armPose, armStep, armTarget, PARTS, PLATTER_REST, platterMoving, platterStep, type PartName, type PlatterState } from './model.ts';
import { gramophonePlacement, toWorld } from './placement.ts';
import { createSpin } from './spin.ts';
import { actionFor, type Target } from './reading.ts';
import { gramophoneUi } from './ui.ts';
import { BUILD_PARTS, buildGramophone, type BuildPart } from './visual.ts';

/**
 * The gramophone in the lobby: a table-top horn gramophone on the left wall beside the notice board,
 * whose platter turns and whose arm swings while a record plays. The behaviour is in `model.ts`, the
 * geometry in `visual.ts`, the words in `reading.ts`; this assembles them in the scene, reports where
 * the visitor's ears are to the sound, and carries the verbs to the shared gramophone.
 *
 * Frames: the scene draws on demand, and nothing here asks for one except to finish a movement the
 * visitor started (the arm, a label's wait). The platter turns only inside the corridor's ambient
 * windows (at most 6 s each, asked for again while the needle is down and the gramophone is in view,
 * never under reduced motion), which is the only reason frames are drawn for it.
 */

const WINDOW_ID = 'gramophone-platter';
/** The longest a frame's step is allowed to be: a hitch must not throw the platter a long way. */
const MAX_STEP_S = 0.1;

export interface GramophoneProps {
  reducedMotion: boolean;
}

interface Rig {
  readonly root: Group;
  readonly groups: Record<PartName, Group>;
  /** The arm's second group: it turns about the horizontal axis, inside the swing. */
  readonly lift: Group;
  readonly materials: PropMaterials;
  /** Light every ivory fitting of `target` by `gain`. */
  glow(target: Target, gain: number): void;
  dispose(): void;
}

function buildRig(parent: Group, scene: Object3D): Rig {
  const built = buildGramophone();
  const materials = createPropMaterials(findDonors(scene), null);
  const root = new Group();
  root.name = 'gramophone';
  const geometries: BufferGeometry[] = [];
  const groups = {} as Record<PartName, Group>;
  const lift = new Group();
  lift.name = 'gramophone:tonearm-lift';
  const colours = new Map<string, { attribute: BufferAttribute; base: Float32Array }>();

  for (const part of BUILD_PARTS) {
    const holder = new Group();
    holder.name = `gramophone:${part}`;
    const spec = PARTS.find((p) => p.name === part);
    if (spec) {
      holder.position.set(spec.pivot[0], spec.pivot[1], spec.pivot[2]);
      groups[spec.name] = holder;
    }
    // The arm's mesh is a child of the lift group, which is a child of the swing.
    const meshParent = part === 'tonearm' ? lift : holder;
    for (const [channel, bucket] of Object.entries(built.buckets[part])) {
      if (bucket.triangleCount === 0) continue;
      const geometry = bucket.toGeometry();
      geometries.push(geometry);
      const mesh = new Mesh(geometry, materials.byChannel[channel as keyof typeof materials.byChannel]);
      mesh.name = `gramophone:${part}:${channel}`;
      meshParent.add(mesh);
      if (channel === 'enamel') {
        const attribute = geometry.getAttribute('color') as BufferAttribute;
        colours.set(part, { attribute, base: new Float32Array(attribute.array) });
      }
    }
    if (part === 'tonearm') holder.add(lift);
    root.add(holder);
  }
  parent.add(root);

  return {
    root,
    groups,
    lift,
    materials,
    glow(target, gain) {
      const k = 1 + gain;
      for (const range of built.fittings) {
        if (range.target !== target) continue;
        const entry = colours.get(range.part);
        if (!entry) continue;
        for (let i = range.start * 3; i < range.end * 3; i += 1) entry.attribute.array[i] = (entry.base[i] ?? 0) * k;
        entry.attribute.needsUpdate = true;
      }
    },
    dispose() {
      root.removeFromParent();
      for (const g of geometries) g.dispose();
      materials.dispose();
    },
  };
}

export function Gramophone({ reducedMotion }: GramophoneProps) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const ambient = useAmbient();
  const state = useGramophone();

  const placement = useMemo(() => gramophonePlacement(), []);
  const built = useMemo(() => buildGramophone(), []);
  const group = useRef<Group>(null);
  const rig = useRef<Rig | null>(null);
  const island = useRef<HTMLElement | null>(null);
  const reduced = useRef(reducedMotion);
  /** The arm's journey and the platter's turn: scene state, advanced by frames. */
  const run = useRef<{ arm: number; platter: PlatterState; held: boolean }>({ arm: 0, platter: PLATTER_REST, held: false });
  const cue = useRef<CueState>(NO_CUE);
  const lastPose = useRef({ x: Number.NaN, z: Number.NaN, yaw: Number.NaN });
  const attention = useRef<Record<Target, number>>({ needle: 0, records: 0 });
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frustum = useMemo(() => new Frustum(), []);
  const scratch = useMemo(() => ({ v: new Vector3(), w: new Vector3(), dir: new Vector3(), m: new Matrix4(), sphere: new Sphere() }), []);

  const hitGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const hitMat = useMemo(() => new MeshBasicMaterial({ visible: false }), []);
  useEffect(
    () => () => {
      hitGeometry.dispose();
      hitMat.dispose();
    },
    [hitGeometry, hitMat],
  );

  // Where each fitting is in the world, for the cues and the labels.
  const fittingWorld = useMemo(() => ({ needle: toWorld(placement, built.fittingAt.needle), records: toWorld(placement, built.fittingAt.records) }), [placement, built]);
  // A sphere round the whole gramophone, for asking whether it is in view.
  const bounds = useMemo(() => {
    const { min, max } = built.bounds();
    const centre = toWorld(placement, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]);
    return { centre, radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
  }, [placement, built]);

  const inView = (): boolean => {
    camera.updateMatrixWorld();
    scratch.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(scratch.m);
    scratch.sphere.set(scratch.v.set(...bounds.centre), bounds.radius);
    return frustum.intersectsSphere(scratch.sphere);
  };

  /** The platter's frames: windows asked of the corridor's scheduler while it turns and can be seen. */
  const spin = useMemo(
    () =>
      createSpin({
        id: WINDOW_ID,
        ambient,
        turning: () => needleDown(gramophone.getState().needle),
        moving: () => platterMoving(run.current.platter),
        inView,
        reduced: () => reduced.current,
        settle: () => {
          run.current.platter = { angle: run.current.platter.angle, speed: 0 };
        },
        timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inView` reads refs and the camera; the scheduler is what changes
    [ambient],
  );
  const keepWindowOpen = spin.keep;

  const applyPose = (): void => {
    const r = rig.current;
    if (!r) return;
    const pose = armPose(run.current.arm);
    r.groups.tonearm.rotation.y = pose.yaw;
    r.lift.rotation.x = -pose.lift;
    r.groups.platter.rotation.y = run.current.platter.angle;
  };

  useEffect(() => {
    reduced.current = reducedMotion;
    if (reducedMotion) {
      run.current = { arm: armTarget(gramophone.getState().needle), platter: PLATTER_REST, held: false };
      applyPose();
    }
    keepWindowOpen();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the helpers read refs; only the setting matters
  }, [reducedMotion]);

  // The needle moved: the arm has a journey to make, and the platter may need frames.
  useEffect(() => {
    run.current.held = false;
    if (reduced.current) {
      run.current = { arm: armTarget(state.needle), platter: PLATTER_REST, held: false };
      applyPose();
    }
    keepWindowOpen();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [state.needle]);

  // The three.js objects, once the world's materials exist to borrow from.
  useEffect(() => {
    const parent = group.current;
    if (!parent) return;
    let alive = true;
    let teardown: (() => void) | undefined;
    void loadFonts().then(() => {
      if (!alive) return;
      const made = buildRig(parent, scene);
      rig.current = made;
      run.current = { arm: armTarget(gramophone.getState().needle), platter: PLATTER_REST, held: false };
      applyPose();
      gl.domElement.dataset['gramophone'] = 'ready';
      invalidate();
      const hook = import.meta.env.DEV ? installDevHook(run, applyPose, invalidate) : undefined;
      teardown = () => {
        hook?.();
        rig.current = null;
        delete gl.domElement.dataset['gramophone'];
        made.dispose();
      };
    });
    return () => {
      alive = false;
      teardown?.();
    };
  }, [scene, gl, invalidate]);

  // The DOM equivalent and the cue labels: a root of their own beside the page's.
  useEffect(() => {
    const mounted = mountGramophoneIsland();
    island.current = mounted.host;
    return () => {
      island.current = null;
      mounted.unmount();
    };
  }, []);

  // What the pointer and the keyboard are on lights the fitting.
  useEffect(
    () =>
      gramophoneUi.subscribe(() => {
        invalidate();
      }),
    [invalidate],
  );
  // A wait that runs on while the camera rests needs a frame at its end, to be looked at again.
  useEffect(
    () => () => {
      spin.stop();
      if (wake.current !== null) clearTimeout(wake.current);
    },
    [spin],
  );

  const worldFitting = (target: Target): Vector3 => scratch.w.set(...fittingWorld[target]);

  useFrame((frame, delta) => {
    const r = rig.current;
    if (!r) return;
    r.materials.syncEnvironment();
    const dt = Math.min(delta, MAX_STEP_S);
    const needle = gramophone.getState().needle;

    // Where the listener is, for the sound.
    const p = frame.camera.position;
    const dir = frame.camera.getWorldDirection(scratch.dir);
    const yawDeg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
    const last = lastPose.current;
    if (!(Math.abs(p.x - last.x) < 0.005 && Math.abs(p.z - last.z) < 0.005 && Math.abs(yawDeg - last.yaw) < 0.25)) {
      lastPose.current = { x: p.x, z: p.z, yaw: yawDeg };
      gramophone.setListener({ x: p.x, z: p.z, yawDeg });
    }

    // The arm: a journey the visitor started, finished frame by frame.
    const target = armTarget(needle);
    if (run.current.held) {
      // A screenshot script has posed it by hand: leave it as it is.
    } else if (run.current.arm !== target) {
      run.current.arm = reduced.current ? target : armStep(run.current.arm, target, dt);
      applyPose();
      if (run.current.arm !== target) invalidate();
    }

    // The platter: only while frames are being drawn for some other reason, which includes its own ambient windows.
    const turning = needleDown(needle) && !reduced.current;
    if (!run.current.held && (turning || platterMoving(run.current.platter))) {
      run.current.platter = platterStep(run.current.platter, turning, dt, reduced.current);
      applyPose();
      if (!spin.open() && !spin.waiting()) keepWindowOpen();
    }

    updateLabels(frame.size, dir, p);
  });

  /** The cue labels: where each fitting is on the screen, which (if any) is shown, and what is lit. */
  function updateLabels(size: { width: number; height: number }, forward: Vector3, eye: Vector3): void {
    const host = island.current;
    const rect = gl.domElement.getBoundingClientRect();
    const views = {} as Record<Target, CueViews[Target]>;
    for (const target of ['needle', 'records'] as const) {
      const at = worldFitting(target);
      const toFitting = scratch.v.copy(at).sub(eye);
      const distance = toFitting.length();
      const angleDeg = distance === 0 ? 0 : (Math.acos(Math.min(1, Math.max(-1, toFitting.dot(forward) / distance))) * 180) / Math.PI;
      // A fitting on a wall is hidden from anyone behind the wall's plane (the lobby's left wall faces +x).
      const facing = (eye.x - at.x) * placement.normal[0] + (eye.z - at.z) * placement.normal[2] > 0;
      views[target] = { distance, angleDeg, occluded: !facing };
      const projected = scratch.v.copy(at).project(camera);
      const x = rect.left + ((projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - projected.y) / 2) * rect.height;
      const onScreen = projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      gramophoneUi.setScreen(target, x, y, onScreen);
      host?.style.setProperty(`--gramophone-${target}-x`, `${Math.round(Math.min(Math.max(x, 16), size.width - 16))}px`);
      host?.style.setProperty(`--gramophone-${target}-y`, `${Math.round(Math.min(Math.max(y, 24), size.height - 24))}px`);
    }

    const now = performance.now();
    cue.current = stepCue(cue.current, views as CueViews, now);
    // A wait or an occlusion that runs out while the camera rests needs one frame at its end.
    const pending = cue.current.waiting !== null ? CUE.showAfterMs : cue.current.occludedSince !== null ? CUE.occludedMs : 0;
    if (pending > 0 && wake.current === null) {
      wake.current = setTimeout(() => {
        wake.current = null;
        invalidate();
      }, pending + 10);
    }

    const hover = gramophoneUi.state.hover;
    const focus = gramophoneUi.state.focus;
    for (const target of ['needle', 'records'] as const) {
      const shown = focus === null && (hover === target || (hover === null && cue.current.shown === target));
      host?.querySelector<HTMLElement>(`.tqw-gramophone__cue[data-target="${target}"]`)?.setAttribute('data-shown', shown ? 'true' : 'false');
      const lit = hover === target || focus === target || cue.current.shown === target ? 1 : 0;
      if (attention.current[target] !== lit) {
        attention.current[target] = lit;
        rig.current?.glow(target, fittingGain(lit, 0));
        invalidate();
      }
    }
  }

  const onPointer = (target: Target, kind: 'over' | 'out' | 'click'): void => {
    if (kind === 'over') {
      gramophoneUi.setHover(target);
      gl.domElement.closest('.tqw-corridor-canvas')?.setAttribute('data-over', 'gramophone');
    } else if (kind === 'out') {
      if (gramophoneUi.state.hover === target) gramophoneUi.setHover(null);
      const surface = gl.domElement.closest('.tqw-corridor-canvas');
      if (surface?.getAttribute('data-over') === 'gramophone') surface.removeAttribute('data-over');
    } else {
      // The verb the visitor saw when they pressed, not the one the first gesture's own unlock has made of it.
      gramophone.press(gramophoneUi.take(target, actionFor(gramophone.getState(), target).verb));
    }
  };

  return (
    <group ref={group} position={[placement.wallX, 0, placement.z]} rotation={[0, placement.yaw, 0]} dispose={null}>
      {(['needle', 'records'] as const).map((target) => {
        const area = built.hits[target];
        return (
          <mesh
            key={target}
            name={`gramophone-hit-${target}`}
            position={area.centre}
            scale={area.size}
            geometry={hitGeometry}
            material={hitMat}
            onPointerOver={(e) => {
              e.stopPropagation();
              onPointer(target, 'over');
            }}
            onPointerOut={() => onPointer(target, 'out')}
            onPointerDown={() => gramophoneUi.arm(target, actionFor(gramophone.getState(), target).verb)}
            onClick={(e) => {
              e.stopPropagation();
              onPointer(target, 'click');
            }}
          />
        );
      })}
    </group>
  );
}

interface DevHook {
  /** Pose the gramophone from a screenshot script: the arm's journey 0..1 and the platter's angle in radians. */
  pose(arm: number, platter: number): void;
}

/** Development only: `window.__tqwGramophone` poses the gramophone for a screenshot script. Stripped from production builds. */
function installDevHook(run: { current: { arm: number; platter: PlatterState; held: boolean } }, apply: () => void, invalidate: () => void): () => void {
  const hook: DevHook = {
    pose(arm, platter) {
      run.current = { arm, platter: { angle: platter, speed: 0 }, held: true };
      apply();
      invalidate();
    },
  };
  (window as unknown as { __tqwGramophone?: DevHook }).__tqwGramophone = hook;
  return () => {
    delete (window as unknown as { __tqwGramophone?: DevHook }).__tqwGramophone;
  };
}

export type { BuildPart };
