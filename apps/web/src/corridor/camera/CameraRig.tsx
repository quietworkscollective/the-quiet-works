import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ChamberId, SpineStore } from '@tqw/engine';
import { PerspectiveCamera, Vector3 } from 'three';
import { bindInput, isIgnored, type InputBinding } from '../../firstPerson/bindings.ts';
import { DEFAULT_TUNING } from '../../firstPerson/controller.ts';
import { createDissolve } from '../../firstPerson/dissolve.ts';
import { applyPose, floorPoint, lensFor, lookScale, wrapYaw } from '../../firstPerson/three.ts';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import { SITE_SCROLL, SPINE_TIMING } from '../../timing.ts';
import type { CorridorAnimation } from '../animation.ts';
import { CHAMBER_SLOTS, CORRIDOR } from '../layout.ts';
import type { ProgressSource } from '../progress.ts';
import type { CorridorSceneProps } from '../types.ts';
import { createClickRouter } from '../input/engage.ts';
import { AMBIENT_FRAME_MS } from './ambient.ts';
import { createDirector, type Director } from './director.ts';
import { FOV } from './viewpoints.ts';
import { watchVisibility } from './visibility.ts';
import { renderWithLook } from '../../look/render.ts';

/**
 * What the scene's pointer handlers reach: the world reports door and board clicks here, so the
 * rig can tell them from a click on the bare floor and from the end of a drag.
 */
export interface RigApi {
  director: Director;
  invalidate(): void;
  doorPointer(id: ChamberId, kind: 'over' | 'out' | 'click'): void;
  clipping(id: ChamberId): void;
}

export interface CameraRigProps {
  spine: SpineStore;
  progress: ProgressSource;
  animation: CorridorAnimation;
  /** The live props of the scene, read at event time so handlers never go stale. */
  handlers: RefObject<CorridorSceneProps>;
  container: RefObject<HTMLDivElement | null>;
  overlay: RefObject<HTMLCanvasElement | null>;
  rigRef: MutableRefObject<RigApi | null>;
  reducedMotion: boolean;
  engaged: boolean;
  onTouchSeen(): void;
}

const NOMINAL_FRAME_MS = 1000 / 60;
/** The director keeps the door choreography on the real clock through a hitch, up to this long. */
const MAX_FRAME_MS = 500;
const round = (v: number, places: number): string => v.toFixed(places);

/**
 * Lives inside the Canvas. Owns the director (camera and choreography), the DOM input
 * bindings and the dissolve, and runs the demand-driven frame: step, pose the camera, publish
 * what tests read, and ask for another frame only while something is moving.
 */
