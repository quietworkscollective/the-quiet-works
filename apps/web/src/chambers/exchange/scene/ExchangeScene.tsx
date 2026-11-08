import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import {
  ACESFilmicToneMapping, BackSide, Box3, BufferGeometry, Color, Group, Light, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PointLight, Raycaster, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, type WebGLRenderer,
} from 'three';
import { bytesFromPackedDataUrl, decodeGlb } from '../../../assets/gltf.ts';
import { disposeResources } from '../../../assets/dispose.ts';
import { BakedSpace } from '../../../baked/BakedSpace.tsx';
import { rendererName } from '../../../corridor/world/quality.ts';
import { LookStack } from '../../../look/index.ts';
import { kelvinToLinear } from '../../../look/colour.ts';
import exchangeModel from '../assets/exchange.glb.gz?url&inline';
import { isDynamicExchangeNode } from '../nodes.ts';
import type { ExchangeState } from '../state.ts';
import {
  EXCHANGE_FOLLOW_MS, EXCHANGE_VIEWS, EXCHANGE_VIEW_MS, poseBetween, travelPose, verticalFov,
  type CameraPose, type ExchangeHotspot, type ExchangeViewId, type StagePoint,
} from '../stage.ts';
import { hitVolumes, outlineNodes, pickHotspot } from './hotspots.ts';
import { LINES, lineNumber, separateLamps, setGlow } from './lamps.ts';
import { EXCHANGE_AMBIENCE, EXCHANGE_FORM_TONE, EXCHANGE_LAMP, EXCHANGE_LIGHTING, EXCHANGE_OPERATOR_GLOW } from './lighting.ts';
import { dragGaze, gazeTarget, LEVEL_GAZE, type Gaze } from '../../gaze.ts';
import { EXCHANGE_ROOM_LOOK } from './look.ts';
import {
  EXCHANGE_MOTION_MS, LEVER_NIGHT_RADIANS, PLATE_OPEN_RADIANS, SET_CHANNELS, cardPulse, channelMs, cordPoseFor, drawerOffset, exchangeSetChannels,
  handsetPose, heldCardTip, lineLampLevels, nudge, plugPosition, ticketPose, type SetChannel, type SetChannels,
} from './pose.ts';

/** A refused action's small physical answer: the receiver lifts and settles, brass taps, the drawer rattles. */
export interface ExchangeFeedback {
  readonly id: 'telephone' | 'plate' | 'drawer';
  readonly sequence: number;
}

export interface ExchangeSceneProps {
  state: ExchangeState;
  view: ExchangeViewId;
  followingCord: boolean;
  reducedMotion: boolean;
  tippedLine: number | null;
  /** Keyboard focus on a control gives its object the same outline as a pointer. */
  focusedHotspot?: ExchangeHotspot | null;
  feedback?: ExchangeFeedback | null;
  onHotspot(id: ExchangeHotspot): void;
  onReady(): void;
  onContextLost(): void;
  onSceneError(error: unknown): void;
}

interface ExchangeDebug {
  inspectCamera(): { position: number[]; direction: number[] };
  clearAndCountMagenta(): number;
  stats(): { calls: number; triangles: number; lights: number };
  /** Where a stage point falls on the page, in CSS pixels. */
  screenPoint(point: StagePoint): [x: number, y: number];
  /** A node's centre on the page and how far its bounds reach from there, in CSS pixels. */
  nodeSpot(name: string): { x: number; y: number; reachX: number; reachY: number } | null;
  /** The first visible mesh behind a page position. */
  sightline(x: number, y: number): string | null;
}

declare global {
  interface Window { __tqwExchange?: ExchangeDebug }
}

const CAMERA = { fov: 48, near: 0.035, far: 35, position: [...EXCHANGE_VIEWS.wide.position] as [number, number, number] };
const GL = { antialias: true, powerPreference: 'high-performance' } as const;
const BACKGROUND = '#0B0907';
const OUTLINE_PIXELS = 1.6;
const OUTLINE_COLOUR = '#F2C27A';
const TAP_SLOP_PIXELS = 14;
const FEEDBACK_MS = 240;
const lightColour = (kelvin: number) => new Color(...kelvinToLinear(kelvin));

