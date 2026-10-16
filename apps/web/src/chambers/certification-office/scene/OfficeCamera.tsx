import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { bindInput, keyIntent, type InputBinding, type InputControls } from '../../../firstPerson/bindings.ts';
import { DEFAULT_TUNING } from '../../../firstPerson/controller.ts';
import { createDissolve } from '../../../firstPerson/dissolve.ts';
import { applyPose, lensFor, lookScale } from '../../../firstPerson/three.ts';
import { SPINE_TIMING } from '../../../timing.ts';
import { useScene } from './context.ts';
import { EYE_HEIGHT, type Navigation } from './navigation.ts';
import { renderWithLook } from '../../../look/render.ts';

export interface OfficeCameraProps {
  navigation: Navigation;
  selectedPosition: 'left' | 'centre' | 'right';
  onStampTarget(x: number, y: number): void;
  overlay: RefObject<HTMLCanvasElement | null>;
  onGesture(): void;
}

const FOV = { landscape: 48, portrait: 58 };
const dialogOpen = () => document.querySelector('dialog[open], [role="dialog"]:not([hidden])') !== null;
const keyboardControl = (target: EventTarget | null) =>
  target instanceof Element && target.closest('button, a[href], input, textarea, select, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="dialog"], dialog, [contenteditable="true"], [data-fp-ignore]') !== null;

