import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ARCHIVE_COPY,
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
  OFFICE_PLAY_FINDINGS,
  OFFICE_PLAY_HINTS,
  restoreOfficePlayStep,
  OFFICE_PLAY_EVIDENCE,
  type OfficeEvidenceId,
  type OfficeObjectId,
  type OfficePlayStep,
  type OfficeStore,
  type MemoSource,
  MEMO_001,
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
const MEMO_FILED_CAPTION = '[Paper slips into the archive]';
const OPTIONAL_EVIDENCE_BY_OBJECT: Partial<Record<OfficeObjectId, OfficeEvidenceId>> = {
  'routing-tray': 'routing-slips', register: 'register', conduit: 'conduit',
};
const hasCoarsePointer = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
/**
 * The office keeps its state for the whole visit: leaving through the door and coming back finds
 * the forms as they were. "Start over" is the only reset. Nothing is stored beyond the page.
 */
let visitStore: CertificationStore | null = null;
let visitObjects: OfficeStore | null = null;
let visitArchive: OfficeArchive | null = null;
let visitCounterSource: MemoSource | null = null;
function archiveForVisit(): OfficeArchive { visitArchive ??= createOfficeArchive(parseSealedFile(sealedOffice)); return visitArchive; }
function objectsForVisit(): OfficeStore { visitObjects ??= createOfficeStore(); return visitObjects; }
const OBJECT_STATIONS: Record<OfficeObjectId, Viewpoint> = {
  press: 'desk', 'ink-pad': 'ink', machine: 'machine-detail', lamp: 'lamp', drawer: 'drawer',
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
  const { settings, text, sound, caption, discoveries, onReady, onContextLost, onSceneError, onLeave } = props;
  const [store] = useState(officeStore);
  const state = useCertification(store);
  const [office] = useState(objectsForVisit);
  const [archive] = useState(archiveForVisit);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState);
  const objects = useSyncExternalStore(office.subscribe, office.getState);
  const [archiveAck, setArchiveAck] = useState<{ title: string; stored: boolean } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const idleTaps = useRef({ step: store.getState().playStep, count: 0 });
  const acceptedPress = useRef(false);
  const pressStartedMoving = useRef(false);
  const [optionalEvidence, setOptionalEvidence] = useState<OfficeEvidenceId | null>(null);
  useEffect(() => {
    for (const [id, token] of Object.entries(objects.discoveries)) {
      void archive.open(id as OfficeItemId, token);
    }
  }, [archive, objects.discoveries]);
  const shadow = false;
  const [counterSource, setCounterSource] = useState<MemoSource | null>(() => visitCounterSource ?? store.getState().memo.source);
  const [counterOpen, setCounterOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [touchDevice, setTouchDevice] = useState(hasCoarsePointer);
  const [cue, setCue] = useState<OfficeCue | null>(null);
  const [responseCue, setResponseCue] = useState<{ id: OfficeObjectId; text: string } | null>(null);
  const [freshForPress, setFreshForPress] = useState(false);
  const [framed, setFramed] = useState<OfficeObjectId | null>(null);
  const [focused, setFocused] = useState<OfficeObjectId | null>(null);
  const [position, setPosition] = useState<ImpressionPosition>('centre');
  const [navigation] = useState(createNavigation);
  const station = useSyncExternalStore(navigation.subscribe, () => navigation.station);
  const navigationMoving = useSyncExternalStore(navigation.subscribe, () => navigation.moving);
  const pendingInspections = useRef<Array<{ id: OfficeObjectId; point: Viewpoint }>>([]);
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

  // The archive is the durable record for this authored chain. A fresh app visit reconstructs its
  // furthest physical state from findings; a state already advanced in this visit is never rolled back.
  useEffect(() => {
    const restored = restoreOfficePlayStep(discoveries?.getState().found['certification-office'] ?? []);
    const rank = { ready: 0, refused: 1, 'drawer-open': 2, 'inspection-recorded': 3, resolved: 4 } as const;
    if (rank[restored] > rank[store.getState().playStep]) store.dispatch({ type: 'RESTORE_PLAY', step: restored });
    idleTaps.current = { step: store.getState().playStep, count: 0 };
  }, [discoveries, store]);

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

  // HTML has no pending scene animation: its committed reply is the completed response.
  useEffect(() => {
    if (textMode && state.processing && !state.pressing) store.dispatch({ type: 'RESPONSE_SETTLED', step: state.stamps });
  }, [store, textMode, state.processing, state.pressing, state.stamps]);
  useEffect(() => {
    let previous = office.getState().response;
    let reset: number | undefined;
    const unsubscribe = office.subscribe(() => {
      const response = office.getState().response;
      if (response === null || response === previous) return;
      previous = response;
      sound.unlock();
      sound.play({ type: 'object', kind: response.soundKind });
      captionRef.current(response.caption);
      const shown = { id: response.id, text: response.caption };
      setResponseCue(shown);
      if (reset !== undefined) window.clearTimeout(reset);
      reset = window.setTimeout(() => setResponseCue(current => current === shown ? null : current), 1400);
    });
    return () => { unsubscribe(); if (reset !== undefined) window.clearTimeout(reset); };
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

  const physicalPressStart = useCallback((wasMoving = navigation.moving) => {
    const current = store.getState();
    acceptedPress.current = !current.pressing && !current.processing;
    pressStartedMoving.current = wasMoving;
    sound.unlock();
    setFreshForPress(office.getState().freshInk);
    office.useInk();
    store.dispatch({ type: 'PRESS' });
  }, [store, sound, office, navigation]);
  const pressStart = useCallback(() => {
    const wasMoving = navigation.moving;
    approach(); physicalPressStart(wasMoving);
  }, [approach, physicalPressStart, navigation]);

  const recordFindings = useCallback((findings: readonly (typeof OFFICE_PLAY_FINDINGS)[keyof typeof OFFICE_PLAY_FINDINGS][]) => {
    findings.forEach(finding => discoveries?.record('certification-office', finding));
    return findings.every(finding => discoveries?.isStored('certification-office', finding.id) ?? false);
  }, [discoveries]);

  const clearHint = useCallback((step: OfficePlayStep) => {
    idleTaps.current = { step, count: 0 };
    setHint(null);
  }, []);

  const recordIdleTap = useCallback((acceptedBeforeResponse = false) => {
    const current = store.getState();
    if (current.playStep === 'resolved' || (!acceptedBeforeResponse && current.processing) || navigation.moving) return;
    if (idleTaps.current.step !== current.playStep) idleTaps.current = { step: current.playStep, count: 0 };
    idleTaps.current.count += 1;
    const rung = Math.floor(idleTaps.current.count / 3);
    if (rung > 0) setHint(OFFICE_PLAY_HINTS[current.playStep][Math.min(rung, 3) - 1] ?? null);
  }, [navigation, store]);

  const pressEnd = useCallback(() => {
    // Touch input only grants audio activation on pointerup, so unlock again here.
    sound.unlock();
    const wasAccepted = acceptedPress.current;
    acceptedPress.current = false;
    const before = store.getState().playStep;
    const firstPress = wasAccepted && before === 'ready';
    store.dispatch({ type: 'RELEASE' });
    if (firstPress && store.getState().playStep === 'refused') {
      clearHint('refused');
      const finding = OFFICE_PLAY_FINDINGS.applicationReceipt;
      setArchiveAck({ title: finding.title, stored: recordFindings([finding]) });
    } else if (wasAccepted && before !== 'resolved' && !pressStartedMoving.current) recordIdleTap(true);
    pressStartedMoving.current = false;
  }, [store, sound, recordFindings, recordIdleTap, clearHint]);

  const openMemo = useCallback(() => {
    if (store.getState().memo.revealed) {
      store.dispatch({ type: 'OPEN_MEMO' });
      const finding = OFFICE_PLAY_FINDINGS.memo;
      setArchiveAck({ title: finding.title, stored: recordFindings([finding]) });
    }
    else if (counterSource !== null) setCounterOpen(true);
  }, [store, counterSource, recordFindings]);
  const readMemo = useCallback((id: OfficeItemId) => {
    const item = archive.getState()[id]?.item;
    if (!item) return;
    const title = item.title ?? ARCHIVE_COPY.kinds[item.kind];
    const finding = { id: item.id, kind: item.kind, ...(item.title === undefined ? {} : { title: item.title }) } as const;
    discoveries?.record('certification-office', finding);
    setArchiveAck({ title, stored: discoveries?.isStored('certification-office', item.id) ?? false });
    sound.unlock();
    sound.play({ type: 'object', kind: 'paper' });
    captionRef.current(MEMO_FILED_CAPTION);
  }, [archive, discoveries, sound]);
  const closeMemo = useCallback(() => { setCounterOpen(false); store.dispatch({ type: 'CLOSE_MEMO' }); }, [store]);
  const reset = useCallback(() => {
    pendingInspections.current = [];
    store.dispatch({ type: 'RESET' });
    clearHint('ready');
  }, [store, clearHint]);

  const lost = useCallback(() => {
    liftHeldStamp();
    onContextLost();
  }, [liftHeldStamp, onContextLost]);
  const failed = useCallback(() => {
    liftHeldStamp();
    onSceneError();
  }, [liftHeldStamp, onSceneError]);
  const ready = useCallback(() => { readyRef.current(); }, []);

  const memoButton = state.memo.revealed || counterSource !== null ? <MemoButton onOpen={openMemo} /> : null;

  const leave = useCallback((route: 'entrance' | 'side' | 'service') => {
    if (route === 'service' && store.getState().phase !== 'overloaded') return;
    liftHeldStamp(); sound.unlock(); sound.play({ type: 'object', kind: 'metal' });
    onLeave();
  }, [store, liftHeldStamp, sound, onLeave]);
  const operate = useCallback((id: OfficeObjectId) => {
    setInspectionOpen(true);
    const before = store.getState().playStep;
    const alreadyRead = office.getState().uses[id] > 0;
    office.inspect(id, store.getState().stamps, false);
    if (id === 'drawer' && before === 'refused') {
      store.dispatch({ type: 'DRAWER_OPENED' });
      const findings = [OFFICE_PLAY_FINDINGS.inspectionCopy, OFFICE_PLAY_FINDINGS.duckRequisition, OFFICE_PLAY_FINDINGS.queueTicket];
      const stored = recordFindings(findings);
      setArchiveAck({ title: OFFICE_PLAY_FINDINGS.inspectionCopy.title, stored });
    }
    if (id === 'tiny-stamp' && before === 'drawer-open') {
      store.dispatch({ type: 'INSPECTION_MARKED' });
      const findings = [OFFICE_PLAY_FINDINGS.inspectionStamp, OFFICE_PLAY_FINDINGS.markedCopy];
      const stored = recordFindings(findings);
      setArchiveAck({ title: OFFICE_PLAY_FINDINGS.inspectionStamp.title, stored });
    }
    if (id === 'machine' && before === 'inspection-recorded') {
      store.dispatch({ type: 'PULL_HATCH' });
      const findings = [OFFICE_PLAY_FINDINGS.emptyBay, OFFICE_PLAY_FINDINGS.memo, OFFICE_PLAY_FINDINGS.completion];
      const stored = recordFindings(findings);
      setArchiveAck({
        title: OFFICE_PLAY_FINDINGS.emptyBay.title,
        stored,
      });
    }
    const evidenceId = OPTIONAL_EVIDENCE_BY_OBJECT[id];
    if (evidenceId !== undefined) {
      setOptionalEvidence(evidenceId);
      const findings = evidenceId === 'routing-slips'
        ? [OFFICE_PLAY_FINDINGS.routingSlip, OFFICE_PLAY_FINDINGS.witnessSlip, OFFICE_PLAY_FINDINGS.unrequestedCopy]
        : evidenceId === 'register'
          ? [OFFICE_PLAY_FINDINGS.certificate, OFFICE_PLAY_FINDINGS.expiredApproval, OFFICE_PLAY_FINDINGS.chairRepair, OFFICE_PLAY_FINDINGS.induction]
          : [OFFICE_PLAY_FINDINGS.conduit];
      const stored = recordFindings(findings);
      const firstFinding = findings[0];
      if (firstFinding) setArchiveAck({ title: firstFinding.title, stored });
    }
    if (!textMode && id === 'side-door') leave('side');
    if (!textMode && id === 'service-panel' && store.getState().phase === 'overloaded') leave('service');
    const after = store.getState().playStep;
    const leaving = !textMode && (id === 'side-door' || (id === 'service-panel' && store.getState().phase === 'overloaded'));
    if (after !== before) clearHint(after);
    else if (alreadyRead && OPTIONAL_EVIDENCE_BY_OBJECT[id] === undefined && !leaving) recordIdleTap();
  }, [office, store, textMode, leave, recordFindings, clearHint, recordIdleTap]);
  const openEvidence = useCallback((id: OfficeEvidenceId) => {
    const object = id === 'routing-slips' ? 'routing-tray' : id === 'register' ? 'register' : 'conduit';
    if (!textMode) navigation.approach(OBJECT_STATIONS[object], settings.reducedMotion);
    operate(object);
  }, [navigation, operate, settings.reducedMotion, textMode]);
  const inspect = useCallback((id: OfficeObjectId) => {
    setFramed(id);
    const evidenceId = OPTIONAL_EVIDENCE_BY_OBJECT[id];
    if (evidenceId !== undefined) {
      openEvidence(evidenceId);
      return;
    }
    const point = OBJECT_STATIONS[id];
    const destination = VIEWPOINTS[point];
    const distance = Math.hypot(navigation.pose.x - destination.x, navigation.pose.z - destination.z);
    if (textMode) {
      operate(id);
      return;
    }
    if (settings.reducedMotion && (navigation.moving || distance > .3)) {
      navigation.approach(point, true);
      return;
    }
    const pending = pendingInspections.current;
    if (pending.some(action => action.id === id)) return;
    if (pending.length > 0 || navigation.moving || distance > .3) {
      pending.push({ id, point });
      if (pending.length === 1 && !navigation.moving) navigation.approach(point, settings.reducedMotion);
      return;
    }
    operate(id);
  }, [navigation, textMode, settings.reducedMotion, operate, openEvidence]);
  useEffect(() => {
    if (navigationMoving) return;
    const pending = pendingInspections.current;
    while (pending.length > 0) {
      const next = pending[0];
      if (!next) return;
      const destination = VIEWPOINTS[next.point];
      const distance = Math.hypot(navigation.pose.x - destination.x, navigation.pose.z - destination.z);
      if (navigation.station !== next.point || distance > .3) {
        navigation.approach(next.point, settings.reducedMotion);
        return;
      }
      pending.shift();
      operate(next.id);
    }
  }, [navigationMoving, station, navigation, settings.reducedMotion, operate]);
  const entrance = useCallback(() => {
    if (Math.hypot(navigation.pose.x, navigation.pose.z - .8) > .3) navigation.approach('arrival', settings.reducedMotion);
    else leave('entrance');
  }, [navigation, settings.reducedMotion, leave]);
  const selected = OFFICE_OBJECTS.find(object => object.id === objects.response?.id);
  const openEvidenceCopy = optionalEvidence === null ? null : OFFICE_PLAY_EVIDENCE[optionalEvidence];

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
      data-play-step={state.playStep}
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
            onOpenDrawer={() => operate('drawer')}
            onMarkInspection={() => operate('tiny-stamp')}
            onPullHatch={() => operate('machine')}
            archiveAck={archiveAck}
            hint={hint}
            onIdleTap={recordIdleTap}
            optionalEvidence={optionalEvidence}
            onOpenEvidence={openEvidence}
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
                onIdleTap={recordIdleTap}
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
          {cue && (!placesOpen || cue.focused) ? <div data-fp-ignore className="tqw-context-cue" data-focused={cue.focused} data-side={cue.side}
            style={{ left: cue.x, top: cue.y }}>
            <button type="button" onFocus={() => setFocused(cue.id)} onBlur={() => setFocused(null)}
              onClick={() => { if (cue.id === 'press') { if (station === 'desk') { pressStart(); pressEnd(); } else approach(); } else inspect(cue.id); }}>
              {responseCue?.id === cue.id ? responseCue.text : cue.id === 'press' ? (station === 'desk' ? OFFICE_LEGIBILITY.submit : 'Approach the desk') :
                cue.id === 'side-door' && (shadow || state.phase === 'overloaded') ? OFFICE_LEGIBILITY.leave :
                (() => {
                  if (cue.id === 'tiny-stamp' && state.playStep === 'drawer-open') return 'Mark inspection copy';
                  if (cue.id === 'machine' && state.playStep === 'inspection-recorded') return 'Pull hatch';
                  const object = OFFICE_OBJECTS.find(object => object.id === cue.id);
                  return objects.uses[cue.id] > 0 ? object?.repeatActions?.[objects.variants[cue.id]] ?? object?.repeatActions?.[0] ?? object?.action : object?.action;
                })()}
            </button>
          </div> : null}
          {openEvidenceCopy ? <section className="tqw-office-play-evidence" role="dialog" aria-label={openEvidenceCopy.title}>
            <button type="button" className="tqw-office-play-evidence__close" onClick={() => setOptionalEvidence(null)}>Close</button>
            <h2>{openEvidenceCopy.title}</h2>
            {archiveAck ? <div className="tqw-office-play-evidence__ack" aria-live="polite">
              <p>Found: {archiveAck.title}</p>
              <p>{archiveAck.stored ? 'Saved to Archive' : 'Found — available this visit'}</p>
            </div> : null}
            {openEvidenceCopy.lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
          </section> : null}
          {archiveAck && optionalEvidence === null ? <div className="tqw-office-play-archive-ack" aria-live="polite">
            <p>Found: {archiveAck.title}</p>
            <p>{archiveAck.stored ? 'Saved to Archive' : 'Found — available this visit'}</p>
          </div> : null}
          {hint ? <div className="tqw-office-play-hint" aria-live="polite">{hint}</div> : null}
        </main>
      )}
      {!textMode && touchDevice ? <div data-fp-ignore className="tqw-office-stations" role="group" aria-label="Office stations">
        <button type="button" className="tqw-office-stations__button" aria-label="Next view" onClick={() => navigation.stepViewpoint(1)}>
          <span aria-hidden="true">⌄</span>
        </button>
        <button type="button" className="tqw-office-stations__button" aria-label="Previous view" onClick={() => navigation.stepViewpoint(-1)}>
          <span aria-hidden="true">⌃</span>
        </button>
      </div> : null}
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
            <OfficeObjects store={office} archive={archive} stamps={state.stamps} playStep={state.playStep} overloaded={state.phase === 'overloaded'} stillness={shadow}
              onReadMemo={readMemo}
              onInspect={inspect} onFocus={setFocused} showStampAction={false} onStampOnce={() => { pressStart(); pressEnd(); }} onExit={leave} onReadCounterMemo={openMemo} />
            {selected ? <button type="button" onClick={() => setInspectionOpen(!inspectionOpen)}>{inspectionOpen ? 'Close inspection' : 'Show inspection'}</button> : null}
            <button type="button" onClick={reset}>Reset the apparatus</button>
            {objects.kept.length > 0 ? <details><summary>Copies kept for this visit</summary><ul>{objects.kept.map(id => <li key={id}>{opened[id]?.item.title ?? 'Copy'}</li>)}</ul></details> : null}
          </aside>
        </div>
      </details>
      {!textMode ? <div data-fp-ignore className="tqw-desk-actions" data-revealed="true"
        onFocus={() => setFocused('press')} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); }}>
        <StampButton pressing={state.pressing} onPressStart={pressStart} onPressEnd={pressEnd} variant="dock" />
        <button type="button" className="tqw-link-button" onClick={() => openEvidence('routing-slips')}>Read routing slip — The Exchange</button>
        <div className="tqw-desk-options" data-at-desk={station === 'desk'}><StampOptions position={position} pressing={state.pressing} onPosition={setPosition} onOnce={() => { pressStart(); pressEnd(); }} /></div>
      </div> : <StampOptions position={position} pressing={state.pressing} onPosition={setPosition} onOnce={() => { pressStart(); pressEnd(); }} />}
      {textMode && !state.memo.revealed && counterSource !== null ? <div className="tqw-counter-archive">{memoButton}</div> : null}
      <MemoDialog memo={MEMO_001} source={state.memo.source ?? counterSource} open={state.memo.open || counterOpen} onClose={closeMemo} />
    </div>
  );
}
