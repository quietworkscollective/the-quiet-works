import { horizontalFov, stageLook, stagePose } from './stage.ts';
import { contains, segmentInside, type Bounds, type Vec2 } from '../../../firstPerson/bounds.ts';
import { createFirstPerson, type Hold, type Pose } from '../../../firstPerson/controller.ts';
import type { InputControls } from '../../../firstPerson/bindings.ts';

export const EYE_HEIGHT = 1.62;
export const ARRIVAL: Pose = { x: 0, z: 0.8, yawDeg: 188.02, pitchDeg: -4.58 };
export const DESK: Pose = { x: -1, z: 2.9, yawDeg: 180, pitchDeg: -25 };
export const VIEWPOINTS = {
  arrival: ARRIVAL,
  desk: DESK,
  application: { x: 1, z: 2, yawDeg: 180, pitchDeg: -5 },
  'application-wide': { x: 1, z: .7, yawDeg: 180, pitchDeg: -5 },
  reveal: { x: -2.25, z: 5.5, yawDeg: 180, pitchDeg: -8 },
  'reveal-wide': { x: -2.6, z: 4.2, yawDeg: 168, pitchDeg: -6 },
  certificate: { x: -2.6, z: 3.9, yawDeg: 170, pitchDeg: 0 },
  window: { x: -2.25, z: 6.7, yawDeg: 180, pitchDeg: 0 },
  records: { x: -2.6, z: 4.4, yawDeg: 211, pitchDeg: -14 },
  drawer: { x: -1.85, z: 1.35, yawDeg: 180, pitchDeg: -25 },
  ink: { x: -1.8, z: 2.2, yawDeg: 180, pitchDeg: -25 },
  lamp: { x: -1.9, z: 2.9, yawDeg: 180, pitchDeg: -12 },
  underside: { x: -0.45, z: 2.05, yawDeg: 180, pitchDeg: -25 },
  clock: { x: 0, z: 5.95, yawDeg: 180, pitchDeg: 25 },
  machine: { x: .2, z: .25, yawDeg: 184, pitchDeg: -10 },
  'machine-detail': { x: 1, z: 3.3, yawDeg: 180, pitchDeg: -10 },
  bell: { x: 1, z: 3.3, yawDeg: 192, pitchDeg: -2 },
  service: { x: 2.8, z: 5.3, yawDeg: 164, pitchDeg: -10 },
  maintenance: { x: 2.7, z: 4.1, yawDeg: 140, pitchDeg: -20 },
  stack: { x: -2, z: 5.4, yawDeg: 215, pitchDeg: -17 },
  hook: { x: -2.5, z: 2, yawDeg: 218, pitchDeg: -3 },
  exit: { x: 2.8, z: 4.7, yawDeg: 147, pitchDeg: 0 },
} satisfies Record<string, Pose>;
export type Viewpoint = keyof typeof VIEWPOINTS;
export type Station = Viewpoint;
export const OFFICE_STATIONS = ['desk', 'machine', 'certificate', 'service'] as const satisfies readonly Viewpoint[];

// Standing clearance around the installed furniture, including the transformed machine.
const FURNITURE: Bounds = [
  { minX: -1.75, maxX: -.75, minZ: 1.2, maxZ: 2.2 },
  { minX: -3.95, maxX: -3.1, minZ: 1.3, maxZ: 3.5 },
  { minX: 3.1, maxX: 3.95, minZ: 1.3, maxZ: 3.5 },
  { minX: -2.35, maxX: 0.35, minZ: 3.2, maxZ: 4.8 },
  { minX: 0.15, maxX: 1.85, minZ: 4.25, maxZ: 5.55 },
  { minX: -3.95, maxX: -2.85, minZ: 5.4, maxZ: 6.4 },
  { minX: -3.7, maxX: -2.5, minZ: 6.35, maxZ: 7.65 },
];
const xs = [-3.95, ...FURNITURE.flatMap(r => [r.minX, r.maxX]), 3.95];
const zs = [0.25, ...FURNITURE.flatMap(r => [r.minZ, r.maxZ]), 7.65];
const edges = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
const xEdges = edges(xs), zEdges = edges(zs);
export const ROOM_BOUNDS: Bounds = xEdges.slice(1).flatMap((maxX, x) =>
  zEdges.slice(1).flatMap((maxZ, z) => {
    const minX = xEdges[x] ?? maxX, minZ = zEdges[z] ?? maxZ;
    return contains(FURNITURE, { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 })
      ? [] : [{ minX, maxX, minZ, maxZ }];
  }),
);
export const isWalkable = (x: number, z: number): boolean => contains(ROOM_BOUNDS, { x, z });

