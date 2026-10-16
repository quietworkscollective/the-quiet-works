import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type LazyExoticComponent,
  type MouseEvent,
} from 'react';
import {
  chamberById,
  createDiscoveryStore,
  createSpineStore,
  FOOTER_COPY,
  HERO_COPY,
  MENU_COPY,
  routeOf,
  sameRoute,
  SPINE_CAPTIONS,
  spineInitial,
  TEXT_MODE_NOTICE_CORRIDOR,
  type ChamberId,
  type PageId,
  type SpineCue,
  type SpineState,
} from '@tqw/engine';
import {
  Captions,
  ChamberHost,
  Details,
  DoorList,
  fillCopy,
  Footer,
  GameWindow,
  Hero,
  MenuPanel,
  NoticeBoard,
  Poster,
  SiteMenu,
  SitePage,
  SmokeVeil,
  TextCorridor,
  Unlocks,
  useRestingInputGate,
  useSessionDiscoveries,
  type CaptionLine,
  type DoorListItem,
  type SettingKey,
  type Settings,
} from '@tqw/ui';
import { useSoundDesk } from './audio/useSoundDesk.ts';
import { isChamberOpenInBuild, preloadChamber, VISIBLE_CHAMBERS } from './chambers/registry.ts';
import type { ChamberComponent, CoreSettings, TextReason } from './chambers/types.ts';
import { createProgress } from './corridor/progress.ts';
import { detectWebGL2, prefersReducedMotion, requestedTextMode } from './environment.ts';
import { escapeReleases, LEAVE_SLACK_PX, progressAt, scrollAction } from './pageScroll.ts';
import { hrefFor, parseRoute } from './routes.ts';
import { SceneBoundary } from './SceneBoundary.tsx';
import { THIRD_PARTY_CREDITS } from './credits/index.ts';
import { useFirstSceneFrame } from './sceneFrame.ts';
import { SITE } from './site.ts';
import { browserStorage } from './storage/index.ts';
import { SITE_SCROLL, SPINE_TIMING } from './timing.ts';

const CorridorScene = lazy(() => import('./corridor/CorridorScene.tsx'));

const CAPTION_LIFETIME_MS = 4500;
const MAX_CAPTIONS = 3;
/**
 * If the corridor never reports the seam (a failed scene), the threshold completes anyway. A safety
 * net only: it must not beat a real seam on a slow device, or the chamber mounts mid-walk, so it
 * allows three times the choreography.
 */
const SEAM_FALLBACK_MS =
  3 * (SPINE_TIMING.handleTurnMs + SPINE_TIMING.latchMs + SPINE_TIMING.entryDelayMs + SPINE_TIMING.entryMs);

const DOORS: readonly DoorListItem[] = VISIBLE_CHAMBERS.map((c) => ({
  id: c.id,
  title: c.title,
  status: c.status,
  description: c.doorDescription,
}));

/** One lazy component per open chamber, created once; its chunk is shared with preloadChamber. */
const CHAMBER_VIEWS: Partial<Record<ChamberId, LazyExoticComponent<ChamberComponent>>> = Object.fromEntries(
  VISIBLE_CHAMBERS.filter((c) => c.status === 'open').map((c) => [
    c.id,
    lazy(() => preloadChamber(c.id) ?? Promise.reject(new Error(`${c.id} has no code`))),
  ]),
);

function locationLine(state: SpineState): string {
  if ((state.phase === 'chamber' || state.phase === 'threshold') && state.chamber) {
    return `${SITE.world} · ${chamberById(state.chamber).title.replace(/^The /, '')}`;
  }
  return state.phase === 'corridor' ? `${SITE.world} · Corridor` : SITE.world;
}

/**
 * The scroll position at which the game window's top reaches the top of the viewport: the end of
 * the hero and the smoke run. Measured from the page, so it holds whatever the viewport does.
 */
function gameTop(): number {
  const section = document.getElementById('game');
  if (!section) return 0;
  const window_ = section.querySelector<HTMLElement>('.tqw-game__window');
  return section.offsetTop + section.offsetHeight - (window_?.offsetHeight ?? window.innerHeight);
}

