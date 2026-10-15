import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ACESFilmicToneMapping, BufferGeometry, Color, Group, Light, Material, Mesh, PerspectiveCamera, Texture, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BakedSpace } from '../../baked/BakedSpace.tsx';
import type { RoomObjectId, RoomState } from './state.ts';
import { stageAdapter, STATIONS, type StagePosition } from './stage.ts';
import './room.css';

import modelUrl from '../../assets/outline-room.glb.gz?url&inline';

const OBJECT_ID = new Map<string, RoomObjectId>([
  ['follower', 'follower'], ['selector', 'selector'], ['wingnut', 'wingnut'], ['tin-a', 'tin-a'],
  ['tin-b', 'tin-b'], ['leaves', 'leaves'], ['hood', 'hood'], ['rest', 'rest'],
  ['eraser', 'eraser'], ['drawer', 'drawer'], ['provenance', 'provenance'], ['door', 'door'],
]);
const CAMERA = { position: [0, 1.62, 1.2] as [number, number, number], fov: 48, near: 0.08, far: 35 };
const DEFAULT_STATION = { id: 'arrival', label: 'Entrance view', x: 0, z: 1.2, headingDeg: 180 } as const;

export interface OutlineSceneProps {
  state: RoomState;
  station: (typeof STATIONS)[number]['id'];
  reducedMotion: boolean;
  inputRef: RefObject<HTMLElement | null>;
  onTarget(id: RoomObjectId, x: number, y: number): void;
  onReady(): void;
  onContextLost(): void;
  onError(): void;
}

function arrayBufferFromDataUrl(value: string): ArrayBuffer {
  const encoded = value.slice(value.indexOf(',') + 1);
  const binary = atob(encoded);
  const bytes = new ArrayBuffer(binary.length);
  const view = new Uint8Array(bytes);
  for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i);
  return bytes;
}

async function roomBuffer(): Promise<ArrayBuffer> {
  const compressed = arrayBufferFromDataUrl(modelUrl);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes = await new Response(stream).arrayBuffer();
  const view = new DataView(bytes);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('The room model is not a valid glTF binary');
  }
  return bytes;
}

function actionTarget(object: Object3D): RoomObjectId | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const id = OBJECT_ID.get(String(node.userData['actionTarget'] ?? ''));
    if (id) return id;
  }
  return null;
}

