import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { applyPose, lensFor } from '../../../firstPerson/three.ts';
import { createFirstPerson, type FirstPerson } from '../../../firstPerson/controller.ts';
import { segmentInside } from '../../../firstPerson/bounds.ts';
import type { InputOptions } from '../../../firstPerson/bindings.ts';
import type { DissolveOptions } from '../../../firstPerson/dissolve.ts';
import { ARRIVAL, createNavigation, DESK, EYE_HEIGHT, isWalkable, ROOM_BOUNDS, routeBetween, VIEWPOINTS, type Navigation, type Viewpoint } from './navigation.ts';
import { officeAssetSlot } from './assetSlots.ts';
import { OfficeCamera } from './OfficeCamera.tsx';

const harness = vi.hoisted(() => ({
  effects: [] as (() => undefined | (() => void))[],
  frame: null as null | (() => void),
  three: null as unknown,
  context: null as unknown,
  input: null as InputOptions | null,
  dissolve: null as DissolveOptions | null,
  dragged: false,
  capture: vi.fn(), dispose: vi.fn(), release: vi.fn(), inputDispose: vi.fn(),
}));
vi.mock('../../../firstPerson/controller.ts', async original => {
  const actual = await original<typeof import('../../../firstPerson/controller.ts')>();
  return { ...actual, createFirstPerson: vi.fn(actual.createFirstPerson) };
});
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useEffect: (effect: () => undefined | (() => void)) => harness.effects.push(effect),
    useMemo: (make: () => unknown) => make(), useRef: (current: unknown) => ({ current }) };
});
vi.mock('@react-three/fiber', () => ({ useThree: () => harness.three, useFrame: (frame: () => void) => { harness.frame = frame; } }));
vi.mock('./context.ts', () => ({ useScene: () => harness.context }));
vi.mock('../../../firstPerson/bindings.ts', () => ({ bindInput: (options: InputOptions) => {
  harness.input = options;
  return { wasDrag: () => harness.dragged, releaseAll: harness.release, dispose: harness.inputDispose };
} }));
vi.mock('../../../firstPerson/dissolve.ts', () => ({ createDissolve: (options: DissolveOptions) => {
  harness.dissolve = options;
  return { capture: () => { options.render(); harness.capture(); }, dispose: harness.dispose };
} }));

