import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, SRGBColorSpace } from 'three';
import type { ExchangeState } from '../state.ts';
import { EXCHANGE_FOV, EXCHANGE_STAGE, applyStageYaw, horizontalFov, limitStagePose, stationYawLimit } from '../stage.ts';
import { bytesFromPackedDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import { disposeResources } from '../../../assets/dispose.ts';
import { BakedSpace } from '../../../baked/BakedSpace.tsx';
import { type AtmosphereLamp, LookStack } from '../../../look/index.ts';
import exchangeModel from '../assets/exchange.glb.gz?url&inline';
import { isDynamicExchangeNode } from '../nodes.ts';
import { rendererName } from '../../../corridor/world/quality.ts';
import { kelvinToLinear } from '../../../look/colour.ts';
import { EXCHANGE_LIGHTING } from './lighting.ts';
import { EXCHANGE_ROOM_LOOK } from './look.ts';

const CAMERA = { fov: EXCHANGE_FOV.landscape, near: 0.035, far: 35, position: [0, 1.62, 0.48] } as const;
const GL = { antialias: true, powerPreference: 'high-performance' } as const;
const [deskRed, deskGreen, deskBlue] = kelvinToLinear(2700);
const [clerestoryRed, clerestoryGreen, clerestoryBlue] = kelvinToLinear(5000);
const [galleryRed, galleryGreen, galleryBlue] = kelvinToLinear(3500);
const DESK_LIGHT_COLOUR = new Color(deskRed, deskGreen, deskBlue);
const CLERESTORY_LIGHT_COLOUR = new Color(clerestoryRed, clerestoryGreen, clerestoryBlue);
const GALLERY_LIGHT_COLOUR = new Color(galleryRed, galleryGreen, galleryBlue);
const AMBIENCE: readonly AtmosphereLamp[] = [
  { id: 'clerestory', kind: 'window', position: [1.82, 11.17, -5.18], direction: [-0.3, -0.84, -0.57] },
  { id: 'desk-pool', kind: 'desk-lamp', position: [-0.24, 1.285, -5.31], direction: [0, -1, 0] },
];

export interface ExchangeSceneProps {
  state: ExchangeState;
  reducedMotion: boolean;
  onReady(): void;
  onContextLost(): void;
  onGesture(): void;
  onError(error: unknown): void;
}

function ExchangeModel({ state, loaded, onError }: { state: ExchangeState; loaded(model: Group): void; onError(error: unknown): void }) {
  const [model, setModel] = useState<Group | null>(null);
  const invalidate = useThree(s => s.invalidate);
  const ready = useRef(loaded);
  useEffect(() => { ready.current = loaded; }, [loaded]);
  useEffect(() => {
    let active = true;
    void bytesFromPackedDataUrl(exchangeModel).then(decodeGlb).then(group => {
      group.traverse(object => { if (isDynamicExchangeNode(object.name)) object.userData['bake'] = 'dynamic'; });
      if (active) { setModel(group); ready.current(group); }
      else disposeResources(group);
    }).catch(onError);
    return () => { active = false; };
  }, [onError]);
  useEffect(() => {
    if (!model) return;
    const light = (name: string, on: boolean) => {
      const node = model.getObjectByName(name);
      if (!node || !(node as Mesh).isMesh) return;
      const mesh = node as Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.emissive = new Color(on ? '#E7A85E' : '#211C14');
        material.emissiveIntensity = on ? EXCHANGE_LIGHTING.indicator.active : EXCHANGE_LIGHTING.indicator.idle;
        material.needsUpdate = true;
      }
    };
    const lampTest = state.lampTestUntil > state.elapsedMs;
    for (let line = 1; line <= 12; line += 1) light('line_lamp_' + String(line).padStart(2, '0'), lampTest || state.litLines.includes(line));
    light('operator_lamp', state.operatorLamp);
    const ladder = model.getObjectByName('inspect_ladder');
    const ladderX = state.discoveries.includes('ladder') ? 0.2 : 0.75;
    if (ladder) ladder.position.x = ladderX;
    for (const [name, offset] of [['ladder_wheel_-0.93', -0.93], ['ladder_wheel_0.93', 0.93]] as const) {
      const wheel = model.getObjectByName(name);
      if (wheel) wheel.position.x = ladderX + offset;
    }
    const handset = model.getObjectByName('phone_handset');
    if (handset) handset.position.y = 1.38 + (state.phase === 'operator-ringing' ? 0.12 : 0);
    for (let line = 1; line <= 12; line += 1) {
      const card = model.getObjectByName(`line_card_${String(line).padStart(2, '0')}`);
      if (card) card.rotation.x = state.connectedLines.includes(line) ? 0.22 : 0;
    }
    invalidate();
  }, [invalidate, model, state]);
  useEffect(() => () => { if (model) disposeResources(model); }, [model]);
  return model ? <primitive object={model} /> : null;
}