function poseOf(view: ExchangeViewId): CameraPose {
  const { position, target } = EXCHANGE_VIEWS[view];
  return { position, target };
}

function placeCamera(camera: PerspectiveCamera, pose: CameraPose, aspect: number, gaze: Gaze = LEVEL_GAZE): void {
  camera.position.set(...pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...gazeTarget(pose.position, pose.target, gaze));
  camera.aspect = aspect;
  camera.fov = verticalFov(aspect);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

interface Cord {
  rest: Mesh | undefined;
  guide: Mesh | undefined;
  seated: Mesh | undefined;
  /** A working copy shown only while the cord changes pose; absent if the poses do not line up. */
  morph: Mesh | null;
}

function prepareCord(model: Group): Cord {
  const find = (pose: string) => model.getObjectByName('enquiry_cord_' + pose) as Mesh | undefined;
  const cord: Cord = { rest: find('rest'), guide: find('guide'), seated: find('seated'), morph: null };
  if (!cord.rest || !cord.guide || !cord.seated) return cord;
  const count = cord.rest.geometry.getAttribute('position').count;
  if (cord.guide.geometry.getAttribute('position').count !== count || cord.seated.geometry.getAttribute('position').count !== count) return cord;
  const morph = new Mesh(cord.seated.geometry.clone(), cord.seated.material);
  morph.name = 'enquiry_cord_moving';
  morph.visible = false;
  morph.frustumCulled = false;
  morph.userData['bake'] = 'dynamic';
  model.add(morph);
  cord.morph = morph;
  return cord;
}

function applyCord(cord: Cord, value: number): void {
  const settled = Number.isInteger(value);
  const pose = cordPoseFor(value);
  for (const name of ['rest', 'guide', 'seated'] as const) {
    const mesh = cord[name];
    if (mesh) mesh.visible = (settled || !cord.morph) && name === pose;
  }
  if (!cord.morph) return;
  cord.morph.visible = !settled;
  if (settled) return;
  const lower = value < 1 ? cord.rest : cord.guide;
  const upper = value < 1 ? cord.guide : cord.seated;
  if (!lower || !upper) return;
  const t = value - Math.floor(value);
  const from = lower.geometry.getAttribute('position');
  const to = upper.geometry.getAttribute('position');
  const live = cord.morph.geometry.getAttribute('position');
  for (let index = 0; index < live.count; index += 1) {
    live.setXYZ(index,
      from.getX(index) + (to.getX(index) - from.getX(index)) * t,
      from.getY(index) + (to.getY(index) - from.getY(index)) * t,
      from.getZ(index) + (to.getZ(index) - from.getZ(index)) * t);
  }
  live.needsUpdate = true;
}

/**
 * Decodes the packed set and readies it for this scene: moving nodes stay out of the bake, each
 * line lamp holds its own level, the form under the ledge lamp is toned down, and the cord can morph.
 */
async function unpackSet(): Promise<{ group: Group; cord: Cord }> {
  const group = await decodeGlb(await bytesFromPackedDataUrl(exchangeModel));
  group.traverse(object => { if (isDynamicExchangeNode(object.name)) object.userData['bake'] = 'dynamic'; });
  separateLamps(group);
  const form = group.getObjectByName('ticket_form');
  if (form instanceof Mesh && form.material instanceof MeshStandardMaterial) {
    form.material = form.material.clone();
    form.material.color.multiplyScalar(EXCHANGE_FORM_TONE);
  }
  return { group, cord: prepareCord(group) };
}

const LAMP_COLOUR = new Color(EXCHANGE_LAMP.colour);
const OPERATOR_COLOUR = new Color(EXCHANGE_OPERATOR_GLOW.colour);

interface Motion { from: number; to: number; start: number; ms: number }

function StageSet({ scene: props, model, onLoaded }: { scene: ExchangeSceneProps; model: Group | null; onLoaded(group: Group): void }) {
  const { state, reducedMotion, tippedLine, feedback } = props;
  const invalidate = useThree(root => root.invalidate);
  const rootScene = useThree(root => root.scene);
  const latest = useRef(props);
  const cord = useRef<Cord | null>(null);
  const values = useRef<Record<SetChannel, number> | null>(null);
  const motions = useRef(new Map<SetChannel, Motion>());
  const cardMotion = useRef<{ line: number; start: number } | null>(null);
  const nudgeMotion = useRef<{ id: ExchangeFeedback['id']; start: number } | null>(null);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const request = { wanted: true };
    unpackSet().then(
      set => {
        if (!request.wanted) { disposeResources(set.group); return; }
        cord.current = set.cord;
        onLoaded(set.group);
      },
      (error: unknown) => { if (request.wanted) latest.current.onSceneError(error); },
    );
    return () => { request.wanted = false; };
  }, [onLoaded]);
  useEffect(() => model ? () => disposeResources(model) : undefined, [model]);

  const apply = useCallback((channels: SetChannels, now: number) => {
    if (!model) return;
    const current = latest.current;
    const node = (name: string) => model.getObjectByName(name);
    const nudged = nudgeMotion.current;
    const push = nudged ? nudge((now - nudged.start) / FEEDBACK_MS) : 0;

    node('enquiry_plug')?.position.set(...plugPosition(channels.plug));
    if (cord.current) applyCord(cord.current, channels.plug);

    const drawer = node('ticket_shelf_drawer');
    if (drawer) {
      const rest = (drawer.userData['rest'] ??= drawer.position.z) as number;
      drawer.position.z = rest + drawerOffset(channels.drawer) + (nudged?.id === 'drawer' ? 0.012 * push : 0);
    }
    const form = node('ticket_form');
    if (form) form.visible = channels.drawer > 0;

    const plate = node('operator_plate_pivot');
    if (plate) plate.rotation.y = PLATE_OPEN_RADIANS * channels.plate - (nudged?.id === 'plate' ? 0.03 * push : 0);
    const lever = node('night_service_pivot');
    if (lever) lever.rotation.x = LEVER_NIGHT_RADIANS * channels.lever;

    const seatedLead = current.state.lead === 'seated';
    const leadRest = node('operator_test_lead_rest');
    const leadSeated = node('operator_test_lead_seated');
    if (leadRest) leadRest.visible = !seatedLead;
    if (leadSeated) leadSeated.visible = seatedLead;

    setGlow(node('operator_lamp'), OPERATOR_COLOUR, EXCHANGE_OPERATOR_GLOW.dark + (EXCHANGE_OPERATOR_GLOW.peak - EXCHANGE_OPERATOR_GLOW.dark) * channels.operator);
    const operatorLight = rootScene.getObjectByName('operator_light');
    if (operatorLight instanceof PointLight) operatorLight.intensity = EXCHANGE_LIGHTING.operator.intensity * channels.operator;

    const handset = node('phone_handset');
    if (handset) {
      const pose = handsetPose(channels.handset);
      handset.position.set(...pose.position);
      if (nudged?.id === 'telephone') handset.position.y += 0.05 * push;
      handset.rotation.set(0, pose.yaw, 0);
    }
    const laid = channels.handset > 0.5;
    const coiled = node('phone_coiled_cord');
    const coiledLaid = node('phone_coiled_cord_laid');
    if (coiled) coiled.visible = !laid;
    if (coiledLaid) coiledLaid.visible = laid;

    const tickets = ticketPose(channels.ticket, current.state);
    const older = node('operator_ticket_old');
    const newer = node('operator_ticket_new');
    if (older) { older.position.set(...tickets.old); older.visible = tickets.oldVisible; }
    if (newer) { newer.position.set(...tickets.fresh); newer.visible = tickets.freshVisible; }

    const levels = lineLampLevels(current.state);
    for (const line of LINES) {
      setGlow(node('line_lamp_' + lineNumber(line)), LAMP_COLOUR, EXCHANGE_LAMP.peak * (levels[line - 1] ?? 0));
      const card = node('line_card_' + lineNumber(line));
      if (!card) continue;
      const pulse = cardMotion.current?.line === line ? cardPulse((now - cardMotion.current.start) / EXCHANGE_MOTION_MS.cardTip) : 0;
      card.rotation.x = -Math.max(heldCardTip(line, current.state, current.tippedLine, current.reducedMotion), pulse);
    }
  }, [model, rootScene]);

  useLayoutEffect(() => {
    if (!model) return;
    const target = exchangeSetChannels(state);
    const now = performance.now();
    const running = values.current;
    if (!running || reducedMotion) {
      values.current = { ...target };
      motions.current.clear();
    } else {
      for (const channel of SET_CHANNELS) {
        const destination = motions.current.get(channel)?.to ?? running[channel];
        if (destination === target[channel]) continue;
        motions.current.set(channel, { from: running[channel], to: target[channel], start: now, ms: channelMs(channel, running[channel], target[channel]) });
      }
    }
    apply(values.current ?? target, now);
    invalidate();
  }, [apply, invalidate, model, reducedMotion, state, tippedLine]);

  useEffect(() => {
    if (tippedLine === null || reducedMotion) { cardMotion.current = null; return; }
    cardMotion.current = { line: tippedLine, start: performance.now() };
    invalidate();
  }, [invalidate, reducedMotion, tippedLine]);

  useEffect(() => {
    if (!feedback || reducedMotion) { nudgeMotion.current = null; return; }
    nudgeMotion.current = { id: feedback.id, start: performance.now() };
    invalidate();
  }, [feedback, invalidate, reducedMotion]);

  useFrame(() => {
    const running = values.current;
    if (!running) return;
    const now = performance.now();
    for (const [channel, motion] of motions.current) {
      const progress = Math.min(1, (now - motion.start) / motion.ms);
      running[channel] = progress >= 1 ? motion.to : motion.from + (motion.to - motion.from) * progress * progress * (3 - 2 * progress);
      if (progress >= 1) motions.current.delete(channel);
    }
    if (cardMotion.current && now - cardMotion.current.start >= EXCHANGE_MOTION_MS.cardTip) cardMotion.current = null;
    if (nudgeMotion.current && now - nudgeMotion.current.start >= FEEDBACK_MS) nudgeMotion.current = null;
    const moving = motions.current.size > 0 || cardMotion.current !== null || nudgeMotion.current !== null;
    apply(running, now);
    if (moving) invalidate();
  });

  return model ? <primitive object={model} /> : null;
}

