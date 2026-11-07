import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';
import type { DiscoveryState } from '@tqw/engine';
import {
  ACTION_LABELS,
  DOCUMENTS,
  JOINT_RECORD,
  ROOM_COPY,
  SOUND_CAPTIONS,
  TOMORROW_COMPLETION,
  TICKET_COPY,
  TOMORROW_FINDINGS,
  TOMORROW_FINDINGS_BY_ID,
  type TomorrowFinding,
} from './copy.ts';
import {
  createTomorrowEngineState,
  nextPrimaryAction,
  payloadForTomorrowEngine,
  transitionTomorrowEngine,
  type TomorrowAction,
  type TomorrowEngineEvent,
  type TomorrowEngineState,
  type TomorrowPhase,
} from './state.ts';
import { DEFAULT_STATION, STATIONS, type TomorrowStationId } from './stage.ts';
import './tomorrow-engine.css';

const TomorrowScene = lazy(() => import('./scene/TomorrowScene.tsx').then((module) => ({ default: module.TomorrowScene })));

type DocumentKey = keyof typeof DOCUMENTS | 'ticket' | 'joint';
type ReaderPanel = { kind: 'archive' } | { kind: 'document'; key: DocumentKey; title: string; allowJoint?: boolean };
type StationAction = { action: TomorrowAction; enabled: boolean; reason?: string };
type EarlyFeedback = { action: TomorrowAction; sequence: number };

const EMPTY_DISCOVERY_STATE: DiscoveryState = { version: 1, found: {}, recognitions: [] };
const EMPTY_SUBSCRIBE = () => () => {};
const stableEmptySnapshot = () => EMPTY_DISCOVERY_STATE;

const ACTION_FINDINGS: Partial<Record<TomorrowAction, readonly TomorrowFinding[]>> = {
  wind: [TOMORROW_FINDINGS.windingInstructions],
  'read-record': [TOMORROW_FINDINGS.movementRecord],
  withdraw: [TOMORROW_FINDINGS.dispatchTicket],
  'open-sleeve': [TOMORROW_FINDINGS.sleeveNote, TOMORROW_FINDINGS.unusedHour],
  'lift-stop-tab': [TOMORROW_FINDINGS.stopInspection, TOMORROW_FINDINGS.startingStopRubbing, TOMORROW_FINDINGS.wheelsFree],
  'turn-over': [TOMORROW_FINDINGS.carbonNote, TOMORROW_FINDINGS.returnPreprinted],
  'arrange-together': [TOMORROW_FINDINGS.jointRecord],
};

const FINDING_DOCUMENT: Readonly<Record<string, { key: DocumentKey; title: string }>> = {
  'winding-instructions': { key: 'winding-instructions', title: TOMORROW_FINDINGS.windingInstructions.title },
  'movement-record': { key: 'movement-record', title: TOMORROW_FINDINGS.movementRecord.title },
  'dispatch-ticket': { key: 'ticket', title: 'Dispatch ticket' },
  'sleeve-note': { key: 'sleeve', title: TOMORROW_FINDINGS.sleeveNote.title },
  'unused-hour': { key: 'sleeve', title: TOMORROW_FINDINGS.unusedHour.title },
  'stop-inspection': { key: 'stop', title: TOMORROW_FINDINGS.stopInspection.title },
  'starting-stop-rubbing': { key: 'stop', title: TOMORROW_FINDINGS.startingStopRubbing.title },
  'wheels-free': { key: 'stop', title: TOMORROW_FINDINGS.wheelsFree.title },
  'carbon-note': { key: 'carbon', title: TOMORROW_FINDINGS.carbonNote.title },
  'return-preprinted': { key: 'carbon', title: TOMORROW_FINDINGS.returnPreprinted.title },
  'joint-record': { key: 'joint', title: JOINT_RECORD.title },
};

const BASE_COPY: Readonly<Record<TomorrowPhase, string>> = {
  ready: 'THE TOMORROW ENGINE',
  wound: 'Movement record ready — date display.',
  'record-opened': 'Date advanced one day. Carriage displacement: zero. Brake released for use.',
  braked: 'Brake applied. Dispatch ticket available — service hatch.',
  withdrawn: 'The date advances; delivery still requires unavailable approval.',
};