export function OfficeCamera({ navigation, onStampTarget, overlay, onGesture }: OfficeCameraProps) {
  const { store, motion, view } = useScene();
  const { camera, gl, scene, size, invalidate, get } = useThree();
  const point = useMemo(() => new Vector3(), []);
  const lastFrame = useRef<number | null>(null);
  const gesture = useRef(onGesture);

  useEffect(() => { gesture.current = onGesture; }, [onGesture]);

  useEffect(() => navigation.subscribe(invalidate), [navigation, invalidate]);
  useEffect(() => {
    navigation.setReducedMotion(motion.reduced);
  });
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.clearViewOffset();
    camera.fov = lensFor(size.width, size.height, FOV);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    navigation.setLens(camera.fov, camera.aspect);
    invalidate();
  }, [camera, size.width, size.height, invalidate, navigation]);

  useEffect(() => {
    const canvas = overlay.current;
    if (!canvas) return;
    const dissolve = createDissolve({
      overlay: canvas,
      source: () => gl.domElement,
      render: () => {
        applyPose(camera, navigation.pose, EYE_HEIGHT);
        scene.updateMatrixWorld(true);
        renderWithLook(gl, scene, camera);
      },
      ms: SPINE_TIMING.dissolveMs,
    });
    navigation.setBeforeCut(() => {
      if (gl.domElement.closest<HTMLElement>('.tqw-canvas')?.dataset['ready'] === 'true') dissolve.capture();
    });
    return () => { navigation.setBeforeCut(null); dissolve.dispose(); };
  }, [navigation, overlay, gl, scene, camera]);

  useEffect(() => {
    const surface = gl.domElement.closest<HTMLElement>('.tqw-canvas') ?? gl.domElement;
    const enabled = () => !store.getState().pressing && !dialogOpen();
    // Check again on drag moves: a dialog or press can take ownership after pointerdown.
    const controls: InputControls = {
      hold: (source, dir) => { if (enabled() || dir === 0) navigation.controls.hold(source, dir); },
      turn: (source, dir) => { if (enabled() || dir === 0) navigation.controls.turn(source, dir); },
      nudge: metres => { if (enabled()) navigation.controls.nudge(metres); },
      look: (yaw, pitch) => { if (enabled()) navigation.controls.look(yaw, pitch); },
    };
    const input: InputBinding = bindInput({
      controls,
      surface,
      // Inside a chamber the game window is engaged (ADR 0003); a dialog or a held press hands
      // input back, and the wrappers above still gate every move.
      mode: () => (enabled() ? 'engaged' : 'page'),
      // The binding's stationary path turns movement presses and vertical swipes into station
      // steps. Navigation still receives the visitor's actual reduced-motion setting above.
      reducedMotion: () => true,
      lookScale: () => {
        const s = get().size;
        return lookScale(s.width, s.height, camera instanceof PerspectiveCamera ? camera.fov : FOV.landscape);
      },
      metresPerPx: DEFAULT_TUNING.nudge.metresPerPx,
      onGesture: () => gesture.current(),
      onActivity: invalidate,
      onStep: dir => navigation.stepViewpoint(dir),
    });
    const turnSource = 'station-keyboard';
    const turnDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented || event.repeat || keyboardControl(event.target)) return;
      const intent = keyIntent(event.code);
      if (intent?.kind === 'turn') navigation.controls.turn(turnSource, intent.dir);
    };
    const turnUp = (event: KeyboardEvent) => {
      if (keyIntent(event.code)?.kind === 'turn') navigation.controls.turn(turnSource, 0);
    };
    window.addEventListener('keydown', turnDown);
    window.addEventListener('keyup', turnUp);
    navigation.setWasDrag(() => input.wasDrag());
    const suspend = () => { input.releaseAll(); navigation.stop(); };
    const checkOwnership = () => {
      if (!enabled()) { input.releaseAll(); navigation.releaseInput(); }
    };
    const off = store.subscribe(checkOwnership);
    const observer = new MutationObserver(checkOwnership);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'role', 'hidden'] });
    const visibility = () => { if (document.hidden) suspend(); };
    window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      off(); observer.disconnect();
      window.removeEventListener('keydown', turnDown);
      window.removeEventListener('keyup', turnUp);
      window.removeEventListener('blur', suspend);
      document.removeEventListener('visibilitychange', visibility);
      input.dispose(); navigation.setWasDrag(null); navigation.stop();
    };
  }, [navigation, store, motion, gl, camera, get, invalidate]);

  useFrame(() => {
    navigation.setReducedMotion(motion.reduced);
    const now = performance.now();
    const previous = Math.max(lastFrame.current ?? navigation.requestedAt ?? now, navigation.requestedAt ?? now);
    const active = navigation.advance((now - previous) / 1000);
    lastFrame.current = now;
    const pose = navigation.pose;
    applyPose(camera, pose, EYE_HEIGHT);
    const yaw = pose.yawDeg * Math.PI / 180;
    const forwardX = -Math.sin(yaw), forwardZ = Math.cos(yaw);
    const blend = size.width < size.height ? 0 : 1;
    if (view.forwardX !== forwardX || view.forwardZ !== forwardZ || view.blend !== blend) view.version++;
    view.forwardX = forwardX; view.forwardZ = forwardZ; view.blend = blend;
    const container = gl.domElement.closest<HTMLElement>('.tqw-canvas');
    if (container) {
      container.dataset['position'] = `${pose.x.toFixed(2)},1.62,${pose.z.toFixed(2)}`;
      container.dataset['pose'] = `${pose.x},${pose.z},${pose.yawDeg},${pose.pitchDeg}`;
      container.dataset['moving'] = String(active);
      container.dataset['pitch'] = String(pose.pitchDeg);
      container.dataset['fov'] = camera instanceof PerspectiveCamera ? String(camera.fov) : '';
      const handle = scene.getObjectByName('office-press-handle');
      container.dataset['stampTarget'] = '';
      if (handle && container.dataset['ready'] === 'true') {
        handle.updateWorldMatrix(true, false);
        handle.localToWorld(point.set(0, 0.165, 0));
        point.project(camera);
        if (point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1) {
          const rect = gl.domElement.getBoundingClientRect();
          const x = rect.left + (point.x + 1) * rect.width / 2;
          const y = rect.top + (1 - point.y) * rect.height / 2;
          container.dataset['stampTarget'] = `${x},${y}`;
          onStampTarget(x, y);
        }
      }
    }
    if (active) invalidate();
  });
  return null;
}
