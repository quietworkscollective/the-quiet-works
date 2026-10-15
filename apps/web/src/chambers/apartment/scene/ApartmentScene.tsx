import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type RootState, type ThreeEvent } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  Light,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
} from 'three';
import { BakedSpace } from '../../../baked/BakedSpace.tsx';
import { LookStack } from '../../../look/index.ts';
import { bytesFromPackedDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import { disposeResources } from '../../../assets/dispose.ts';
import type { ApartmentObjectId, ApartmentState } from '../state.ts';
import { APARTMENT_OBJECTS } from '../state.ts';
import {
  APARTMENT_STAGE,
  DEFAULT_STATION,
  STATIONS,
  VISIBLE_HALF_ARC_DEG,
  limitsForViewport,
  stageAdapter,
  type ApartmentStationId,
  type StagePosition,
} from '../stage.ts';
import modelUrl from '../assets/apartment.glb.gz?url&inline';
import { APARTMENT_ROOM_LOOK } from '../look.ts';

const CAMERA = { position: [0, 1.62, 0.82] as [number, number, number], fov: 48, near: 0.06, far: 28 };
const DYNAMIC_NAMES = [
  'Kettle_Switch', 'Kettle_Smoke', 'Faucet_Handle', 'Water_Flow', 'Moving_Keys', 'Moving_Chair', 'Moving_Cup',
  'Moving_Magnet', 'Moving_Window_Sash', 'Moving_Cushion', 'Platform_Gate',
] as const;
export interface ApartmentTarget {
  id: ApartmentObjectId;
  x: number;
  y: number;
  immediate: boolean;
}

export interface ApartmentSceneProps {
  state: ApartmentState;
  station: ApartmentStationId;
  reducedMotion: boolean;
  onTarget(target: ApartmentTarget | null): void;
  onStation(station: ApartmentStationId): void;
  onGesture(): void;
  onReady(): void;
  onContextLost(): void;
  onError(error: unknown): void;
}

function targetId(object: Object3D): ApartmentObjectId | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const value = String(node.userData['actionTarget'] ?? '');
    if (APARTMENT_OBJECTS.some((item) => item.id === value)) return value as ApartmentObjectId;
  }
  return null;
}

function rememberVector(node: Object3D, axis: 'x' | 'y' | 'z'): number {
  const key = `apartmentBase${axis.toUpperCase()}`;
  if (node.userData[key] === undefined) node.userData[key] = node.position[axis];
  return Number(node.userData[key]);
}

function rememberRotation(node: Object3D, axis: 'x' | 'y' | 'z'): number {
  const key = `apartmentBaseRotation${axis.toUpperCase()}`;
  if (node.userData[key] === undefined) node.userData[key] = node.rotation[axis];
  return Number(node.userData[key]);
}

function updateModel(root: Group, state: ApartmentState): void {
  const node = (name: string) => root.getObjectByName(name);
  const chair = node('Moving_Chair');
  if (chair) chair.position.z = rememberVector(chair, 'z') - (state.chairSlid ? 0.18 : 0);
  const cup = node('Moving_Cup');
  if (cup) cup.position.y = rememberVector(cup, 'y') + (state.cupLifted ? 0.11 : 0);
  const saucer = node('Saucer_Turntable');
  if (saucer) saucer.rotation.y = rememberRotation(saucer, 'y') + (state.saucerTurned ? Math.PI / 3 : 0);
  const magnet = node('Moving_Magnet');
  if (magnet) magnet.rotation.x = rememberRotation(magnet, 'x') + (state.magnetTurned ? Math.PI : 0);
  const sash = node('Moving_Window_Sash');
  if (sash) sash.position.x = rememberVector(sash, 'x') + (state.windowOpen ? 0.06 : 0);
  const cushion = node('Moving_Cushion');
  if (cushion) cushion.position.y = rememberVector(cushion, 'y') + (state.cushionLifted ? 0.12 : 0);
  const gate = node('Platform_Gate');
  if (gate) gate.position.y = rememberVector(gate, 'y') + (state.elevatorGateRaised ? 0.52 : 0);
  const kettleSwitch = node('Kettle_Switch');
  if (kettleSwitch) kettleSwitch.rotation.x = rememberRotation(kettleSwitch, 'x') + (state.kettleOn ? 0.46 : 0);
  const kettleSmoke = node('Kettle_Smoke');
  if (kettleSmoke) kettleSmoke.visible = state.kettleOn;
  const faucet = node('Faucet_Handle');
  if (faucet) faucet.rotation.z = rememberRotation(faucet, 'z') + state.faucetFlow * 0.45;
  const water = node('Water_Flow');
  if (water) water.visible = state.faucetFlow > 0;
  const keys = node('Moving_Keys');
  if (keys) {
    const offset = state.keyArrangement === 0 ? -0.035 : 0.035;
    for (const [index, name] of ['Key_A', 'Key_B', 'Key_C'].entries()) {
      const key = keys.getObjectByName(name);
      if (!key) continue;
      if (key.userData['apartmentBaseX'] === undefined) key.userData['apartmentBaseX'] = key.position.x;
      if (key.userData['apartmentBaseZ'] === undefined) key.userData['apartmentBaseZ'] = key.position.z;
      const sign = index === 1 ? -1 : 1;
      key.position.x = Number(key.userData['apartmentBaseX']) + (state.keyArrangementCount > 0 ? offset * sign : 0);
      key.position.z = Number(key.userData['apartmentBaseZ']) + (state.keyArrangementCount > 0 ? offset * (index - 1) : 0);
    }
  }
  const indicator = node('Kettle_Indicator');
  if (indicator instanceof Mesh) {
    const materials = Array.isArray(indicator.material) ? indicator.material : [indicator.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.emissive.set(state.kettleOn ? '#A95722' : '#221A14');
      material.emissiveIntensity = state.kettleOn ? 0.8 : 0.04;
      material.needsUpdate = true;
    }
  }
}

