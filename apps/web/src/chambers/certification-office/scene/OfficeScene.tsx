import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect, useSyncExternalStore } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { DESK, type Navigation } from './navigation.ts';
import { OfficeAsset } from './OfficeAsset.tsx';
import { officeAssetPose } from './assetSlots.ts';
import { Application } from './Application.tsx';
import { ContextualCue } from './ContextualCue.tsx';
import { OfficeCamera } from './OfficeCamera.tsx';
import { createCursorControl, createView, SceneContext, useFontsReady, type SceneContextValue } from './context.ts';
import { Desk } from './Desk.tsx';
import { Director } from './director.ts';
import { Lamp } from './Lamp.tsx';
import { Wear } from './Wear.tsx';
import { bindAfterFirstFrame } from './firstFrame.ts';
import { InspectionLamp } from './InspectionLamp.tsx';
import { Machine } from './Machine.tsx';
import { createMaterials } from './materials.ts';
import { PALETTE } from './palette.ts';
import { Room } from './Room.tsx';
import { RoomObjects } from './RoomObjects.tsx';
import { StampPress } from './StampPress.tsx';
import { areFontsLoaded, loadFonts } from './textures.ts';
import { whenOfficeReady } from './ready.ts';
import type { OfficeSceneProps } from './types.ts';
import { BakedSpace } from '../../../baked/BakedSpace.tsx';
import { LookStack, OFFICE_LOOK, type AtmosphereLamp } from '../../../look/index.ts';

// Start fetching the canvas fonts as soon as the scene chunk loads.
void loadFonts();

/**
 * @react-three/fiber 9.8 still builds a THREE.Clock, which three 0.186 flags as deprecated with a
 * console warning on every start-up. The app ships with no console noise, so that one message is
 * dropped; everything else passes through untouched. Remove when fiber moves to THREE.Timer.
 */
const CLOCK_WARNING = 'THREE.Clock: This module has been deprecated';
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith(CLOCK_WARNING)) return;
  originalWarn(...args);
};

const COARSE_QUERY = '(pointer: coarse)';

/** The lamps that carry a shaft of light: the desk lamp, the ceiling fittings and the window. */
const OFFICE_LAMPS: readonly AtmosphereLamp[] = [
  { id: 'desk-lamp', kind: 'desk-lamp', position: [-2.3, 1.4, 4.28], direction: [1.3, -0.57, -0.28] },
  { id: 'ceiling-centre', kind: 'ceiling-fitting', position: [0, 5.6, 6], direction: [0, -1, 0] },
  { id: 'inspection', kind: 'ceiling-fitting', position: [3, 3.6, 1.8], direction: [0.35, -3.15, 1.5] },
  { id: 'speaking-window', kind: 'window', position: [-2.25, 1.55, 7.9], direction: [0.12, -0.2, -1] },
];

// Module-level so a parent re-render never hands fiber a "new" configuration, which would reset
// the standing camera framing.
const CAMERA_PROPS = { fov: 48, near: 0.05, far: 45, position: [0, 1.62, 0.8] } as const;
const GL_PROPS = { antialias: true, powerPreference: 'high-performance' } as const;

/**
 * The Certification Office. Everything animates from store state and cues (never from its own
 * pointer handlers), and the render loop is on demand: with nothing moving, no frames are drawn.
 */