const STATION_ACTIONS: Readonly<Record<TomorrowStationId, readonly [StationAction, StationAction]>> = {
  'winding-control': [
    { action: 'wind', enabled: true },
    { action: 'brake', enabled: true },
  ],
  'date-display': [
    { action: 'read-record', enabled: true },
    { action: 'read-instructions', enabled: true, reason: ROOM_COPY.unavailableAfterWind },
  ],
  carriage: [
    { action: 'open-sleeve', enabled: true },
    { action: 'lift-stop-tab', enabled: true },
  ],
  'service-hatch': [
    { action: 'withdraw', enabled: true },
    { action: 'read-ticket', enabled: true, reason: ROOM_COPY.unavailableAfterTicket },
  ],
};

const TEXT_EXAMINES: Readonly<Record<TomorrowStationId, readonly TomorrowAction[]>> = {
  'winding-control': ['examine-casing', 'examine-gearing', 'read-title', 'read-inscription', 'examine-linkage', 'examine-lamp'],
  'date-display': ['examine-gearing', 'examine-linkage', 'examine-paper-support'],
  carriage: ['examine-carriage', 'read-work-label', 'read-starting-mark', 'examine-paper-support'],
  'service-hatch': ['examine-linkage', 'examine-paper-support', 'examine-carriage'],
};

function isEarlyAttempt(action: TomorrowAction, phase: TomorrowPhase): boolean {
  if (action === 'read-record') return phase === 'ready';
  if (action === 'brake') return phase === 'ready' || phase === 'wound';
  return action === 'withdraw' && (phase === 'ready' || phase === 'wound' || phase === 'record-opened');
}

function actionSound(action: TomorrowAction, before: TomorrowEngineState, after: TomorrowEngineState): { kind: 'metal' | 'wood' | 'paper' | null; caption: string | null } {
  if ((action === 'wind' && before.phase !== 'ready')
    || (action === 'read-record' && before.phase !== 'wound')
    || (action === 'brake' && before.phase !== 'record-opened')
    || (action === 'withdraw' && before.phase !== 'braked')
    || (action === 'open-sleeve' && before.sleeveOpen)
    || (action === 'lift-stop-tab' && before.stopTabOpen)
    || ((action === 'turn-over' || action === 'show-front') && before.ticketFace === after.ticketFace)) {
    return { kind: null, caption: null };
  }
  if (action === 'wind') return { kind: 'wood', caption: SOUND_CAPTIONS.wind };
  if (action === 'read-record') return { kind: 'paper', caption: SOUND_CAPTIONS.record };
  if (action === 'brake') return { kind: 'wood', caption: SOUND_CAPTIONS.brake };
  if (action === 'withdraw') return { kind: 'paper', caption: SOUND_CAPTIONS.ticket };
  if (action === 'open-sleeve') return { kind: 'paper', caption: SOUND_CAPTIONS.sleeve };
  if (action === 'lift-stop-tab') return { kind: 'metal', caption: SOUND_CAPTIONS.tab };
  if (action === 'turn-over' || action === 'show-front') return { kind: 'paper', caption: SOUND_CAPTIONS.carbon };
  if (action.startsWith('examine-') || action === 'read-starting-mark' || action === 'read-work-label' || action === 'read-title' || action === 'read-inscription') {
    return { kind: 'metal', caption: SOUND_CAPTIONS.metal };
  }
  return { kind: null, caption: null };
}

function nextState(state: TomorrowEngineState, event: TomorrowEngineEvent): TomorrowEngineState {
  return transitionTomorrowEngine(state, event);
}

function panelForAction(action: TomorrowAction, state: TomorrowEngineState, before: TomorrowEngineState): ReaderPanel | null {
  if (action === 'wind') return before.phase === 'ready'
    ? { kind: 'document', key: 'winding-instructions', title: DOCUMENTS['winding-instructions'].title }
    : null;
  if (action === 'read-record') return state.phase === 'ready' ? null : { kind: 'document', key: 'movement-record', title: DOCUMENTS['movement-record'].title };
  if (action === 'read-instructions') return state.phase === 'ready' ? null : { kind: 'document', key: 'winding-instructions', title: DOCUMENTS['winding-instructions'].title };
  if (action === 'read-ticket' || action === 'withdraw') return state.phase === 'withdrawn' ? { kind: 'document', key: 'ticket', title: 'Dispatch ticket' } : null;
  if (action === 'open-sleeve') return { kind: 'document', key: 'sleeve', title: DOCUMENTS.sleeve.title, allowJoint: true };
  if (action === 'lift-stop-tab') return { kind: 'document', key: 'stop', title: DOCUMENTS.stop.title };
  if (action === 'turn-over') return { kind: 'document', key: 'ticket', title: 'Dispatch ticket' };
  if (action === 'show-front') return state.phase === 'withdrawn' ? { kind: 'document', key: 'ticket', title: 'Dispatch ticket' } : null;
  if (action === 'arrange-together') return { kind: 'document', key: 'joint', title: JOINT_RECORD.title };
  return null;
}

