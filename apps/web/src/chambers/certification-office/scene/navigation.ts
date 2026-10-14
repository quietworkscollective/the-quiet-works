import { contains, segmentInside, type Bounds, type Vec2 } from '../../../firstPerson/bounds.ts';
import { createFirstPerson, type Hold, type Pose } from '../../../firstPerson/controller.ts';
import type { InputControls } from '../../../firstPerson/bindings.ts';

export const EYE_HEIGHT = 1.62;
export type Station = 'room' | 'desk';
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
  records: { x: -2.5, z: 5.9, yawDeg: 270, pitchDeg: -14 },
  drawer: { x: -1.5, z: 1.35, yawDeg: 180, pitchDeg: -25 },
  ink: { x: -1.8, z: 2.2, yawDeg: 180, pitchDeg: -25 },
  lamp: { x: -1.9, z: 2.9, yawDeg: 180, pitchDeg: -12 },
  underside: { x: -0.45, z: 2.05, yawDeg: 180, pitchDeg: -25 },
  clock: { x: 0, z: 5.95, yawDeg: 180, pitchDeg: 25 },
  machine: { x: 1, z: 3.3, yawDeg: 180, pitchDeg: -25 },
  bell: { x: 1, z: 3.3, yawDeg: 192, pitchDeg: -2 },
  service: { x: 2.8, z: 5.3, yawDeg: 164, pitchDeg: -10 },
  maintenance: { x: 2.8, z: 5.4, yawDeg: 90, pitchDeg: -20 },
  stack: { x: -2, z: 6.9, yawDeg: 270, pitchDeg: -17 },
  hook: { x: -2.5, z: 2, yawDeg: 270, pitchDeg: -3 },
  exit: { x: 2.8, z: 1.8, yawDeg: 90, pitchDeg: 0 },
} satisfies Record<string, Pose>;
export type Viewpoint = keyof typeof VIEWPOINTS;

// Standing clearance around the installed furniture, including the transformed machine.
const FURNITURE: Bounds = [
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
      if (!to || visited.has(next) || !segmentInside(ROOM_BOUNDS, from, to, 0.01)) continue;
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
  setBeforeCut(callback: (() => void) | null): void;
  setWasDrag(callback: (() => boolean) | null): void;
  wasDrag(): boolean;
}

export function createNavigation(): Navigation {
  let beforeCut: (() => void) | null = null;
  let wasDrag: (() => boolean) | null = null;
  const controller = createFirstPerson({ start: ARRIVAL, bounds: ROOM_BOUNDS, beforeCut: () => beforeCut?.() });
  let station: Station = 'room';
  let requestedAt: number | null = null;
  let authored = false;
  let generation = 0;
  let named: Viewpoint = 'arrival';
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const wake = () => {
    if (controller.active && requestedAt === null) requestedAt = performance.now();
    notify();
  };
  const release = () => { station = 'room'; authored = false; generation++; };
  const halt = () => {
    release();
    controller.lock(true);
    controller.setPose({});
    controller.lock(false);
    requestedAt = null;
  };
  const controls: InputControls = {
    hold(source, dir) {
      if (dir && !controller.reducedMotion) release();
      controller.hold(source, dir); wake();
    },
    turn(source, dir) {
      if (dir && !controller.reducedMotion) release();
      controller.turn(source, dir); wake();
    },
    nudge(metres) {
      if (metres && !controller.reducedMotion) release();
      controller.nudge(metres); wake();
    },
    look(yaw, pitch) {
      if (yaw || pitch) release();
      controller.look(yaw, pitch); wake();
    },
  };
  const navigation: Navigation = {
    get pose() { return controller.pose; },
    get requestedAt() { return requestedAt; },
    get station() { return station; },
    get moving() { return controller.active; },
    controls,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    approach(point, cut) {
      halt(); named = point;
      const destination = VIEWPOINTS[point];
      const token = generation;
      const done = () => {
        if (token !== generation) return;
        authored = false;
        station = point === 'desk' ? 'desk' : 'room';
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
      halt();
      if (controller.reducedMotion) controller.cutTo(ARRIVAL);
      else {
        controller.look(0, ARRIVAL.pitchDeg - controller.pose.pitchDeg);
        controller.nudge(-0.45);
      }
      wake();
    },
    stepViewpoint(dir) {
      const names = Object.keys(VIEWPOINTS) as Viewpoint[];
      navigation.approach(names[(names.indexOf(named) + dir + names.length) % names.length] ?? 'arrival', true);
    },
    input(forward, turn) {
      const hold = (value: number): Hold => Math.sign(value) as Hold;
      controls.hold('button', hold(forward));
      controls.turn('button', hold(turn));
    },
    stop() { const current = station; halt(); station = current; notify(); },
    releaseInput() {
      // A press or reader owns input, but an authored approach must still reach its station.
      controller.lock(true);
      if (!controller.gliding) controller.setPose({});
      controller.lock(false);
      if (!controller.active) requestedAt = null;
      wake();
    },
    advance(seconds) {
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
      return controller.active;
    },
    setReducedMotion(reduced) {
      if (reduced === controller.reducedMotion) return;
      const current = station;
      release(); station = current;
      controller.setReducedMotion(reduced);
      if (!controller.active) requestedAt = null;
      wake();
    },
    setBeforeCut(callback) { beforeCut = callback; },
    setWasDrag(callback) { wasDrag = callback; },
    wasDrag() { return wasDrag?.() ?? false; },
  };
  return navigation;
}
