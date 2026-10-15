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
import { escapeReleases, progressAt, scrollAction } from './pageScroll.ts';
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

  // Follow the OS reduced-motion preference live, unless the visitor has toggled it here.
  const motionOverridden = useRef(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (!motionOverridden.current) setSettings((s) => ({ ...s, reducedMotion: query.matches }));
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const caption = useCallback((text: string) => {
    captionId.current += 1;
    const line = { id: captionId.current, text };
    setCaptions((lines) => [...lines, line].slice(-MAX_CAPTIONS));
    window.setTimeout(() => setCaptions((lines) => lines.filter((l) => l.id !== line.id)), CAPTION_LIFETIME_MS);
  }, []);

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
  // Mirrors threshold.current.seam for rendering: a chamber walked into mounts only once the
  // visitor stands in the doorway, so its heavy first mount never lands mid-walk.
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
          setSeamReached(seam);
          if (!textModeRef.current) {
            window.scrollTo(0, gameTop());
            setEngaged(true);
          }
        }
        lastPhase.current = next.phase;
      }),
    [spine],
  );

  useEffect(
    () =>
      spine.onCue((cue) => {
        sound.playSpine(cue);
        const line = SPINE_CAPTIONS[cue.type];
        if (line) caption(line);
      }),
    [spine, sound, caption],
  );

  useEffect(() => {
    if (state.phase !== 'threshold' || threshold.current.seam) return;
    const timer = window.setTimeout(() => {
      threshold.current.seam = true;
      setSeamReached(true);
      completeIfDone();
    }, SEAM_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.chamber, completeIfDone]);

  const onSeam = useCallback(() => {
    threshold.current.seam = true;
    setSeamReached(true);
    completeIfDone();
  }, [completeIfDone]);
  const onChamberReady = useCallback(() => {
    threshold.current.ready = true;
    completeIfDone();
  }, [completeIfDone]);

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

  // Native scroll writes the progress (no scroll-jacking, no snapping) and carries the spine:
  // reaching the game window's top hands over to the corridor; scrolling back above it, while not
  // engaged, returns to the entrance. Holding the window (engaged) pins the page, so nothing here
  // moves the visitor.
  useEffect(() => {
    if (textMode) return;
    const onScroll = () => {
      const top = gameTop();
      if (top <= 0) return;
      const y = window.scrollY;
      progress.set(progressAt(y, top));
      const action = scrollAction({ y, top, phase: spine.getState().phase, engaged: engagedRef.current });
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

  // While engaged the page does not scroll: it is held at the game window.
  useEffect(() => {
    if (!holding) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [holding]);

  // While the window is only resting, the wheel and the walking keys are the page's, whatever the scene does.
  useRestingInputGate(engaged, !textMode);

  /** Browser fullscreen was left (by any route): the window no longer holds the page. */
  const release = useCallback(() => setEngaged(false), []);
  /** Leave, or Escape: hand scrolling back, and come out of fullscreen if that is where the visitor is. */
  const leaveWindow = useCallback(() => {
    setEngaged(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

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
      if (key === 'reducedMotion') motionOverridden.current = true;
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
    [webgl, settings.muted, sound],
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
  const mountChamber = inChamber && (state.phase === 'chamber' || seamReached);
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
            <ChamberHost chamber={state.chamber ?? ''} hold={!textMode} inert={!holding && !textMode} onReady={onChamberReady}>
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
      <Footer menu={menu('footer')} onOpenPage={openPage} trivia={trivia} />

      {settings.captions ? <Captions lines={captions} /> : null}
      <MenuPanel
        open={menuOpen}
        settings={fullSettings}
        onToggle={toggle}
        canLeaveTextMode={webgl}
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