function documentForFinding(id: string): ReaderPanel | null {
  const entry = FINDING_DOCUMENT[id];
  return entry ? {
    kind: 'document',
    key: entry.key,
    title: entry.title,
    ...(id === TOMORROW_FINDINGS.unusedHour.id ? { allowJoint: true } : {}),
  } : null;
}

function currentSessionHas(findings: readonly TomorrowFinding[], id: string): boolean {
  return findings.some((finding) => finding.id === id);
}

function renderDocument(key: DocumentKey, officeAvailable: boolean, ticketFace: 'front' | 'reverse') {
  if (key === 'ticket') return <>
    <p className="tqw-tomorrow-ticket-reference">{ROOM_COPY.ticketReference}</p>
    <div className="tqw-tomorrow-reader-body" data-ticket-face={ticketFace} tabIndex={0}>
      {ticketFace === 'reverse' ? <>
        <p>{ROOM_COPY.returnLabel}</p>
        <p>{DOCUMENTS.carbon.paragraphs[0]}</p>
      </> : null}
      <ol className="tqw-tomorrow-ticket-lines">{TICKET_COPY.map((line) => <li key={line}>{line}</li>)}</ol>
    </div>
  </>;
  if (key === 'joint') return <div className="tqw-tomorrow-reader-body" tabIndex={0}>
    {JOINT_RECORD.originals.map((original) => <section key={original.title} className="tqw-tomorrow-original">
      <h3>{original.title}</h3><p>{original.body}</p>
    </section>)}
  </div>;
  if (key === 'sleeve') return <div className="tqw-tomorrow-reader-body" tabIndex={0}>
    {DOCUMENTS.sleeve.paragraphs.slice(0, 2).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <p>{DOCUMENTS.sleeve.paragraphs[2]}</p>
    <p className="tqw-tomorrow-comparison-status">{officeAvailable ? ROOM_COPY.eligibleOfficeEvidence : ROOM_COPY.emptyOfficeEvidence}</p>
  </div>;
  const document = DOCUMENTS[key];
  return <div className="tqw-tomorrow-reader-body" tabIndex={0}>
    {document.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
  </div>;
}

export default function TomorrowEngineChamber(props: ChamberProps) {
  const { settings, text, sound, onReady, onContextLost, onSceneError, onLeave, discoveries, reread, onRereadOpened } = props;
  const subscribe = useCallback((listener: () => void) => discoveries?.subscribe(listener) ?? EMPTY_SUBSCRIBE(), [discoveries]);
  const getSnapshot = useCallback(() => discoveries?.getState() ?? stableEmptySnapshot(), [discoveries]);
  const discoveryState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [state, setState] = useState(() => createTomorrowEngineState(discoveries?.getRoomState('tomorrow-engine')));
  const stateRef = useRef(state);
  const [sessionFindings, setSessionFindings] = useState<readonly TomorrowFinding[]>([]);
  const [panel, setPanel] = useState<ReaderPanel | null>(null);
  const [hintRung, setHintRung] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [actionCaption, setActionCaption] = useState<string | null>(null);
  const [earlyFeedback, setEarlyFeedback] = useState<EarlyFeedback | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLost, setSceneLost] = useState(false);
  const [cue, setCue] = useState<{ action: TomorrowAction; x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const stageElement = useRef<HTMLElement | null>(null);
  const readyRef = useRef(onReady);
  const lastPrimaryAction = useRef<TomorrowAction | null>(null);
  const feedbackSequence = useRef(0);
  const panelHeading = useRef<HTMLHeadingElement | null>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  const restorePanelFocus = useRef(false);
  const primaryButton = useRef<HTMLButtonElement | null>(null);
  const textMode = text !== null || sceneLost;
  const roomReady = textMode || sceneReady;
  const localFindings = useMemo(() => {
    const persisted = discoveryState.found['tomorrow-engine'] ?? [];
    const merged = new Map<string, TomorrowFinding>();
    for (const entry of persisted) {
      const canonical = TOMORROW_FINDINGS_BY_ID.get(entry.id);
      if (canonical) merged.set(canonical.id, canonical);
    }
    for (const entry of sessionFindings) merged.set(entry.id, entry);
    return [...merged.values()];
  }, [discoveryState.found, sessionFindings]);
  const officeAvailable = discoveries?.has('certification-office', 'office-expired-approval') ?? false;
  const unusedHourFound = discoveries?.has('tomorrow-engine', TOMORROW_FINDINGS.unusedHour.id)
    || currentSessionHas(sessionFindings, TOMORROW_FINDINGS.unusedHour.id);
  const jointAvailable = unusedHourFound && officeAvailable;
  const resultText = hintText ?? state.result ?? BASE_COPY[state.phase];
  const primaryAction = nextPrimaryAction(state);
  const station = state.station || DEFAULT_STATION.id;
  const stationActions = STATION_ACTIONS[station];

  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    if (panel) {
      panelHeading.current?.focus();
      restorePanelFocus.current = false;
      return;
    }
    if (!restorePanelFocus.current) return;
    const focusTarget = panelOpener.current?.isConnected ? panelOpener.current : primaryButton.current;
    focusTarget?.focus();
    restorePanelFocus.current = false;
  }, [panel]);
  useEffect(() => {
    sound.setRoom('tomorrow-engine');
    return () => sound.setRoom('corridor');
  }, [sound]);
  useEffect(() => {
    if (textMode) readyRef.current();
  }, [textMode]);
  useEffect(() => {
    if (discoveryState === EMPTY_DISCOVERY_STATE) return;
    const existing = discoveryState.found['tomorrow-engine'] ?? [];
    const recognized: TomorrowFinding[] = [];
    for (const entry of existing) {
      const canonical = TOMORROW_FINDINGS_BY_ID.get(entry.id);
      if (canonical) recognized.push(canonical);
    }
    if (JSON.stringify(existing) === JSON.stringify(recognized)) return;
    const found = { ...discoveryState.found, 'tomorrow-engine': recognized };
    discoveries?.importText(JSON.stringify({
      version: discoveryState.version,
      found,
      recognitions: discoveryState.recognitions,
      ...(discoveryState.roomState ? { roomState: discoveryState.roomState } : {}),
    }));
  }, [discoveries, discoveryState]);

  const persist = useCallback((next: TomorrowEngineState) => {
    stateRef.current = next;
    setState(next);
    discoveries?.setRoomState('tomorrow-engine', { ...payloadForTomorrowEngine(next) });
  }, [discoveries]);

  const hasTomorrowFinding = useCallback((id: string) =>
    (discoveries?.has('tomorrow-engine', id) ?? false) || currentSessionHas(sessionFindings, id),
  [discoveries, sessionFindings]);

  const recordForAction = useCallback((action: TomorrowAction, before: TomorrowEngineState, after: TomorrowEngineState) => {
    if (action === 'wind' && before.phase !== 'ready') return [];
    if (action === 'read-record' && before.phase !== 'wound') return [];
    if (action === 'withdraw' && (before.phase !== 'braked' || after.phase !== 'withdrawn')) return [];
    if (action === 'open-sleeve' && before.sleeveOpen) return [];
    if (action === 'lift-stop-tab' && before.stopTabOpen) return [];
    if (action === 'turn-over' && (before.phase !== 'withdrawn' || before.ticketFace === 'reverse')) return [];
    if (action === 'arrange-together' && !jointAvailable) return [];
    return ACTION_FINDINGS[action] ?? [];
  }, [jointAvailable]);

  const performAction = useCallback((action: TomorrowAction) => {
    const before = stateRef.current;
    setHintText(null);
    if (isEarlyAttempt(action, before.phase)) {
      feedbackSequence.current += 1;
      setEarlyFeedback({ action, sequence: feedbackSequence.current });
    } else {
      setEarlyFeedback(null);
    }
    let after = nextState(before, { type: 'action', action });
    after = { ...after, acknowledgement: null };
    if (before.phase !== 'withdrawn' && after.phase === 'withdrawn') {
      discoveries?.record('tomorrow-engine', TOMORROW_COMPLETION);
    }
    const findings = recordForAction(action, before, after);
    const freshFindings = findings.filter((finding) => !hasTomorrowFinding(finding.id));
    if (findings.length > 0) {
      for (const finding of findings) discoveries?.record('tomorrow-engine', finding);
      setSessionFindings((current) => {
        const next = new Map(current.map((finding) => [finding.id, finding]));
        for (const finding of findings) next.set(finding.id, finding);
        return [...next.values()];
      });
    }
    if (freshFindings.length > 0) {
      const acknowledgement = freshFindings.find((finding) => finding.kind === 'memo') ?? (freshFindings[0] as (typeof freshFindings)[number]);
      after = { ...after, acknowledgement: acknowledgement.title };
      const stored = discoveries !== undefined && findings.every((finding) => discoveries.isStored('tomorrow-engine', finding.id));
      setAnnouncement(stored ? null : 'Found — available this visit');
      setHintRung(0);
      setHintText(null);
    } else {
      setAnnouncement(null);
    }
    if (after.phase !== before.phase) {
      setHintRung(0);
      setHintText(null);
    }
    const nextPanel = panelForAction(action, after, before);
    if (action === 'brake') setPanel(null);
    else if (nextPanel !== null) {
      const active = document.activeElement;
      panelOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      restorePanelFocus.current = false;
      setPanel(nextPanel);
    }
    else if (action !== 'arrange-together') setPanel(null);
    persist(after);
    const soundCue = actionSound(action, before, after);
    setActionCaption(soundCue.caption);
    if (soundCue.kind !== null) {
      sound.unlock();
      sound.play({ type: 'object', kind: soundCue.kind });
    }
    setCue(null);
  }, [discoveries, hasTomorrowFinding, persist, recordForAction, sound]);

  const chooseStation = useCallback((next: TomorrowStationId) => {
    const after = nextState(stateRef.current, { type: 'station', station: next });
    persist(after);
    setCue(null);
    setEarlyFeedback(null);
    setPanel(null);
  }, [persist]);

  const resetMechanism = useCallback(() => {
    const after = nextState(stateRef.current, { type: 'reset' });
    persist(after);
    setPanel(null);
    setHintRung(0);
    setHintText(null);
    setActionCaption(null);
    setEarlyFeedback(null);
    setAnnouncement(null);
    setCue(null);
  }, [persist]);

  const activateHint = useCallback(() => {
    const hints = ROOM_COPY.hints[stateRef.current.phase];
    const nextRung = stateRef.current.phase === 'withdrawn' ? 0 : Math.min(hintRung, hints.length - 1);
    setHintText(hints[nextRung] ?? hints[hints.length - 1] ?? '');
    setActionCaption(null);
    setHintRung(stateRef.current.phase === 'withdrawn' ? 0 : Math.min(nextRung + 1, hints.length - 1));
  }, [hintRung]);

  const rememberPanelOpener = useCallback(() => {
    const active = document.activeElement;
    panelOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    restorePanelFocus.current = false;
  }, []);
  const openArchive = useCallback(() => {
    rememberPanelOpener();
    setPanel({ kind: 'archive' });
  }, [rememberPanelOpener]);
  const openFinding = useCallback((id: string) => {
    const next = documentForFinding(id);
    if (next) {
      rememberPanelOpener();
      setPanel(next);
    }
  }, [rememberPanelOpener]);
  // Read again from the site's archive: open the chosen record once the room can be seen.
  const rereadDone = useRef(0);
  useEffect(() => {
    if (!reread || !roomReady || rereadDone.current === reread.seq) return;
    const { finding, seq } = reread;
    const frame = requestAnimationFrame(() => {
      rereadDone.current = seq;
      openFinding(finding);
      onRereadOpened?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [onRereadOpened, openFinding, reread, roomReady]);
  const closePanel = useCallback(() => {
    restorePanelFocus.current = true;
    setPanel(null);
  }, []);
  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePanel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closePanel, panel]);

  const contextAction = useMemo<TomorrowAction | 'archive' | null>(() => {
    if (panel?.kind !== 'document') return null;
    if (panel.key === 'ticket') return state.ticketFace === 'front' ? 'turn-over' : 'show-front';
    if (panel.key === 'sleeve' && panel.allowJoint && jointAvailable) return 'arrange-together';
    return 'archive';
  }, [jointAvailable, panel, state.ticketFace]);

  const target = useCallback((value: { id: TomorrowAction; x: number; y: number } | null) => {
    if (value === null) { setCue(null); return; }
    const rect = stageElement.current?.getBoundingClientRect();
    setCue(rect ? {
      action: value.id,
      x: ((value.x - rect.left) / Math.max(1, rect.width)) * 100,
      y: ((value.y - rect.top) / Math.max(1, rect.height)) * 100,
    } : { action: value.id, x: 50, y: 78 });
  }, []);

  const primary = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const action = event.detail > 1 && lastPrimaryAction.current !== null ? lastPrimaryAction.current : primaryAction;
    if (event.detail <= 1) lastPrimaryAction.current = primaryAction;
    performAction(action);
  }, [performAction, primaryAction]);
  const buttonForStationAction = (entry: StationAction, side: 'left' | 'right') => {
    const disabledByPhase = (entry.action === 'read-instructions' && state.phase === 'ready')
      || (entry.action === 'read-ticket' && state.phase !== 'withdrawn');
    const disabled = !entry.enabled || disabledByPhase;
    const reasonId = entry.reason ? `tqw-tomorrow-reason-${entry.action}` : undefined;
    return <button key={entry.action} type="button" className={`tqw-tomorrow-station-action tqw-tomorrow-station-action--${side}`}
      data-station-action={entry.action}
      data-early-feedback={settings.reducedMotion && earlyFeedback?.action === entry.action ? 'true' : undefined}
      disabled={disabled} aria-describedby={disabled ? reasonId : undefined}
      onClick={() => performAction(entry.action)}>{ACTION_LABELS[entry.action]}</button>;
  };

  const showContextAction = () => {
    if (contextAction === null) return <span className="tqw-tomorrow-context-slot" aria-hidden="true" />;
    if (contextAction === 'archive') return <button type="button" className="tqw-tomorrow-context" onClick={openArchive}>{ROOM_COPY.archive}</button>;
    return <button type="button" className="tqw-tomorrow-context" onClick={() => performAction(contextAction)}>{ACTION_LABELS[contextAction]}</button>;
  };

  return <div className="tqw-app tqw-tomorrow-engine" data-mode={textMode ? 'text' : '3d'} data-room-ready={roomReady}
    data-phase={state.phase} data-station={station} data-date={state.phase === 'ready' ? '14' : '15'}
    data-completed={state.completed} data-reduced-motion={settings.reducedMotion} data-muted={settings.muted}>
    <header className="tqw-tomorrow-topbar" data-fp-ignore>
      <button type="button" aria-label={ROOM_COPY.leave} title={ROOM_COPY.leaveTitle} onClick={onLeave}>{ROOM_COPY.leave}</button>
      <button ref={primaryButton} type="button" className="tqw-tomorrow-primary" onClick={primary}>{ACTION_LABELS[primaryAction]}</button>
      <button type="button" className="tqw-tomorrow-hint" aria-label={ROOM_COPY.hint} onClick={activateHint}>{ROOM_COPY.hint}</button>
      <button type="button" className="tqw-tomorrow-archive" aria-label={ROOM_COPY.archive} onClick={openArchive}>{ROOM_COPY.archive}</button>
      <button type="button" aria-label={ROOM_COPY.reset} onClick={resetMechanism}>Reset</button>
    </header>

    <section ref={stageElement} className="tqw-tomorrow-stage" aria-label={`View: ${STATIONS.find((place) => place.id === station)?.label ?? 'Winding control'}`}>
      <h1 className="tqw-tomorrow-visually-hidden">{ROOM_COPY.title}</h1>
      {textMode ? <div className="tqw-tomorrow-text-scene">
        <p>{ROOM_COPY.fallbackTitle}</p>
        <h2>{STATIONS.find((place) => place.id === station)?.label ?? DEFAULT_STATION.label}</h2>
        <p>{state.phase === 'ready' ? ROOM_COPY.dateReady : ROOM_COPY.dateAdvanced}</p>
        {text?.reason === 'unsupported' || sceneLost ? <p>{ROOM_COPY.fallback}</p> : null}
        {text?.retry ? <button type="button" onClick={text.retry}>{ROOM_COPY.retry}</button> : null}
        <ul className="tqw-tomorrow-text-examines" aria-label="Visible object examines" tabIndex={0}>
          {TEXT_EXAMINES[station].map((action) => <li key={action}>
            <button type="button" onClick={() => performAction(action)}>{ACTION_LABELS[action]}</button>
          </li>)}
        </ul>
      </div> : <SceneBoundary fallback={null} onError={() => { setSceneLost(true); onSceneError(); }}>
        <Suspense fallback={<div className="tqw-tomorrow-loading" aria-hidden="true" />}>
          <TomorrowScene state={state} station={station} reducedMotion={settings.reducedMotion} earlyFeedback={earlyFeedback} onTarget={target}
            onObject={performAction} onReady={() => { setSceneReady(true); readyRef.current(); }}
            onContextLost={onContextLost} onError={() => { setSceneLost(true); onSceneError(); }} />
        </Suspense>
      </SceneBoundary>}
      {cue && !textMode ? <button type="button" className="tqw-tomorrow-cue" data-room-cue={cue.action}
        style={{ left: `${Math.max(4, Math.min(96, cue.x))}%`, top: `${Math.max(8, Math.min(88, cue.y))}%` }}
        onPointerLeave={() => setCue(null)} onFocus={() => undefined} onClick={() => performAction(cue.action)}>
        {ACTION_LABELS[cue.action]}
      </button> : null}
    </section>

    <main className="tqw-tomorrow-rail" aria-label={ROOM_COPY.title}>
      <p className="tqw-tomorrow-result" role="status" aria-live="polite" tabIndex={0}>
        <span>{resultText}</span>
        {settings.captions && actionCaption ? <span className="tqw-tomorrow-result-caption">{actionCaption}</span> : null}
      </p>
      <p className="tqw-tomorrow-acknowledgement" aria-live="polite" tabIndex={0}
        aria-label={state.acknowledgement && !announcement ? `Found: ${state.acknowledgement}` : undefined}>
        {state.acknowledgement && !announcement ? <span>Found: {state.acknowledgement}</span> : null}
        {announcement ? <span>{announcement}</span> : null}
      </p>
      {announcement ? <span className="tqw-tomorrow-visually-hidden" role="status">{announcement}</span> : null}

      <nav className="tqw-tomorrow-stations" aria-label="Room stations" data-fp-ignore>
        {STATIONS.map((place) => <button type="button" key={place.id} data-station-target={place.id}
          aria-pressed={station === place.id} onClick={() => chooseStation(place.id)}>
          {place.label}
        </button>)}
      </nav>
      <div className="tqw-tomorrow-actions" aria-label="Station actions" data-fp-ignore>
        {stationActions.map((entry, index) => buttonForStationAction(entry, index === 0 ? 'left' : 'right'))}
        {stationActions.map((entry) => entry.reason && ((entry.action === 'read-instructions' && state.phase === 'ready') || (entry.action === 'read-ticket' && state.phase !== 'withdrawn'))
          ? <span className="tqw-tomorrow-visually-hidden" key={`reason-${entry.action}`} id={`tqw-tomorrow-reason-${entry.action}`}>{entry.reason}</span>
          : null)}
      </div>

      <section className={`tqw-tomorrow-panel${panel ? ' tqw-tomorrow-panel--open' : ''}`} aria-label={panel?.kind === 'archive' ? ROOM_COPY.archive : panel?.kind === 'document' ? panel.title : 'Reader'}>
        {panel ? <>
          <header className="tqw-tomorrow-panel-header">
            <h2 ref={panelHeading} tabIndex={-1}>{panel.kind === 'archive' ? ROOM_COPY.archive : panel.title}</h2>
            {showContextAction()}
            <button type="button" className="tqw-tomorrow-close" aria-label={ROOM_COPY.close} onClick={closePanel}>{ROOM_COPY.close}</button>
          </header>
          {panel.kind === 'archive' ? <div className="tqw-tomorrow-archive-list" tabIndex={0}>
            {localFindings.length === 0 ? <p>{ROOM_COPY.archiveEmpty}</p> : <ul>
              {localFindings.map((finding) => <li key={finding.id}>
                <button type="button" data-archive-entry={finding.id} onClick={() => openFinding(finding.id)}>{finding.title}</button>
              </li>)}
            </ul>}
          </div> : renderDocument(panel.key, officeAvailable, state.ticketFace)}
        </> : null}
      </section>

    </main>
    <span className="tqw-tomorrow-visually-hidden" aria-live="polite">{state.phase === 'ready' ? ROOM_COPY.dateReady : ROOM_COPY.dateAdvanced}</span>
  </div>;
}