function RoomLighting() {
  const { desk, ledge, underDesk, clerestory, operator } = EXCHANGE_LIGHTING;
  const colours = useMemo(() => ({
    desk: lightColour(desk.kelvin), ledge: lightColour(ledge.kelvin), underDesk: lightColour(underDesk.kelvin),
    clerestory: lightColour(clerestory.kelvin), operator: lightColour(operator.kelvin),
  }), [clerestory.kelvin, desk.kelvin, ledge.kelvin, operator.kelvin, underDesk.kelvin]);
  return <>
    <pointLight color={colours.desk} position={desk.position} intensity={desk.intensity} distance={desk.distance} decay={2} />
    <pointLight color={colours.ledge} position={ledge.position} intensity={ledge.intensity} distance={ledge.distance} decay={2} />
    <pointLight color={colours.underDesk} position={underDesk.position} intensity={underDesk.intensity} distance={underDesk.distance} decay={2} />
    <pointLight color={colours.clerestory} position={clerestory.position} intensity={clerestory.intensity} distance={clerestory.distance} decay={2} />
    <group userData={{ bake: 'dynamic' }}>
      <pointLight name="operator_light" color={colours.operator} position={operator.position} intensity={0} distance={operator.distance} decay={2} />
    </group>
  </>;
}

function CameraRig({ view, followingCord, reducedMotion, host, gaze }: Pick<ExchangeSceneProps, 'view' | 'followingCord' | 'reducedMotion'> & { host: RefObject<HTMLDivElement | null>; gaze: RefObject<Gaze> }) {
  const { camera, gl, invalidate, size } = useThree();
  const shown = useRef<CameraPose>(poseOf(view));
  const move = useRef<{ start: number; ms: number; at(t: number): CameraPose } | null>(null);
  const previous = useRef(view);
  const aspect = size.width / Math.max(1, size.height);

  useLayoutEffect(() => {
    const element = host.current;
    if (element) {
      element.dataset['view'] = view;
      element.dataset['station'] = EXCHANGE_VIEWS[view].station;
      element.dataset['renderer'] = rendererName(gl.getContext());
    }
    if (previous.current !== view) {
      // A new station starts level: a glance belongs to the station it was taken from.
      gaze.current = LEVEL_GAZE;
      const to = poseOf(view);
      if (reducedMotion) {
        move.current = null;
        shown.current = to;
      } else {
        const from = previous.current;
        const interrupted = move.current ? shown.current : null;
        const follow = followingCord && from === 'jacks' && view === 'kneehole';
        move.current = {
          start: performance.now(),
          ms: follow ? EXCHANGE_FOLLOW_MS : EXCHANGE_VIEW_MS,
          at: t => interrupted ? poseBetween(interrupted, to, t) : travelPose(from, view, t),
        };
      }
      previous.current = view;
    }
    if (!move.current) placeCamera(camera as PerspectiveCamera, shown.current, aspect, gaze.current);
    invalidate();
  }, [aspect, camera, followingCord, gaze, gl, host, invalidate, reducedMotion, view]);

  // Every drawn frame places the camera, so a drag that only asks for a frame turns the view.
  useFrame(() => {
    const active = move.current;
    if (active) {
      const progress = Math.min(1, (performance.now() - active.start) / active.ms);
      shown.current = active.at(progress);
      if (progress >= 1) move.current = null;
      else invalidate();
    }
    placeCamera(camera as PerspectiveCamera, shown.current, aspect, gaze.current);
  });
  return null;
}