// Rectangle centres form a small visibility graph; shared segmentInside validates every leg.
const GATES: readonly Vec2[] = ROOM_BOUNDS.map(r => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }));
let gateLinks: readonly (readonly boolean[])[] | null = null;
function links() {
  return gateLinks ??= GATES.map(from => GATES.map(to => segmentInside(ROOM_BOUNDS, from, to, .01)));
}
export function routeBetween(start: Vec2, destination: Vec2): Vec2[] {
  if (!contains(ROOM_BOUNDS, start) || !contains(ROOM_BOUNDS, destination)) return [];
  if (segmentInside(ROOM_BOUNDS, start, destination, 0.01)) return [destination];
  const nodes = [start, destination, ...GATES];
  const distance = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  distance[0] = 0;
  while (visited.size < nodes.length) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited.has(i) && (at < 0 || (distance[i] ?? Infinity) < (distance[at] ?? Infinity))) at = i;
    }
    if (at < 0 || !Number.isFinite(distance[at])) return [];
    if (at === 1) break;
    visited.add(at);
    const from = nodes[at];
    if (!from) return [];
    for (let next = 1; next < nodes.length; next++) {
      const to = nodes[next];
      if (!to || visited.has(next)) continue;
      if (!(at < 2 || next < 2 ? segmentInside(ROOM_BOUNDS, from, to, .01) : links()[at-2]?.[next-2])) continue;
      const length = (distance[at] ?? Infinity) + Math.hypot(to.x - from.x, to.z - from.z);
      if (length < (distance[next] ?? Infinity)) { distance[next] = length; previous[next] = at; }
    }
  }
  const route: Vec2[] = [];
  for (let at = 1; at > 0; at = previous[at] ?? -1) {
    const point = nodes[at];
    if (!point) return [];
    route.unshift(point);
  }
  return route;
}

export interface Navigation {
  readonly pose: Readonly<Pose>;
  readonly requestedAt: number | null;
  readonly station: Station;
  readonly moving: boolean;
  readonly controls: InputControls;
  subscribe(listener: () => void): () => void;
  approach(point: Viewpoint, cut: boolean): void;
  stepBack(): void;
  stepViewpoint(dir: -1 | 1): void;
  input(forward: number, turn: number): void;
  stop(): void;
  releaseInput(): void;
  advance(seconds: number): boolean;
  setReducedMotion(reduced: boolean): void;
  setLens(verticalFov: number, aspect: number): void;
  setBeforeCut(callback: (() => void) | null): void;
  setWasDrag(callback: (() => boolean) | null): void;
  wasDrag(): boolean;
}

