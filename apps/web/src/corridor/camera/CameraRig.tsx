import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CORRIDOR_PROPS, type ChamberId, type SpineStore } from '@tqw/engine';
import { PerspectiveCamera, Vector3 } from 'three';
import { bindInput, isIgnored, type InputBinding } from '../../firstPerson/bindings.ts';
import { DEFAULT_TUNING } from '../../firstPerson/controller.ts';
import { createDissolve } from '../../firstPerson/dissolve.ts';
import { applyPose, floorPoint, lensFor, lookScale, wrapYaw } from '../../firstPerson/three.ts';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import { SITE_SCROLL, SPINE_TIMING } from '../../timing.ts';
import type { CorridorAnimation } from '../animation.ts';
import { createFirstHint, type FirstHint } from '../input/hint.ts';
import { createClickRouter } from '../input/engage.ts';
import type { CueStore } from '../input/cues.ts';
import { createOverTracker } from '../input/over.ts';
import { CHAMBER_SLOTS, CORRIDOR } from '../layout.ts';
import type { ProgressSource } from '../progress.ts';
import type { PropAnimation, PropId } from '../props.ts';
import type { CorridorSceneProps } from '../types.ts';
import { AMBIENT_FRAME_MS } from './ambient.ts';
import type { AmbientScheduler } from './ambientClock.ts';
import type { BoardMotion } from './boardMotion.ts';
import { boardPoint } from './framing.ts';
import { cueText, readerFor, targetId, type CueTarget } from './cueText.ts';
import { createDirector, type Director } from './director.ts';
import { framePlan } from './framePlan.ts';
import type { Lens } from './framing.ts';
import { createProbe, probeRequested } from './probe.ts';
import { onBoard } from './hit.ts';
import { placement, targetCorners } from './place.ts';
import { propAnchor, propById } from './stations.ts';
import { FOV, handoverPose } from './viewpoints.ts';
import { watchVisibility } from './visibility.ts';
import { renderWithLook } from '../../look/render.ts';
import { isSoftwareRenderer, rendererName } from '../world/quality.ts';
import { waitForGpuFrame } from './gpuFrame.ts';
import { handoffFrameMode } from './handoff.ts';
import { atHandover } from './atHandover.ts';

/**
 * What the scene's pointer handlers reach: the world reports door, prop and board clicks here, so
 * the rig can tell them from a click on the bare floor and from the end of a drag.
 */
export interface RigApi {
  director: Director;
  invalidate(): void;
  doorPointer(id: ChamberId, kind: 'over' | 'out' | 'click'): void;
  clipping(id: ChamberId): void;
  propPointer(id: PropId, kind: 'over' | 'out' | 'click'): void;
}