const names = Object.keys(VIEWPOINTS) as Viewpoint[];
const settle = (nav: Navigation, limit = 60) => {
  let elapsed = 0;
  while (nav.moving && elapsed < limit) { nav.advance(0.05); elapsed += 0.05; }
  expect(nav.moving, 'travel must finish').toBe(false);
  return elapsed;
};
const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const controllerFor = (_nav: Navigation): FirstPerson => vi.mocked(createFirstPerson).mock.results.at(-1)!.value;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Office navigation', () => {
  it('uses the default shared controller and its live pose with accepted numbers', () => {
    const nav = createNavigation();
    const call = vi.mocked(createFirstPerson).mock.calls.at(-1)![0];
    expect(call.tuning, 'rooms cannot retune the controller').toBeUndefined();
    expect(nav.pose).toBe(controllerFor(nav).pose);
    expect(nav.pose).toEqual({ x: 0, z: 0.8, yawDeg: 188.02, pitchDeg: -4.58 });
    expect(EYE_HEIGHT).toBe(1.62);
    nav.input(1, 1);
    for (let i = 0; i < 6; i++) nav.advance(0.05);
    const before = { ...nav.pose };
    nav.advance(0.05);
    expect(gap(nav.pose, before)).toBeCloseTo(0.055, 4);
    expect(nav.pose.yawDeg - before.yawDeg).toBeCloseTo(3.75, 6);
    nav.input(0, 0);
    for (let i = 0; i < 4; i++) nav.advance(0.05);
    expect(nav.moving).toBe(false);
  });

  it('excludes the actual furniture footprints and archive while retaining clear aisles', () => {
    for (const [x, z] of [[-1, 4], [-2.1, 3.45], [0.1, 4.55], [1, 4.9], [0.4, 5.2], [1.6, 4.6], [-3.5, 5.9], [-3.1, 7], [-3.4, 7.3], [0, 8], [4.2, 2], [0, 0]]) {
      expect(isWalkable(x!, z!), `${x},${z}`).toBe(false);
    }
    for (const [x, z] of [[-3.95, 0.25], [-2.6, 4], [2.2, 5], [0, 6.5], [-2.25, 6.7]]) expect(isWalkable(x!, z!)).toBe(true);
    for (const pose of Object.values(VIEWPOINTS)) expect(isWalkable(pose.x, pose.z)).toBe(true);
  });

  // Plans every viewpoint pair: about 2 s on a quiet machine, more on a loaded one or a CI runner.
  it('routes every named viewpoint pair through walkable segments', { timeout: 30_000 }, () => {
    for (const from of names) for (const to of names) {
      let previous = VIEWPOINTS[from];
      const route = routeBetween(previous, VIEWPOINTS[to]);
      expect(route.length, `${from} to ${to}`).toBeGreaterThan(0);
      for (const leg of route) {
        expect(segmentInside(ROOM_BOUNDS, previous, leg, 0.01), `${from} to ${to}: ${JSON.stringify(leg)}`).toBe(true);
        previous = { ...previous, ...leg };
      }
      expect(previous.x).toBe(VIEWPOINTS[to].x);
      expect(previous.z).toBe(VIEWPOINTS[to].z);
    }
    expect(routeBetween(ARRIVAL, { x: -1, z: 4 })).toEqual([]);
  });

  it('travels every named destination without crossing furniture and queues default glides', () => {
    const nav = createNavigation();
    const glide = vi.spyOn(controllerFor(nav), 'glideTo');
    for (const name of ['window', 'desk', ...names] as Viewpoint[]) {
      nav.approach(name, false);
      let previous = { ...nav.pose };
      for (let i = 0; nav.moving && i < 1200; i++) {
        nav.advance(0.05);
        expect(segmentInside(ROOM_BOUNDS, previous, nav.pose, 0.01)).toBe(true);
        previous = { ...nav.pose };
      }
      expect(nav.moving).toBe(false);
      expect(nav.pose.x).toBe(VIEWPOINTS[name].x);
      expect(nav.pose.z).toBe(VIEWPOINTS[name].z);
    }
    expect(glide.mock.calls.length).toBeGreaterThan(names.length);
    for (const [, options] of glide.mock.calls) expect(options?.speedMps).toBeUndefined();
  });

  it('claims the desk only on completed arrival', () => {
    const nav = createNavigation();
    nav.approach('desk', false);
    expect(nav.station).toBe('room');
    expect(nav.moving).toBe(true);
    settle(nav, 10);
    expect(nav.station).toBe('desk');
    expect(nav.pose.x).toBe(-1); expect(nav.pose.z).toBe(2.9);
    expect(nav.pose.yawDeg).toBeCloseTo(180, 10); expect(nav.pose.pitchDeg).toBe(-25);
    nav.stop(); expect(nav.station).toBe('desk');
  });

  it.each(['hold', 'turn', 'nudge', 'look'] as const)('releases the desk via %s controls', kind => {
    const nav = createNavigation();
    nav.approach('desk', true);
    const controller = controllerFor(nav);
    const forward = vi.spyOn(controller, kind);
    if (kind === 'hold' || kind === 'turn') nav.controls[kind]('key', 1);
    else if (kind === 'nudge') nav.controls.nudge(0.35);
    else nav.controls.look(3, 2);
    expect(nav.station).toBe('room');
    expect(forward).toHaveBeenCalledOnce();
    nav.advance(0.05);
    if (kind === 'hold' || kind === 'nudge') expect(nav.pose.z).toBeGreaterThan(DESK.z);
    if (kind === 'turn' || kind === 'look') expect(nav.pose.yawDeg).toBeGreaterThan(DESK.yawDeg);
  });

  it('Step back cancels queued arrival with no stale onDone', () => {
    const nav = createNavigation();
    const glide = vi.spyOn(controllerFor(nav), 'glideTo');
    nav.approach('window', true);
    nav.approach('desk', false);
    nav.advance(0.5);
    const stale = glide.mock.calls.at(-1)![1]?.onDone;
    nav.stepBack();
    stale?.();
    const released = { ...nav.pose };
    settle(nav);
    expect(nav.station).toBe('room');
    expect(gap(nav.pose, released)).toBeLessThan(0.6);
    expect(gap(nav.pose, DESK)).toBeGreaterThan(2);
    const final = { ...nav.pose };
    nav.advance(5);
    expect(nav.pose).toEqual(final);
    nav.approach('desk', true); nav.stepBack(); settle(nav);
    expect(nav.pose.z).toBeLessThan(DESK.z); expect(nav.station).toBe('room');
  });

  it('movement cancels queued legs without a stale station callback', () => {
    const nav = createNavigation();
    const glide = vi.spyOn(controllerFor(nav), 'glideTo');
    nav.approach('window', true); nav.approach('desk', false); nav.advance(0.5);
    const stale = glide.mock.calls.at(-1)![1]?.onDone;
    nav.input(-1, 0); stale?.(); nav.advance(0.05); nav.input(0, 0); settle(nav);
    expect(nav.station).toBe('room');
    expect(gap(nav.pose, DESK)).toBeGreaterThan(2);
    const pose = { ...nav.pose }; nav.advance(10); expect(nav.pose).toEqual(pose);
  });

  it('reduced motion cuts all named views before changing the outgoing pose', () => {
    const nav = createNavigation();
    nav.setReducedMotion(true);
    for (const name of names) {
      const before = { ...nav.pose };
      const cut = vi.fn(() => expect(nav.pose).toEqual(before));
      nav.setBeforeCut(cut); nav.approach(name, false);
      expect(cut).toHaveBeenCalledOnce();
      expect(nav.pose).toEqual(VIEWPOINTS[name]);
      expect(nav.moving).toBe(false);
      nav.input(1, 1); nav.controls.nudge(1); nav.advance(1);
      expect(nav.pose).toEqual(VIEWPOINTS[name]);
    }
    nav.setBeforeCut(null); nav.stepBack(); expect(nav.pose).toEqual(ARRIVAL); expect(nav.station).toBe('room');
  });

  it('explicit static cuts and reduced step inputs select named stationary views', () => {
    const nav = createNavigation(), cut = vi.fn();
    nav.setBeforeCut(cut); nav.approach('desk', true);
    expect(cut).toHaveBeenCalledOnce(); expect(nav.station).toBe('desk');
    nav.setReducedMotion(true); nav.stepViewpoint(-1);
    expect(nav.pose).toEqual(ARRIVAL); expect(nav.moving).toBe(false);
    nav.stepViewpoint(1); expect(nav.pose).toEqual(DESK);
  });

  it('frames low props and the bell within the accepted pitch limit', () => {
    for (const pose of Object.values(VIEWPOINTS)) expect(Math.abs(pose.pitchDeg)).toBeLessThanOrEqual(25);
    expect(VIEWPOINTS.records.yawDeg).toBe(211); expect(VIEWPOINTS.exit.yawDeg).toBe(147);
    for (const [pose, y, z] of [[VIEWPOINTS.drawer, 0.68, 3.38], [VIEWPOINTS.underside, 0.75, 4]] as const) {
      expect(Math.atan2(EYE_HEIGHT - y, z - pose.z) * 180 / Math.PI).toBeLessThanOrEqual(25);
    }
    expect(VIEWPOINTS.bell).toEqual({ x: 1, z: 3.3, yawDeg: 192, pitchDeg: -2 });
  });

  it('looking never walks and clamps pitch including reduced motion', () => {
    const nav = createNavigation();
    for (const reduced of [false, true]) {
      nav.setReducedMotion(reduced);
      const before = { ...nav.pose };
      nav.controls.look(90, 1000); nav.advance(0.5);
      expect(gap(nav.pose, before)).toBe(0); expect(nav.pose.pitchDeg).toBe(25);
      nav.controls.look(-30, -1000); expect(nav.pose.pitchDeg).toBe(-25);
      expect(nav.moving).toBe(false);
    }
  });

  it('keeps a free walking hitch capped at one shared 50 ms step', () => {
    const nav = createNavigation(), reference = createNavigation();
    nav.input(1, 0); reference.input(1, 0);
    for (let i = 0; i < 6; i++) { nav.advance(0.05); reference.advance(0.05); }
    const before = { ...nav.pose }; nav.advance(0.5); reference.advance(0.05);
    expect(nav.pose).toEqual(reference.pose); expect(gap(nav.pose, before)).toBeCloseTo(0.055, 6);
  });

  it('keeps assisted clock pace through 100 ms cold frames and bounds a longer hitch', () => {
    const cold = createNavigation(), smooth = createNavigation();
    cold.approach('desk', false); smooth.approach('desk', false);
    for (let i = 0; i < 50; i++) { cold.advance(0.1); smooth.advance(0.05); smooth.advance(0.05); }
    expect(cold.pose).toEqual(smooth.pose); expect(cold.station).toBe('desk');
    const a = createNavigation(), b = createNavigation();
    a.approach('window', false); b.approach('window', false);
    a.advance(20); b.advance(8); expect(a.pose).toEqual(b.pose);
    const cruise = createNavigation(); cruise.approach('exit', false);
    for (let i = 0; i < 8; i++) cruise.advance(0.1);
    const before = { ...cruise.pose }; cruise.advance(0.1);
    expect(gap(cruise.pose, before)).toBeCloseTo(0.08, 6);
  });

  it('clears demand state after stopping, arriving, and reducing an ongoing approach', () => {
    const nav = createNavigation(), listener = vi.fn();
    const published: (number | null)[] = [];
    const off = nav.subscribe(() => { published.push(nav.requestedAt); listener(); });
    expect(nav.moving).toBe(false); expect(nav.requestedAt).toBeNull(); expect(nav.advance(3)).toBe(false);
    nav.approach('desk', false); expect(nav.requestedAt).not.toBeNull();
    const requested = nav.requestedAt; nav.advance(0.5); expect(nav.requestedAt).toBe(requested);
    settle(nav); expect(nav.requestedAt).toBeNull(); expect(published.at(-1)).toBeNull();
    nav.input(1, 1); nav.stop(); expect(nav.moving).toBe(false); expect(nav.requestedAt).toBeNull();
    const pose = { ...nav.pose }; nav.advance(1); expect(nav.pose).toEqual(pose);
    nav.approach('window', false); nav.setReducedMotion(true);
    expect(nav.moving).toBe(false); expect(nav.requestedAt).toBeNull();
    expect(listener).toHaveBeenCalled(); off(); listener.mockClear(); nav.stop(); expect(listener).not.toHaveBeenCalled();
  });

  it('forwards drag classification and removes its callback on cleanup', () => {
    const nav = createNavigation(); expect(nav.wasDrag()).toBe(false);
    nav.setWasDrag(() => true); expect(nav.wasDrag()).toBe(true);
    nav.setWasDrag(null); expect(nav.wasDrag()).toBe(false);
  });
});