/**
 * The core shell (ADR 0001, ADR 0003): the spine machine and its URL, settings, the sound desk,
 * captions, and the page: a hero, the smoke run, the game window, the visitor's archive, the
 * project's details and a footer. The core owns the page's structure and one thing the spine does
 * not: whether the game window has captured the visitor's input ("engaged"). Chambers own
 * everything inside their door, and open inside the game window.
 */
export function App() {
  const [spine] = useState(() => createSpineStore(
    spineInitial(parseRoute(window.location.pathname), isChamberOpenInBuild),
    isChamberOpenInBuild,
  ));
  const state = useSyncExternalStore(spine.subscribe, spine.getState);
  const [progress] = useState(() => createProgress());
  const [webgl] = useState(detectWebGL2);
  const [textReason, setTextReason] = useState<TextReason | null>(() =>
    !webgl ? 'unsupported' : requestedTextMode() ? 'chosen' : null,
  );
  const [settings, setSettings] = useState<CoreSettings>(() => ({
    muted: false,
    reducedMotion: prefersReducedMotion(),
    captions: false,
  }));
  const [captions, setCaptions] = useState<readonly CaptionLine[]>([]);
  const [readyChamber, setReadyChamber] = useState<ChamberId | null>(null);
  const sound = useSoundDesk();
  // The visitor's on-device discoveries (ADR 0003, R-1). Creating the store reads storage and never
  // writes it: the one key is first written when something is found (or an archive is imported).
  const [discoveries] = useState(() => createDiscoveryStore(browserStorage()));
  const session = useSessionDiscoveries(discoveries);
  const [trivia] = useState(() => {
    const pool = FOOTER_COPY.trivia;
    return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : undefined;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  // A chamber's URL (or a sealed door's) arrives with the game window already engaged.
  const [engaged, setEngaged] = useState(() => state.phase !== 'entrance');
  // Once audio has started the mute control stays one press away, outside the menu.
  const [audioOn, setAudioOn] = useState(false);
  const captionId = useRef(0);
  const pendingDoorCue = useRef<SpineCue | null>(null);

  const textMode = textReason !== null;
  // The corridor scene has drawn its first frame: the poster behind the hero dissolves, the veil may stop waiting.
  const sceneDrawn = useFirstSceneFrame(!textMode);
  // A still of the hero view covers the canvas from the first paint, for a visit that begins at the hero.
  const [beganAtHero] = useState(() => state.phase === 'entrance');
  const [posterGone, setPosterGone] = useState(false);
  const showPoster = beganAtHero && !textMode && !posterGone;
  const fullSettings: Settings = { ...settings, textMode };
  /** Text mode has no game window to capture: its reading order is the page. */
  const holding = engaged && !textMode;
  /** The smoke run: one viewport (no runway) when motion is reduced. */
  const runViewports = settings.reducedMotion ? 1 : SITE_SCROLL.runViewports;
  /** The crossfade at a door's seam, and the poster's: the short dissolve under reduced motion. */
  const seamMs = settings.reducedMotion || textMode ? SPINE_TIMING.dissolveMs : SPINE_TIMING.seamMs;

  const focusPhase = useRef(state.phase);
  useEffect(() => {
    const previous = focusPhase.current;
    focusPhase.current = state.phase;
    if (previous !== 'chamber' && state.phase === 'chamber') {
      const chamber = state.chamber;
      window.requestAnimationFrame(() => {
        if (spine.getState().phase !== 'chamber' || spine.getState().chamber !== chamber) return;
        const host = document.querySelector<HTMLElement>('.tqw-chamber-host');
        const target = host?.querySelector<HTMLElement>('[data-chamber-entry]')
          ?? host?.querySelector<HTMLElement>('h1:not([aria-hidden="true"]), h2:not([aria-hidden="true"])')
          ?? host?.querySelector<HTMLElement>('button:not(:disabled)');
        if (!target) return;
        if (target.matches('h1, h2') && !target.hasAttribute('tabindex')) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      });
    } else if (previous === 'chamber' && state.phase === 'corridor' && state.focus) {
      const door = state.focus;
      window.requestAnimationFrame(() => {
        if (spine.getState().phase !== 'corridor' || spine.getState().focus !== door) return;
        document.querySelector<HTMLElement>(`.tqw-doors [data-door="${door}"]`)?.focus({ preventScroll: true });
      });
    }
  }, [spine, state.chamber, state.focus, state.phase]);

  const engagedRef = useRef(engaged);
  const textModeRef = useRef(textMode);
  const mutedRef = useRef(settings.muted);
  useEffect(() => {
    engagedRef.current = engaged;
    textModeRef.current = textMode;
    mutedRef.current = settings.muted;
  });

  const unlockSound = useCallback(() => {
    sound.unlock();
    if (!mutedRef.current) setAudioOn(true);
  }, [sound]);

  useEffect(() => sound.setMuted(settings.muted), [sound, settings.muted]);
  useEffect(() => {
    sound.setRoom(state.phase === 'chamber' && state.chamber ? state.chamber : 'corridor');
  }, [sound, state.phase, state.chamber]);

  const motionOverridden = useRef(false);

  const caption = useCallback((text: string) => {
    captionId.current += 1;
    const line = { id: captionId.current, text };
    setCaptions((lines) => [...lines, line].slice(-MAX_CAPTIONS));
    window.setTimeout(() => setCaptions((lines) => lines.filter((l) => l.id !== line.id)), CAPTION_LIFETIME_MS);
  }, []);
  const playSpineCue = useCallback((cue: SpineCue) => {
    sound.playSpine(cue);
    const line = SPINE_CAPTIONS[cue.type];
    if (line) caption(line);
  }, [sound, caption]);

  // The URL follows the spine; back and forward come in as ROUTE events.
  useEffect(
    () =>
      spine.onDispatch((event, next) => {
        if (event.type === 'ROUTE') return;
        const target = routeOf(next);
        if (!sameRoute(target, parseRoute(window.location.pathname))) {
          window.history.pushState(null, '', hrefFor(target, window.location));
        }
      }),
    [spine],
  );
  useEffect(() => {
    const onPop = () => spine.dispatch({ type: 'ROUTE', route: parseRoute(window.location.pathname) });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [spine]);

  // A threshold completes when the door choreography reached the seam AND the chamber is ready.
  // Arriving by the board or a link has no walk, so its seam is immediate.
  const threshold = useRef({ seam: state.phase === 'threshold', ready: false });
  // Mirrors threshold.current.seam for rendering: a room can prepare behind the closed door, but
  // the host remains hidden and inert until the visitor reaches the doorway.
  const [seamReached, setSeamReached] = useState(state.phase === 'threshold');
  const completeIfDone = useCallback(() => {
    const t = threshold.current;
    if (t.seam && t.ready && spine.getState().phase === 'threshold') spine.dispatch({ type: 'THRESHOLD_DONE' });
  }, [spine]);
  const instantThreshold = textMode || settings.reducedMotion;
  const instantRef = useRef(instantThreshold);
  useEffect(() => {
    instantRef.current = instantThreshold;
  });

  // Arm a fresh threshold the moment the spine enters one. Dispatch listeners run before cue
  // listeners, so a seam reported from a 'door-open' cue always lands on the armed threshold.
  // Entering any chamber also takes the visitor to the game window and engages it: the chamber
  // opens there, and a visitor who chose it from the board, a link or a door wants to be in it.
  const lastPhase = useRef(state.phase);
  useEffect(
    () =>
      spine.onDispatch((_event, next) => {
        if (next.phase === 'threshold' && lastPhase.current !== 'threshold') {
          const seam = next.via !== 'door' || instantRef.current;
          threshold.current = { seam, ready: false };
          pendingDoorCue.current = null;
          setReadyChamber(null);
          setSeamReached(seam);
          if (!textModeRef.current) {
            window.scrollTo(0, gameTop());
            engagedRef.current = true;
            setEngaged(true);
          }
        } else if (next.phase !== 'threshold' && lastPhase.current === 'threshold') {
          pendingDoorCue.current = null;
          setReadyChamber(null);
        }
        lastPhase.current = next.phase;
      }),
    [spine],
  );

  useEffect(
    () =>
      spine.onCue((cue) => {
        const current = spine.getState();
        if (
          cue.type === 'door-open' &&
          cue.via === 'door' &&
          current.phase === 'threshold' &&
          current.via === 'door' &&
          !threshold.current.ready
        ) {
          pendingDoorCue.current = cue;
          return;
        }
        playSpineCue(cue);
      }),
    [spine, playSpineCue],
  );

  useEffect(() => {
    if (
      state.phase !== 'threshold' ||
      threshold.current.seam ||
      (state.via === 'door' && !threshold.current.ready)
    ) return;
    const timer = window.setTimeout(() => {
      threshold.current.seam = true;
      setSeamReached(true);
      completeIfDone();
    }, SEAM_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.chamber, state.via, readyChamber, completeIfDone]);

  const onSeam = useCallback(() => {
    threshold.current.seam = true;
    setSeamReached(true);
    completeIfDone();
  }, [completeIfDone]);
  const onChamberReady = useCallback(() => {
    const current = spine.getState();
    if (current.phase !== 'threshold' || !current.chamber) return;
    threshold.current.ready = true;
    if (current.via === 'door') {
      const cue = pendingDoorCue.current;
      pendingDoorCue.current = null;
      if (cue) playSpineCue(cue);
      if (!instantThreshold) {
        setReadyChamber(current.chamber);
        return;
      }
      threshold.current.seam = true;
      setSeamReached(true);
    }
    completeIfDone();
  }, [spine, instantThreshold, playSpineCue, completeIfDone]);

  const markInstantDoorSeam = useCallback(() => {
    const current = spine.getState();
    if (current.phase !== 'threshold' || current.via !== 'door') return;
    threshold.current.seam = true;
    setSeamReached(true);
    completeIfDone();
  }, [spine, completeIfDone]);
  const restoreAnimatedDoorSeam = useCallback(() => {
    const current = spine.getState();
    if (current.phase !== 'threshold' || current.via !== 'door' || threshold.current.ready) return;
    threshold.current.seam = false;
    setSeamReached(false);
  }, [spine]);

  // Follow the OS reduced-motion preference live, unless the visitor has toggled it here.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (motionOverridden.current) return;
      setSettings((s) => ({ ...s, reducedMotion: query.matches }));
      if (query.matches) markInstantDoorSeam();
      else if (!textModeRef.current) restoreAnimatedDoorSeam();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [markInstantDoorSeam, restoreAnimatedDoorSeam]);

  // ---- the page: scroll, progress, engagement -------------------------------------------------

  // The page owns its scroll position: no browser restoration, so a reload starts where the URL says.
  useEffect(() => {
    const history = window.history;
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  // A chamber's URL lands in the game window, already engaged, before the first paint.
  const arrivedEngaged = useRef(engaged && !textMode);
  useLayoutEffect(() => {
    if (arrivedEngaged.current) window.scrollTo(0, gameTop());
  }, []);

  // Native scroll writes the progress and carries the spine. Scrolling never engages the game
  // window: the page keeps scrolling past it, and only a deliberate Enter (click, tap or key) hands
  // the wheel and the swipe to the world.
  useEffect(() => {
    if (textMode) return;
    const onScroll = () => {
      const top = gameTop();
      if (top <= 0) return;
      const y = window.scrollY;
      progress.set(progressAt(y, top));
      const phase = spine.getState().phase;
      const action = scrollAction({ y, top, phase, engaged: engagedRef.current });
      if (action === 'handover') spine.dispatch({ type: 'ENTRANCE_DONE' });
      else if (action === 'return') spine.dispatch({ type: 'RETURN_TO_ENTRANCE' });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [spine, progress, textMode, runViewports]);

  // While the window is only resting, the wheel and the walking keys are the page's, whatever the scene does.
  useRestingInputGate(engaged, !textMode);

  // Fine-pointer desktops hold the page at the game while engaged. Touch devices keep the
  // document's native scroll so a hand-over gesture can continue beyond the window.
  useEffect(() => {
    if (!holding) return;
    const touchOrCoarse = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    if (touchOrCoarse) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [holding]);

  /** Browser fullscreen was left (by any route): the window no longer holds the page. */
  const release = useCallback(() => {
    engagedRef.current = false;
    setEngaged(false);
  }, []);
  /** Leave, or Escape: hand scrolling back, and come out of fullscreen if that is where the visitor is. */
  const leaveWindow = useCallback(() => {
    release();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [release]);

  // A window that has moved mostly out of view no longer owns page input. The 40% threshold lets a
  // visitor scroll away naturally on touch devices and releases the desktop hold after momentum.
  useEffect(() => {
    if (!holding || textMode) return;
    const gameWindow = document.querySelector<HTMLElement>('.tqw-game__window');
    if (!gameWindow) return;

    const visibleRatio = () => {
      const rect = gameWindow.getBoundingClientRect();
      if (rect.height <= 0) return 0;
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return visibleHeight / rect.height;
    };
    const releaseIfAway = () => { if (visibleRatio() < 0.4) release(); };
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.target === gameWindow && entry.intersectionRatio < 0.4)) release();
        }, { threshold: [0, 0.4] });
    observer?.observe(gameWindow);
    window.addEventListener('scroll', releaseIfAway, { passive: true });
    window.addEventListener('resize', releaseIfAway);

    const isInsideWindow = (event: Event) => {
      const target = event.target;
      return target instanceof Node && gameWindow.contains(target);
    };
    const onWheelOutsideWindow = (event: WheelEvent) => {
      if (isInsideWindow(event)) return;
      release();
      // Let the page keep its default scroll; the corridor's bubble listener must not capture it.
      event.stopImmediatePropagation();
    };
    const onPointerDownOutsideWindow = (event: PointerEvent) => {
      if (!isInsideWindow(event)) release();
    };
    window.addEventListener('wheel', onWheelOutsideWindow, { capture: true, passive: true });
    window.addEventListener('pointerdown', onPointerDownOutsideWindow, { capture: true, passive: true });
    releaseIfAway();

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', releaseIfAway);
      window.removeEventListener('resize', releaseIfAway);
      window.removeEventListener('wheel', onWheelOutsideWindow, { capture: true });
      window.removeEventListener('pointerdown', onPointerDownOutsideWindow, { capture: true });
    };
  }, [holding, release, textMode]);

  const releaseAtHandover = useCallback((distance: number) => {
    engagedRef.current = false;
    setEngaged(false);
    const travel = Math.max(LEAVE_SLACK_PX + 1, Math.min(distance, window.innerHeight));
    window.requestAnimationFrame(() => window.scrollTo(0, Math.max(0, gameTop() - travel)));
  }, []);

  // Once the visitor has walked back to the hand-over, another upward wheel or downward swipe
  // means “back to the page”. The scene keeps the gesture unless the camera is at that exact seam.
  useEffect(() => {
    if (textMode) return;
    const worldAtHandover = () =>
      document.querySelector<HTMLElement>('.tqw-corridor-canvas')?.dataset['atHandover'] === 'true';
    const onWheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      if (
        !engagedRef.current ||
        event.ctrlKey ||
        event.deltaY >= 0 ||
        !target?.closest('.tqw-corridor-canvas') ||
        target.closest('button, a, input, textarea, select, [data-fp-ignore]') ||
        !worldAtHandover()
      ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      releaseAtHandover(Math.abs(event.deltaY));
    };
    let touchStart: { id: number; x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      touchStart =
        engagedRef.current &&
        event.pointerType === 'touch' &&
        target?.closest('.tqw-corridor-canvas') &&
        !target.closest('button, a, input, textarea, select, [data-fp-ignore]')
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!touchStart || event.pointerId !== touchStart.id) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      if (dy < SITE_SCROLL.gestureThresholdPx || dy <= Math.abs(dx) || !worldAtHandover()) return;
      touchStart = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      releaseAtHandover(dy);
    };
    const clearTouch = () => {
      touchStart = null;
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', clearTouch, { capture: true });
    window.addEventListener('pointercancel', clearTouch, { capture: true });
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', clearTouch, { capture: true });
      window.removeEventListener('pointercancel', clearTouch, { capture: true });
    };
  }, [releaseAtHandover, textMode]);

  // Escape releases the window, but a dialog closes first: if one is open, the browser closes it and
  // this does nothing. (Leaving browser fullscreen is Escape's other meaning; that releases too, below.)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const releases = escapeReleases({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        dialogOpen: document.querySelector('dialog[open]') !== null,
        engaged: engagedRef.current,
        textMode: textModeRef.current,
      });
      if (releases) leaveWindow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leaveWindow]);

  const enterGame = useCallback(() => {
    unlockSound();
    if (textModeRef.current) {
      document.getElementById('game')?.scrollIntoView({ block: 'start' });
      return;
    }
    window.scrollTo(0, gameTop());
    engagedRef.current = true;
    setEngaged(true);
    if (spine.getState().phase === 'entrance') spine.dispatch({ type: 'ENTRANCE_DONE' });
  }, [spine, unlockSound]);

  // The skip link: past the hero and the smoke, to the game window, with the Enter control in focus.
  // (`#game` alone would not do: that section spans the hero and the run, so its top is the page's.)
  const skipToGame = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (textModeRef.current) {
        const section = document.getElementById('game');
        section?.scrollIntoView({ block: 'start' });
        section?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true });
        return;
      }
      window.scrollTo(0, gameTop());
      // The chrome is out of the tab order until the smoke clears; the scroll event would say so a frame late.
      progress.set(1);
      document.querySelector<HTMLElement>('.tqw-game__enter-button, .tqw-game__leave')?.focus({ preventScroll: true });
    },
    [progress],
  );

  const scrollCue = useCallback(() => {
    const target = textModeRef.current
      ? (document.getElementById('game')?.offsetTop ?? window.innerHeight)
      : (document.querySelector<HTMLElement>('.tqw-hero')?.offsetHeight ?? window.innerHeight);
    window.scrollTo(0, target);
  }, []);

  const toggle = useCallback(
    (key: SettingKey) => {
      if (key === 'textMode') {
        if (!webgl) return;
        setTextReason((reason) => (reason === null ? 'chosen' : null));
        return;
      }
      if (key === 'reducedMotion') {
        motionOverridden.current = true;
        if (settings.reducedMotion) {
          if (!textMode) restoreAnimatedDoorSeam();
        } else {
          markInstantDoorSeam();
        }
      }
      if (key === 'muted') {
        const unmuting = settings.muted;
        // Mute first so unlock() sees the new value; only turning sound ON may create audio.
        sound.setMuted(!unmuting);
        if (unmuting) {
          sound.unlock();
          setAudioOn(true);
        }
      }
      setSettings((s) => ({ ...s, [key]: !s[key as keyof CoreSettings] }));
    },
    [webgl, settings.muted, settings.reducedMotion, textMode, sound, markInstantDoorSeam, restoreAnimatedDoorSeam],
  );

  const onContextLost = useCallback(() => setTextReason('contextLost'), []);
  const onSceneError = useCallback(() => setTextReason('unsupported'), []);
  const retry3D = useCallback(() => setTextReason(null), []);

  const openBoard = useCallback(() => {
    unlockSound();
    setMenuOpen(false);
    spine.dispatch({ type: 'OPEN_BOARD' });
  }, [spine, unlockSound]);
  const closeBoard = useCallback(() => spine.dispatch({ type: 'CLOSE_BOARD' }), [spine]);
  const chooseClipping = useCallback(
    (id: ChamberId) => {
      preloadChamber(id);
      spine.dispatch({ type: 'OPEN_DOOR', id, via: 'board' });
    },
    [spine],
  );
  const openPage = useCallback(
    (page: PageId) => {
      setMenuOpen(false);
      spine.dispatch({ type: 'OPEN_PAGE', page });
    },
    [spine],
  );
  const closePage = useCallback(() => spine.dispatch({ type: 'CLOSE_PAGE' }), [spine]);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const leave = useCallback(() => spine.dispatch({ type: 'LEAVE_CHAMBER' }), [spine]);
  const backToEntrance = useCallback(() => {
    setMenuOpen(false);
    leaveWindow();

    let current = spine.getState();
    if (current.page) {
      spine.dispatch({ type: 'CLOSE_PAGE' });
      current = spine.getState();
    }
    if (current.boardOpen) {
      spine.dispatch({ type: 'CLOSE_BOARD' });
      current = spine.getState();
    }
    if (current.phase === 'chamber' || current.phase === 'threshold') {
      spine.dispatch({ type: 'LEAVE_CHAMBER' });
      current = spine.getState();
    }
    if (current.phase === 'corridor') spine.dispatch({ type: 'RETURN_TO_ENTRANCE' });

    // The camera settles from its current pose once the scroll position and phase both describe
    // the landing view. Let the dialog close and restore focus before moving the page; then move
    // focus to the top menu without letting it pull the visitor back to the old button.
    progress.set(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.tqw-site nav[aria-label="Top links"] button[aria-haspopup="dialog"]')?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      });
    });
  }, [leaveWindow, progress, spine]);

  const focusDoor = useCallback(
    (id: ChamberId) => {
      preloadChamber(id);
      if (spine.getState().phase === 'entrance') spine.dispatch({ type: 'ENTRANCE_DONE' });
      spine.dispatch({ type: 'FOCUS_DOOR', id });
    },
    [spine],
  );
  const openDoor = useCallback(
    (id: ChamberId) => {
      unlockSound();
      preloadChamber(id);
      if (spine.getState().phase === 'entrance') spine.dispatch({ type: 'ENTRANCE_DONE' });
      spine.dispatch({ type: 'OPEN_DOOR', id, via: 'door' });
    },
    [spine, unlockSound],
  );
  const doorIntent = useCallback((id: ChamberId) => void preloadChamber(id), []);

  const doors = useMemo(
    () => ({ doors: DOORS, focus: state.focus, onFocusDoor: focusDoor, onOpenDoor: openDoor }),
    [state.focus, focusDoor, openDoor],
  );

  const inChamber = (state.phase === 'threshold' || state.phase === 'chamber') && state.chamber !== null;
  // Walking through a door keeps the corridor on screen until the seam; the board and links cut straight in.
  const showCorridor = !inChamber || (state.phase === 'threshold' && state.via === 'door' && !instantThreshold);
  const mountChamber = inChamber;
  const Chamber = mountChamber && state.chamber ? CHAMBER_VIEWS[state.chamber] : undefined;

  const soundControl = audioOn ? { muted: settings.muted, onToggle: () => toggle('muted') } : undefined;
  const menu = (variant: 'hero' | 'footer') => (
    <SiteMenu variant={variant} onOpenBoard={openBoard} onOpenPage={openPage} onOpenMenu={openMenu} sound={soundControl} />
  );

  // Quiet details from this visit only: the doors that are open, and what this visitor has found.
  const doorsOpen = VISIBLE_CHAMBERS.filter((c) => c.status === 'open').length;
  const details = [
    ...(doorsOpen > 0 ? [doorsOpen === 1 ? HERO_COPY.doorsOne : fillCopy(HERO_COPY.doorsMany, { n: doorsOpen })] : []),
    ...(session.count > 0
      ? [session.count === 1 ? HERO_COPY.discoveriesOne : fillCopy(HERO_COPY.discoveriesMany, { n: session.count })]
      : []),
  ];

  const corridorNotice = (
    <p role="note" className="tqw-text__notice">
      {TEXT_MODE_NOTICE_CORRIDOR[textReason ?? 'chosen']}{' '}
      {textReason === 'contextLost' ? (
        <button type="button" className="tqw-link-button" onClick={retry3D}>
          Try the 3D view again
        </button>
      ) : null}
    </p>
  );

  return (
    <div
      className="tqw-site"
      data-spine={state.phase}
      data-chamber={state.chamber ?? ''}
      data-focus={state.focus ?? ''}
      data-board={state.boardOpen}
      data-page={state.page ?? ''}
      data-text={textMode}
      data-engaged={holding}
      data-scene-ready={sceneDrawn}
      data-reduced-motion={settings.reducedMotion}
      style={
        {
          '--tqw-run': runViewports,
          '--tqw-seam-ms': `${seamMs}ms`,
          '--tqw-poster-ms': `${settings.reducedMotion ? SPINE_TIMING.dissolveMs : 400}ms`,
        } as CSSProperties
      }
    >
      <a className="tqw-skip" href="#game" onClick={skipToGame}>
        {MENU_COPY.skip}
      </a>

      {/*
        The journey: the hero, the smoke run and the game window's slot flow in one column, and the
        game window (sticky, pinned) shares their cell, so the world shows behind the hero and the
        run, and its slot is always the journey's last viewport, whatever the hero's height.
      */}
      <div className="tqw-journey">
        <div className="tqw-journey__flow">
          <Hero
              menu={menu('hero')}
              details={details}
              onScrollCue={scrollCue}
              onEnter={enterGame}
              text={textMode}
              progress={progress}
              keyframes={SITE_SCROLL.veil}
              reducedMotion={settings.reducedMotion}
            />
          {textMode ? null : <div className="tqw-run" aria-hidden="true" />}
          {textMode ? null : <div className="tqw-slot" aria-hidden="true" />}
        </div>

        <GameWindow
          progress={progress}
          engaged={holding}
          location={locationLine(state)}
          onReturn={inChamber ? leave : undefined}
          onEnter={enterGame}
          onLeave={leaveWindow}
          onOpenMenu={openMenu}
          sound={soundControl}
          onFullscreenChange={(active) => {
            if (!active) release();
          }}
          text={textMode}
          veil={
            textMode ? null : (
              <SmokeVeil
                progress={progress}
                keyframes={SITE_SCROLL.veil}
                reducedMotion={settings.reducedMotion}
                ready={sceneDrawn}
                loadingDelayMs={SITE_SCROLL.loadingDelayMs}
              />
            )
          }
        >
          {showCorridor ? (
            textMode ? (
              <TextCorridor doors={doors} onOpenBoard={openBoard} notice={corridorNotice} />
            ) : (
              <>
                <SceneBoundary fallback={null} onError={onSceneError}>
                  <Suspense fallback={null}>
                    <CorridorScene
                      spine={spine}
                      progress={progress}
                      reducedMotion={settings.reducedMotion}
                      readyChamber={readyChamber}
                      onDoorIntent={doorIntent}
                      onSeam={onSeam}
                      onWalk={(mps) => sound.setWalk(mps)}
                      onContextLost={onContextLost}
                      onGesture={unlockSound}
                      engaged={holding}
                      onEngageRequest={enterGame}
                    />
                  </Suspense>
                </SceneBoundary>
                {showPoster ? (
                  <Poster landscape="/poster-hero-1440x900.webp" portrait="/poster-hero-412x915.webp" ready={sceneDrawn} onGone={() => setPosterGone(true)} />
                ) : null}
                {state.phase === 'corridor' ? (
                  // Keyboard doors are the world's actions: inert until the window is engaged.
                  <div className="tqw-corridor" inert={!holding}>
                    <main>
                      <h1 className="tqw-visually-hidden">The corridor</h1>
                      <DoorList {...doors} variant="overlay" />
                    </main>
                  </div>
                ) : null}
              </>
            )
          ) : null}

          {Chamber ? (
            <ChamberHost
              chamber={state.chamber ?? ''}
              hold={!textMode}
              inert={!holding && !textMode}
              seam={state.phase !== 'threshold' || seamReached}
              onReady={onChamberReady}
            >
              {(ready) => (
                <Suspense fallback={null}>
                  <Chamber
                    settings={settings}
                    text={textReason ? { reason: textReason, retry: textReason === 'contextLost' ? retry3D : undefined } : null}
                    sound={sound}
                    caption={caption}
                    discoveries={discoveries}
                    onReady={ready}
                    onLeave={leave}
                    onContextLost={onContextLost}
                    onSceneError={onSceneError}
                  />
                </Suspense>
              )}
            </ChamberHost>
          ) : null}
        </GameWindow>
      </div>

      <Unlocks store={discoveries} chambers={VISIBLE_CHAMBERS} onReplaced={session.rebaseline} />
      <Details onOpenPage={openPage} />
      <Footer menu={menu('footer')} onOpenPage={openPage} onOpenMenu={openMenu} trivia={trivia} />

      {settings.captions ? <Captions lines={captions} /> : null}
      <MenuPanel
        open={menuOpen}
        settings={fullSettings}
        onToggle={toggle}
        canLeaveTextMode={webgl}
        inChamber={inChamber}
        onReturnToCorridor={leave}
        onBackToEntrance={backToEntrance}
        onOpenBoard={openBoard}
        onOpenPage={openPage}
        onClose={closeMenu}
      />
      <NoticeBoard open={state.boardOpen} chambers={VISIBLE_CHAMBERS} onChoose={chooseClipping} onClose={closeBoard} />
      {state.page ? (
        <SitePage
          page={state.page}
          authorUrl={SITE.authorUrl}
          thirdParty={THIRD_PARTY_CREDITS}
          onClose={closePage}
          onNavigate={openPage}
          onOpenBoard={() => {
            closePage();
            openBoard();
          }}
        />
      ) : null}
    </div>
  );
}
