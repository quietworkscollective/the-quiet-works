import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, type Group } from 'three';
import { useAmbient } from '../../ambient.ts';
import { PROPS, type PropAnimation, type PropId } from '../../props.ts';
import { loadFonts } from '../textures/canvas.ts';
import { startTouches, type Touches } from './ambientTouches.ts';
import { makePropAtlas } from './atlas.ts';
import { buildProps } from './build.ts';
import { hitBoxes, pointerHandlers } from './hit.ts';
import { Gramophone } from './gramophone/Gramophone.tsx';
import { createPropMaterials, findDonors, type PropMaterials } from './materials.ts';
import { loadModelKit, type PropModelKit } from './modelKit.ts';
import { PROP_MODEL_IDS, propModelSource } from './modelSources.ts';
import { NO_AMBIENT, type AmbientDrive } from './motion.ts';
import type { Assembly } from './parts.ts';
import { createPropsRig, type PropsRig } from './rig.ts';
import { MODELS } from './models/index.ts';
import { placementOf } from './placement.ts';
import { PropVisualsContext, type ExternalInstance } from './visuals.ts';

export interface CorridorPropsProps {
  animation: PropAnimation;
  reducedMotion: boolean;
  onPointer(id: PropId, kind: 'over' | 'out' | 'click'): void;
}

/**
 * The twelve things to touch in the lobby and corridor (ADR 0004). The props are skinned meshes
 * built once from `buildProps()` (a handful of draw calls for all of them) and posed from the
 * per-frame state the interaction lane writes into `animation`; the hit areas are invisible boxes
 * that report the pointer. Nothing here asks for a frame: the props move when a frame is drawn
 * for some other reason (a hover, an action, an ambient window), and never otherwise.
 */