function RoomLighting() {
  return <>
    <hemisphereLight args={['#EEECE4', '#746E61', EXCHANGE_LIGHTING.warmReturn.intensity]} />
    <pointLight color={DESK_LIGHT_COLOUR} position={EXCHANGE_LIGHTING.desk.position} intensity={EXCHANGE_LIGHTING.desk.intensity} distance={4} decay={2} />
    <pointLight color={CLERESTORY_LIGHT_COLOUR} position={EXCHANGE_LIGHTING.clerestory.position} intensity={EXCHANGE_LIGHTING.clerestory.intensity} distance={12} decay={2} />
    <pointLight color="#E0B987" position={EXCHANGE_LIGHTING.equipment.position} intensity={EXCHANGE_LIGHTING.equipment.intensity} distance={5} decay={2} />
    <pointLight color="#D8A66E" position={EXCHANGE_LIGHTING.underDesk.position} intensity={EXCHANGE_LIGHTING.underDesk.intensity} distance={1.8} decay={2} />
    <pointLight color={GALLERY_LIGHT_COLOUR} position={EXCHANGE_LIGHTING.galleryBounce.position} intensity={EXCHANGE_LIGHTING.galleryBounce.intensity} distance={6} decay={2} />
  </>;
}

function CameraRig({ stationId, yaw, pitch, onTurn, onPitch, onClampYaw, onStation, onGesture }: {
  stationId: string;
  yaw: number;
  pitch: number;
  onTurn(delta: number, limit: number): void;
  onPitch(delta: number): void;
  onClampYaw(yaw: number): void;
  onStation(index: number): void;
  onGesture(): void;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const station = EXCHANGE_STAGE.stations.find(item => item.id === stationId) ?? EXCHANGE_STAGE.stations[0];
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.fov = size.height > size.width ? EXCHANGE_FOV.portrait : EXCHANGE_FOV.landscape;
    const fov = horizontalFov(camera.fov, size.width / Math.max(1, size.height));
    const visibleHalfArcDeg = 'visibleHalfArcDeg' in station ? station.visibleHalfArcDeg : undefined;
    const pose = limitStagePose({
      x: station.x,
      z: station.z,
      yawDeg: station.yawDeg + yaw,
      pitchDeg: station.pitchDeg + pitch,
    }, fov, visibleHalfArcDeg ?? EXCHANGE_STAGE.visibleHalfArcDeg);
    const yawOffset = pose.yawDeg - station.yawDeg;
    if (Math.abs(yawOffset - yaw) > 0.005) onClampYaw(yawOffset);
    camera.position.set(station.x, station.eyeHeight, station.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pose.pitchDeg * Math.PI / 180, -(pose.yawDeg * Math.PI / 180), 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const host = gl.domElement.closest<HTMLElement>('.tqw-exchange-canvas');
    if (host) {
      host.dataset['cameraStation'] = station.id;
      host.dataset['renderer'] = rendererName(gl.getContext());
      host.dataset['yawLimit'] = stationYawLimit(station, fov).toFixed(2);
      host.dataset['horizontalFov'] = fov.toFixed(2);
      host.dataset['cameraYaw'] = pose.yawDeg.toFixed(2);
      host.dataset['cameraPitch'] = pose.pitchDeg.toFixed(2);
      host.dataset['lookPitch'] = String(pitch);
    }
    invalidate();
  }, [camera, gl, invalidate, onClampYaw, pitch, size.height, size.width, station, yaw]);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute('aria-label', 'The Exchange stage. Use arrow keys to turn, number keys one to four to change station, or drag to look.');
    canvas.tabIndex = 0;
    const point = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      current.x = event.clientX; current.y = event.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) current.moved = true;
      if (!(camera instanceof PerspectiveCamera)) return;
      const aspect = size.width / Math.max(1, size.height);
      const limit = stationYawLimit(station, horizontalFov(camera.fov, aspect));
      onTurn((dx / Math.max(1, size.width)) * horizontalFov(camera.fov, aspect), limit);
      onPitch(-dy * camera.fov / Math.max(1, size.height));
      invalidate();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      onGesture();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    };
    const up = (event: PointerEvent) => {
      if (drag.current?.id === event.pointerId) drag.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON|SUMMARY)$/.test(event.target.tagName)) return;
      const aspect = size.width / Math.max(1, size.height);
      const limit = camera instanceof PerspectiveCamera ? stationYawLimit(station, horizontalFov(camera.fov, aspect)) : 0;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') { event.preventDefault(); onTurn(-12, limit); }
      else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') { event.preventDefault(); onTurn(12, limit); }
      else if (/^[1-4]$/.test(event.key)) { event.preventDefault(); onStation(Number(event.key) - 1); }
    };
    const turnEvent = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      const aspect = size.width / Math.max(1, size.height);
      const limit = camera instanceof PerspectiveCamera ? stationYawLimit(station, horizontalFov(camera.fov, aspect)) : 0;
      onTurn(delta, limit);
    };
    const pitchEvent = (event: Event) => onPitch((event as CustomEvent<number>).detail);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', point);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('keydown', key);
    window.addEventListener('exchange:turn', turnEvent);
    window.addEventListener('exchange:pitch', pitchEvent);
    const blur = () => { drag.current = null; };
    window.addEventListener('blur', blur);
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', point);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('keydown', key); window.removeEventListener('exchange:turn', turnEvent); window.removeEventListener('exchange:pitch', pitchEvent); window.removeEventListener('blur', blur);
    };
  }, [camera, gl, invalidate, onGesture, onPitch, onStation, onTurn, size.height, size.width, station]);
  return null;
}