const OUTLINE_VERTEX = `
  uniform vec2 resolution;
  uniform float pixels;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 facing = normalize(normalMatrix * normal);
    vec2 away = length(facing.xy) > 0.0001 ? normalize(facing.xy) : vec2(0.0);
    clip.xy += away * pixels * 2.0 / resolution * clip.w;
    gl_Position = clip;
  }`;
const OUTLINE_FRAGMENT = `
  uniform vec3 colour;
  void main() { gl_FragColor = vec4(colour, 1.0); }`;

/** A thin hull behind the object, a constant width on screen, and nothing else about the object changes. */
function Outline({ model, nodes }: { model: Group | null; nodes: readonly string[] }) {
  const { gl, invalidate, size } = useThree();
  const group = useRef<Group>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide,
    toneMapped: false,
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: { resolution: { value: new Vector2(1, 1) }, pixels: { value: OUTLINE_PIXELS }, colour: { value: new Color(OUTLINE_COLOUR) } },
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const resolution = material.uniforms['resolution'];
    if (resolution) gl.getDrawingBufferSize(resolution.value as Vector2);
    invalidate();
  }, [gl, invalidate, material, size]);

  useEffect(() => {
    const holder = group.current;
    if (!holder || !model) return;
    holder.clear();
    for (const name of nodes) {
      const node = model.getObjectByName(name);
      if (!(node instanceof Mesh)) continue;
      const hull = new Mesh(node.geometry as BufferGeometry, material);
      hull.matrixAutoUpdate = false;
      hull.userData['source'] = node;
      holder.add(hull);
    }
    invalidate();
  }, [invalidate, material, model, nodes]);

  useFrame(() => {
    for (const hull of group.current?.children ?? []) {
      hull.matrix.copy((hull.userData['source'] as Object3D).matrixWorld);
      hull.matrixWorldNeedsUpdate = true;
    }
  });
  return <group ref={group} userData={{ bake: 'dynamic' }} />;
}

