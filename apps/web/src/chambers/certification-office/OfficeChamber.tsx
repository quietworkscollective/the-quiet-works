import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  OFFICE_LEGIBILITY,
  CAPTION_REPLY_SAGGING,
  CAPTIONS,
  createCertificationStore,
  createOfficeStore,
  createOfficeArchive,
  parseSealedFile,
  type OfficeArchive,
  type OfficeItemId,
  OFFICE_OBJECTS,
  type OfficeObjectId,
  type OfficeStore,
  type MemoSource,
  MEMO_001,
  STILLNESS_MS,
  TEXT_MODE_NOTICE,
  type CertificationStore,
  type Cue,
} from '@tqw/engine';
import { OfficeApplicationReadout, MachineReadout, MemoButton, MemoDialog, OfficeObjects, StampButton, StampOptions, TextOffice, useCertification, type ImpressionPosition } from '@tqw/ui';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';

import type { OfficeCue } from './scene/ContextualCue.tsx';
import { VIEWPOINTS, type Viewpoint, createNavigation } from './scene/navigation.ts';

import sealedOffice from '../../../../../packages/engine/src/sealed/certification-office.sealed.json';

const OfficeScene = lazy(() => import('./scene/OfficeScene.tsx'));
const ignoreSceneFocus = () => {};
const hasCoarsePointer = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const stationControlStyle: CSSProperties = {
  position: 'absolute', right: 'max(16px, env(safe-area-inset-right))', top: '50%', transform: 'translateY(-50%)',
  display: 'flex', flexDirection: 'column', gap: 12, zIndex: 12,
};
const stationButtonStyle: CSSProperties = {
  appearance: 'none', display: 'grid', placeItems: 'center', width: 56, height: 56, padding: 0, borderRadius: '50%',
  border: '1.5px solid color-mix(in srgb, #ddd5c8 70%, transparent)', background: 'color-mix(in srgb, #151a20 62%, transparent)',
  color: '#ddd5c8', touchAction: 'none', WebkitTapHighlightColor: 'transparent',
};

/**
 * The office keeps its state for the whole visit: leaving through the door and coming back finds
 * the forms as they were. "Start over" is the only reset. Nothing is stored beyond the page.
 */
let visitStore: CertificationStore | null = null;
let visitObjects: OfficeStore | null = null;
let visitArchive: OfficeArchive | null = null;
let visitCounterSource: MemoSource | null = null;
let visitShadow = false;
function archiveForVisit(): OfficeArchive { visitArchive ??= createOfficeArchive(parseSealedFile(sealedOffice)); return visitArchive; }
function objectsForVisit(): OfficeStore { visitObjects ??= createOfficeStore(); return visitObjects; }
const OBJECT_STATIONS: Record<OfficeObjectId, Viewpoint> = {
  press: 'desk', 'ink-pad': 'ink', machine: 'machine', lamp: 'lamp', drawer: 'drawer',
  'tiny-stamp': 'underside', register: 'records', window: 'window', bell: 'bell',
  sign: 'exit', 'side-door': 'exit', 'service-panel': 'service', chair: 'window',
  stack: 'stack', clock: 'clock', conduit: 'maintenance', 'routing-tray': 'records', 'coat-hook': 'hook',
};
function officeStore(): CertificationStore {
  visitStore ??= createCertificationStore();
  return visitStore;
}

function captionFor(cue: Cue): string | null {
  if (cue.type === 'reply' && cue.step >= 3) return CAPTION_REPLY_SAGGING;
  return CAPTIONS[cue.type];
}

