import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, Group, Light, Mesh, Object3D, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Vector3, type Texture } from 'three';
import { BakedSpace } from '../../../baked/BakedSpace.tsx';
import { bytesFromPackedDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import { disposeResources } from '../../../assets/dispose.ts';
import type { TomorrowEngineState, TomorrowAction } from '../state.ts';
import { DEFAULT_STATION, cameraForViewport, stationById, type TomorrowStationId } from '../stage.ts';
import modelUrl from '../assets/tomorrow-engine.glb.gz?url&inline';

const CAMERA = { position: [0, 1.35, 1] as [number, number, number], fov: 42, near: 0.08, far: 20 };

export interface TomorrowTarget {
  id: TomorrowAction;
  x: number;
  y: number;
}

export interface TomorrowEarlyFeedback {
  action: TomorrowAction;
  sequence: number;
}

export interface TomorrowSceneProps {
  state: TomorrowEngineState;
  station: TomorrowStationId;
  reducedMotion: boolean;
  earlyFeedback: TomorrowEarlyFeedback | null;
  onTarget(target: TomorrowTarget | null): void;
  onObject(id: TomorrowAction): void;
  onReady(): void;
  onContextLost(): void;
  onError(error: unknown): void;
}

interface TomorrowDebug {
  setStation(station: TomorrowStationId): void;
  inspectCamera(): { position: [number, number, number]; direction: [number, number, number] };
  clearAndCountMagenta(): number;
  stats(): { calls: number; triangles: number; lights: number };
}

declare global {
  interface Window { __tqwTomorrowEngine?: TomorrowDebug }
}

const OBJECT_ACTIONS: Readonly<Record<string, TomorrowAction>> = {
  Interact_Flywheel: 'wind',
  Interact_Brake: 'brake',
  Interact_DateFace: 'read-record',
  Interact_RecordGuard: 'read-record',
  Interact_DispatchHatch: 'withdraw',
  Interact_HourSleeve: 'open-sleeve',
  Interact_StopTab: 'lift-stop-tab',
  Interact_Structure: 'examine-structure',
  Interact_Clerestory: 'examine-glass',
  Interact_Casing: 'examine-casing',
  Interact_Gearing: 'examine-gearing',
  Interact_Carriage: 'examine-carriage',
  Interact_StartingMark: 'read-starting-mark',
  Interact_WorkLabel: 'read-work-label',
  Interact_WorkLamp: 'examine-lamp',
  Interact_TitlePlaque: 'read-title',
  Interact_PreparationInscription: 'read-inscription',
  Interact_InspectionLinkage: 'examine-linkage',
  Interact_PaperSupport: 'examine-paper-support',
};

function targetAction(object: Object3D): TomorrowAction | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const value = String(node.userData['actionTarget'] ?? '');
    const action = OBJECT_ACTIONS[value];
    if (action !== undefined) return action;
  }
  return null;
}