function cameraRig(size = { width: 800, height: 400 }) {
  const nav = createNavigation(), camera = new PerspectiveCamera(48, 2, 0.1, 100), scene = new Scene();
  const container = { dataset: { ready: 'true' } as Record<string, string> };
  const canvas = { closest: () => container, getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 400 }) };
  const gl = { domElement: canvas, render: vi.fn() }, invalidate = vi.fn();
  const motion = { reduced: false }, view = { forwardX: 0, forwardZ: 0, blend: 1, version: 0 };
  let pressing = false, dialog = false;
  const query = vi.fn(() => dialog ? {} : null);
  const store = { getState: () => ({ pressing }), subscribe: vi.fn((_listener: () => void) => () => {}) };
  vi.stubGlobal('document', { querySelector: query, body: {}, addEventListener: vi.fn(), removeEventListener: vi.fn(), hidden: false });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  const state = { camera, scene, gl, size, invalidate, get: () => state };
  harness.three = state; harness.context = { store, motion, view };
  const onStampTarget = vi.fn(), onGesture = vi.fn();
  OfficeCamera({ navigation: nav, selectedPosition: 'centre', onStampTarget, onGesture, overlay: { current: {} as HTMLCanvasElement } });
  const cleanups = harness.effects.map(effect => effect());
  return { nav, camera, scene, container, gl, invalidate, motion, view, store, onStampTarget, onGesture,
    setPressing: (value: boolean) => { pressing = value; }, setDialog: (value: boolean) => { dialog = value; },
    cleanup: () => { for (const cleanup of cleanups) cleanup?.(); } };
}