export default function OfficeScene(props: OfficeSceneProps) {
  const { store, reducedMotion } = props;
  const fontsReady = useFontsReady();
  const [prepared, setPrepared] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const handlers = useRef(props);
  const loseCleanup = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  const coarse = useMemo(() => window.matchMedia(COARSE_QUERY).matches, []);
  const dpr = useMemo<[number, number]>(
    () => [1, Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)],
    [coarse],
  );
  const director = useMemo(() => new Director(store), [store]);
  const [motion] = useState(() => ({ reduced: reducedMotion }));
  const [view] = useState(createView);

  useEffect(() => {
    handlers.current = props;
  });
  useEffect(() => {
    motion.reduced = reducedMotion;
  }, [motion, reducedMotion]);
  useEffect(() => director.attach(), [director]);
  // Layout cleanup, not a passive one: fiber force-loses the context as the canvas unmounts, and
  // that event fires within the same commit. Unmounting is not a lost context.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loseCleanup.current?.();
      loseCleanup.current = null;
      director.setInvalidate(null);
    };
  }, [director]);

  const onCreated = useCallback(
    (state: RootState) => {
      const { gl } = state;
      gl.domElement.setAttribute('aria-hidden', 'true');
      gl.toneMapping = ACESFilmicToneMapping;
      // Exposure stays at 1: the mood is set by the light intensities, not by lifting the whole frame.
      gl.toneMappingExposure = 1;
      const onLost = () => {
        if (mounted.current) handlers.current.onContextLost();
      };
      gl.domElement.addEventListener('webglcontextlost', onLost);
      director.setInvalidate(state.invalidate);
      const cancelLog = import.meta.env.DEV ? logFirstFrame(state) : () => {};
      loseCleanup.current = () => {
        gl.domElement.removeEventListener('webglcontextlost', onLost);
        cancelLog();
      };
    },
    [director],
  );

  const onPrepared = useCallback(() => {
    queueMicrotask(() => {
      if (!mounted.current) return;
      if (containerRef.current) containerRef.current.dataset['ready'] = 'true';
      setPrepared(true);
      handlers.current.onReady?.();
    });
  }, []);

  const onStampTarget = useCallback((x: number, y: number) => {
    const el = containerRef.current;
    if (el) el.dataset['stampTarget'] = `${x.toFixed(1)},${y.toFixed(1)}`;
  }, []);

  return (
    <div
      ref={containerRef}
      className="tqw-canvas"
      data-stamp-target=""
      data-ready={prepared}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {fontsReady ? (
        <Canvas
          frameloop="demand"
          dpr={dpr}
          shadows={false}
          gl={GL_PROPS}
          camera={CAMERA_PROPS}
          onCreated={onCreated}
          style={{ opacity: prepared ? 1 : 0, pointerEvents: prepared ? 'auto' : 'none' }}
        >
          <Scene
            store={store}
            director={director}
            motion={motion}
            view={view}
            coarse={coarse}
            selectedPosition={props.selectedPosition ?? 'centre'}
            navigation={props.navigation}
            office={props.office}
            archive={props.archive}
            shadow={props.shadow}
            freshInk={props.freshInk}
            focusedObject={props.focusedObject}
            framedObject={props.framedObject}
            onCue={props.onCue}
            onInspect={props.onInspect}
            onFocusObject={props.onFocusObject}
            onEntrance={props.onEntrance}
            container={containerRef}
            handlers={handlers}
            onStampTarget={onStampTarget}
            onPrepared={onPrepared}
            overlay={overlayRef}
          />
          <LookStack profile={OFFICE_LOOK} reducedMotion={reducedMotion} lamps={OFFICE_LAMPS} />
        </Canvas>
      ) : null}
      {!prepared ? <div className="tqw-office-preparing" /> : null}
      <canvas ref={overlayRef} className="tqw-office-dissolve" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', visibility: prepared ? 'visible' : 'hidden' }} />
    </div>
  );
}

interface SceneProps {
  store: OfficeSceneProps['store'];
  director: Director;
  motion: { reduced: boolean };
  view: SceneContextValue['view'];
  coarse: boolean;
  selectedPosition: NonNullable<OfficeSceneProps['selectedPosition']>;
  navigation: OfficeSceneProps['navigation'];
  office: OfficeSceneProps['office'];
  archive: OfficeSceneProps['archive'];
  shadow: boolean;
  freshInk: boolean;
  focusedObject: OfficeSceneProps['focusedObject'];
  framedObject: OfficeSceneProps['framedObject'];
  onCue: OfficeSceneProps['onCue'];
  onInspect: OfficeSceneProps['onInspect'];
  onFocusObject: OfficeSceneProps['onFocusObject'];
  onEntrance: OfficeSceneProps['onEntrance'];
  container: React.RefObject<HTMLDivElement | null>;
  overlay: React.RefObject<HTMLCanvasElement | null>;
  handlers: React.RefObject<OfficeSceneProps>;
  onStampTarget(x: number, y: number): void;
  onPrepared(): void;
}

function pressInReach(navigation: Navigation): boolean {
  return Math.hypot(navigation.pose.x - DESK.x, navigation.pose.z - DESK.z) <= 0.3;
}

// Keep event callbacks bound to the live props ref throughout a held pointer gesture.
function pressHandlers(handlers: React.RefObject<OfficeSceneProps>): Pick<SceneContextValue, 'onPosition' | 'onPressStart' | 'onPressEnd'> {
  return {
    onPosition: position => handlers.current.onSelectPosition?.(position),
    onPressStart: () => handlers.current.onPressStart(),
    onPressEnd: () => handlers.current.onPressEnd(),
  };
}