function Pointer({ scene: props, model, host, gaze }: { scene: ExchangeSceneProps; model: Group | null; host: RefObject<HTMLDivElement | null>; gaze: RefObject<Gaze> }) {
  const { camera, gl, invalidate } = useThree();
  const [lit, setLit] = useState<ExchangeHotspot | null>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const surface = gl.domElement;
    const aim = { ray: new Raycaster(), at: new Vector2() };
    /** The press in progress: which pointer, where it went down, and what lay under it. */
    let held: { pointer: number; x: number; y: number; hotspot: ExchangeHotspot | null; from: Gaze; looking: boolean } | null = null;

    const under = ({ clientX, clientY }: PointerEvent): ExchangeHotspot | null => {
      const frame = surface.getBoundingClientRect();
      aim.at.set((clientX - frame.left) / frame.width * 2 - 1, 1 - (clientY - frame.top) / frame.height * 2);
      aim.ray.setFromCamera(aim.at, camera);
      const { view, state } = latest.current;
      const from = aim.ray.ray.origin.toArray() as unknown as StagePoint;
      const along = aim.ray.ray.direction.toArray() as unknown as StagePoint;
      return pickHotspot(from, along, hitVolumes(view, state));
    };
    const light = (hotspot: ExchangeHotspot | null) => {
      surface.style.cursor = hotspot === null ? 'default' : 'pointer';
      if (host.current) host.current.dataset['hotspot'] = hotspot ?? '';
      setLit(hotspot);
    };
    const drop = () => { held = null; light(null); };

    const handlers: Partial<Record<'pointermove' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointerleave', (event: PointerEvent) => void>> = {
      // Only a mouse hovers, and never while a press is under way.
      // A drag past the tap slop looks around; a mouse with no button down only hovers.
      pointermove: event => {
        if (held === null) {
          if (event.pointerType === 'mouse') light(under(event));
          return;
        }
        if (held.pointer !== event.pointerId) return;
        const dx = event.clientX - held.x;
        const dy = event.clientY - held.y;
        if (!held.looking && Math.hypot(dx, dy) <= TAP_SLOP_PIXELS) return;
        if (!held.looking) { held.looking = true; light(null); }
        gaze.current = dragGaze(held.from, dx, dy);
        if (host.current) host.current.dataset['gaze'] = `${gaze.current.yaw.toFixed(3)},${gaze.current.pitch.toFixed(3)}`;
        invalidate();
      },
      pointerdown: event => {
        if (event.button !== 0) return;
        held = { pointer: event.pointerId, x: event.clientX, y: event.clientY, hotspot: under(event), from: gaze.current, looking: false };
        surface.setPointerCapture?.(event.pointerId);
        light(held.hotspot);
      },
      // A press is a tap only if it lifts where it went down; a slide answers nothing.
      pointerup: event => {
        if (held === null || held.pointer !== event.pointerId) return;
        const tapped = !held.looking && Math.hypot(event.clientX - held.x, event.clientY - held.y) <= TAP_SLOP_PIXELS ? held.hotspot : null;
        held = null;
        if (event.pointerType !== 'mouse') light(null);
        if (tapped !== null) latest.current.onHotspot(tapped);
      },
      pointercancel: drop,
      pointerleave: drop,
    };
    const wiring = new AbortController();
    for (const [type, handler] of Object.entries(handlers)) surface.addEventListener(type, handler as EventListener, { signal: wiring.signal });
    return () => wiring.abort();
  }, [camera, gaze, gl, host, invalidate]);

  const { view, state, focusedHotspot } = props;
  const outlined = lit ?? focusedHotspot ?? null;
  const nodes = useMemo(() => outlined ? outlineNodes(outlined, view, state) : [], [outlined, state, view]);
  useEffect(() => { invalidate(); }, [invalidate, nodes]);
  return <Outline model={model} nodes={nodes} />;
}