describe('Office camera adapter', () => {
  beforeEach(() => {
    harness.effects = []; harness.frame = null; harness.input = null; harness.dissolve = null;
    harness.dragged = false; vi.clearAllMocks();
  });

  it('binds shared input, disables dialog and press ownership, and forwards reduced steps', () => {
    const rig = cameraRig(), input = harness.input!;
    expect(input.controls).toBeDefined(); expect(input.metresPerPx).toBeCloseTo(0.0035, 10);
    expect(input.lookScale().pitch).toBe(48 / 400);
    expect(input.mode()).toBe('engaged');
    rig.setPressing(true); expect(input.mode()).toBe('page');
    const before = { ...rig.nav.pose }; input.controls.look(10, 5); input.controls.hold('key', 1); input.controls.nudge(1);
    expect(rig.nav.pose).toEqual(before); expect(rig.nav.moving).toBe(false);
    rig.setPressing(false); rig.setDialog(true); expect(input.mode()).toBe('page');
    rig.setDialog(false); input.onGesture(); expect(rig.onGesture).toHaveBeenCalledOnce();
    rig.motion.reduced = true; harness.frame!(); expect(input.reducedMotion()).toBe(true);
    input.onStep?.(1); expect(rig.nav.pose).toEqual(DESK);
    rig.motion.reduced = false; rig.nav.setReducedMotion(false);
    rig.nav.approach('arrival', true); rig.nav.approach('desk', false);
    rig.setPressing(true); rig.store.subscribe.mock.calls[0]![0]();
    expect(rig.nav.moving, 'press input ownership must allow the desk approach to finish').toBe(true);
    settle(rig.nav, 10); expect(rig.nav.station).toBe('desk');
    rig.setPressing(false); rig.nav.controls.nudge(-1); rig.nav.advance(0.05); rig.setDialog(true);
    rig.store.subscribe.mock.calls[0]![0](); expect(rig.nav.moving).toBe(false);
    harness.dragged = true; expect(rig.nav.wasDrag()).toBe(true);
    rig.cleanup(); expect(harness.inputDispose).toHaveBeenCalledOnce(); expect(rig.nav.wasDrag()).toBe(false);
  });

  it('does not copy a preparation frame into the reduced-motion overlay', () => {
    const rig = cameraRig(); rig.container.dataset['ready'] = 'false';
    rig.nav.setReducedMotion(true); rig.nav.approach('desk', true);
    expect(harness.capture).not.toHaveBeenCalled(); expect(rig.gl.render).not.toHaveBeenCalled();
    rig.container.dataset['ready'] = 'true'; rig.nav.approach('window', true);
    expect(harness.capture).toHaveBeenCalledOnce(); rig.cleanup();
  });

  it('captures an actual outgoing render with the shared 120 ms dissolve', () => {
    const rig = cameraRig();
    expect(harness.dissolve!.ms).toBe(120);
    rig.nav.approach('desk', true);
    expect(rig.gl.render).toHaveBeenCalledWith(rig.scene, rig.camera);
    expect(harness.capture).toHaveBeenCalledOnce();
    expect(rig.camera.position.z, 'capture must render before the cut').toBe(0.8);
    rig.cleanup(); rig.nav.approach('arrival', true);
    expect(harness.capture).toHaveBeenCalledOnce(); expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it('applies shared pose and lens, publishes desk-local forward direction, and rests on demand', () => {
    const rig = cameraRig(); harness.frame!();
    expect(rig.camera.position.toArray()).toEqual([0, 1.62, 0.8]);
    expect(rig.camera.fov).toBe(48); expect(rig.camera.rotation.y).toBeCloseTo(-188.02 * Math.PI / 180);
    expect(rig.view.forwardX).toBeCloseTo(-Math.sin(188.02 * Math.PI / 180));
    expect(rig.view.forwardZ).toBeCloseTo(Math.cos(188.02 * Math.PI / 180));
    expect(rig.container.dataset['position']).toBe('0.00,1.62,0.80');
    expect(rig.container.dataset['pitch']).toBe('-4.58');
    rig.invalidate.mockClear(); harness.frame!(); expect(rig.invalidate).not.toHaveBeenCalled();
    rig.nav.input(1, 0); rig.invalidate.mockClear(); harness.frame!(); expect(rig.invalidate).toHaveBeenCalledOnce();
    rig.cleanup();
    harness.effects = [];
    const portrait = cameraRig({ width: 400, height: 800 });
    expect(portrait.camera.fov).toBe(58); portrait.cleanup();
  });

  it('counts an authored approach through a cold shader frame', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const rig = cameraRig(); harness.frame!();
    clock.mockReturnValue(1100); rig.nav.approach('desk', false);
    clock.mockReturnValue(6500); harness.frame!();
    expect(rig.nav.station).toBe('desk');
    expect(rig.nav.pose.x).toBe(DESK.x); expect(rig.nav.pose.z).toBe(DESK.z);
    rig.cleanup();
  });

  it('excludes idle gaps while counting elapsed time from the input request', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const rig = cameraRig(); harness.frame!();
    clock.mockReturnValue(100000); rig.nav.approach('desk', false);
    clock.mockReturnValue(100100); harness.frame!();
    const reference = createNavigation(); reference.approach('desk', false); reference.advance(0.1);
    expect(rig.nav.pose).toEqual(reference.pose);
    clock.mockReturnValue(100200); harness.frame!(); reference.advance(0.1); expect(rig.nav.pose).toEqual(reference.pose);
    rig.cleanup();
  });

  it('projects only the actual press handle and clears missing or out-of-view targets', () => {
    const rig = cameraRig(); rig.nav.approach('desk', true); harness.frame!();
    expect(rig.container.dataset['stampTarget']).toBe(''); expect(rig.onStampTarget).not.toHaveBeenCalled();
    const handle = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial());
    handle.name = 'office-press-handle'; handle.position.set(-1, 1.05, 4); rig.scene.add(handle); harness.frame!();
    rig.container.dataset['ready'] = 'false'; rig.onStampTarget.mockClear(); harness.frame!();
    expect(rig.container.dataset['stampTarget']).toBe(''); expect(rig.onStampTarget).not.toHaveBeenCalled();
    rig.container.dataset['ready'] = 'true'; harness.frame!();
    expect(rig.onStampTarget).toHaveBeenCalledOnce();
    const point = handle.localToWorld(handle.position.clone().set(0, 0.165, 0)).project(rig.camera);
    expect(rig.onStampTarget.mock.calls[0]![0]).toBeCloseTo(10 + (point.x + 1) * 400);
    expect(rig.onStampTarget.mock.calls[0]![1]).toBeCloseTo(20 + (1 - point.y) * 200);
    rig.nav.approach('exit', true); harness.frame!(); expect(rig.container.dataset['stampTarget']).toBe('');
    expect(rig.onStampTarget).toHaveBeenCalledOnce();
    handle.geometry.dispose(); (handle.material as MeshBasicMaterial).dispose(); rig.cleanup();
  });
});