function disposeRoom(gltf: GLTF): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material as unknown as Record<string, unknown>)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function poseCamera(camera: PerspectiveCamera, station: { headingDeg: number; x: number; z: number }, yawOffset: number, width: number, height: number, pitchDeg: number): { yaw: number; pitch: number } {
  const limits = stageAdapter.limits(width, height);
  const yaw = stageAdapter.clampTurn(yawOffset, width, height);
  const pitch = stageAdapter.clampPitch(pitchDeg);
  camera.position.set(station.x, 1.62, station.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set((pitch * Math.PI) / 180, ((station.headingDeg + yaw) * Math.PI) / 180, 0);
  camera.fov = limits.verticalFovDeg;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { yaw, pitch };
}

function setPose(camera: PerspectiveCamera, stationId: OutlineSceneProps['station'], yawOffset: number, width: number, height: number, positionOverride?: StagePosition, pitchDeg = -2): number {
  const station = STATIONS.find((value) => value.id === stationId) ?? DEFAULT_STATION;
  poseCamera(camera, { ...station, ...(positionOverride ?? {}) }, yawOffset, width, height, pitchDeg);
  return stageAdapter.limits(width, height).yawLimitDeg;
}

function updateInteractiveProps(root: Group, state: RoomState): void {
  const setVisible = (name: string, visible: boolean) => { const object = root.getObjectByName(name); if (object) object.visible = visible; };
  setVisible('ComparisonHood', !state.hoodOpen);
  setVisible('TinA_Lid', !state.hoodOpen);
  setVisible('TinB_Lid', !state.hoodOpen);
  const lineNodes = [
    ['WaxLine_Wingnut', state.lines.wingnut, state.lineProgress.wingnut],
    ['WaxLine_TinA', state.lines.tinA, state.lineProgress.tinA],
    ['WaxLine_TinB', state.lines.tinB, state.lineProgress.tinB],
    ['WaxLine_Service', state.lines.service, state.lineProgress.service],
  ] as const;
  for (const [name, line, progress] of lineNodes) {
    const object = root.getObjectByName(name);
    if (!object) continue;
    object.visible = line !== 'empty';
    if (object instanceof Mesh) {
      const geometry = object.geometry;
      const count = geometry.index?.count ?? geometry.getAttribute('position').count;
      geometry.setDrawRange(0, Math.floor((count * progress) / 3) * 3);
    }
  }
  setVisible('PantographFollower', !state.followerParked);
  const follower = root.getObjectByName('PantographFollower');
  if (follower) {
    if (follower.userData['baseX'] === undefined) follower.userData['baseX'] = follower.position.x;
    if (follower.userData['baseZ'] === undefined) follower.userData['baseZ'] = follower.position.z;
    const guide = state.activeTrace;
    const progress = guide === 'wingnut' ? state.lineProgress.wingnut : guide === 'tin-a' ? state.lineProgress.tinA : guide === 'tin-b' ? state.lineProgress.tinB : guide === 'service' ? state.lineProgress.service : 1;
    if (guide && progress < 1) {
      const centres = { wingnut: [-0.5, 3.65, 0.19, 0.11], 'tin-a': [-0.4, 5.15, 0.15, 0.1], 'tin-b': [0.4, 5.15, 0.15, 0.1], service: [-1.2, 3.56, 0.07, 0.075] } as const;
      const [x, z, radiusX, radiusZ] = centres[guide];
      const angle = progress * Math.PI * 2;
      follower.position.x = Number(follower.userData['baseX']) + x + radiusX * Math.cos(angle) - 0.62;
      follower.position.z = Number(follower.userData['baseZ']) + z + radiusZ * Math.sin(angle) - 3.6;
    } else {
      follower.position.x = Number(follower.userData['baseX']);
      follower.position.z = Number(follower.userData['baseZ']);
    }
  }
  const selector = root.getObjectByName('SelectorPointer');
  if (selector) selector.position.x = state.selectedGuide === 'tin-a' ? -0.8 : state.selectedGuide === 'tin-b' ? -0.66 : -0.94;
  const boat = root.getObjectByName('WoodenBoat');
  if (boat) boat.position.y = state.boatLifted ? 0.17 : 0;
  setVisible('Folded mast', !state.boatMastRaised);
  setVisible('Raised mast', state.boatMastRaised);
  const cloth = root.getObjectByName('Liftable cloth edge');
  if (cloth) {
    if (cloth.userData['baseY'] === undefined) cloth.userData['baseY'] = cloth.position.y;
    cloth.position.y = Number(cloth.userData['baseY']) + (state.clothEdgeLifted ? 0.06 : 0);
  }
  const drawer = root.getObjectByName('ServiceDrawer');
  if (drawer) drawer.position.z = state.serviceDrawerOpen ? -0.22 : 0;
  const shoe = root.getObjectByName('GuideShoe');
  if (shoe) shoe.visible = state.serviceDrawerOpen;
  const rightLeaf = root.getObjectByName('Right ground-glass leaf');
  if (rightLeaf) {
    if (rightLeaf.userData['baseX'] === undefined) rightLeaf.userData['baseX'] = rightLeaf.position.x;
    rightLeaf.position.x = Number(rightLeaf.userData['baseX']) - (state.comparisonOverlaid ? 0.8 : 0);
  }
  const rightLine = root.getObjectByName('WaxLine_TinB');
  if (rightLine) rightLine.position.x = state.comparisonOverlaid ? -0.8 : 0;
  root.traverse((node) => {
    if (node.name === 'Glass leaf brass rail' && node.position.x > 0) {
      if (node.userData['baseX'] === undefined) node.userData['baseX'] = node.position.x;
      node.position.x = Number(node.userData['baseX']) - (state.comparisonOverlaid ? 0.8 : 0);
    }
  });
}

function RoomModel({ props, onLoaded }: { props: OutlineSceneProps; onLoaded(): void }) {
  const { camera, gl, invalidate, scene, setFrameloop } = useThree();
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const handlers = useRef(props);
  const yaw = useRef(0);
  const position = useRef<{ x: number; z: number }>({ x: DEFAULT_STATION.x, z: DEFAULT_STATION.z });

  useEffect(() => { handlers.current = props; });
  useEffect(() => {
    let cancelled = false;
    void roomBuffer().then((bytes) => new GLTFLoader().parseAsync(bytes, '')).then((result) => {
      if (cancelled) { disposeRoom(result); return; }
      setGltf(result);
    }).catch((error: unknown) => {
      if (!cancelled) {
        console.error('Outline Room model failed to load', error);
        handlers.current.onError();
      }
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    const { width, height } = gl.domElement.getBoundingClientRect();
    yaw.current = 0;
    const station = STATIONS.find((value) => value.id === props.station) ?? DEFAULT_STATION;
    position.current = { x: station.x, z: station.z };
    setPose(camera as PerspectiveCamera, props.station, 0, width, height, position.current);
    invalidate();
  }, [camera, gl, invalidate, props.station]);

  useEffect(() => {
    const root = gltf?.scene;
    if (!root) return;
    updateInteractiveProps(root, props.state);
    invalidate();
  }, [gltf, invalidate, props.state]);

  useEffect(() => {
    if (!gltf) return;
    return () => disposeRoom(gltf);
  }, [gltf]);

  useEffect(() => {
    const el = handlers.current.inputRef.current;
    if (!el) return;
    let drag: { x: number; y: number; startYaw: number; active: boolean } | null = null;
    let lastPointer = 0;
    const cam = camera as PerspectiveCamera;
    const viewport = () => gl.domElement.getBoundingClientRect();
    const currentStation = () => STATIONS.find((value) => value.id === handlers.current.station) ?? DEFAULT_STATION;
    const readTarget = (target: EventTarget | null) => target instanceof Element ? target.closest('button,summary,a,input,select,textarea') : null;
    const keydown = (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (readTarget(keyEvent.target)) return;
      const key = keyEvent.key.toLowerCase();
      const rect = viewport();
      if (key === 'a' || key === 'arrowleft') { if (!handlers.current.reducedMotion) yaw.current = stageAdapter.turn(yaw.current, 4, rect.width, rect.height); keyEvent.preventDefault(); }
      else if (key === 'd' || key === 'arrowright') { if (!handlers.current.reducedMotion) yaw.current = stageAdapter.turn(yaw.current, -4, rect.width, rect.height); keyEvent.preventDefault(); }
      else if (key === 'w' || key === 'arrowup' || key === 's' || key === 'arrowdown') {
        const sign: -1 | 1 = key === 'w' || key === 'arrowup' ? 1 : -1;
        position.current = stageAdapter.walk(position.current, currentStation().headingDeg + yaw.current, sign);
        keyEvent.preventDefault();
      }
      setPose(cam, handlers.current.station, yaw.current, rect.width, rect.height, position.current);
      invalidate();
    };
    const pointerdown = (event: Event) => {
      const pointer = event as PointerEvent;
      if (handlers.current.reducedMotion || pointer.button !== 0 || pointer.target !== gl.domElement) return;
      drag = { x: pointer.clientX, y: pointer.clientY, startYaw: yaw.current, active: false };
      lastPointer = pointer.pointerId;
    };
    const pointermove = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!drag || pointer.pointerId !== lastPointer) return;
      const dx = pointer.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.active = true;
      if (!drag.active) return;
      const rect = viewport();
      yaw.current = stageAdapter.turn(drag.startYaw, -dx * 0.18, rect.width, rect.height);
      setPose(cam, handlers.current.station, yaw.current, rect.width, rect.height, position.current);
      invalidate();
    };
    const pointerup = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!drag || pointer.pointerId !== lastPointer) return;
      drag = null;
    };
    const resize = () => {
      const rect = viewport();
      yaw.current = stageAdapter.clampTurn(yaw.current, rect.width, rect.height);
      setPose(cam, handlers.current.station, yaw.current, rect.width, rect.height, position.current);
      invalidate();
    };
    el.addEventListener('keydown', keydown);
    el.addEventListener('pointerdown', pointerdown);
    window.addEventListener('pointermove', pointermove);
    window.addEventListener('pointerup', pointerup);
    window.addEventListener('resize', resize);
    return () => {
      el.removeEventListener('keydown', keydown);
      el.removeEventListener('pointerdown', pointerdown);
      window.removeEventListener('pointermove', pointermove);
      window.removeEventListener('pointerup', pointerup);
      window.removeEventListener('resize', resize);
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const dev = window as Window & {
      __tqwScene?: import('three').Scene;
      __tqwGl?: import('three').WebGLRenderer;
      __tqwFreeze?: () => void;
      __tqwCamera?: PerspectiveCamera;
    };
    dev.__tqwScene = scene;
    dev.__tqwGl = gl;
    dev.__tqwCamera = camera as PerspectiveCamera;
    dev.__tqwFreeze = () => setFrameloop('never');
    let previousVisibility: Map<Object3D, boolean> | null = null;
    const probe = {
      setPose(stationId: OutlineSceneProps['station'], yawOffsetDeg: number, pitchDeg = -2): number {
        const rect = gl.domElement.getBoundingClientRect();
        const station = STATIONS.find((value) => value.id === stationId) ?? DEFAULT_STATION;
        const pose = poseCamera(camera as PerspectiveCamera, station, yawOffsetDeg, rect.width, rect.height, pitchDeg);
        yaw.current = pose.yaw;
        position.current = { x: station.x, z: station.z };
        invalidate();
        return yaw.current;
      },
      setPoseAt(stagePosition: StagePosition, headingDeg: number, yawOffsetDeg: number, pitchDeg: number): { appliedYaw: number; appliedPitch: number } {
        const rect = gl.domElement.getBoundingClientRect();
        const pose = poseCamera(camera as PerspectiveCamera, { ...stagePosition, headingDeg }, yawOffsetDeg, rect.width, rect.height, pitchDeg);
        yaw.current = pose.yaw;
        position.current = { x: stagePosition.x, z: stagePosition.z };
        invalidate();
        return { appliedYaw: pose.yaw, appliedPitch: pose.pitch };
      },
      setSweepPixelRatio(pixelRatio: number): void {
        gl.setPixelRatio(pixelRatio);
        invalidate();
      },
      setStageShellOnly(enabled: boolean): void {
        const root = gltf?.scene;
        if (!root) throw new Error('The Outline Room model is not ready');
        if (!enabled) {
          for (const [node, visible] of previousVisibility ?? []) node.visible = visible;
          previousVisibility = null;
          invalidate();
          return;
        }
        previousVisibility = new Map();
        root.traverse((node) => previousVisibility?.set(node, node.visible));
        const showStage = (node: Object3D, inheritedStage: boolean): boolean => {
          const isStage = inheritedStage || node.userData['stageSurface'] === 'structure' || node.userData['actionTarget'] === 'door';
          const containsStage = node.children.map((child) => showStage(child, isStage)).some(Boolean);
          node.visible = node === root || isStage || containsStage;
          return isStage || containsStage;
        };
        showStage(root, false);
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
        scene.traverse((node) => { if (node instanceof Light) lights += 1; });
        const result = { magentaPixels, calls: gl.info.render.calls, triangles: gl.info.render.triangles, lights, yaw: camera.rotation.y };
        scene.background = previousBackground;
        gl.setClearColor(previousClear, previousAlpha);
        if (restore) gl.render(scene, camera);
        return result;
      },
    };
    window.__outlineStageProbe = { ...probe, scene, camera: camera as PerspectiveCamera, renderer: gl };
    return () => {
      if (dev.__tqwScene === scene) delete dev.__tqwScene;
      if (dev.__tqwGl === gl) delete dev.__tqwGl;
      if (dev.__tqwCamera === camera) delete dev.__tqwCamera;
      delete dev.__tqwFreeze;
      if (window.__outlineStageProbe?.scene === scene) delete window.__outlineStageProbe;
    };
  }, [camera, gl, gltf, invalidate, scene, setFrameloop]);

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const id = actionTarget(event.object);
    if (!id) return;
    event.stopPropagation();
    const vector = event.point.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const x = rect.left + (vector.x + 1) * rect.width / 2;
    const y = rect.top + (1 - vector.y) * rect.height / 2;
    handlers.current.onTarget(id, x, y);
  };

  return <>
    <color attach="background" args={['#151A20']} />
    <hemisphereLight name="4300K soft fill" args={['#d7d3c8', '#52493d', 0.28]} />
    <pointLight name="3500K task pool" color="#f4c998" intensity={16} distance={7} decay={2} position={[0, 2.52, 3.85]} />
    <pointLight name="quiet wall fill" color="#d7cbbb" intensity={1.25} distance={7} decay={2} position={[-2.5, 2.5, 6.75]} />
    {gltf ? <primitive object={gltf.scene} dispose={null} onClick={onClick} /> : null}
    {gltf ? <BakedSpace space="codex-room" onReady={onLoaded} /> : null}
  </>;
}