function cameraPose(camera: PerspectiveCamera, station: TomorrowStationId, width: number, height: number, aspectWidth = width, aspectHeight = height): void {
  const frame = cameraForViewport(stationById(station), width, height);
  camera.position.set(...frame.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...frame.target);
  camera.fov = frame.verticalFovDeg;
  camera.aspect = aspectWidth / Math.max(1, aspectHeight);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function setDateTexture(model: Group, advanced: boolean): void {
  const numeral = model.getObjectByName('Date_Numeral_Quad');
  if (!(numeral instanceof Mesh)) return;
  const materials = Array.isArray(numeral.material) ? numeral.material : [numeral.material];
  for (const material of materials) {
    const texture = (material as typeof material & { map?: Texture | null }).map;
    if (!texture) continue;
    texture.wrapS = RepeatWrapping;
    texture.repeat.x = 0.5;
    texture.offset.x = advanced ? 0.5 : 0;
    texture.needsUpdate = true;
  }
}

function remember(node: Object3D, key: string, value: number): number {
  if (node.userData[key] === undefined) node.userData[key] = value;
  return Number(node.userData[key]);
}

function RoomModel({ props, onLoaded }: { props: TomorrowSceneProps; onLoaded(): void }) {
  const { camera, gl, invalidate, scene, setFrameloop } = useThree();
  const [model, setModel] = useState<Group | null>(null);
  const handlers = useRef(props);
  const station = useRef<TomorrowStationId>(DEFAULT_STATION.id);
  const readyRef = useRef(onLoaded);
  const previousPhase = useRef<TomorrowEngineState['phase']>(props.state.phase);
  const dateMotion = useRef<{ start: number } | null>(null);
  const feedbackMotion = useRef<{ action: TomorrowAction; start: number } | null>(null);

  useEffect(() => { handlers.current = props; });
  useEffect(() => { readyRef.current = onLoaded; }, [onLoaded]);

  useEffect(() => {
    let cancelled = false;
    void bytesFromPackedDataUrl(modelUrl).then(decodeGlb).then((root) => {
      for (const node of root.children) node.frustumCulled = false;
      if (cancelled) disposeResources(root);
      else setModel(root);
    }).catch((error: unknown) => {
      if (!cancelled) handlers.current.onError(error);
    });
    return () => { cancelled = true; };
  }, []);

  const applyPose = useCallback(() => {
    const rect = gl.domElement.getBoundingClientRect();
    cameraPose(camera as PerspectiveCamera, station.current, rect.width, rect.height);
    gl.domElement.dataset['cameraZ'] = String(camera.position.z);
    gl.domElement.dataset['cameraStation'] = station.current;
    gl.domElement.dataset['cameraYaw'] = '0';
    gl.domElement.dataset['cameraPitch'] = '0';
    invalidate();
  }, [camera, gl, invalidate]);

  useLayoutEffect(() => {
    station.current = stationById(props.station).id;
    applyPose();
  }, [applyPose, props.station]);

  useLayoutEffect(() => {
    if (!model) return;
    const isAdvanced = props.state.phase !== 'ready';
    if (previousPhase.current === 'ready' && isAdvanced && !props.reducedMotion) {
      dateMotion.current = { start: performance.now() };
      gl.domElement.dataset['dateNumeral'] = '14';
      invalidate();
    } else {
      dateMotion.current = null;
      setDateTexture(model, isAdvanced);
      gl.domElement.dataset['dateNumeral'] = isAdvanced ? '15' : '14';
    }
    previousPhase.current = props.state.phase;
    invalidate();
  }, [gl, invalidate, model, props.reducedMotion, props.state.phase]);

  useLayoutEffect(() => {
    if (!model) return;
    const rotor = model.getObjectByName('Flywheel_Rotor');
    const brake = model.getObjectByName('Brake_Lever');
    const guard = model.getObjectByName('Record_Guard');
    const recordContents = model.getObjectByName('Record_Contents');
    const catchMesh = model.getObjectByName('Record_Catch');
    const linkage = model.getObjectByName('Brake_Release_Linkage');
    const hatch = model.getObjectByName('Dispatch_Hatch_Lip');
    const ticketEdge = model.getObjectByName('Ticket_Edge');
    const ticket = model.getObjectByName('Dispatch_Ticket');
    const hourCard = model.getObjectByName('Hour_Sleeve_Card');
    const stopTab = model.getObjectByName('Stop_Tab');
    const rubbing = model.getObjectByName('Stop_Rubbing');
    if (rotor && dateMotion.current === null) rotor.rotation.z = props.state.phase === 'ready' ? 0 : Math.PI * 2 + 0.42;
    if (brake) brake.position.x = remember(brake, 'basePositionX', brake.position.x) + (props.state.phase === 'braked' || props.state.phase === 'withdrawn' ? 0.22 : 0);
    if (guard) guard.rotation.z = remember(guard, 'baseRotationZ', guard.rotation.z) + (props.state.phase === 'ready' || props.state.phase === 'wound' ? 0 : -0.16);
    if (recordContents) recordContents.visible = props.state.phase !== 'ready' && props.state.phase !== 'wound';
    if (catchMesh) catchMesh.position.y = remember(catchMesh, 'basePositionY', catchMesh.position.y) + (props.state.phase === 'ready' || props.state.phase === 'wound' ? 0 : 0.05);
    if (linkage) linkage.position.y = remember(linkage, 'basePositionY', linkage.position.y) + (props.state.phase === 'ready' || props.state.phase === 'wound' ? 0 : 0.05);
    if (hatch) hatch.rotation.x = remember(hatch, 'baseRotationX', hatch.rotation.x) + (props.state.phase === 'braked' || props.state.phase === 'withdrawn' ? -0.32 : 0);
    if (ticketEdge) ticketEdge.visible = props.state.phase === 'braked';
    if (ticket) {
      ticket.visible = props.state.phase === 'withdrawn';
      ticket.position.z = remember(ticket, 'basePositionZ', ticket.position.z) + (props.state.phase === 'withdrawn' ? -0.28 : 0);
    }
    if (hourCard) {
      hourCard.visible = props.state.sleeveOpen;
      hourCard.position.y = remember(hourCard, 'basePositionY', hourCard.position.y) + (props.state.sleeveOpen ? -0.06 : 0);
    }
    if (stopTab) stopTab.rotation.z = remember(stopTab, 'baseRotationZ', stopTab.rotation.z) + (props.state.stopTabOpen ? 1.22 : 0);
    if (rubbing) rubbing.visible = props.state.stopTabOpen;
    const instructionCard = model.getObjectByName('Instruction_Card');
    if (instructionCard) instructionCard.visible = props.state.phase !== 'ready';
    if (dateMotion.current === null) {
      setDateTexture(model, props.state.phase !== 'ready');
      gl.domElement.dataset['dateNumeral'] = props.state.phase === 'ready' ? '14' : '15';
    }
    invalidate();
  }, [gl, invalidate, model, props.state]);

  useEffect(() => {
    if (!props.earlyFeedback || props.reducedMotion) {
      feedbackMotion.current = null;
      return;
    }
    feedbackMotion.current = { action: props.earlyFeedback.action, start: performance.now() };
    invalidate();
  }, [invalidate, props.earlyFeedback?.sequence, props.reducedMotion]);

  useEffect(() => {
    if (!model) return;
    return () => disposeResources(model);
  }, [model]);

  useEffect(() => {
    const resize = () => applyPose();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [applyPose]);

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); handlers.current.onContextLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const dev = window as Window & { __tqwScene?: typeof scene; __tqwGl?: typeof gl; __tqwFreeze?: () => void };
    dev.__tqwScene = scene;
    dev.__tqwGl = gl;
    dev.__tqwFreeze = () => setFrameloop('never');
    const getLightCount = () => {
      let lights = 0;
      scene.traverse((object) => { if (object instanceof Light) lights += 1; });
      return lights;
    };
    const debug: TomorrowDebug = {
      setStation(next) {
        station.current = stationById(next).id;
        applyPose();
      },
      inspectCamera() {
        const direction = camera.getWorldDirection(new Vector3());
        return {
          position: camera.position.toArray() as [number, number, number],
          direction: direction.toArray() as [number, number, number],
        };
      },
      clearAndCountMagenta() {
        const previousBackground = scene.background;
        const previousClear = gl.getClearColor(new Color()).clone();
        const previousAlpha = gl.getClearAlpha();
        scene.background = null;
        gl.setClearColor(0xff00ff, 1);
        gl.render(scene, camera);
        const context = gl.getContext();
        const pixels = new Uint8Array(gl.domElement.width * gl.domElement.height * 4);
        context.readPixels(0, 0, gl.domElement.width, gl.domElement.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
        let magenta = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if ((pixels[index] ?? 0) > 245 && (pixels[index + 1] ?? 255) < 15 && (pixels[index + 2] ?? 0) > 245) magenta += 1;
        }
        scene.background = previousBackground;
        gl.setClearColor(previousClear, previousAlpha);
        invalidate();
        return magenta;
      },
      stats() {
        return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, lights: getLightCount() };
      },
    };
    window.__tqwTomorrowEngine = debug;
    return () => {
      if (dev.__tqwScene === scene) delete dev.__tqwScene;
      if (dev.__tqwGl === gl) delete dev.__tqwGl;
      delete dev.__tqwFreeze;
      if (window.__tqwTomorrowEngine === debug) delete window.__tqwTomorrowEngine;
    };
  }, [applyPose, camera, gl, invalidate, scene, setFrameloop]);

  useFrame(() => {
    if (!model) return;
    let animating = false;
    if (dateMotion.current !== null) {
      const progress = Math.min(1, (performance.now() - dateMotion.current.start) / 420);
      const eased = 1 - (1 - progress) ** 3;
      const rotor = model.getObjectByName('Flywheel_Rotor');
      if (rotor) rotor.rotation.z = (Math.PI * 2 + 0.42) * eased;
      if (progress >= 1) {
        setDateTexture(model, true);
        gl.domElement.dataset['dateNumeral'] = '15';
        dateMotion.current = null;
      } else {
        gl.domElement.dataset['dateNumeral'] = '14';
        animating = true;
      }
    }
    if (feedbackMotion.current !== null) {
      const feedback = feedbackMotion.current;
      const progress = Math.min(1, (performance.now() - feedback.start) / 180);
      const nudge = Math.sin(Math.PI * progress);
      const state = handlers.current.state;
      const brake = model.getObjectByName('Brake_Lever');
      const catchMesh = model.getObjectByName('Record_Catch');
      const hatch = model.getObjectByName('Dispatch_Hatch_Lip');
      if (feedback.action === 'read-record' && catchMesh) {
        const released = state.phase === 'record-opened' || state.phase === 'braked' || state.phase === 'withdrawn';
        catchMesh.position.y = remember(catchMesh, 'basePositionY', catchMesh.position.y) + (released ? 0.05 : 0) - 0.015 * nudge;
      } else if (feedback.action === 'brake' && brake) {
        const seated = state.phase === 'braked' || state.phase === 'withdrawn';
        brake.position.x = remember(brake, 'basePositionX', brake.position.x) + (seated ? 0.22 : 0) - 0.025 * nudge;
      } else if (feedback.action === 'withdraw' && hatch) {
        const open = state.phase === 'braked' || state.phase === 'withdrawn';
        hatch.rotation.x = remember(hatch, 'baseRotationX', hatch.rotation.x) + (open ? -0.32 : 0) - 0.035 * nudge;
      }
      if (progress >= 1) feedbackMotion.current = null;
      else animating = true;
    }
    if (animating) invalidate();
  });

  const onPointer = (event: ThreeEvent<PointerEvent>) => {
    const action = targetAction(event.object);
    if (!action) return;
    handlers.current.onTarget({ id: action, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
  };
  const onPointerOut = () => handlers.current.onTarget(null);
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const action = targetAction(event.object);
    if (!action) return;
    handlers.current.onObject(action);
  };

  useEffect(() => {
    if (!model) return;
    let meshes = 0;
    model.traverse((object) => { if (object instanceof Mesh) meshes += 1; });
    if (meshes > 0) readyRef.current();
  }, [model]);

  return model ? <primitive object={model} onPointerOver={onPointer} onPointerOut={onPointerOut} onClick={onClick} /> : null;
}

export function TomorrowScene(props: TomorrowSceneProps) {
  const [modelReady, setModelReady] = useState(false);
  const handleLoaded = useCallback(() => setModelReady(true), []);
  return <Canvas className="tqw-tomorrow-engine-canvas" aria-label={`View: ${stationById(props.station).label}`} tabIndex={-1} frameloop="demand" dpr={[1, 1.5]} camera={CAMERA}
    gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
    onCreated={({ gl, scene }) => {
      gl.outputColorSpace = SRGBColorSpace;
      gl.toneMapping = ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.78;
      gl.shadowMap.enabled = false;
      scene.background = new Color('#100c08');
    }}>
    <pointLight position={[-0.92, 2.22, 3.82]} color="#E7B777" intensity={4.5} distance={2.6} decay={2} />
    <pointLight position={[0, 2.22, 3.82]} color="#E8BD83" intensity={5} distance={2.8} decay={2} />
    <pointLight position={[0.92, 2.22, 3.82]} color="#D99E61" intensity={4.2} distance={2.5} decay={2} />
    <RoomModel props={props} onLoaded={handleLoaded} />
    {modelReady ? <BakedSpace space="tomorrow-engine" onReady={props.onReady} /> : null}
  </Canvas>;
}