export function CorridorProps({ animation, reducedMotion, onPointer }: CorridorPropsProps) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const built = useRef<{ rig: PropsRig; materials: PropMaterials } | null>(null);
  const reduced = useRef(reducedMotion);
  const touches = useRef<Touches | null>(null);
  /** Development only: a screenshot script can pin the ambient motions. */
  const pinned = useRef<AmbientDrive | null>(null);
  const ambient = useAmbient();

  // The procedural visuals unless a provider supplies others (see visuals.ts).
  const visuals = useContext(PropVisualsContext);
  const [modelsRequested, setModelsRequested] = useState(false);
  const [modelKit, setModelKit] = useState<PropModelKit | null>(null);
  const assembly = useMemo(() => buildProps(visuals, modelKit ?? undefined), [visuals, modelKit]);
  const hits = useMemo(() => hitBoxes(assembly), [assembly]);
  const handlePointer = useCallback((id: PropId, kind: 'over' | 'out' | 'click') => {
    onPointer(id, kind);
    // The ready-made models are a local enhancement. Load them only after a visitor acts on a
    // prop, so no model payload joins the landing/corridor's first-visit download.
    if (kind === 'click') setModelsRequested(true);
  }, [onPointer]);
  const hitGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  // Invisible: raycast by the pointer, never drawn.
  const hitMaterial = useMemo(() => new MeshBasicMaterial({ visible: false }), []);
  useEffect(
    () => () => {
      hitGeometry.dispose();
      hitMaterial.dispose();
    },
    [hitGeometry, hitMaterial],
  );

  useEffect(() => {
    reduced.current = reducedMotion;
    invalidate();
  }, [reducedMotion, invalidate]);

  // The props' own two small motions: windows asked of the scheduler now and then, none under reduced motion.
  useEffect(() => {
    const running = startTouches(ambient, reducedMotion);
    touches.current = running;
    return () => {
      running.stop();
      touches.current = null;
    };
  }, [ambient, reducedMotion]);

  // Model modules contain the props' ready-made GLBs. Do not ask Vite for them until a prop is
  // actually activated; the procedural assembly remains complete while they load.
  useEffect(() => {
    if (!modelsRequested) return;
    let alive = true;
    let loaded: PropModelKit | null = null;
    const lite = findDonors(scene)?.oak instanceof MeshLambertMaterial;
    void loadModelKit(PROP_MODEL_IDS, propModelSource, {
      lite,
      anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
    }).then((kit) => {
      if (!alive) {
        kit.dispose();
        return;
      }
      loaded = kit;
      setModelKit(kit);
      invalidate();
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [modelsRequested, scene, gl, invalidate]);

  // The props borrow the world's shader and grain, so they are made once the world's meshes exist,
  // and their lettering is drawn once the fonts are ready.
  useEffect(() => {
    const parent = group.current;
    if (!parent) return;
    let alive = true;
    let teardown: (() => void) | undefined;
    void loadFonts().then(() => {
      if (!alive) return;
      const donors = findDonors(scene);
      const lite = donors?.oak instanceof MeshLambertMaterial;
      const atlas = makePropAtlas(lite ? 1 : Math.min(8, gl.capabilities.getMaxAnisotropy()));
      const materials = createPropMaterials(donors, atlas, modelKit?.textures ?? null);
      const externals: Partial<Record<PropId, ExternalInstance>> = {};
      for (const model of MODELS) {
        const make = visuals.external?.[model.id];
        if (make) externals[model.id] = make(placementOf(model.id), model.parts(placementOf(model.id)));
      }
      const rig = createPropsRig(assembly, materials, externals);
      parent.add(rig.root);
      built.current = { rig, materials };
      gl.domElement.dataset['props'] = String(PROPS.length);
      invalidate();
      const hook = import.meta.env.DEV ? installDevHook({ animation, rig, materials, kit: modelKit, assembly, pinned, reduced }) : undefined;
      teardown = () => {
        hook?.();
        built.current = null;
        delete gl.domElement.dataset['props'];
        rig.dispose();
        materials.dispose();
      };
    });
    return () => {
      alive = false;
      teardown?.();
    };
  }, [assembly, visuals, scene, gl, invalidate, animation, modelKit]);

  useFrame(() => {
    const current = built.current;
    if (!current) return;
    // The world binds its reflection environment after the props mount: take it as soon as it is there.
    current.materials.syncEnvironment();
    current.rig.update(animation, pinned.current ?? touches.current?.drive() ?? NO_AMBIENT, reduced.current);
  });

  return (
    <group ref={group} dispose={null}>
      {/* The thirteenth thing in the lobby, apart from the twelve: it has its own behaviour, words and sound (see gramophone/). */}
      <Gramophone reducedMotion={reducedMotion} />
      {hits.map((h) => (
        <mesh
          key={h.id}
          name={`prop-hit-${h.id}`}
          position={h.centre}
          scale={h.size}
          geometry={hitGeometry}
          material={hitMaterial}
          {...pointerHandlers(h.id, handlePointer)}
        />
      ))}
    </group>
  );
}

interface DevHookArgs {
  animation: PropAnimation;
  rig: PropsRig;
  materials: PropMaterials;
  kit: PropModelKit | null;
  assembly: Assembly;
  pinned: { current: AmbientDrive | null };
  reduced: { current: boolean };
}

/**
 * Development only: `window.__tqwProps` poses the props from a screenshot script (the dev build's
 * canvas draws on demand, so a script sets the motion, then asks for a frame). Stripped from
 * production builds.
 */
function installDevHook({ animation, rig, materials, kit, assembly, pinned, reduced }: DevHookArgs): () => void {
  const hook = {
    animation,
    rig,
    kit,
    assembly,
    /** Pose the props from `animation` now, so the next draw shows them. */
    apply() {
      materials.syncEnvironment();
      return rig.update(animation, pinned.current ?? NO_AMBIENT, reduced.current);
    },
    set(id: PropId, motion: Partial<PropAnimation[PropId]>) {
      Object.assign(animation[id], motion);
      return hook.apply();
    },
    /** Hold the two ambient motions at given displacements (-1..1). */
    touch(sleeve: number, tag: number) {
      pinned.current = { sleeve, tag };
      return hook.apply();
    },
    reset() {
      for (const p of PROPS) Object.assign(animation[p.id], { attention: 0, action: 0, glint: 0 });
      pinned.current = null;
      return hook.apply();
    },
  };
  (window as unknown as { __tqwProps?: typeof hook }).__tqwProps = hook;
  return () => {
    delete (window as unknown as { __tqwProps?: typeof hook }).__tqwProps;
  };
}
