import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { CHAMBERS, type ChamberId } from '@tqw/engine';
import { AmbientContext } from './ambient.ts';
import { createCorridorAnimation } from './animation.ts';
import { createAmbientScheduler } from './camera/ambientClock.ts';
import { BoardMotionContext, createBoardMotion } from './camera/boardMotion.ts';
import { CameraRig, type RigApi } from './camera/CameraRig.tsx';
import { LANDING_POSE } from './camera/viewpoints.ts';
import { CorridorWorld } from './CorridorWorld.tsx';
import { CueLayer } from './input/CueLayer.tsx';
import { createCueStore } from './input/cues.ts';
import { TouchControls } from './input/TouchControls.tsx';
import { CORRIDOR } from './layout.ts';
import { createPropAnimation, type PropId } from './props.ts';
import type { CorridorSceneProps } from './types.ts';
import { CORRIDOR_LOOK, LANDING_LOOK, LookStack, type AtmosphereLamp } from '../look/index.ts';
import { corridorSconceSlots, LOBBY_SCONCES } from './world/lighting.ts';
import { shouldLoadCorridorDecor } from './world/decor/activation.ts';

/**
 * The lobby and corridor as a first-person view (ADR 0001, ADR 0003, ADR 0004). The Canvas renders
 * on demand: a frame is drawn only while the camera, a door or a prop is moving, the hero's drift
 * and the ambient windows the world asks for (a fan, a paper corner) at 15 frames a second, and
 * nothing at all while the scene is off screen, the tab hidden, or nothing is moving.
 * `CameraRig` (inside the Canvas) owns the walk, the doors' choreography, the things to touch and
 * the input; this component is the shell around it: the container tests and styles hook into, the
 * lost-context pattern, the touch controls (shown only while engaged) and the DOM cues over the
 * scene (verb labels, the "Things nearby" list, the first hint).
 *
 * The container carries what tests read: `data-pose` ("x,z,yawDeg"), `data-pitch`, `data-door-targets`
 * (the on-screen centre of each visible door in CSS px), `data-frames` (frames drawn so far),
 * `data-ambient` (the ambient windows open now) and, for styles, `data-phase`, `data-engaged` and
 * `data-over` (set only while the pointer is on a door, a prop or the board).
 */
const CAMERA = {
  fov: 48,
  near: 0.05,
  far: 90,
  position: [LANDING_POSE.x, CORRIDOR.eyeHeight, LANDING_POSE.z] as [number, number, number],
};

/** Where each sconce's shaft starts and which way it leans: down and a little into the room. */
const FIXTURE_OFFSET = 0.2;
const CORRIDOR_LAMPS: readonly AtmosphereLamp[] = [
  ...corridorSconceSlots().map((slot): AtmosphereLamp => {
    const left = slot.side === 'left';
    const wall = left ? -CORRIDOR.width / 2 : CORRIDOR.width / 2;
    return { id: slot.id, kind: 'sconce', position: [wall + (left ? FIXTURE_OFFSET : -FIXTURE_OFFSET), CORRIDOR.sconce.y, slot.z], direction: [left ? 0.45 : -0.45, -1, 0] };
  }),
  ...LOBBY_SCONCES.map((lamp): AtmosphereLamp => {
    const x = lamp.face === 'x-' ? lamp.x - FIXTURE_OFFSET : lamp.face === 'x+' ? lamp.x + FIXTURE_OFFSET : lamp.x;
    return { id: lamp.id, kind: 'hero-lamp', position: [x, CORRIDOR.sconce.y, lamp.face === 'z+' ? lamp.z + FIXTURE_OFFSET : lamp.z], direction: [lamp.face === 'x-' ? -0.45 : lamp.face === 'x+' ? 0.45 : 0, -1, 0] };
  }),
];