function Scene({ store, director, motion, view, coarse, selectedPosition, navigation, office, archive, shadow, freshInk, focusedObject, framedObject, onCue, onInspect, onFocusObject, onEntrance, container, overlay, handlers, onStampTarget, onPrepared }: SceneProps) {
  const certification = useSyncExternalStore(store.subscribe, store.getState);
  const objects = useSyncExternalStore(office.subscribe, office.getState);
  const gl = useThree((s) => s.gl);
  const room = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree(s => s.camera);

  const materials = useMemo(() => createMaterials(gl.capabilities.getMaxAnisotropy(), coarse), [gl, coarse]);
  const [resourcesReady, setResourcesReady] = useState(false);
  const [bakeReady, setBakeReady] = useState(false);
  const onResourcesReady = useCallback(() => setResourcesReady(true), []);
  const onBakeReady = useCallback(() => setBakeReady(true), []);
  useEffect(() => {
    if (resourcesReady && bakeReady) onPrepared();
  }, [resourcesReady, bakeReady, onPrepared]);
  useLayoutEffect(() => {
    let cancelReady = () => {};
    const cancelBind = bindAfterFirstFrame(room, () => {
      try {
        const unbind = materials.bindEnvironment(gl);
        cancelReady = whenOfficeReady(gl, onResourcesReady, {
          scene: room, camera, fontsReady: areFontsLoaded, invalidate,
          onError: () => handlers.current.onContextLost(),
        });
        return unbind;
      } catch {
        handlers.current.onContextLost();
        return () => {};
      }
    });
    return () => { cancelReady(); cancelBind(); };
  }, [materials, gl, room, camera, invalidate, onResourcesReady, handlers]);
  useEffect(() => () => materials.dispose(), [materials]);

  const cursor = useMemo(() => {
    const el = container.current ?? gl.domElement.parentElement ?? gl.domElement;
    return createCursorControl(el);
  }, [container, gl]);
  useEffect(() => () => cursor.clear(), [cursor]);

  const context = useMemo<SceneContextValue>(
    () => ({
      store,
      director,
      materials,
      motion,
      cursor,
      view,
      ...pressHandlers(handlers),
      canPress: () => pressInReach(navigation),
      onPressSelect: () => {
        if (!navigation.wasDrag() && navigation.station !== 'desk') navigation.approach('desk', motion.reduced);
      },
    }),
    [store, director, materials, motion, cursor, view, handlers, navigation],
  );

  return (
    <SceneContext.Provider value={context}>
      <color attach="background" args={[PALETTE.coal]} />
      <fog attach="fog" args={[PALETTE.coal, 8, 28]} />
      <hemisphereLight args={['#bdc8c3', '#353a32', 1.15]} />
      <directionalLight position={[-2, 4.8, 2]} color="#c3d0d0" intensity={1.5} />
      <pointLight position={[0, 4.8, 6]} color="#f3cf96" intensity={24} distance={13} decay={2} />

      <group dispose={null}>
        <Room materials={materials} />
        <BakedSpace space="office" onReady={onBakeReady} />
        <Application />
        <Wear inkPadOpen={objects.toggles['ink-pad']} />
        <group userData={{ bake: 'dynamic' }}>
          <InspectionLamp understood={shadow || certification.memo.revealed || objects.uses.sign > 0 || objects.uses.conduit > 0} />
        </group>
        <RoomObjects office={office} archive={archive} overloaded={certification.phase === 'overloaded'} shadow={shadow} onInspect={id => { if (!navigation.wasDrag()) onInspect(id); }} onFocus={onFocusObject} onEntrance={() => { if (!navigation.wasDrag()) onEntrance(); }} />
        <OfficeAsset id="desk" fittings={['drawer']}>
          <Desk materials={materials} showStationery={false} />
        </OfficeAsset>
        <group {...officeAssetPose('press-rig')} userData={{officeObjectId:'press'}}>
          <StampPress freshInk={freshInk} selectedPosition={selectedPosition} windowClipWorld={[-2.25, 1.08, 7.85]} channelDirection={[-2, -0.9]} />
        </group>
        <group {...officeAssetPose('lamp-rig')} userData={{officeObjectId:'lamp', bake:'dynamic'}}>
          <Lamp materials={materials} towardWall={objects.toggles.lamp} deskTarget={[-1.68, .0115, -.04]} />
        </group>
        <group {...officeAssetPose('machine-rig')} userData={{officeObjectId:'machine'}} scale={[1.7, 2.9, 1.9]}>
          <Machine />
        </group>
      </group>
      <OfficeCamera selectedPosition={selectedPosition} navigation={navigation} onStampTarget={onStampTarget} overlay={overlay} onGesture={() => handlers.current.onGesture()} />
      <ContextualCue preferred={framedObject} focused={focusedObject} onCue={onCue} />
    </SceneContext.Provider>
  );
}

/** Dev only: report draw calls and triangles once the first frame has been rendered. */
function logFirstFrame(state: RootState): () => void {
  const { gl } = state;
  let tries = 0;
  let frame = 0;
  const poll = () => {
    tries += 1;
    if (gl.info.render.frame > 0) {
      console.info(
        `[tqw] first frame: ${gl.info.render.calls} draw calls, ${gl.info.render.triangles} triangles`,
      );
      return;
    }
    if (tries < 600) frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  const dev = window as unknown as { __tqwGl?: typeof gl; __tqwCamera?: typeof state.camera; __tqwScene?: typeof state.scene; __tqwFreeze?: () => void };
  dev.__tqwFreeze = () => state.setFrameloop('never');
  dev.__tqwGl = gl;
  dev.__tqwCamera = state.camera;
  dev.__tqwScene = state.scene;
  return () => {
    cancelAnimationFrame(frame);
    if (dev.__tqwGl === gl) { delete dev.__tqwGl; delete dev.__tqwCamera; delete dev.__tqwScene; delete dev.__tqwFreeze; }
  };
}
