import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { digestItem, openSealed, parseSealedFile, type SealedItem } from '@tqw/engine';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';
import outlineProvenance from './provenance.json';
import sealedRoom from '../../../../../packages/engine/src/sealed/codex-room.sealed.json';
import { BOAT_UNDERSIDE_TOKEN, GUIDE_SHOE_TOKEN, OBJECTS, type GuideId, type RoomAction, type RoomObjectId } from './state.ts';
import { createRoomStore } from './store.ts';
import { STATIONS, type StageStation } from './stage.ts';
import { OutlineScene } from './OutlineScene.tsx';
import './room.css';

const GUIDE_ORDER = ['wingnut', 'tin-a', 'tin-b'] as const;
type SpecimenGuide = (typeof GUIDE_ORDER)[number];
const SECRET_IDS = { shoe: 'service-shoe-note', boat: 'boat-hinge-note' } as const;
const TRACE_DURATION_MS = 4200;

const DESCRIPTIONS: Record<RoomObjectId, string> = {
  follower: 'A brass pantograph links an ivory grip to a blunt wax pencil.',
  selector: 'Three broad detents choose the fastener or one of the two tins.',
  wingnut: 'A small wing nut is held in a clamp large enough to suggest a committee.',
  'tin-a': 'Tin A contains a small wooden boat with a folding mast.',
  'tin-b': 'Tin B contains a blue bowl packed in folded cotton.',
  leaves: 'Two ground-glass leaves hold matching wax outlines when traced.',
  hood: 'The shared comparison hood lifts from the two tins.',
  rest: 'An ivory rest holds the follower above the clear pane.',
  eraser: 'A felt sled wipes only the currently selected outline.',
  drawer: 'A small service drawer holds a removable guide shoe.',
  provenance: 'This is a fictional mechanical installation. It does not represent a person.',
  door: 'The entrance remains available as the way back to the corridor.',
};

let visitStore: ReturnType<typeof createRoomStore> | null = null;
function roomStore(): ReturnType<typeof createRoomStore> {
  visitStore ??= createRoomStore();
  return visitStore;
}

function guideLabel(guide: string): string {
  return guide === 'wingnut' ? 'Wing nut' : guide === 'tin-a' ? 'Tin A' : guide === 'tin-b' ? 'Tin B' : 'Guide shoe';
}

function firstAction(id: RoomObjectId): string {
  return OBJECTS.find((object) => object.id === id)?.action ?? 'Inspect object';
}

function objectStation(id: RoomObjectId): StageStation['id'] {
  if (id === 'tin-a' || id === 'tin-b' || id === 'hood' || id === 'leaves') return 'rear';
  if (id === 'drawer' || id === 'eraser' || id === 'provenance') return 'west';
  if (id === 'rest' || id === 'door') return 'east';
  return 'bench';
}