export function CameraRig(props: CameraRigProps) {
  const { spine, progress, animation, handlers, container, overlay, rigRef, onTouchSeen } = props;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const director = useRef<Director | null>(null);
  const input = useRef<InputBinding | null>(null);
  const lastFrame = useRef<number | null>(null);
  /** False while the scene is off screen or the tab is hidden: nothing is drawn. */
  const visible = useRef(true);
  const ambientTimer = useRef(0);
  const touchSeen = useRef(onTouchSeen);
  useEffect(() => {
    touchSeen.current = onTouchSeen;
  });

  // The lens follows the screen: wider on a portrait phone. Never changes at the hand-over.
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const fov = lensFor(size.width, size.height, FOV);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    container.current?.setAttribute('data-fov', String(fov));
    invalidate();
  }, [camera, container, size.width, size.height, invalidate]);

  useEffect(() => {
    const surface = container.current;
    const overlayCanvas = overlay.current;
    if (!surface || !overlayCanvas) return;
    const dissolve = createDissolve({
      overlay: overlayCanvas,
      source: () => gl.domElement,
      render: () => renderWithLook(gl, scene, camera),
      ms: SPINE_TIMING.dissolveMs,
    });
    const d = createDirector({
      spine,
      progress,
      animation,
      reducedMotion: handlers.current.reducedMotion,
      portrait: () => {
        const box = surface.getBoundingClientRect();
        return (box.height || window.innerHeight) > (box.width || window.innerWidth);
      },
      onSeam: () => handlers.current.onSeam(),
      onWalk: (mps) => handlers.current.onWalk(mps),
      onDoorIntent: (id) => handlers.current.onDoorIntent(id),
      beforeCut: () => dissolve.capture(),
      requestFrame: () => get().invalidate(),
    });
    director.current = d;
    d.setEngaged(handlers.current.engaged);

    const binding: InputBinding = bindInput({
      controls: d.controller,
      surface,
      mode: () => d.inputMode(),
      dragThresholdPx: { touch: SITE_SCROLL.gestureThresholdPx },
      reducedMotion: () => d.controller.reducedMotion,
      lookScale: () => {
        const { size: s } = get();
        return lookScale(s.width, s.height, camera instanceof PerspectiveCamera ? camera.fov : FOV.landscape);
      },
      metresPerPx: DEFAULT_TUNING.nudge.metresPerPx,
      onGesture: () => handlers.current.onGesture(),
      onActivity: () => get().invalidate(),
      onStep: (dir) => d.stepViewpoint(dir),
      onTouch: () => touchSeen.current(),
    });
    input.current = binding;

    // Engaged, a click does what it always did; at rest it only asks to engage and is consumed.
    const router = createClickRouter({
      engaged: () => handlers.current.engaged,
      onGesture: () => handlers.current.onGesture(),
      onEngageRequest: () => handlers.current.onEngageRequest(),
      clickDoor: (id) => d.clickDoor(id),
      clickClipping: (id) => spine.dispatch({ type: 'OPEN_DOOR', id, via: 'board' }),
      clickFloor: (point) => d.clickFloor(point),
    });

    // The one renderer serves the hero and the game window and draws nothing while neither is
    // on screen (or the tab is hidden); it comes back in the state it was left.
    const show = (isVisible: boolean) => {
      visible.current = isVisible;
      const root = get();
      root.setFrameloop(isVisible ? 'demand' : 'never');
      window.clearTimeout(ambientTimer.current);
      ambientTimer.current = 0;
      lastFrame.current = null;
      if (isVisible) root.invalidate();
      else root.internal.frames = 0;
    };
    const watch = watchVisibility(surface, show);
    show(watch.visible());

    // A click that landed on a door or the board is theirs; a bare floor click is ours.
    let consumed = false;
    const onPointerDown = () => {
      consumed = false;
    };
    const onClick = (event: MouseEvent) => {
      if (consumed) {
        consumed = false;
        return;
      }
      if (binding.wasDrag() || isIgnored(event.target) || !(camera instanceof PerspectiveCamera)) return;
      const rect = surface.getBoundingClientRect();
      const point = floorPoint(camera, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
      if (point) router.floor(point);
      else router.background();
    };
    surface.addEventListener('pointerdown', onPointerDown, true);
    surface.addEventListener('click', onClick);

    rigRef.current = {
      director: d,
      invalidate: () => get().invalidate(),
      doorPointer(id, kind) {
        if (kind === 'over') {
          surface.dataset['over'] = 'door';
          d.setHover(id);
        } else if (kind === 'out') {
          delete surface.dataset['over'];
          d.setHover(null);
        } else {
          consumed = true;
          if (!binding.wasDrag()) router.door(id);
        }
      },
      clipping(id) {
        consumed = true;
        if (!binding.wasDrag()) router.clipping(id);
      },
    };
    lastFrame.current = null;
    get().invalidate();

    return () => {
      rigRef.current = null;
      surface.removeEventListener('pointerdown', onPointerDown, true);
      surface.removeEventListener('click', onClick);
      watch.dispose();
      window.clearTimeout(ambientTimer.current);
      ambientTimer.current = 0;
      binding.dispose();
      input.current = null;
      dissolve.dispose();
      d.dispose();
      director.current = null;
    };
  }, [spine, progress, animation, handlers, container, overlay, rigRef, gl, scene, camera, get]);

  useEffect(() => {
    director.current?.setReducedMotion(props.reducedMotion);
  }, [props.reducedMotion]);

  // Leaving the window lets go of every held key, whichever way the page released it.
  useEffect(() => {
    director.current?.setEngaged(props.engaged);
    if (!props.engaged) input.current?.releaseAll();
  }, [props.engaged]);

  // Landing scroll moves the camera; a frame is due for every change of progress.
  useEffect(() => progress.subscribe(() => invalidate()), [progress, invalidate]);

  const scratch = useRef({ v: new Vector3(), targets: '', pose: '', pitch: '' });

  useFrame(() => {
    const d = director.current;
    if (!d) return;
    const now = performance.now();
    const dt = lastFrame.current === null ? NOMINAL_FRAME_MS : Math.min(MAX_FRAME_MS, now - lastFrame.current);
    const busy = d.step(dt);
    lastFrame.current = busy ? now : null;
    applyPose(camera, d.pose, CORRIDOR.eyeHeight);

    // What the end-to-end tests read: the pose, where the doors are on screen, frames drawn.
    const el = container.current;
    if (el && gl.domElement.dataset['world'] === 'ready') {
      const pose = `${round(d.pose.x, 3)},${round(d.pose.z, 3)},${round(wrapYaw(d.pose.yawDeg), 2)}`;
      if (pose !== scratch.current.pose) {
        scratch.current.pose = pose;
        el.dataset['poseTime'] = String(now);
        el.dataset['pose'] = pose;
      }
      const pitch = round(d.pose.pitchDeg, 1);
      if (pitch !== scratch.current.pitch) {
        scratch.current.pitch = pitch;
        el.dataset['pitch'] = pitch;
      }
      const { size: s } = get();
      const found: Record<string, [number, number]> = {};
      for (const slot of CHAMBER_SLOTS) {
        if (!slot.chamber) continue;
        const side = slot.side === 'right' ? 1 : -1;
        const spec = CHAMBER_MODULES[slot.chamber].door;
        scratch.current.v.set(side * (CORRIDOR.width / 2 - 0.05), spec.height / 2, slot.z).project(camera);
        const v = scratch.current.v;
        if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) {
          found[slot.chamber] = [Math.round(((v.x + 1) / 2) * s.width), Math.round(((1 - v.y) / 2) * s.height)];
        }
      }
      const targets = JSON.stringify(found);
      if (targets !== scratch.current.targets) {
        scratch.current.targets = targets;
        el.dataset['doorTargets'] = targets;
      }
      el.dataset['frames'] = String(gl.info.render.frame);
    }
    if (!busy) return;
    if (!d.ambientOnly) {
      invalidate();
    } else if (ambientTimer.current === 0 && visible.current) {
      // Only the hero's drift is moving: a slow arc needs fifteen frames a second, not sixty.
      ambientTimer.current = window.setTimeout(() => {
        ambientTimer.current = 0;
        if (visible.current) get().invalidate();
      }, AMBIENT_FRAME_MS);
    }
  });

  return null;
}