export interface CameraRigProps {
  spine: SpineStore;
  progress: ProgressSource;
  animation: CorridorAnimation;
  /** The props' per-frame state, written by the director and read by the world. */
  propAnimation: PropAnimation;
  /** The notice board pin's glint, read by the world. */
  boardMotion: BoardMotion;
  /** The ambient scheduler the world and props lanes ask for windows; the rig tells it when it may not open any. */
  ambient: AmbientScheduler;
  /** The DOM cue overlay's state. */
  cues: CueStore;
  /** The chamber behind a pending door once it has drawn its first ready frame. */
  readyChamber: ChamberId | null;
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
/** The first hint appears this long after the visitor arrives at the starting view. */
const HINT_DELAY_MS = 900;
/** A reader stays this long, or until the visitor walks away from the prop. */
const READER_MS = 14_000;
const READER_RANGE_M = 3.5;
const round = (v: number, places: number): string => v.toFixed(places);

/** An element with `data-prop`, `data-board` or `data-door` carrying the id of what it stands for. */
function focusTargetOf(el: Element | null): CueTarget | null {
  const holder = el?.closest('[data-prop], [data-door], [data-board]');
  if (!holder) return null;
  const prop = holder.getAttribute('data-prop');
  if (prop) return { kind: 'prop', id: prop as PropId };
  if (holder.hasAttribute('data-board')) return { kind: 'board' };
  const door = holder.getAttribute('data-door');
  return door ? { kind: 'door', id: door as ChamberId } : null;
}

/** True when the browser would draw a focus ring on `el`: keyboard (or assistive) focus, not a mouse press. */
function focusVisible(el: Element | null): boolean {
  try {
    return el?.matches(':focus-visible') ?? false;
  } catch {
    return false;
  }
}

/**
 * Lives inside the Canvas. Owns the director (camera and choreography), the DOM input
 * bindings and the dissolve, and runs the demand-driven frame: step, pose the camera, publish
 * what tests read and the cue overlay draws, and ask for another frame only while something is
 * moving or an ambient window is open.
 */
export function CameraRig(props: CameraRigProps) {
  const { spine, progress, animation, handlers, container, overlay, rigRef, onTouchSeen } = props;
  const { propAnimation, boardMotion, ambient, cues } = props;
  const { readyChamber } = props;
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
  const wakeTimer = useRef(0);
  const software = useMemo(() => isSoftwareRenderer(rendererName(gl.getContext())), [gl]);
  const firstFrameSubmitted = useRef(false);
  const frameQueued = useRef(false);
  const cancelFence = useRef<(() => void) | null>(null);
  const syncFrameMode = useRef<(() => void) | null>(null);
  /** The first-encounter hint of the live scene: a label appearing is the visitor finding what it points at. */
  const hintRef = useRef<FirstHint | null>(null);
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
    const over = createOverTracker(surface);
    const lens = (): Lens => {
      const { size: s } = get();
      return { vfovDeg: camera instanceof PerspectiveCamera ? camera.fov : FOV.landscape, aspect: s.width / Math.max(1, s.height) };
    };

    // The first-encounter hint (once per visit, in memory only) and the reader for a prop's label.
    const hint: FirstHint = createFirstHint({
      onChange: (shown) => cues.set({ hint: shown ? CORRIDOR_PROPS.firstHint : null }),
    });
    hintRef.current = hint;
    let hintTimer = 0;
    let readerTimer = 0;
    let readerId: PropId | null = null;
    const closeReader = () => {
      window.clearTimeout(readerTimer);
      readerTimer = 0;
      readerId = null;
      cues.set({ reader: null });
    };
    const onPropAct = (id: PropId) => {
      const content = readerFor(id);
      hint.dismiss();
      closeReader();
      cues.set({
        live: content.text ? `${content.verb}. ${content.text}` : content.verb,
        reader: content.text ? content : null,
      });
      if (content.text) {
        readerId = id;
        readerTimer = window.setTimeout(closeReader, READER_MS);
      }
    };

    const d = createDirector({
      spine,
      progress,
      animation,
      propAnimation,
      boardMotion,
      ambient: ambient.clock,
      lens,
      reducedMotion: handlers.current.reducedMotion,
      portrait: () => {
        const box = surface.getBoundingClientRect();
        return (box.height || window.innerHeight) > (box.width || window.innerWidth);
      },
      onSeam: () => handlers.current.onSeam(),
      onWalk: (mps) => handlers.current.onWalk(mps),
      onDoorIntent: (id) => handlers.current.onDoorIntent(id),
      onPropAct,
      onArrive: () => {
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => {
          if (spine.getState().phase === 'corridor') hint.offer();
        }, HINT_DELAY_MS);
      },
      beforeCut: () => dissolve.capture(),
      requestFrame: () => { syncFrameMode.current?.(); get().invalidate(); },
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
      onActivity: () => { syncFrameMode.current?.(); get().invalidate(); },
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
      // A clipping on the board: the first click takes the visitor to the board, the next goes in.
      clickClipping: (id) => {
        if (!d.interest.frameBoard()) spine.dispatch({ type: 'OPEN_DOOR', id, via: 'board' });
      },
      clickFloor: (point) => d.clickFloor(point),
      clickProp: (id) => d.interest.clickProp(id),
      clickBoard: () => d.interest.clickBoard(),
      actProp: (id) => d.interest.actProp(id),
      actBoard: () => d.interest.actBoard(),
    });