export function createNavigation(): Navigation {
  let beforeCut: (() => void) | null = null;
  let wasDrag: (() => boolean) | null = null;
  let fov = horizontalFov(48, 1.6);
  const controller = createFirstPerson({ start: stagePose(VIEWPOINTS.machine, fov), bounds: ROOM_BOUNDS, beforeCut: () => beforeCut?.() });
  const turning = new Map<string, Hold>();
  const turnInput = () => Math.sign([...turning.values()].reduce<number>((sum, dir) => sum + dir, 0));
  let station: Station = 'machine';
  let requestedAt: number | null = null;
  let authored = false;
  let generation = 0;
  let named: Viewpoint = 'machine';
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const wake = () => {
    if ((controller.active || turnInput()) && requestedAt === null) requestedAt = performance.now();
    notify();
  };
  const release = () => { authored = false; generation++; };
  const releaseTurn = () => turning.clear();
  const halt = () => {
    release(); releaseTurn();
    controller.lock(true);
    controller.setPose({});
    controller.lock(false);
    requestedAt = null;
  };
  const controls: InputControls = {
    hold() {},
    turn(source, dir) {
      controller.turn(source, 0);
      turning.set(source, controller.reducedMotion ? 0 : dir); wake();
    },
    nudge() {},
    look(yaw, pitch) {
      controller.look(stageLook(controller.pose.yawDeg, yaw, fov), pitch); wake();
    },
  };
  const navigation: Navigation = {
    get pose() { return controller.pose; },
    get requestedAt() { return requestedAt; },
    get station() { return station; },
    get moving() { return controller.active || Boolean(turnInput()); },
    controls,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    approach(point, cut) {
      halt(); named = point;
      const destination = stagePose(VIEWPOINTS[point], fov);
      const token = generation;
      const done = () => {
        if (token !== generation) return;
        authored = false;
        station = point;
        requestedAt = null;
        notify();
      };
      if (cut || controller.reducedMotion) { controller.cutTo(destination); done(); return; }
      const route = routeBetween(controller.pose, destination);
      if (!route.length) { notify(); return; }
      authored = true;
      const leg = () => {
        if (token !== generation) return;
        const next = route.shift();
        if (!next) { done(); return; }
        controller.glideTo(route.length ? next : destination, { onDone: leg });
      };
      leg(); wake();
    },
    stepBack() {
      navigation.stepViewpoint(-1);
    },
    stepViewpoint(dir) {
      const at = OFFICE_STATIONS.findIndex(point => point === named);
      const next = at < 0 ? (dir > 0 ? 0 : OFFICE_STATIONS.length - 1) : (at + dir + OFFICE_STATIONS.length) % OFFICE_STATIONS.length;
      navigation.approach(OFFICE_STATIONS[next] ?? 'desk', true);
    },
    input(forward, turn) {
      const hold = (value: number): Hold => Math.sign(value) as Hold;
      if (forward) navigation.stepViewpoint(Math.sign(forward) as -1 | 1);
      controls.turn('button', hold(turn));
    },
    stop() {
      const destination = authored ? named : null;
      halt();
      if (destination) { controller.cutTo(stagePose(VIEWPOINTS[destination], fov)); station = destination; }
      notify();
    },
    releaseInput() {
      releaseTurn();
      // A press or reader owns input, but an authored approach must still reach its station.
      controller.lock(true);
      if (!controller.gliding) controller.setPose({});
      controller.lock(false);
      if (!controller.active) requestedAt = null;
      wake();
    },
    advance(seconds) {
      if (turnInput()) controller.look(stageLook(controller.pose.yawDeg, turnInput() * 75 * Math.min(.05, Math.max(0, seconds)), fov), 0);
      const ms = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
      if (authored) {
        // Station travel follows its command clock through cold shader preparation.
        // Free movement below keeps the shared 50 ms hitch cap.
        let remaining = Math.min(8000, ms);
        while (remaining > 0 && authored) {
          const slice = Math.min(50, remaining);
          controller.step(slice); remaining -= slice;
        }
      } else controller.step(ms);
      if (!controller.active) requestedAt = null;
      return controller.active || Boolean(turnInput());
    },
    setLens(vertical, aspect) {
      fov = horizontalFov(vertical, aspect);
      const pose = stagePose({...controller.pose}, fov);
      if (Math.abs(pose.yawDeg - controller.pose.yawDeg) > 1e-9) controller.setPose(pose);
    },
    setReducedMotion(reduced) {
      if (reduced === controller.reducedMotion) return;
      const destination = authored ? named : null;
      release(); releaseTurn();
      controller.setReducedMotion(reduced);
      if (destination) {
        controller.cutTo(stagePose(VIEWPOINTS[destination], fov));
        station = destination;
      }
      if (!controller.active) requestedAt = null;
      wake();
    },
    setBeforeCut(callback) { beforeCut = callback; },
    setWasDrag(callback) { wasDrag = callback; },
    wasDrag() { return wasDrag?.() ?? false; },
  };
  return navigation;
}