export default function ExchangeScene({ state, reducedMotion, onReady, onContextLost, onGesture, onError }: ExchangeSceneProps) {
  const [stationId, setStationId] = useState('threshold');
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [stationDissolve, setStationDissolve] = useState(false);
  const stationTimer = useRef<number | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const ready = useRef(onReady);
  const reported = useRef(false);
  const devScene = useRef<RootState | null>(null);
  useEffect(() => { ready.current = onReady; }, [onReady]);
  const onStation = useCallback((index: number) => {
    const station = EXCHANGE_STAGE.stations[index];
    if (!station) return;
    if (stationTimer.current !== null) window.clearTimeout(stationTimer.current);
    if (!reducedMotion) { setStationId(station.id); setYaw(0); setPitch(0); return; }
    setStationDissolve(true);
    stationTimer.current = window.setTimeout(() => {
      setStationId(station.id); setYaw(0); setPitch(0);
      stationTimer.current = window.setTimeout(() => { setStationDissolve(false); stationTimer.current = null; }, 60);
    }, 60);
  }, [reducedMotion]);
  const stationEvent = useCallback((event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    const index = EXCHANGE_STAGE.stations.findIndex(station => station.id === id);
    if (index >= 0) onStation(index);
  }, [onStation]);
  useEffect(() => {
    window.addEventListener('exchange:station', stationEvent);
    return () => { window.removeEventListener('exchange:station', stationEvent); };
  }, [stationEvent]);
  useEffect(() => () => { if (stationTimer.current !== null) window.clearTimeout(stationTimer.current); }, []);
  const loaded = useCallback((_model: Group) => setModelReady(true), []);
  const created = useCallback((root: RootState) => {
    root.gl.toneMapping = ACESFilmicToneMapping;
    root.gl.outputColorSpace = SRGBColorSpace;
    root.gl.toneMappingExposure = 1;
    root.gl.domElement.addEventListener('webglcontextlost', onContextLost);
    let background = '#C2C0B8';
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('holes') === 'magenta') background = '#FF00FF';
    root.scene.background = new Color(background);
    if (import.meta.env.DEV) {
      const dev = window as unknown as { __tqwGl?: RootState['gl']; __tqwScene?: RootState['scene']; __tqwFreeze?: () => void };
      dev.__tqwGl = root.gl;
      dev.__tqwScene = root.scene;
      dev.__tqwFreeze = () => root.setFrameloop('never');
      devScene.current = root;
    }
  }, [onContextLost]);
  const turn = useCallback((delta: number, limit: number) => {
    setYaw(current => applyStageYaw(current, delta, limit));
  }, []);
  const clampYaw = useCallback((nextYaw: number) => setYaw(nextYaw), []);
  const lookPitch = useCallback((delta: number) => setPitch(current => Math.max(-25, Math.min(25, current + delta))), []);
  const lamps = useMemo(() => AMBIENCE, []);
  const afterReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    setFrameReady(true);
    ready.current();
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return () => {
      const root = devScene.current;
      if (!root) return;
      const dev = window as unknown as { __tqwGl?: RootState['gl']; __tqwScene?: RootState['scene']; __tqwFreeze?: () => void };
      if (dev.__tqwGl === root.gl) { delete dev.__tqwGl; delete dev.__tqwScene; delete dev.__tqwFreeze; }
    };
  }, []);

  return <div className="tqw-canvas tqw-exchange-canvas" data-ready={modelReady} data-frame-ready={frameReady}
    data-station={stationId} data-yaw={yaw.toFixed(2)} data-look-pitch={pitch}
    style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none' }}>
    <Canvas frameloop="demand" dpr={[1, Math.min(window.devicePixelRatio || 1, 1.75)]} gl={GL} camera={CAMERA} onCreated={created}>
      <RoomLighting />
      <ExchangeModel state={state} loaded={loaded} onError={onError} />
      {modelReady ? <BakedSpace space="exchange" onReady={afterReady} /> : null}
      <CameraRig stationId={stationId} yaw={yaw} pitch={pitch} onTurn={turn} onPitch={lookPitch} onClampYaw={clampYaw} onStation={onStation} onGesture={onGesture} />
      <LookStack profile={EXCHANGE_ROOM_LOOK} reducedMotion={reducedMotion} lamps={lamps} />
    </Canvas>
    {reducedMotion ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: '#211b14', opacity: stationDissolve ? 0.5 : 0, transition: 'opacity 60ms linear' }} /> : null}
  </div>;
}