function Diagnostics() {
  const { camera, gl, invalidate, scene, setFrameloop } = useThree(root => root);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const dev = window as Window & { __tqwScene?: typeof scene; __tqwGl?: typeof gl; __tqwFreeze?: () => void };
    dev.__tqwScene = scene;
    dev.__tqwGl = gl;
    dev.__tqwFreeze = () => setFrameloop('never');
    const debug: ExchangeDebug = {
      inspectCamera: () => ({ position: camera.position.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray() }),
      clearAndCountMagenta() {
        const background = scene.background;
        const clear = gl.getClearColor(new Color()).clone();
        const alpha = gl.getClearAlpha();
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
        scene.background = background;
        gl.setClearColor(clear, alpha);
        invalidate();
        return magenta;
      },
      stats() {
        let lights = 0;
        scene.traverse(object => { if (object instanceof Light) lights += 1; });
        return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, lights };
      },
      screenPoint(point) {
        const box = gl.domElement.getBoundingClientRect();
        const { x, y } = new Vector3(...point).project(camera);
        return [box.left + (x + 1) / 2 * box.width, box.top + (1 - y) / 2 * box.height];
      },
      nodeSpot(name) {
        const node = scene.getObjectByName(name);
        if (!node) return null;
        const bounds = new Box3().setFromObject(node);
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(index => debug.screenPoint([
          index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z,
        ]));
        const across = corners.map(corner => corner[0]);
        const down = corners.map(corner => corner[1]);
        const [left, right, top, bottom] = [Math.min(...across), Math.max(...across), Math.min(...down), Math.max(...down)];
        return { x: (left + right) / 2, y: (top + bottom) / 2, reachX: (right - left) / 2, reachY: (bottom - top) / 2 };
      },
      sightline(x, y) {
        const box = gl.domElement.getBoundingClientRect();
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2), camera);
        const shown = (object: Object3D | null): boolean => !object || (object.visible && shown(object.parent));
        return ray.intersectObject(scene, true).find(hit => shown(hit.object))?.object.name ?? null;
      },
    };
    window.__tqwExchange = debug;
    return () => {
      if (dev.__tqwScene === scene) delete dev.__tqwScene;
      if (dev.__tqwGl === gl) delete dev.__tqwGl;
      delete dev.__tqwFreeze;
      if (window.__tqwExchange === debug) delete window.__tqwExchange;
    };
  }, [camera, gl, invalidate, scene, setFrameloop]);
  return null;
}