/** The Certification Office (TQW-001), the first chamber behind the corridor's first open door. */
export default function OfficeChamber(props: ChamberProps) {
  const { settings, text, sound, caption, onReady, onContextLost, onSceneError, onLeave } = props;
  const [roomReady, setRoomReady] = useState(text !== null);
  const [store] = useState(officeStore);
  const state = useCertification(store);
  const [office] = useState(objectsForVisit);
  const [archive] = useState(archiveForVisit);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState);
  const objects = useSyncExternalStore(office.subscribe, office.getState);
  useEffect(() => {
    for (const [id, token] of Object.entries(objects.discoveries)) {
      void archive.open(id as OfficeItemId, token);
    }
  }, [archive, objects.discoveries]);
  const [shadow, setShadow] = useState(visitShadow);
  const [counterSource, setCounterSource] = useState<MemoSource | null>(() => visitCounterSource ?? store.getState().memo.source);
  const [counterOpen, setCounterOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [touchDevice, setTouchDevice] = useState(hasCoarsePointer);
  const [cue, setCue] = useState<OfficeCue | null>(null);
  const [freshForPress, setFreshForPress] = useState(false);
  const [framed, setFramed] = useState<OfficeObjectId | null>(null);
  const [focused, setFocused] = useState<OfficeObjectId | null>(null);
  const [position, setPosition] = useState<ImpressionPosition>('centre');
  const [navigation] = useState(createNavigation);
  const station = useSyncExternalStore(navigation.subscribe, () => navigation.station);
  const approach = useCallback(() => {
    if (navigation.station !== 'desk') navigation.approach('desk', text !== null || settings.reducedMotion);
  }, [navigation, text, settings.reducedMotion]);
  const unlockSound = useCallback(() => sound.unlock(), [sound]);
  const textMode = text !== null;
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setTouchDevice(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { navigation.setReducedMotion(textMode || settings.reducedMotion); }, [navigation, settings.reducedMotion, textMode]);

  // Cues drive sound and captions; neither has authority over state.
  const captionRef = useRef(caption);
  useEffect(() => {
    captionRef.current = caption;
  });
  useEffect(
    () =>
      store.onCue((cue) => {
        sound.play(cue);
        if (cue.type === 'memo-revealed') {
          visitCounterSource = cue.source;
          setCounterSource(cue.source);
        }
        const line = captionFor(cue);
        if (line !== null) captionRef.current(line);
      }),
    [store, sound],
  );

  // Text mode is ready as soon as it is mounted; the 3D view reports its first frame itself.
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  useEffect(() => {
    if (textMode) readyRef.current();
  }, [textMode]);

  const wait = useCallback((gesture = false) => {
    if (store.getState().processing || shadow) return;
    if (gesture) sound.unlock();
    const known = store.getState().memo.revealed;
    store.dispatch({ type: 'STILLNESS' });
    if (known) sound.play({ type: 'stillness' });
    visitShadow = true; setShadow(true);
    office.pause();
    const token = office.getState().discoveries['office-10'];
    if (token) void archive.open('office-10', token).then(opened => {
      const line = opened?.item.body[0];
      if (line) captionRef.current(line);
    });
  }, [store, sound, shadow, office, archive]);
  useEffect(() => {
    if ((!roomReady && !textMode) || state.processing || shadow) return;
    const timer = window.setTimeout(wait, STILLNESS_MS);
    return () => window.clearTimeout(timer);
  }, [wait, state.stamps, state.processing, shadow, roomReady, textMode]);
  // HTML has no pending scene animation: its committed reply is the completed response.
  useEffect(() => {
    if (textMode && state.processing && !state.pressing) store.dispatch({ type: 'RESPONSE_SETTLED', step: state.stamps });
  }, [store, textMode, state.processing, state.pressing, state.stamps]);
  useEffect(() => {
    let previous = office.getState().response;
    return office.subscribe(() => {
      const response = office.getState().response;
      if (response === null || response === previous) return;
      previous = response;
      if (response.id !== 'chair') { sound.unlock(); sound.play({ type: 'object', kind: response.soundKind }); }
      captionRef.current(response.caption);
    });
  }, [office, sound]);
  useEffect(() => () => { office.readMemo(null); store.dispatch({ type: 'CLOSE_MEMO' }); }, [office, store]);

  // A held stamp must never stick: losing focus or visibility lifts it.
  const liftHeldStamp = useCallback(() => {
    if (store.getState().pressing) store.dispatch({ type: 'RELEASE' });
  }, [store]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) liftHeldStamp();
    };
    window.addEventListener('blur', liftHeldStamp);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', liftHeldStamp);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [liftHeldStamp]);

  // The scene's pointer handlers die with it; a stamp held through a context loss, a switch to
  // text mode or leaving the chamber must lift, or the press would stay stuck in the store.
  useEffect(() => liftHeldStamp, [liftHeldStamp, textMode]);

  const physicalPressStart = useCallback(() => {
    sound.unlock();
    setFreshForPress(office.getState().freshInk);
    office.useInk();
    store.dispatch({ type: 'PRESS' });
  }, [store, sound, office]);
  const pressStart = useCallback(() => {
    approach(); physicalPressStart();
  }, [approach, physicalPressStart]);

  const pressEnd = useCallback(() => {
    // Touch input only grants audio activation on pointerup, so unlock again here.
    sound.unlock();
    store.dispatch({ type: 'RELEASE' });
  }, [store, sound]);

  const openMemo = useCallback(() => {
    if (store.getState().memo.revealed) store.dispatch({ type: 'OPEN_MEMO' });
    else if (counterSource !== null) setCounterOpen(true);
  }, [store, counterSource]);
  const closeMemo = useCallback(() => { setCounterOpen(false); store.dispatch({ type: 'CLOSE_MEMO' }); }, [store]);
  const reset = useCallback(() => store.dispatch({ type: 'RESET' }), [store]);

  const lost = useCallback(() => {
    liftHeldStamp();
    onContextLost();
  }, [liftHeldStamp, onContextLost]);
  const failed = useCallback(() => {
    liftHeldStamp();
    onSceneError();
  }, [liftHeldStamp, onSceneError]);
  const ready = useCallback(() => { setRoomReady(true); readyRef.current(); }, []);

  const memoButton = state.memo.revealed || counterSource !== null ? <MemoButton onOpen={openMemo} /> : null;

  const leave = useCallback((route: 'entrance' | 'side' | 'service') => {
    if (route === 'service' && store.getState().phase !== 'overloaded') return;
    liftHeldStamp(); sound.unlock(); sound.play({ type: 'object', kind: 'metal' });
    onLeave();
  }, [store, liftHeldStamp, sound, onLeave]);
  const operate = useCallback((id: OfficeObjectId) => {
    setInspectionOpen(true);
    office.inspect(id, store.getState().stamps);
    if (!textMode && id === 'side-door') leave('side');
    if (!textMode && id === 'service-panel' && store.getState().phase === 'overloaded') leave('service');
  }, [office, store, textMode, leave]);
  const inspect = useCallback((id: OfficeObjectId) => {
    setFramed(id);
    const point = OBJECT_STATIONS[id];
    const destination = VIEWPOINTS[point];
    const distance = Math.hypot(navigation.pose.x - destination.x, navigation.pose.z - destination.z);
    if (!textMode && (navigation.moving || distance > .3)) {
      navigation.approach(point, settings.reducedMotion);
      return;
    }
    operate(id);
  }, [navigation, textMode, settings.reducedMotion, operate]);
  const entrance = useCallback(() => {
    if (Math.hypot(navigation.pose.x, navigation.pose.z - .8) > .3) navigation.approach('arrival', settings.reducedMotion);
    else leave('entrance');
  }, [navigation, settings.reducedMotion, leave]);
  const selected = OFFICE_OBJECTS.find(object => object.id === objects.response?.id);

  return (
    <div
      ref={appRef}
      className="tqw-app"
      data-station={station}
      data-places={placesOpen}
      data-object={selected?.id ?? ''}
      data-kept={objects.kept.join(',')}
      data-documents={objects.discoveredMemos.join(',')}
      data-opened={Object.keys(opened).join(',')}
      data-shadow={shadow}
      data-mode={textMode ? 'text' : '3d'}
      data-stamps={state.stamps}
      data-phase={state.phase}
      data-pressing={state.pressing}
      data-processing={state.processing}
      data-memo={state.memo.revealed ? (state.memo.source ?? '') : 'hidden'}
      data-muted={settings.muted}
      data-reduced-motion={settings.reducedMotion}
    >
      {textMode ? (
        <main className="tqw-text">
          <TextOffice
            state={state}
            impressionPosition={position}
            notice={TEXT_MODE_NOTICE[text.reason]}
            noticeAction={
              text.retry ? (
                <button type="button" className="tqw-link-button" onClick={text.retry}>
                  Try the 3D view again
                </button>
              ) : undefined
            }
            reducedMotion={settings.reducedMotion}
            onPressStart={pressStart}
            onPressEnd={pressEnd}
            onOpenMemo={openMemo}
            onReset={reset}
          />
        </main>
      ) : (
        <main className="tqw-stage">
          <h1 className="tqw-visually-hidden">The Certification Office</h1>
          <SceneBoundary fallback={null} onError={failed}>
            <Suspense fallback={<div className="tqw-stage__loading" aria-hidden="true" />}>
              <OfficeScene
                store={store}
                selectedPosition={position}
                onSelectPosition={setPosition}
                navigation={navigation}
                office={office}
                archive={archive}
                shadow={shadow}
                freshInk={freshForPress}
                onInspect={inspect}
                onFocusObject={ignoreSceneFocus}
                focusedObject={focused}
                framedObject={framed}
                onCue={setCue}
                onEntrance={entrance}
                reducedMotion={settings.reducedMotion}
                onGesture={unlockSound}
                onPressStart={physicalPressStart}
                onPressEnd={pressEnd}
                onContextLost={lost}
                onReady={ready}
              />
            </Suspense>
          </SceneBoundary>
          <div className="tqw-visually-hidden"><MachineReadout state={state} visible /><OfficeApplicationReadout stamps={state.stamps} /></div>
          {touchDevice ? <div data-fp-ignore role="group" aria-label="Office stations" style={stationControlStyle}>
            <button type="button" aria-label="Next view" style={stationButtonStyle} onClick={() => navigation.stepViewpoint(1)}>
              <span aria-hidden="true">⌄</span>
            </button>
            <button type="button" aria-label="Previous view" style={stationButtonStyle} onClick={() => navigation.stepViewpoint(-1)}>
              <span aria-hidden="true">⌃</span>
            </button>
          </div> : null}
          {cue && (!placesOpen || cue.focused) ? <div data-fp-ignore className="tqw-context-cue" data-focused={cue.focused} data-side={cue.side}
            style={{ left: cue.x, top: cue.y }}>
            <button type="button" onFocus={() => setFocused(cue.id)} onBlur={() => setFocused(null)}
              onClick={() => { if (cue.id === 'press') { if (station === 'desk') { pressStart(); pressEnd(); } else approach(); } else operate(cue.id); }}>
              {cue.id === 'press' ? (station === 'desk' ? OFFICE_LEGIBILITY.submit : 'Approach the desk') :
                cue.id === 'side-door' && (shadow || state.phase === 'overloaded') ? OFFICE_LEGIBILITY.leave :
                (() => { const object = OFFICE_OBJECTS.find(object => object.id === cue.id); return objects.uses[cue.id] > 0 ? object?.repeatActions?.[objects.variants[cue.id]] ?? object?.repeatActions?.[0] ?? object?.action : object?.action; })()}
            </button>
          </div> : null}
        </main>
      )}
      <details data-fp-ignore className="tqw-places" onToggle={event => setPlacesOpen(event.currentTarget.open)}>
        <summary>Places and actions</summary>
        <div className="tqw-places__content" onWheel={event => event.stopPropagation()}>
          <nav aria-label="Office movement">
            <button type="button" onFocus={() => setFocused('press')} onBlur={() => setFocused(null)} onClick={approach}>Approach the desk</button>
            <button type="button" onClick={() => navigation.stepBack()}>Previous station</button>
            <button type="button" onClick={() => navigation.approach('certificate', settings.reducedMotion)}>View the certificate</button>
            {state.stamps >= 5 ? <button type="button" onClick={() => navigation.approach(window.innerHeight > window.innerWidth ? 'reveal-wide' : 'reveal', settings.reducedMotion)}>View the officer’s window</button> : null}
            <button type="button" onClick={() => navigation.approach('window', settings.reducedMotion)}>View the window</button>
            <button type="button" onClick={() => navigation.approach(window.innerHeight > window.innerWidth ? 'application-wide' : 'application', settings.reducedMotion)}>View the application board</button>
            <button type="button" onClick={() => navigation.approach('records', settings.reducedMotion)}>View the records</button>
            <button type="button" onClick={() => navigation.approach('arrival', settings.reducedMotion)}>View the entrance</button>
            <button type="button" onClick={() => navigation.approach('exit', settings.reducedMotion)}>View the side exit</button>
          </nav>
          <p>Stations: W / S or ↑ / ↓; phone: swipe. Look: A / D, ← / →, or drag.</p>
          {!textMode ? memoButton : null}
          {!textMode && state.stamps > 0 ? <button type="button" onClick={reset}>Start over</button> : null}
          <aside className="tqw-office-exploration" data-inspection={inspectionOpen} data-exits="true">
            <OfficeObjects store={office} archive={archive} stamps={state.stamps} overloaded={state.phase === 'overloaded'} stillness={shadow}
              onInspect={inspect} onFocus={setFocused} showStampAction={false} onStampOnce={() => { pressStart(); pressEnd(); }} onWait={() => wait(true)} onExit={leave} onReadCounterMemo={openMemo} />
            {selected ? <button type="button" onClick={() => setInspectionOpen(!inspectionOpen)}>{inspectionOpen ? 'Close inspection' : 'Show inspection'}</button> : null}
            <button type="button" onClick={reset}>Reset the apparatus</button>
            {objects.kept.length > 0 ? <details><summary>Copies kept for this visit</summary><ul>{objects.kept.map(id => <li key={id}>{opened[id]?.item.title ?? 'Copy'}</li>)}</ul></details> : null}
          </aside>
        </div>
      </details>
      {!textMode ? <div data-fp-ignore className="tqw-desk-actions" data-revealed={station === 'desk' || placesOpen}
        onFocus={() => setFocused('press')} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); }}>
        <StampButton pressing={state.pressing} onPressStart={pressStart} onPressEnd={pressEnd} variant="dock" />
        <div className="tqw-desk-options" data-at-desk={station === 'desk'}><StampOptions position={position} pressing={state.pressing} onPosition={setPosition} onOnce={() => { pressStart(); pressEnd(); }} /></div>
      </div> : <StampOptions position={position} pressing={state.pressing} onPosition={setPosition} onOnce={() => { pressStart(); pressEnd(); }} />}
      {textMode && !state.memo.revealed && counterSource !== null ? <div className="tqw-counter-archive">{memoButton}</div> : null}
      <MemoDialog memo={MEMO_001} source={state.memo.source ?? counterSource} open={state.memo.open || counterOpen} onClose={closeMemo} />
    </div>
  );
}