// Physical public labels must fit the standing reveal without the reader or a device crop.
it('keeps public labels inside standing reveal and four-metre certificate frames', () => {
  for (const [name,width,height] of [['reveal',1440,900],['reveal-wide',412,839],['certificate',1440,900],['certificate',412,839]] as const) {
    const pose=VIEWPOINTS[name],camera=new PerspectiveCamera(lensFor(width,height,{landscape:48,portrait:58}),width/height,.05,45);
    applyPose(camera,pose,EYE_HEIGHT);
    for(const [id,width,height] of [['officer-nameplate',1,.28],['blank-certificate',.64,.84]] as const) {
      if(name==='certificate' && id==='officer-nameplate')continue;
      const [x,y,z]=officeAssetSlot(id).position;
      for(const dx of [-1,1])for(const dy of [-1,1]) {
        const point=new Vector3(x+dx*width/2,y+dy*height/2,z).project(camera);
        expect(Math.abs(point.x),`${name}: ${id} horizontal edge`).toBeLessThan(.95);
        expect(point.y,`${name}: ${id} below the shared header`).toBeLessThan(.84);
        expect(point.y).toBeGreaterThan(-.9);
        expect(point.z).toBeGreaterThan(-1);expect(point.z).toBeLessThan(1);
      }
    }
  }
});