    // What the DOM overlay's controls do: the verb label presses the object, the list acts on a prop.
    const press = (target: CueTarget) => {
      if (target.kind === 'door') router.door(target.id);
      else if (target.kind === 'prop') router.prop(target.id);
      else router.board();
    };
    const unbind = cues.bind({
      activateCue() {
        const cue = d.cue();
        if (cue) press(cue.target);
      },
      activatePlace: (target) => router.place(target),
      dismissHint: () => hint.dismiss(),
      closeReader,
    });

    // A software renderer gets one submitted frame behind the poster, then pauses while its fade
    // and removal are observable. The ordinary demand loop resumes once the poster is gone.
    let handoffPending = document.querySelector('.tqw-poster') !== null;
    let resumeTimer = 0;
    let lastVisible = visible.current;
    const applyFrameMode = () => {
      const mode = handoffFrameMode({
        visible: visible.current,
        stillHero: spine.getState().phase === 'entrance' && progress.get() === 0 && !handlers.current.engaged,
        handoffPending,
        firstFrameSubmitted: firstFrameSubmitted.current,
        constrained: software,
      });
      const root = get();
      const modeChanged = root.frameloop !== mode;
      const visibilityChanged = lastVisible !== visible.current;
      lastVisible = visible.current;
      const hidden = document.visibilityState === 'hidden';
      ambient.setReason('hidden', hidden);
      ambient.setReason('offscreen', !visible.current && !hidden);
      surface.dataset['ambient'] = ambient.openIds().join(',');
      if (!modeChanged && !visibilityChanged) return;
      if (modeChanged) root.setFrameloop(mode);
      window.clearTimeout(ambientTimer.current);
      ambientTimer.current = 0;
      window.clearTimeout(wakeTimer.current);
      wakeTimer.current = 0;
      lastFrame.current = null;
      if (mode === 'demand') {
        root.invalidate();
        d.wake();
      } else root.internal.frames = 0;
    };
    syncFrameMode.current = applyFrameMode;
    const poster = new MutationObserver(() => {
      if (!handoffPending || document.querySelector('.tqw-poster') || resumeTimer) return;
      // Keep removal observable before resuming an expensive software draw.
      resumeTimer = window.setTimeout(() => {
        handoffPending = false;
        applyFrameMode();
        poster.disconnect();
      }, 1000);
    });
    if (software && handoffPending) poster.observe(document.documentElement, { childList: true, subtree: true });
    const show = (isVisible: boolean) => {
      visible.current = isVisible;
      applyFrameMode();
    };
    const watch = watchVisibility(surface, show);
    show(watch.visible());

    // The overlay and the ambient windows are only for the corridor (and the hero, for windows): not
    // while a door's chamber, the board or a page covers the scene.
    const cover = () => {
      const state = spine.getState();
      ambient.setReason('covered', state.phase === 'threshold' || state.phase === 'chamber' || state.boardOpen || state.page !== null);
      applyFrameMode();
      get().invalidate();
    };
    cover();
    const offCover = spine.subscribe(cover);