/** The direct render's output; the look stack takes over tone mapping while it runs and hands it back. */
const OUTPUT = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1, outputColorSpace: SRGBColorSpace } as const;

function finishRenderer(gl: WebGLRenderer, onLost: () => void): void {
  Object.assign(gl, OUTPUT);
  // Calling preventDefault keeps the context restorable; the room drops to text mode either way.
  gl.domElement.addEventListener('webglcontextlost', lost => { lost.preventDefault(); onLost(); });
}

/** Development only: `?holes=magenta` paints the void so a sweep can count what shows through. */
const sweepingHoles = () => import.meta.env.DEV && new URLSearchParams(location.search).get('holes') === 'magenta';

export default function ExchangeScene(props: ExchangeSceneProps) {
  const [model, setModel] = useState<Group | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const gaze = useRef<Gaze>(LEVEL_GAZE);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  // BakedSpace rebinds the lightmaps whenever this callback changes, so it must stay one function.
  const baked = useCallback(() => {
    setFrameReady(true);
    latest.current.onReady();
  }, []);
  const created = useCallback(({ gl, scene }: RootState) => {
    finishRenderer(gl, () => latest.current.onContextLost());
    scene.background = new Color(sweepingHoles() ? '#FF00FF' : BACKGROUND);
  }, []);

  return <div ref={host} className="tqw-canvas tqw-exchange-canvas" data-ready={model !== null} data-frame-ready={frameReady}
    style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none' }}>
    <Canvas aria-label={`View: ${props.view}`} tabIndex={-1} frameloop="demand" dpr={[1, Math.min(window.devicePixelRatio || 1, 1.75)]} gl={GL} camera={CAMERA} onCreated={created}>
      <RoomLighting />
      <StageSet scene={props} model={model} onLoaded={setModel} />
      {model ? <BakedSpace space="exchange" onReady={baked} /> : null}
      <CameraRig view={props.view} followingCord={props.followingCord} reducedMotion={props.reducedMotion} host={host} gaze={gaze} />
      <Pointer scene={props} model={model} host={host} gaze={gaze} />
      <Diagnostics />
      <LookStack profile={EXCHANGE_ROOM_LOOK} reducedMotion={props.reducedMotion} lamps={EXCHANGE_AMBIENCE} />
    </Canvas>
  </div>;
}