export function OutlineScene(props: OutlineSceneProps) {
  const [loaded, setLoaded] = useState(false);
  const onReady = props.onReady;
  const settings = useMemo(() => ({ antialias: true, alpha: false, powerPreference: 'high-performance' as const }), []);
  const onContextLost = props.onContextLost;
  const onCreated = useMemo(() => (state: { gl: import('three').WebGLRenderer }) => {
    state.gl.domElement.setAttribute('aria-hidden', 'true');
    state.gl.toneMapping = ACESFilmicToneMapping;
    state.gl.toneMappingExposure = 1;
    const lost = (event: Event) => { event.preventDefault(); onContextLost(); };
    state.gl.domElement.addEventListener('webglcontextlost', lost);
    state.gl.domElement.dataset['outlineRoom'] = 'ready';
  }, [onContextLost]);
  const loadedOnce = useRef(false);
  const markLoaded = useCallback(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    setLoaded(true);
    onReady();
  }, [onReady]);

  return <div className="tqw-outline-room__canvas-wrap" data-model-ready={loaded}>
    <Canvas
      frameloop="demand"
      dpr={[1, Math.min(window.devicePixelRatio || 1, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2)]}
      shadows={false}
      gl={settings}
      camera={CAMERA}
      onCreated={onCreated}
      onPointerMissed={() => undefined}
    >
      <RoomModel props={props} onLoaded={markLoaded} />
    </Canvas>
    {!loaded ? <div className="tqw-outline-room__loading" role="status">The room is being set.</div> : null}
  </div>;
}

declare global {
  interface Window {
    __outlineStageProbe?: {
      setPose(station: OutlineSceneProps['station'], yawOffsetDeg: number, pitchDeg?: number): number;
      setPoseAt(position: StagePosition, headingDeg: number, yawOffsetDeg: number, pitchDeg: number): { appliedYaw: number; appliedPitch: number };
      setSweepPixelRatio(pixelRatio: number): void;
      setStageShellOnly(enabled: boolean): void;
      measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number; yaw: number };
      scene: import('three').Scene;
      camera: PerspectiveCamera;
      renderer: import('three').WebGLRenderer;
    };
  }
}