function poseCamera(
  camera: PerspectiveCamera,
  pose: { x: number; z: number; headingDeg: number; pitchDeg: number },
  yawOffset: number,
  width: number,
  height: number,
): { yaw: number; pitch: number } {
  const limits = limitsForViewport(width, height);
  const yaw = stageAdapter.clampTurn(yawOffset, width, height);
  const pitch = stageAdapter.clampPitch(pose.pitchDeg);
  camera.position.set(pose.x, 1.62, pose.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set((pitch * Math.PI) / 180, ((pose.headingDeg + yaw) * Math.PI) / 180, 0);
  camera.fov = limits.verticalFovDeg;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { yaw, pitch };
}

function roomPose(stationId: ApartmentStationId, position?: StagePosition, pitchOffset = 0) {
  const station = STATIONS.find((value) => value.id === stationId) ?? DEFAULT_STATION;
  return {
    ...station,
    x: position?.x ?? station.x,
    z: position?.z ?? station.z,
    pitchDeg: station.pitchDeg + pitchOffset,
  };
}

function RoomModel({ props, onLoaded }: { props: ApartmentSceneProps; onLoaded(): void }) {
  const { camera, gl, invalidate, scene, setFrameloop } = useThree();
  const sinkPoolTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(-2.48, 0.82, 2.5);
    return target;
  }, []);
  const sofaBounceTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(2.55, 0.75, 3.17);
    return target;
  }, []);
  const kettlePoolTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(-2.66, 1.0, 3.53);
    return target;
  }, []);
  const windowPoolTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(-2.55, 1.6, 3.5);
    return target;
  }, []);
  const tablePoolTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(-0.7, 0.8, 2.7);
    return target;
  }, []);
  const [model, setModel] = useState<Group | null>(null);
  const handlers = useRef(props);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const position = useRef<StagePosition>({ x: DEFAULT_STATION.x, z: DEFAULT_STATION.z });
  const station = useRef<ApartmentStationId>(DEFAULT_STATION.id);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => { handlers.current = props; });
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  useEffect(() => {
    let cancelled = false;
    void bytesFromPackedDataUrl(modelUrl).then(decodeGlb).then((root) => {
      for (const name of DYNAMIC_NAMES) {
        const object = root.getObjectByName(name);
        if (object) object.userData['bake'] = 'dynamic';
      }
      if (cancelled) disposeResources(root);
      else setModel(root);
    }).catch((error: unknown) => {
      if (!cancelled) handlers.current.onError(error);
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    const rect = gl.domElement.getBoundingClientRect();
    station.current = props.station;
    const current = STATIONS.find((value) => value.id === props.station) ?? DEFAULT_STATION;
    position.current = { x: current.x, z: current.z };
    yaw.current = 0;
    pitch.current = 0;
    poseCamera(camera as PerspectiveCamera, roomPose(props.station), 0, rect.width, rect.height);
    const host = gl.domElement.closest<HTMLElement>('.tqw-apartment-canvas');
    if (host) host.dataset['cameraStation'] = props.station;
    invalidate();
  }, [camera, gl, invalidate, props.station]);

  useEffect(() => {
    if (!model) return;
    updateModel(model, props.state);
    invalidate();
  }, [invalidate, model, props.state]);

  useEffect(() => {
    if (!model) return;
    return () => disposeResources(model);
  }, [model]);

  useEffect(() => {
    const el = gl.domElement;
    const cam = camera as PerspectiveCamera;
    const viewport = () => el.getBoundingClientRect();
    const readTarget = (target: EventTarget | null) => target instanceof Element ? target.closest('button,summary,a,input,select,textarea') : null;
    const applyPose = () => {
      const rect = viewport();
      poseCamera(cam, roomPose(station.current, position.current, pitch.current), yaw.current, rect.width, rect.height);
      const host = el.closest<HTMLElement>('.tqw-apartment-canvas');
      if (host) {
        const limits = limitsForViewport(rect.width, rect.height);
        host.dataset['yawLimit'] = limits.yawLimitDeg.toFixed(2);
        host.dataset['horizontalFov'] = limits.horizontalFovDeg.toFixed(2);
        host.dataset['cameraYaw'] = (roomPose(station.current).headingDeg + yaw.current).toFixed(2);
        host.dataset['cameraPitch'] = (roomPose(station.current).pitchDeg + pitch.current).toFixed(2);
      }
      invalidate();
    };
    const keydown = (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (readTarget(keyEvent.target)) return;
      const key = keyEvent.key.toLowerCase();
      const rect = viewport();
      if (key === 'a' || key === 'arrowleft') {
        yaw.current = stageAdapter.turn(yaw.current, 4, rect.width, rect.height);
        keyEvent.preventDefault();
      } else if (key === 'd' || key === 'arrowright') {
        yaw.current = stageAdapter.turn(yaw.current, -4, rect.width, rect.height);
        keyEvent.preventDefault();
      } else if (key === 'w' || key === 'arrowup' || key === 's' || key === 'arrowdown') {
        const direction = key === 'w' || key === 'arrowup' ? 1 : -1;
        position.current = stageAdapter.walk(position.current, roomPose(station.current).headingDeg + yaw.current, direction);
        keyEvent.preventDefault();
      } else if (/^[1-5]$/.test(key)) {
        const next = STATIONS[Number(key) - 1];
        if (next) { handlers.current.onStation(next.id); keyEvent.preventDefault(); }
      } else return;
      applyPose();
    };
    const pointerDown = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0 || pointer.target !== el) return;
      handlers.current.onGesture();
      drag = { x: pointer.clientX, y: pointer.clientY, startYaw: yaw.current, startPitch: pitch.current, active: false };
      lastPointer = pointer.pointerId;
    };
    const pointerMove = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!drag || pointer.pointerId !== lastPointer) return;
      const dx = pointer.clientX - drag.x;
      const dy = pointer.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.active = true;
      if (!drag.active) return;
      const rect = viewport();
      yaw.current = stageAdapter.turn(drag.startYaw, -dx * 0.18, rect.width, rect.height);
      pitch.current = stageAdapter.clampPitch(drag.startPitch - dy * 0.12);
      applyPose();
    };
    const pointerUp = (event: Event) => {
      const pointer = event as PointerEvent;
      if (drag && pointer.pointerId === lastPointer) drag = null;
    };
    const resize = () => {
      const rect = viewport();
      yaw.current = stageAdapter.clampTurn(yaw.current, rect.width, rect.height);
      applyPose();
    };
    const turnControl = (event: Event) => {
      const direction = Number((event as CustomEvent<unknown>).detail);
      if (direction !== -1 && direction !== 1) return;
      const rect = viewport();
      yaw.current = stageAdapter.turn(yaw.current, direction === -1 ? 8 : -8, rect.width, rect.height);
      applyPose();
    };
    const pitchControl = (event: Event) => {
      const delta = Number((event as CustomEvent<unknown>).detail);
      if (!Number.isFinite(delta)) return;
      pitch.current = stageAdapter.clampPitch(pitch.current + delta);
      applyPose();
    };
    let drag: { x: number; y: number; startYaw: number; startPitch: number; active: boolean } | null = null;
    let lastPointer = -1;
    el.tabIndex = 0;
    el.setAttribute('aria-label', 'The Apartment stage. Use the arrow keys to look and the number keys to choose a station.');
    el.addEventListener('keydown', keydown);
    el.addEventListener('pointerdown', pointerDown);
    window.addEventListener('apartment:turn', turnControl);
    window.addEventListener('apartment:pitch', pitchControl);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('resize', resize);
    return () => {
      el.removeEventListener('keydown', keydown);
      el.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('apartment:turn', turnControl);
      window.removeEventListener('apartment:pitch', pitchControl);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('resize', resize);
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    if (!model) return;
    if (!import.meta.env.DEV) return;
    const dev = window as Window & {
      __tqwScene?: RootState['scene'];
      __tqwGl?: RootState['gl'];
      __tqwFreeze?: () => void;
      __apartmentStageProbe?: {
        camera: PerspectiveCamera;
        setPose(id: ApartmentStationId, yawOffset: number, pitchDeg?: number): number;
        setPoseAt(position: StagePosition, headingDeg: number, yawOffset: number, pitchDeg: number): { appliedYaw: number; appliedPitch: number };
        setSweepPixelRatio(pixelRatio: number): void;
        measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number };
      };
    };
    const probe = {
      camera: camera as PerspectiveCamera,
      setPose(id: ApartmentStationId, yawOffset: number, pitchDeg?: number): number {
        const current = STATIONS.find((value) => value.id === id) ?? DEFAULT_STATION;
        const rect = gl.domElement.getBoundingClientRect();
        const pose = poseCamera(camera as PerspectiveCamera, { ...current, pitchDeg: pitchDeg ?? current.pitchDeg }, yawOffset, rect.width, rect.height);
        station.current = id;
        position.current = { x: current.x, z: current.z };
        yaw.current = pose.yaw;
        pitch.current = (pitchDeg ?? current.pitchDeg) - current.pitchDeg;
        invalidate();
        return pose.yaw;
      },
      setPoseAt(stagePosition: StagePosition, headingDeg: number, yawOffset: number, pitchDeg: number) {
        const rect = gl.domElement.getBoundingClientRect();
        const pose = poseCamera(camera as PerspectiveCamera, { ...stagePosition, headingDeg, pitchDeg }, yawOffset, rect.width, rect.height);
        station.current = 'threshold';
        position.current = { x: stagePosition.x, z: stagePosition.z };
        yaw.current = pose.yaw;
        pitch.current = pose.pitch;
        invalidate();
        return { appliedYaw: pose.yaw, appliedPitch: pose.pitch };
      },
      setSweepPixelRatio(pixelRatio: number) {
        gl.setPixelRatio(pixelRatio);
        invalidate();
      },
      measureMagenta(restore = true) {
        const previousBackground = scene.background;
        const previousClear = gl.getClearColor(new Color()).clone();
        const previousAlpha = gl.getClearAlpha();
        scene.background = null;
        gl.setClearColor('#ff00ff', 1);
        gl.info.reset();
        gl.render(scene, camera);
        const context = gl.getContext();
        const width = gl.domElement.width;
        const height = gl.domElement.height;
        const pixels = new Uint8Array(width * height * 4);
        context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
        let magentaPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if ((pixels[index] ?? 0) > 180 && (pixels[index + 1] ?? 255) < 90 && (pixels[index + 2] ?? 0) > 180) magentaPixels += 1;
        }
        let lights = 0;
        scene.traverse((object) => { if (object instanceof Light) lights += 1; });
        const result = { magentaPixels, calls: gl.info.render.calls, triangles: gl.info.render.triangles, lights };
        scene.background = previousBackground;
        gl.setClearColor(previousClear, previousAlpha);
        if (restore) gl.render(scene, camera);
        return result;
      },
    };
    dev.__tqwScene = scene;
    dev.__tqwGl = gl;
    dev.__tqwFreeze = () => setFrameloop('never');
    dev.__apartmentStageProbe = probe;
    return () => {
      if (dev.__tqwScene === scene) delete dev.__tqwScene;
      if (dev.__tqwGl === gl) delete dev.__tqwGl;
      delete dev.__tqwFreeze;
      if (dev.__apartmentStageProbe === probe) delete dev.__apartmentStageProbe;
    };
  }, [camera, gl, invalidate, model, scene, setFrameloop]);

  const pointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    const id = targetId(event.object);
    gl.domElement.style.cursor = id ? 'pointer' : '';
    if (!id) return;
    const point = event.point.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    handlers.current.onTarget({ id, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2, immediate: false });
  }, [camera, gl]);

  const pointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!targetId(event.object)) return;
    gl.domElement.style.cursor = '';
    handlers.current.onTarget(null);
  }, [gl]);

  const click = useCallback((event: ThreeEvent<MouseEvent>) => {
    const id = targetId(event.object);
    if (!id) return;
    event.stopPropagation();
    const point = event.point.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    handlers.current.onTarget({ id, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2, immediate: true });
  }, [camera, gl]);

  return <>
    <color attach="background" args={['#766858']} />
    <fogExp2 attach="fog" args={['#B9B6AF', 0.018]} />
    <hemisphereLight name="Quiet room fill" args={['#D6DCE0', '#3C3F3A', 0.035]} />
    <spotLight name="Cool window light across the cabinets" color="#D6E0E2" position={[0, 2.18, 5.05]} target={windowPoolTarget} intensity={3.6} distance={4.4} angle={0.95} penumbra={0.96} decay={2} />
    <primitive object={windowPoolTarget} dispose={null} />
    <spotLight name="Soft bounced light into the enamel sink" color="#DFE4E2" position={[-1.82, 1.46, 2.22]} target={sinkPoolTarget} intensity={1.2} distance={2.8} angle={0.92} penumbra={0.96} decay={2} />
    <primitive object={sinkPoolTarget} dispose={null} />
    <spotLight name="Soft floor bounce toward the sofa" color="#D9DFDB" position={[0.75, 0.35, 2.25]} target={sofaBounceTarget} intensity={2.8} distance={4.5} angle={1.4} penumbra={0.98} decay={2} />
    <primitive object={sofaBounceTarget} dispose={null} />
    <spotLight name="Warm practical at the kettle" color="#F2D5AF" position={[-2.48, 1.49, 3.52]} target={kettlePoolTarget} intensity={1.3} distance={1.6} angle={0.7} penumbra={0.72} decay={2} />
    <primitive object={kettlePoolTarget} dispose={null} />
    <spotLight name="Practical pool over both cups" color="#EED6B0" position={[-2.48, 1.49, 3.52]} target={tablePoolTarget} intensity={32} distance={3.2} angle={0.68} penumbra={0.74} decay={2} />
    <primitive object={tablePoolTarget} dispose={null} />
    {model ? <primitive object={model} dispose={null} onPointerOver={pointerOver} onPointerOut={pointerOut} onClick={click} /> : null}
    {model ? <BakedSpace space="apartment" onReady={onLoaded} /> : null}
    <LookStack profile={APARTMENT_ROOM_LOOK} reducedMotion={props.reducedMotion} />
  </>;
}