const coarsePointer = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export default function CorridorScene(props: CorridorSceneProps) {
  const { spine, progress } = props;
  const state = useSyncExternalStore(spine.subscribe, spine.getState);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const rig = useRef<RigApi | null>(null);
  const animation = useMemo(() => createCorridorAnimation(CHAMBERS.map((c) => c.id)), []);
  const mounted = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const [touch, setTouch] = useState(coarsePointer);
  const bakeWorkbench = import.meta.env.DEV && new URLSearchParams(window.location.search).get('bake') === 'off';
  const subscribeDecor = useCallback((notify: () => void) => progress.subscribe(() => notify()), [progress]);
  const getDecorActive = useCallback(
    () => shouldLoadCorridorDecor({ progress: progress.get(), engaged: props.engaged, phase: state.phase, bakeWorkbench }),
    [bakeWorkbench, progress, props.engaged, state.phase],
  );
  const decorActive = useSyncExternalStore(subscribeDecor, getDecorActive, getDecorActive);
  const onTouchSeen = useCallback(() => setTouch(true), []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup.current?.();
    };
  }, []);

  const onCreated = useCallback((root: RootState) => {
    root.gl.domElement.setAttribute('aria-hidden', 'true');
    const lost = () => {
      if (mounted.current) handlers.current.onContextLost();
    };
    root.gl.domElement.addEventListener('webglcontextlost', lost);
    cleanup.current = () => root.gl.domElement.removeEventListener('webglcontextlost', lost);
  }, []);

  const onDoorPointer = useCallback(
    (id: ChamberId, kind: 'over' | 'out' | 'click') => rig.current?.doorPointer(id, kind),
    [],
  );
  const onClipping = useCallback((id: ChamberId) => rig.current?.clipping(id), []);
  const hold = useCallback((dir: -1 | 0 | 1) => {
    const current = rig.current;
    if (!current) return;
    current.director.controller.hold('button', dir);
    current.invalidate();
  }, []);
  const step = useCallback((dir: -1 | 1) => rig.current?.director.stepViewpoint(dir), []);
  // ADR 0004: the props' per-frame state and pointer events, the ambient scheduler the world asks
  // for render windows, the notice board pin's glint, and the DOM cues drawn over the scene.
  const propAnimation = useMemo(() => createPropAnimation(), []);
  const boardMotion = useMemo(() => createBoardMotion(), []);
  const cues = useMemo(() => createCueStore(), []);
  const ambient = useMemo(() => createAmbientScheduler(), []);
  useEffect(() => {
    // A window opening is a reason to draw a frame now, not at the next scroll or hover.
    ambient.setOnChange(() => rig.current?.invalidate());
    return () => {
      ambient.setOnChange(null);
      ambient.dispose();
    };
  }, [ambient]);
  const onPropPointer = useCallback(
    (id: PropId, kind: 'over' | 'out' | 'click') => rig.current?.propPointer(id, kind),
    [],
  );

  return (
    <>
      <div
        ref={container}
        className="tqw-corridor-canvas"
        data-door-targets="{}"
        data-phase={state.phase}
        data-engaged={props.engaged}
      >
        <div className="tqw-corridor-view" aria-hidden="true">
          <Canvas frameloop="demand" dpr={[1, 1.5]} camera={CAMERA} onCreated={onCreated}>
            <color attach="background" args={[CORRIDOR.fog.colour]} />
            <fog attach="fog" args={[CORRIDOR.fog.colour, CORRIDOR.fog.near, CORRIDOR.fog.far]} />
            <AmbientContext.Provider value={ambient.clock}>
              <BoardMotionContext.Provider value={boardMotion}>
                <CorridorWorld
                  animation={animation}
                  focus={state.focus}
                  reducedMotion={props.reducedMotion}
                  decorActive={decorActive}
                  onDoorPointer={onDoorPointer}
                  onClipping={onClipping}
                  propAnimation={propAnimation}
                  onPropPointer={onPropPointer}
                />
              </BoardMotionContext.Provider>
            </AmbientContext.Provider>
            <CameraRig
              spine={spine}
              progress={progress}
              animation={animation}
              propAnimation={propAnimation}
              boardMotion={boardMotion}
              ambient={ambient}
              cues={cues}
              readyChamber={props.readyChamber}
              handlers={handlers}
              container={container}
              overlay={overlay}
              rigRef={rig}
              reducedMotion={props.reducedMotion}
              engaged={props.engaged}
              onTouchSeen={onTouchSeen}
            />
            <LookStack profile={state.phase === 'entrance' ? LANDING_LOOK : CORRIDOR_LOOK} reducedMotion={props.reducedMotion} lamps={CORRIDOR_LAMPS} />
          </Canvas>
        </div>
        <TouchControls
          visible={touch && state.phase === 'corridor' && props.engaged}
          reducedMotion={props.reducedMotion}
          onHold={hold}
          onStep={step}
        />
        <CueLayer store={cues} reducedMotion={props.reducedMotion} />
      </div>
      {/* Outside the container, so the container holds exactly one canvas: the scene's. */}
      <canvas ref={overlay} className="tqw-dissolve" aria-hidden="true" />
    </>
  );
}