export default function OutlineChamber(props: ChamberProps) {
  const { settings, text, sound, caption, onReady, onContextLost, onSceneError, onLeave, discoveries } = props;
  const [store] = useState(roomStore);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [selectedStation, setSelectedStation] = useState<StageStation['id']>('arrival');
  const [focusedObject, setFocusedObject] = useState<RoomObjectId | null>(null);
  const [cue, setCue] = useState<{ id: RoomObjectId; x: number; y: number } | null>(null);
  const [opened, setOpened] = useState<Partial<Record<keyof typeof SECRET_IDS, SealedItem>>>({});
  const [secretError, setSecretError] = useState(false);
  const [stroke, setStroke] = useState<GuideId | null>(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const stageElement = useRef<HTMLElement | null>(null);
  const captionRef = useRef(caption);
  const roomReadyRef = useRef(onReady);
  const airCaptioned = useRef(false);
  const activeStroke = useRef<{ guide: GuideId; started: number } | null>(null);
  const frame = useRef<number | null>(null);
  const textMode = text !== null;
  const ready = sceneReady || textMode;

  useEffect(() => { captionRef.current = caption; }, [caption]);
  useEffect(() => { roomReadyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    if (textMode) roomReadyRef.current();
  }, [textMode]);
  useEffect(() => {
    if (!ready || textMode || settings.muted || !settings.captions || airCaptioned.current) return;
    airCaptioned.current = true;
    captionRef.current('[Low air passes through a wall grille]');
  }, [ready, settings.captions, settings.muted, textMode]);
  const markReady = useCallback(() => {
    setSceneReady(true);
    roomReadyRef.current();
  }, []);

  useEffect(() => {
    for (const token of state.discoveryTokens) {
      if (token === GUIDE_SHOE_TOKEN) discoveries?.record('outline-room', { id: SECRET_IDS.shoe, kind: 'secret' });
      if (token === BOAT_UNDERSIDE_TOKEN) discoveries?.record('outline-room', { id: SECRET_IDS.boat, kind: 'secret' });
    }
  }, [discoveries, state.discoveryTokens]);

  // One exposed spring timer. Hidden time is not charged; tracing resets it.
  useEffect(() => {
    if (!ready || state.comparisonRevealed || stroke) return;
    let remaining = 12_000;
    let started = 0;
    let timer: number | undefined;
    const arm = () => {
      if (document.hidden) return;
      if (remaining <= 0) { store.dispatch({ type: 'LEAVE_UNTRACED' }); return; }
      started = performance.now();
      timer = window.setTimeout(() => store.dispatch({ type: 'LEAVE_UNTRACED' }), remaining);
    };
    const pause = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
      remaining = Math.max(0, remaining - (performance.now() - started));
    };
    const visibility = () => { if (document.hidden) pause(); else arm(); };
    document.addEventListener('visibilitychange', visibility);
    arm();
    return () => { pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [ready, state.traceSequence, state.comparisonRevealed, store, stroke]);

  const play = useCallback((kind: 'metal' | 'wood' | 'paper' | 'cloth' | 'rubber', line: string) => {
    sound.unlock();
    sound.play({ type: 'object', kind });
    captionRef.current(line);
  }, [sound]);

  const cancelTrace = useCallback(() => {
    const active = activeStroke.current;
    if (!active) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    store.dispatch({ type: 'CANCEL_TRACE', guide: active.guide });
    activeStroke.current = null;
    setStroke(null);
  }, [store]);

  const completeTrace = useCallback((guide: GuideId) => {
    if (!activeStroke.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    store.dispatch({ type: 'TRACE_PROGRESS', guide, progress: 1 });
    store.dispatch({ type: 'TRACE_COMPLETE', guide });
    activeStroke.current = null;
    setStroke(null);
    sound.play({ type: 'object', kind: 'rubber' });
    captionRef.current('[The wax line settles on the glass]');
  }, [sound, store]);

  const startTrace = useCallback((guide: GuideId) => {
    if (activeStroke.current) cancelTrace();
    store.dispatch({ type: 'TRACE_BEGIN', guide });
    sound.unlock();
    if (textMode || settings.reducedMotion) {
      store.dispatch({ type: 'TRACE_PROGRESS', guide, progress: 1 });
      store.dispatch({ type: 'TRACE_COMPLETE', guide });
      sound.play({ type: 'object', kind: 'metal' });
      captionRef.current('[The complete outline appears; the follower rests]');
      return;
    }
    activeStroke.current = { guide, started: performance.now() };
    setStroke(guide);
    sound.play({ type: 'object', kind: 'metal' });
    captionRef.current('[The brass bearing takes up its travel]');
    const tick = (now: number) => {
      const active = activeStroke.current;
      if (!active || active.guide !== guide) return;
      const progress = Math.min(1, Math.max(0, (now - active.started) / TRACE_DURATION_MS));
      store.dispatch({ type: 'TRACE_PROGRESS', guide, progress });
      if (progress >= 1) { completeTrace(guide); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [cancelTrace, completeTrace, settings.reducedMotion, sound, store, textMode]);

  useEffect(() => {
    if (!stroke) return;
    if (textMode) cancelTrace();
    else if (settings.reducedMotion) completeTrace(stroke);
  }, [cancelTrace, completeTrace, settings.reducedMotion, stroke, textMode]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) cancelTrace(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cancelTrace]);
  useEffect(() => () => {
    const active = activeStroke.current;
    if (!active) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    store.dispatch({ type: 'CANCEL_TRACE', guide: active.guide });
    activeStroke.current = null;
  }, [store]);

  const perform = useCallback((id: RoomObjectId, action?: string) => {
    let event: { kind: 'metal' | 'wood' | 'paper' | 'cloth' | 'rubber'; caption: string } = {
      kind: 'metal', caption: '[A small brass mechanism moves]',
    };
    const dispatch = (value: RoomAction) => store.dispatch(value);
    switch (id) {
      case 'follower':
        if (state.followerParked) { dispatch({ type: 'RESUME_TRACING' }); event = { kind: 'metal', caption: '[The follower lifts from its rest]' }; }
        else { startTrace(state.selectedGuide); return; }
        break;
      case 'selector': {
        const current = GUIDE_ORDER.indexOf(state.selectedGuide as SpecimenGuide);
        const next = GUIDE_ORDER[(current + 1) % GUIDE_ORDER.length] ?? 'wingnut';
        dispatch({ type: 'SELECT_GUIDE', guide: next });
        event = { kind: 'metal', caption: `[The selector rests at ${guideLabel(next)}]` };
        break;
      }
      case 'wingnut':
        if (action === 'trace') { dispatch({ type: 'SELECT_GUIDE', guide: 'wingnut' }); startTrace('wingnut'); return; }
        else { dispatch({ type: 'INSPECT_WINGNUT' }); event = { kind: 'metal', caption: '[The clamp turns to its other face]' }; }
        break;
      case 'tin-a':
        if (action === 'trace') { dispatch({ type: 'SELECT_GUIDE', guide: 'tin-a' }); startTrace('tin-a'); return; }
        else if (state.hoodOpen && action === 'lift') { dispatch({ type: state.boatLifted ? 'REPLACE_BOAT' : 'LIFT_BOAT' }); event = { kind: 'wood', caption: state.boatLifted ? '[The wooden boat returns to its tin]' : '[The wooden boat lifts from the tin]' }; }
        else if (state.hoodOpen && state.boatLifted && action === 'underside') { dispatch({ type: 'INSPECT_BOAT_UNDERSIDE' }); event = { kind: 'metal', caption: '[The wooden mast folds on a small hinge]' }; }
        else if (state.hoodOpen && state.boatMastRaised) { dispatch({ type: 'TOGGLE_BOAT_MAST' }); event = { kind: 'metal', caption: '[The wooden mast folds on a small hinge]' }; }
        else if (state.hoodOpen) { dispatch({ type: 'TOGGLE_BOAT_MAST' }); event = { kind: 'metal', caption: '[The wooden mast raises on a small hinge]' }; }
        else { dispatch({ type: 'INSPECT_TIN', tin: 'tin-a' }); event = { kind: 'metal', caption: '[The tin lid gives a quiet hinge tick]' }; }
        break;
      case 'tin-b':
        if (action === 'trace') { dispatch({ type: 'SELECT_GUIDE', guide: 'tin-b' }); startTrace('tin-b'); return; }
        else if (state.hoodOpen && action === 'cloth') { dispatch({ type: state.clothEdgeLifted ? 'REPLACE_CLOTH' : 'LIFT_CLOTH_EDGE' }); event = { kind: 'cloth', caption: '[Cotton shifts around the bowl]' }; }
        else { dispatch({ type: 'INSPECT_TIN', tin: 'tin-b' }); event = { kind: 'metal', caption: '[The tin lid gives a quiet hinge tick]' }; }
        break;
      case 'leaves':
        if (state.hoodOpen && action === 'rims') dispatch({ type: 'INSPECT_EQUAL_RIMS' });
        else dispatch({ type: 'TOGGLE_COMPARE' });
        event = { kind: 'cloth', caption: '[The glass leaves meet at a felt spacer]' };
        break;
      case 'hood':
        dispatch({ type: state.hoodOpen ? 'CLOSE_HOOD' : 'OPEN_HOOD' });
        event = { kind: 'metal', caption: '[The comparison hood moves to its stop]' };
        break;
      case 'rest':
        if (!state.followerParked && stroke) cancelTrace();
        dispatch({ type: state.followerParked ? 'RESUME_TRACING' : 'LEAVE_UNTRACED' });
        event = state.followerParked ? { kind: 'metal', caption: '[The follower returns to its track]' } : { kind: 'wood', caption: '[The follower rests above the pane]' };
        break;
      case 'eraser':
        dispatch({ type: 'WIPE_SELECTED_LINE' });
        event = { kind: 'rubber', caption: '[Felt sweeps the selected line]' };
        break;
      case 'drawer':
        if (action === 'shoe') { startTrace('service'); return; }
        else if (action === 'return') { dispatch({ type: 'RETURN_SPECIMEN_GUIDE' }); event = { kind: 'metal', caption: '[The specimen selector is restored]' }; }
        else { dispatch({ type: state.serviceDrawerOpen ? 'CLOSE_SERVICE_DRAWER' : 'OPEN_SERVICE_DRAWER' }); event = { kind: 'wood', caption: '[The service drawer slides on its guide]' }; }
        break;
      case 'provenance':
        dispatch({ type: 'READ_PROVENANCE' });
        event = { kind: 'paper', caption: '[A small enamel plate is read]' };
        break;
      case 'door':
        cancelTrace();
        play('metal', '[The door latch moves; corridor air returns]');
        onLeave();
        return;
    }
    play(event.kind, event.caption);
  }, [cancelTrace, onLeave, play, startTrace, state, store, stroke]);

  const openSecret = useCallback(async (which: keyof typeof SECRET_IDS) => {
    const file = parseSealedFile(sealedRoom);
    const token = which === 'shoe' ? GUIDE_SHOE_TOKEN : BOAT_UNDERSIDE_TOKEN;
    setSecretError(false);
    const item = await openSealed(file, SECRET_IDS[which], token);
    if (!item || await digestItem(item) !== file.items[SECRET_IDS[which]]?.digest) { setSecretError(true); return; }
    setOpened((current) => ({ ...current, [which]: item }));
    play('paper', '[A fictional catalogue note is opened]');
  }, [play]);

  const jump = useCallback((station: StageStation) => {
    setSelectedStation(station.id);
    setCue(null);
    sound.unlock();
    sound.play({ type: 'object', kind: 'wood' });
    captionRef.current('[A measured step to the next station]');
  }, [sound]);

  const selectCue = useCallback((id: RoomObjectId, x: number, y: number) => {
    const station = STATIONS.find((candidate) => candidate.id === objectStation(id));
    let cuePosition = { x, y };
    const rect = stageElement.current?.getBoundingClientRect();
    if (station && station.id !== selectedStation) {
      jump(station);
      if (rect) cuePosition = { x: rect.width / 2, y: rect.height * 0.78 };
    } else if (rect) cuePosition = { x: x - rect.left, y: y - rect.top };
    setFocusedObject(id);
    setCue({ id, ...cuePosition });
  }, [jump, selectedStation]);

  const objectActions = (id: RoomObjectId) => {
    switch (id) {
      case 'follower': return <button onClick={() => perform(id)}>{state.followerParked ? 'Resume tracing' : 'Trace once'}</button>;
      case 'selector': return <div className="tqw-outline-room__button-row">{GUIDE_ORDER.map((guide) => <button key={guide} aria-pressed={state.selectedGuide === guide} onClick={() => { store.dispatch({ type: 'SELECT_GUIDE', guide }); play('metal', `[The selector rests at ${guideLabel(guide)}]`); }}>{guideLabel(guide)}</button>)}</div>;
      case 'wingnut': return <div className="tqw-outline-room__button-row"><button onClick={() => perform(id)}>Inspect fastener</button><button onClick={() => perform(id, 'trace')}>Trace wing nut</button></div>;
      case 'tin-a': return <div className="tqw-outline-room__button-row"><button onClick={() => perform(id)}>Inspect Tin A</button><button onClick={() => perform(id, 'trace')}>Trace Tin A</button>{state.hoodOpen ? <button onClick={() => perform(id, 'lift')}>{state.boatLifted ? 'Replace boat' : 'Lift boat'}</button> : null}{state.hoodOpen && state.boatLifted ? <button onClick={() => perform(id, 'underside')}>Inspect underside</button> : null}{state.hoodOpen ? <button onClick={() => perform(id)}>{state.boatMastRaised ? 'Fold mast' : 'Raise mast'}</button> : null}{(state.boatUndersideRead || discoveries?.has('outline-room', SECRET_IDS.boat)) ? <button onClick={() => void openSecret('boat')}>Read boat note</button> : null}</div>;
      case 'tin-b': return <div className="tqw-outline-room__button-row"><button onClick={() => perform(id)}>Inspect Tin B</button><button onClick={() => perform(id, 'trace')}>Trace Tin B</button>{state.hoodOpen ? <button onClick={() => perform(id, 'cloth')}>{state.clothEdgeLifted ? 'Replace cloth' : 'Lift cloth edge'}</button> : null}</div>;
      case 'leaves': return <div className="tqw-outline-room__button-row"><button onClick={() => perform(id)}>Compare outlines</button>{state.hoodOpen ? <button onClick={() => perform(id, 'rims')}>Inspect equal rims</button> : null}</div>;
      case 'hood': return <button onClick={() => perform(id)}>{state.hoodOpen ? 'Close comparison hood' : 'Lift comparison hood'}</button>;
      case 'rest': return <button onClick={() => perform(id)}>{state.followerParked ? 'Resume tracing' : 'Leave untraced'}</button>;
      case 'eraser': return <button onClick={() => perform(id)}>Wipe selected line</button>;
      case 'drawer': return <div className="tqw-outline-room__button-row"><button onClick={() => perform(id)}>{state.serviceDrawerOpen ? 'Close service drawer' : 'Open service drawer'}</button>{state.serviceDrawerOpen ? <><button onClick={() => perform(id, 'shoe')}>Trace guide shoe</button><button onClick={() => perform(id, 'return')}>Return specimen guide</button></> : null}{state.lines.service === 'full' || discoveries?.has('outline-room', SECRET_IDS.shoe) ? <button onClick={() => void openSecret('shoe')}>Read guide shoe note</button> : null}</div>;
      case 'provenance': return <button onClick={() => perform(id)}>Read provenance plate</button>;
      case 'door': return <button onClick={() => perform(id)}>Leave room</button>;
    }
  };

  return (
    <section className="tqw-outline-room" data-room-ready={ready} data-mode={textMode ? 'text' : 'visual'} data-selected-guide={state.selectedGuide} data-path={state.discoveryPath ?? ''} data-active-trace={state.activeTrace ?? ''} data-line-tin-a={state.lines.tinA} data-line-tin-b={state.lines.tinB} data-reduced-motion={settings.reducedMotion} aria-label="The Outline Room">
      <h1 className="tqw-visually-hidden">The Outline Room</h1>
      {textMode ? (
        <div className="tqw-outline-room__text" role="region" aria-label="Workshop catalogue">
          <h2>A small instrument workshop</h2>
          <p>A brass arm follows the outside edge of a selected object. It leaves the inside undescribed.</p>
          <p>Station: <strong>{STATIONS.find((station) => station.id === selectedStation)?.label ?? 'Entrance view'}</strong>.</p>
          <p>Current guide: <strong>{guideLabel(state.selectedGuide)}</strong>. The glass leaves are {state.comparisonOverlaid ? 'overlaid' : 'separate'}; the comparison hood is {state.hoodOpen ? 'open' : 'closed'}.</p>
          <p>{state.tracedTinA && state.tracedTinB ? 'Both tins have matching outlines. One contains a wooden boat; the other, a packed ceramic bowl.' : state.discoveryPath === 'stop' ? 'The follower is resting. Both contents are available to inspect.' : 'The follower is ready. Inspect an object or choose a guide below.'}</p>
          <p className="tqw-outline-room__fiction-note">The tins are fictional workshop specimens. Nothing here describes a visitor.</p>
        </div>
      ) : (
        <main ref={stageElement} className="tqw-outline-room__stage" aria-label="Interactive room view" tabIndex={0} onPointerDown={(event) => { if (event.target instanceof HTMLCanvasElement) event.currentTarget.focus({ preventScroll: true }); }}>
          <SceneBoundary fallback={null} onError={onSceneError}>
            <Suspense fallback={null}>
              <OutlineScene
                state={state}
                station={selectedStation}
                reducedMotion={settings.reducedMotion}
                inputRef={stageElement}
                onTarget={selectCue}
                onReady={markReady}
                onContextLost={onContextLost}
                onError={onSceneError}
              />
            </Suspense>
          </SceneBoundary>
          {cue ? <div className="tqw-outline-room__cue" style={{ left: cue.x, top: cue.y }} data-focused={focusedObject === cue.id}>
            <button type="button" onFocus={() => setFocusedObject(cue.id)} onBlur={() => setFocusedObject(null)} onClick={() => { setCue(null); perform(cue.id); }}>
              {firstAction(cue.id)}
            </button>
          </div> : null}
        </main>
      )}

      <details className="tqw-outline-room__places" open={textMode || placesOpen} onToggle={(event) => setPlacesOpen(event.currentTarget.open)}>
        <summary>Places and actions</summary>
        <nav aria-label="Room stations" className="tqw-outline-room__stations">
          {STATIONS.map((station) => <button key={station.id} type="button" aria-pressed={selectedStation === station.id} onClick={() => jump(station)}>{station.label}</button>)}
        </nav>
        <p className="tqw-outline-room__help">Use W / S or the arrow keys to walk, A / D or left / right to turn, and drag to look. The camera stays inside the room.</p>
        <ol className="tqw-outline-room__objects" aria-label="Inspectable objects">
          {OBJECTS.map((object) => <li key={object.id} data-room-object={object.id}>
            <div><h2>{object.name}</h2><p>{DESCRIPTIONS[object.id]}</p>{object.id === 'provenance' && state.provenanceRead ? <p className="tqw-outline-room__provenance">{outlineProvenance.credit}</p> : null}</div>
            {objectActions(object.id)}
          </li>)}
        </ol>
        {opened.shoe || opened.boat ? <section className="tqw-outline-room__reading" aria-label="Opened workshop notes">
          {(['shoe', 'boat'] as const).map((which) => opened[which] ? <article key={which} aria-labelledby={`outline-note-${which}`}>
            <h2 id={`outline-note-${which}`}>{opened[which]?.title}</h2>
            <p>{opened[which]?.label}</p>
            {opened[which]?.body.map((paragraph, index) => <p key={`${which}-${index}`}>{paragraph}</p>)}
          </article> : null)}
          <button type="button" onClick={() => setOpened({})}>Close notes</button>
        </section> : null}
        {secretError ? <p role="alert">This note could not be opened. The room's saved discovery remains unchanged.</p> : null}
        {textMode && text?.retry ? <button type="button" onClick={text.retry}>Try the 3D view again</button> : null}
      </details>
      {!textMode && state.discoveryPath ? <p className="tqw-visually-hidden" role="status">The comparison hood is {state.hoodOpen ? 'open' : 'closed'}.</p> : null}
    </section>
  );
}