    // A click that landed on a door, a prop, a clipping or the board is theirs; a bare floor click is ours.
    let consumed = false;
    const onPointerDown = () => {
      consumed = false;
      cues.set({ keyboard: false });
    };
    const ndcOf = (event: MouseEvent | PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        y: -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      };
    };
    const onBoardSurface = (event: MouseEvent | PointerEvent): boolean =>
      spine.getState().phase === 'corridor' && onBoard({ ...d.pose }, lens(), ndcOf(event));
    const onClick = (event: MouseEvent) => {
      if (consumed) {
        consumed = false;
        return;
      }
      if (binding.wasDrag() || isIgnored(event.target) || !(camera instanceof PerspectiveCamera)) return;
      if (onBoardSurface(event)) {
        router.board();
        return;
      }
      const rect = surface.getBoundingClientRect();
      const point = floorPoint(camera, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
      if (point) router.floor(point);
      else router.background();
    };
    // The board's surface has no mesh of its own to report hover, so the rig reads the pointer.
    let onTheBoard = false;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || isIgnored(event.target)) return;
      const now = onBoardSurface(event);
      if (now === onTheBoard) return;
      onTheBoard = now;
      if (now) {
        over.enter('board');
        hint.dismiss();
      } else over.leave('board');
      d.interest.hoverBoard(now);
    };
    const onPointerLeave = () => {
      if (!onTheBoard) return;
      onTheBoard = false;
      over.leave('board');
      d.interest.hoverBoard(false);
    };
    surface.addEventListener('pointerdown', onPointerDown, true);
    surface.addEventListener('click', onClick);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerleave', onPointerLeave);

    // Keyboard focus on a prop in the list or a door in the keyboard list shows its label and a ring.
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      const target = focusTargetOf(el);
      d.setFocusTarget(target && focusVisible(el) ? target : null);
      if (target && focusVisible(el)) hint.dismiss();
    };
    const onFocusOut = () => d.setFocusTarget(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (hint.visible()) hint.dismiss();
        else if (readerId) closeReader();
        return;
      }
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      cues.set({ keyboard: true });
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown, true);

    // Tests and tools open an ambient window exactly as the world does: through the scheduler's own rules.
    const onAmbientRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; ms?: number }>).detail;
      if (detail?.id) ambient.clock.requestWindow(String(detail.id), Number(detail.ms ?? 1000));
    };
    surface.addEventListener('tqw:ambient-window', onAmbientRequest);

    rigRef.current = {
      director: d,
      invalidate: () => get().invalidate(),
      doorPointer(id, kind) {
        if (kind === 'over') {
          over.enter('door');
          d.setHover(id);
          hint.dismiss();
        } else if (kind === 'out') {
          over.leave('door');
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
      propPointer(id, kind) {
        if (kind === 'over') {
          over.enter('prop');
          d.interest.hoverProp(id);
          hint.dismiss();
        } else if (kind === 'out') {
          over.leave('prop');
          d.interest.hoverProp(null);
        } else {
          consumed = true;
          if (!binding.wasDrag()) router.prop(id);
        }
      },
    };
    lastFrame.current = null;
    get().invalidate();

    // The hole probe (ADR 0007), only on a page opened for it: a test places the camera anywhere the
    // stage allows and counts the pixels nothing drew. The director's pose is put back after each draw.
    let probe: ReturnType<typeof createProbe> | undefined;
    if (import.meta.env.DEV && probeRequested()) {
      probe = createProbe({
        gl,
        scene,
        camera,
        limit: () => d.controller.yawLimitDeg,
        restore: () => applyPose(camera, d.pose, CORRIDOR.eyeHeight),
      });
      window.__tqwProbe = probe;
    }

    // The reader closes itself when the visitor walks away from what it is about.
    const walkAway = window.setInterval(() => {
      if (!readerId) return;
      const a = propAnchor(propById(readerId));
      if (Math.hypot(a.x - d.pose.x, a.z - d.pose.z) > READER_RANGE_M) closeReader();
    }, 1000);

    return () => {
      rigRef.current = null;
      if (import.meta.env.DEV) delete window.__tqwProbe;
      probe?.dispose();
      surface.removeEventListener('pointerdown', onPointerDown, true);
      surface.removeEventListener('click', onClick);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerleave', onPointerLeave);
      surface.removeEventListener('tqw:ambient-window', onAmbientRequest);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown, true);
      window.clearInterval(walkAway);
      window.clearTimeout(hintTimer);
      window.clearTimeout(readerTimer);
      offCover();
      unbind();
      hint.dispose();
      hintRef.current = null;
      over.clear();
      cues.set({ cue: null, ring: false, places: [], reader: null, hint: null, live: '', shown: false });
      cues.place({ label: null, ring: null });
      ambient.setReason('covered', false);
      watch.dispose();
      poster.disconnect();
      window.clearTimeout(resumeTimer);
      cancelFence.current?.();
      cancelFence.current = null;
      syncFrameMode.current = null;
      firstFrameSubmitted.current = false;
      frameQueued.current = false;
      window.clearTimeout(ambientTimer.current);
      ambientTimer.current = 0;
      window.clearTimeout(wakeTimer.current);
      wakeTimer.current = 0;
      binding.dispose();
      input.current = null;
      dissolve.dispose();
      d.dispose();
      director.current = null;
    };
  }, [spine, progress, animation, propAnimation, boardMotion, ambient, cues, handlers, container, overlay, rigRef, gl, scene, camera, get, software]);

  useEffect(() => {
    if (readyChamber) director.current?.markChamberReady(readyChamber);
  }, [readyChamber]);

  useEffect(() => {
    director.current?.setReducedMotion(props.reducedMotion);
    ambient.setReason('reduced-motion', props.reducedMotion);
  }, [props.reducedMotion, ambient]);

  // Leaving the window lets go of every held key, whichever way the page released it.
  useEffect(() => {
    director.current?.setEngaged(props.engaged);
    syncFrameMode.current?.();
    if (!props.engaged) input.current?.releaseAll();
  }, [props.engaged]);

  // Landing scroll moves the camera; a frame is due for every change of progress.
  useEffect(() => progress.subscribe(() => { syncFrameMode.current?.(); invalidate(); }), [progress, invalidate]);

  const scratch = useRef({ v: new Vector3(), targets: '', boardTarget: '', pose: '', pitch: '', ambient: '', atHandover: '' });

  useFrame(() => {
    const d = director.current;
    if (!d) return;
    const now = performance.now();
    const dt = lastFrame.current === null ? NOMINAL_FRAME_MS : Math.min(MAX_FRAME_MS, now - lastFrame.current);
    const busy = d.step(dt);
    const windowOpen = ambient.tick();
    applyPose(camera, d.pose, CORRIDOR.eyeHeight);

    // What the end-to-end tests read: the pose, where the doors are on screen, frames drawn.
    const el = container.current;
    const publish = () => {
      if (!el) return;
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
      const start = handoverPose(s.height > s.width);
      const handoverFlag = String(atHandover(d.pose, start));
      if (handoverFlag !== scratch.current.atHandover) {
        scratch.current.atHandover = handoverFlag;
        el.dataset['atHandover'] = handoverFlag;
      }
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
      scratch.current.v.set(...boardPoint(0, 0)).project(camera);
      const boardTarget = JSON.stringify([
        Math.round(((scratch.current.v.x + 1) / 2) * s.width),
        Math.round(((1 - scratch.current.v.y) / 2) * s.height),
      ]);
      if (boardTarget !== scratch.current.boardTarget) {
        scratch.current.boardTarget = boardTarget;
        el.dataset['boardTarget'] = boardTarget;
      }
      const open = ambient.openIds().join(',');
      if (open !== scratch.current.ambient) {
        scratch.current.ambient = open;
        el.dataset['ambient'] = open;
      }
      el.dataset['frames'] = String(gl.info.render.frame);
      syncCues(d, s.width, s.height);
    };
    if (el && gl.domElement.dataset['content'] === 'ready') {
      if (!software || firstFrameSubmitted.current) {
        if (!software || !cancelFence.current) publish();
      } else if (!frameQueued.current) {
        frameQueued.current = true;
        // Fiber draws after its frame subscribers. The fence must follow that draw.
        queueMicrotask(() => {
          if (director.current !== d) {
            frameQueued.current = false;
            return;
          }
          firstFrameSubmitted.current = true;
          syncFrameMode.current?.();
          const context = gl.getContext();
          if (!('fenceSync' in context)) {
            frameQueued.current = false;
            publish();
            return;
          }
          cancelFence.current = waitForGpuFrame(context as WebGL2RenderingContext, () => {
            cancelFence.current = null;
            frameQueued.current = false;
            publish();
          }, () => {
            cancelFence.current = null;
            firstFrameSubmitted.current = false;
            frameQueued.current = false;
            syncFrameMode.current?.();
          });
        });
      }
    }

    // The next frame: at the display's pace while something moves, at the ambient cadence for the
    // hero's drift or an open ambient window, and not at all otherwise.
    const plan = framePlan({ visible: visible.current, busy, ambientOnly: d.ambientOnly, windowOpen });
    lastFrame.current = plan === 'none' ? null : now;
    if (plan === 'now') {
      invalidate();
    } else if (plan === 'ambient' && ambientTimer.current === 0) {
      ambientTimer.current = window.setTimeout(() => {
        ambientTimer.current = 0;
        if (visible.current) get().invalidate();
      }, AMBIENT_FRAME_MS);
    }
    armWake(d);
  });

  /** Wakes the director when something would change with no frame drawn (a glint is due, a held action ends). */
  function armWake(d: Director): void {
    window.clearTimeout(wakeTimer.current);
    wakeTimer.current = 0;
    const ms = d.nextWakeMs();
    if (ms === null || !visible.current) return;
    wakeTimer.current = window.setTimeout(
      () => {
        wakeTimer.current = 0;
        if (!visible.current || director.current !== d) return;
        // A label settling or fading with no frame drawn (the visitor stopped walking): bring the overlay up to date.
        const busy = d.wake();
        const { size: s } = get();
        syncCues(d, s.width, s.height);
        if (busy) get().invalidate();
        else armWake(d);
      },
      Math.max(16, ms),
    );
  }

  function hintOnCue(): void {
    hintRef.current?.dismiss();
  }

  /**
   * Writes what the cue overlay draws: the label and ring for the cue (only what the visitor has
   * found, was sent to, or has focus on), and the "Places and actions" list.
   */
  function syncCues(d: Director, width: number, height: number): void {
    const state = spine.getState();
    const shown = visible.current && state.phase === 'corridor';
    // A label button the visitor has focus on is never taken away by a timer.
    const holding = document.activeElement?.classList.contains('tqw-cue--button') === true;
    const cue = shown && !holding ? d.cue() : null;
    if (holding && shown) return;
    cues.set({
      shown,
      cue: cue ? { key: targetId(cue.target), text: cue.text, asButton: !cue.focused, visible: cue.visible } : null,
      ring: cue?.focused === true,
      places:
        (state.phase === 'entrance' || state.phase === 'corridor') && !state.boardOpen && state.page === null
          ? d.places().map((place) => {
              const target: CueTarget = place.kind === 'board' ? { kind: 'board' } : { kind: 'prop', id: place.id };
              return { key: targetId(target), text: cueText(target), target };
            })
          : [],
    });
    if (cue?.visible) hintOnCue();
    if (!cue || !(camera instanceof PerspectiveCamera)) {
      cues.place({ label: null, ring: null });
      return;
    }
    const label = cues.labelSize() ?? { width: 160, height: 44 };
    const lens: Lens = { vfovDeg: camera.fov, aspect: width / Math.max(1, height) };
    const corners = targetCorners(cue.target, doorSizeOf);
    cues.place(placement(corners, { ...d.pose }, lens, { width, height }, label, { ring: cue.focused }));
  }

  return null;
}

function doorSizeOf(id: string): { width: number; height: number } {
  const spec = CHAMBER_MODULES[id as ChamberId].door;
  return { width: spec.width, height: spec.height };
}