export default function ApartmentScene(props: ApartmentSceneProps) {
  const { onContextLost } = props;
  const [frameReady, setFrameReady] = useState(false);
  const ready = useRef(props.onReady);
  const reported = useRef(false);
  const contextLossListener = useRef<((event: Event) => void) | null>(null);
  const renderer = useRef<RootState['gl'] | null>(null);
  useEffect(() => { ready.current = props.onReady; }, [props.onReady]);
  const markReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    setFrameReady(true);
    ready.current();
  }, []);
  const created = useCallback((root: RootState) => {
    root.gl.toneMapping = ACESFilmicToneMapping;
    root.gl.outputColorSpace = SRGBColorSpace;
    root.gl.toneMappingExposure = 1;
    const lost = (event: Event) => { event.preventDefault(); onContextLost(); };
    contextLossListener.current = lost;
    renderer.current = root.gl;
    root.gl.domElement.addEventListener('webglcontextlost', lost);
    const dev = window as Window & { __tqwScene?: RootState['scene']; __tqwGl?: RootState['gl']; __tqwFreeze?: () => void };
    if (import.meta.env.DEV) {
      dev.__tqwScene = root.scene;
      dev.__tqwGl = root.gl;
      dev.__tqwFreeze = () => root.setFrameloop('never');
    }
  }, [onContextLost]);
  useEffect(() => () => {
    const gl = renderer.current;
    const lost = contextLossListener.current;
    if (gl && lost) gl.domElement.removeEventListener('webglcontextlost', lost);
    if (import.meta.env.DEV) {
      const dev = window as Window & { __tqwScene?: RootState['scene']; __tqwGl?: RootState['gl']; __tqwFreeze?: () => void };
      if (dev.__tqwGl === gl) { delete dev.__tqwScene; delete dev.__tqwGl; delete dev.__tqwFreeze; }
    }
  }, []);
  const settings = useMemo(() => ({ antialias: true, alpha: false, powerPreference: 'high-performance' as const }), []);

  return <div className="tqw-apartment-canvas" data-frame-ready={frameReady} data-room-ready={frameReady}
    data-station={props.station} data-reduced-motion={props.reducedMotion} data-visible-half-arc={VISIBLE_HALF_ARC_DEG}
    data-stage-size={`${APARTMENT_STAGE.width}x${APARTMENT_STAGE.depth}x${APARTMENT_STAGE.height}`}>
    <Canvas frameloop="demand" dpr={[1, Math.min(window.devicePixelRatio || 1, 1.75)]} gl={settings} camera={CAMERA} onCreated={created}>
      <RoomModel props={props} onLoaded={markReady} />
    </Canvas>
  </div>;
}
