import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { openSealed, parseSealedFile, type SealedItem } from '@tqw/engine';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';
import sealedApartment from '../../../../../packages/engine/src/sealed/apartment.sealed.json';
import {
  APARTMENT_OBJECTS,
  APARTMENT_TOKENS,
  nextApartmentTick,
  type ApartmentEvent,
  type ApartmentFindingId,
  type ApartmentObjectId,
  type ReplyChoice,
} from './state.ts';
import { apartmentVisitStore } from './store.ts';
import { STATIONS, type ApartmentStationId } from './stage.ts';
import type { ApartmentTarget } from './scene/ApartmentScene.tsx';
import './apartment.css';

const ApartmentScene = lazy(() => import('./scene/ApartmentScene.tsx'));
const SEALED = parseSealedFile(sealedApartment);
const REPLY_CHOICES: Readonly<Record<'default' | 'revised' | 'unsure', readonly ReplyChoice[]>> = {
  default: ['fine', 'tired', 'talk-later'],
  revised: ['not-sure', 'still-here', 'later-please'],
  unsure: ['unsure'],
};
const OBJECT_SOUND: Readonly<Record<ApartmentObjectId, { kind: 'metal' | 'wood' | 'paper' | 'cloth' | 'bell'; caption: string }>> = {
  phone: { kind: 'metal', caption: '[A small phone case tap]' },
  kettle: { kind: 'metal', caption: '[The kettle switch clicks; a white-grey wisp curls from the spout]' },
  faucet: { kind: 'metal', caption: '[The valve turns; water moves]' },
  keys: { kind: 'bell', caption: '[Three keys touch the shelf]' },
  chair: { kind: 'wood', caption: '[The chair slides on felt feet]' },
  bill: { kind: 'paper', caption: '[A sheet of paper lifts and settles]' },
  cup: { kind: 'wood', caption: '[Ceramic touches the saucer]' },
  magnet: { kind: 'metal', caption: '[The magnet turns with a light snap]' },
  window: { kind: 'metal', caption: '[The window latch opens]' },
  cushion: { kind: 'cloth', caption: '[The cushion cover shifts]' },
  platform: { kind: 'wood', caption: '[A low mechanism answers beneath the floor]' },
  underside: { kind: 'paper', caption: '[A pencil mark is read beneath the table]' },
};
const LINE_IDS = new Set<ApartmentFindingId>([
  'phone-message', 'reply-options-default', 'reply-options-revised', 'reply-unsure', 'outward-reply',
]);

function Finding({ item }: { item: SealedItem }) {
  return <section className="tqw-apartment-finding" aria-label={item.title ?? 'Found text'}>
    {item.label ? <p className="tqw-apartment-finding__label">{item.label}</p> : null}
    {item.title ? <h2>{item.title}</h2> : null}
    {item.from ? <p className="tqw-apartment-finding__from">{item.from}</p> : null}
    {item.body.map((line, index) => <p key={index}>{line}</p>)}
  </section>;
}

function replySetFor(state: ReturnType<typeof apartmentVisitStore.getState>): 'default' | 'revised' | 'unsure' | null {
  return state.replySet === 'closed' ? null : state.replySet;
}

/** The chamber keeps visit progress in memory and never writes room actions to storage. */
export default function ApartmentChamber(props: ChamberProps) {
  const { settings, text, sound, caption, onReady, onContextLost, onSceneError, onLeave, discoveries } = props;
  const state = useSyncExternalStore(apartmentVisitStore.subscribe, apartmentVisitStore.getState);
  const [station, setStation] = useState<ApartmentStationId>('threshold');
  const [sceneReady, setSceneReady] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [readouts, setReadouts] = useState<Partial<Record<ApartmentFindingId, SealedItem>>>({});
  const [activeFinding, setActiveFinding] = useState<ApartmentFindingId | null>(null);
  const [cue, setCue] = useState<ApartmentTarget | null>(null);
  const [stationDissolve, setStationDissolve] = useState(false);
  const [sceneLost, setSceneLost] = useState(false);
  const stageElement = useRef<HTMLElement | null>(null);
  const captionRef = useRef(caption);
  const readyRef = useRef(onReady);
  const cueTimer = useRef<number | null>(null);
  const cueHideTimer = useRef<number | null>(null);
  const floorImpactTimer = useRef<number | null>(null);
  const stationTimer = useRef<number | null>(null);
  const openedItems = useRef(new Set<ApartmentFindingId>());
  const toneCaptioned = useRef(false);
  const textMode = text !== null || sceneLost;
  const roomReady = textMode || sceneReady;

  useEffect(() => { captionRef.current = caption; }, [caption]);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => { sound.setRoom('apartment'); }, [sound]);
  useEffect(() => {
    if (textMode) readyRef.current();
  }, [textMode]);

  const openFinding = useCallback(async (id: ApartmentFindingId) => {
    if (openedItems.current.has(id)) return;
    openedItems.current.add(id);
    const token = APARTMENT_TOKENS[id];
    const item = await openSealed(SEALED, id, token);
    if (!item) {
      openedItems.current.delete(id);
      return;
    }
    setReadouts((current) => ({ ...current, [id]: item }));
    discoveries?.record('apartment', { id: item.id, kind: item.kind });
    if (!LINE_IDS.has(id)) setActiveFinding(id);
  }, [discoveries]);

  useEffect(() => {
    let cancelled = false;
    const loadFindings = async () => {
      for (const id of state.found) {
        if (cancelled) return;
        await openFinding(id);
      }
    };
    void loadFindings();
    return () => { cancelled = true; };
  }, [openFinding, state.found]);

  useEffect(() => {
    if (!roomReady) return;
    const delay = nextApartmentTick(state);
    if (delay === null) return;
    let remaining = delay;
    let startedAt = 0;
    let timer: number | undefined;
    const arm = () => {
      if (document.hidden) return;
      startedAt = performance.now();
      timer = window.setTimeout(() => apartmentVisitStore.dispatch({ type: 'tick', elapsedMs: remaining }), remaining);
    };
    const pause = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
    };
    const visibility = () => { if (document.hidden) pause(); else arm(); };
    document.addEventListener('visibilitychange', visibility);
    arm();
    return () => {
      pause();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [roomReady, state]);

  useEffect(() => () => {
    if (cueTimer.current !== null) window.clearTimeout(cueTimer.current);
    if (cueHideTimer.current !== null) window.clearTimeout(cueHideTimer.current);
    if (floorImpactTimer.current !== null) window.clearTimeout(floorImpactTimer.current);
    if (stationTimer.current !== null) window.clearTimeout(stationTimer.current);
  }, []);

  const unlockSound = useCallback(() => {
    sound.unlock();
    if (!toneCaptioned.current && !settings.muted) {
      toneCaptioned.current = true;
      captionRef.current('[Distant transport, a refrigerator compressor, and a small pipe movement]');
    }
  }, [settings.muted, sound]);

  const play = useCallback((kind: 'metal' | 'wood' | 'paper' | 'cloth' | 'bell', line: string) => {
    sound.play({ type: 'object', kind });
    captionRef.current(line);
  }, [sound]);

  const perform = useCallback((event: ApartmentEvent) => {
    unlockSound();
    const before = apartmentVisitStore.getState();
    const after = apartmentVisitStore.dispatch(event);
    if (after === before) return;

    if (event.type === 'reply') {
      play('metal', '[A small phone case tap]');
      if (floorImpactTimer.current !== null) window.clearTimeout(floorImpactTimer.current);
      floorImpactTimer.current = window.setTimeout(() => {
        play('wood', '[A low padded impact sounds beneath the floor]');
        floorImpactTimer.current = null;
      }, 250);
      return;
    }

    if (event.type === 'touch') {
      const soundCue = OBJECT_SOUND[event.object];
      play(soundCue.kind, soundCue.caption);
      return;
    }

    if (event.type === 'select-elevator') {
      play('metal', '[A latch withdraws beneath the floor]');
      return;
    }
    if (event.type === 'wait') {
      play('cloth', '[The room settles; no reply is required]');
      return;
    }
  }, [play, unlockSound]);

  useEffect(() => {
    if (!state.elevatorAvailable || state.touched.length > 0 || settings.muted) return;
    sound.play({ type: 'object', kind: 'metal' });
    captionRef.current('[A latch withdraws beneath the floor]');
  }, [settings.muted, sound, state.elevatorAvailable, state.touched.length]);

  const target = useCallback((value: ApartmentTarget | null) => {
    if (cueTimer.current !== null) window.clearTimeout(cueTimer.current);
    if (cueHideTimer.current !== null) window.clearTimeout(cueHideTimer.current);
    cueTimer.current = null;
    cueHideTimer.current = null;
    if (!value) {
      cueHideTimer.current = window.setTimeout(() => { setCue(null); cueHideTimer.current = null; }, 350);
      return;
    }
    const rect = stageElement.current?.getBoundingClientRect();
    const relative = rect ? {
      ...value,
      x: ((value.x - rect.left) / Math.max(1, rect.width)) * 100,
      y: ((value.y - rect.top) / Math.max(1, rect.height)) * 100,
    } : { ...value, x: 50, y: 76 };
    if (value.immediate || settings.reducedMotion) setCue(relative);
    else cueTimer.current = window.setTimeout(() => { setCue(relative); cueTimer.current = null; }, 250);
  }, [settings.reducedMotion]);

  const focusObject = useCallback((id: ApartmentObjectId) => {
    const rect = stageElement.current?.getBoundingClientRect();
    if (!rect) return;
    target({ id, x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.76, immediate: true });
  }, [target]);

  const chooseStation = useCallback((next: ApartmentStationId) => {
    if (stationTimer.current !== null) window.clearTimeout(stationTimer.current);
    setCue(null);
    setStationDissolve(true);
    const fade = settings.reducedMotion ? 60 : 90;
    stationTimer.current = window.setTimeout(() => {
      setStation(next);
      stationTimer.current = window.setTimeout(() => {
        setStationDissolve(false);
        stationTimer.current = null;
      }, settings.reducedMotion ? 60 : 80);
    }, fade);
  }, [settings.reducedMotion]);

  const moveStation = useCallback((step: -1 | 1) => {
    const current = STATIONS.findIndex((candidate) => candidate.id === station);
    const next = STATIONS[(current + step + STATIONS.length) % STATIONS.length];
    if (next) chooseStation(next.id);
  }, [chooseStation, station]);

  const handleTarget = useCallback((value: ApartmentTarget | null) => target(value), [target]);
  const leave = useCallback(() => {
    unlockSound();
    play('metal', '[The apartment door latch moves; corridor air returns]');
    onLeave();
  }, [onLeave, play, unlockSound]);

  const replySet = replySetFor(state);
  const replyItemId: ApartmentFindingId | null = replySet === 'default'
    ? 'reply-options-default'
    : replySet === 'revised' ? 'reply-options-revised' : replySet === 'unsure' ? 'reply-unsure' : null;
  const replyItem = replyItemId ? readouts[replyItemId] : undefined;
  const phoneMessage = readouts['phone-message'];
  const actionButton = (id: ApartmentObjectId, label: string, action?: 'turn-saucer' | 'compare-latch') => (
    <button type="button" data-object-action={id} onFocus={() => focusObject(id)} onClick={() => {
      const event: ApartmentEvent = action === undefined ? { type: 'touch', object: id } : { type: 'touch', object: id, action };
      perform(event);
    }}>{label}</button>
  );
  const objectActions = (id: ApartmentObjectId, publicLabel: string) => {
    if (id === 'phone') return <>
      {actionButton(id, publicLabel)}
      {phoneMessage ? <div className="tqw-apartment-phone-copy"><Finding item={phoneMessage} /></div> : null}
      {replyItem && replySet ? <div className="tqw-apartment-replies" aria-label={replyItem.label ?? 'Reply choices'}>
        {REPLY_CHOICES[replySet].map((choice, index) => {
          const label = replyItem.body[index];
          return label ? <button type="button" key={choice} data-reply-choice={choice} onClick={() => perform({ type: 'reply', choice })}>{label}</button> : null;
        })}
      </div> : null}
      {state.outwardReply && readouts['outward-reply'] ? <Finding item={readouts['outward-reply']} /> : null}
    </>;
    if (id === 'keys') return <>
      {actionButton(id, publicLabel)}
      {state.keyArrangementCount > 0 ? actionButton(id, 'Compare with the repaired latch', 'compare-latch') : null}
      {readouts['bent-house-key'] ? <Finding item={readouts['bent-house-key']} /> : null}
    </>;
    if (id === 'cup') return <>
      {actionButton(id, state.cupLifted ? 'Set the cup down' : publicLabel)}
      {state.chairSlid && state.cupLifted ? actionButton(id, 'Turn the saucer', 'turn-saucer') : null}
      {readouts['under-saucer'] ? <Finding item={readouts['under-saucer']} /> : null}
    </>;
    if (id === 'chair') return actionButton(id, state.chairSlid ? 'Return the chair' : publicLabel);
    if (id === 'kettle') return actionButton(id, state.kettleOn ? 'Switch the kettle off' : publicLabel);
    if (id === 'faucet') return actionButton(id, state.faucetFlow === 0 ? publicLabel : 'Change the water flow');
    if (id === 'bill') return actionButton(id, state.billRead ? 'Reread the bill' : publicLabel);
    if (id === 'magnet') return actionButton(id, state.magnetTurned ? 'Turn the magnet back' : publicLabel);
    if (id === 'window') return actionButton(id, state.windowOpen ? 'Close the window' : publicLabel);
    if (id === 'cushion') return <>
      {actionButton(id, state.cushionLifted ? 'Replace the cushion' : publicLabel)}
      {readouts['repair-patch'] ? <Finding item={readouts['repair-patch']} /> : null}
    </>;
    if (id === 'platform') return <>
      {actionButton(id, publicLabel)}
      {state.elevatorAvailable ? <button type="button" data-elevator-select onClick={() => perform({ type: 'select-elevator' })}>
        {state.elevatorGateRaised ? 'Gate raised' : 'Select the elevator'}
      </button> : <p className="tqw-apartment-status">The platform will be available shortly.</p>}
      {state.elevatorGateRaised ? <button type="button" data-elevator-leave onClick={leave}>Leave by elevator</button> : null}
    </>;
    if (id === 'underside') return <>
      {actionButton(id, publicLabel)}
      {state.waiting || state.unansweredElapsedMs >= 20_000
        ? readouts['fourth-line'] ? <Finding item={readouts['fourth-line']} /> : null
        : <button type="button" onClick={() => perform({ type: 'wait' })}>Wait a little</button>}
    </>;
    return actionButton(id, publicLabel);
  };

  const places = <details className="tqw-apartment-places" onToggle={(event) => setPlacesOpen(event.currentTarget.open)}>
    <summary>Places and actions</summary>
    <div className="tqw-apartment-places__content" onWheel={(event) => event.stopPropagation()}>
      <nav aria-label="Room stations">
        {STATIONS.map((place, index) => <button type="button" key={place.id} data-station-target={place.id} onClick={() => chooseStation(place.id)}>
          View {place.label} <span className="tqw-apartment-key-hint">{index + 1}</span>
        </button>)}
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('apartment:turn', { detail: -1 }))}>Turn left</button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('apartment:turn', { detail: 1 }))}>Turn right</button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('apartment:pitch', { detail: -8 }))}>Look down</button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('apartment:pitch', { detail: 8 }))}>Look up</button>
      </nav>
      <p>Left and right turn. Up and down walk. Drag to look. Keys 1 to 5 choose a station.</p>
      <section aria-labelledby="apartment-object-actions">
        <h2 id="apartment-object-actions">Objects</h2>
        <ul>{APARTMENT_OBJECTS.map((object) => <li key={object.id} data-room-object={object.id}>
          <h3>{object.label}</h3>
          <p>{object.description}</p>
          {objectActions(object.id, object.action)}
        </li>)}</ul>
      </section>
      {activeFinding && readouts[activeFinding] ? <Finding item={readouts[activeFinding]} /> : null}
      <button type="button" onClick={leave}>Return to the corridor</button>
    </div>
  </details>;

  return <div className="tqw-app tqw-apartment" data-mode={textMode ? 'text' : '3d'} data-room-ready={roomReady}
    data-path={state.path} data-reply-set={state.replySet} data-elevator={state.elevatorAvailable ? 'available' : 'waiting'}
    data-platform-intact={state.elevatorPlatformIntact} data-gate={state.elevatorGateRaised ? 'raised' : 'lowered'}
    data-places={placesOpen} data-reduced-motion={settings.reducedMotion} data-muted={settings.muted}>
    {textMode ? <main className="tqw-apartment-text">
      <h1>The Apartment</h1>
      <p>{text?.reason === 'unsupported' ? 'This room is available as a set of places and actions.' : 'The room is ready as a set of places and actions.'}</p>
      {text?.retry ? <button type="button" className="tqw-apartment-link" onClick={text.retry}>Try the 3D view again</button> : null}
      {places}
    </main> : <main className="tqw-apartment-stage" aria-label="The Apartment room">
      <h1 className="tqw-apartment-visually-hidden">The Apartment</h1>
      <section ref={stageElement} className={`tqw-apartment-stage__view${stationDissolve ? ' tqw-apartment-stage__view--dissolve' : ''}`} aria-label={`View: ${STATIONS.find((place) => place.id === station)?.label ?? 'Entrance'}`}>
        <SceneBoundary fallback={null} onError={() => { setSceneLost(true); onSceneError(); }}>
          <Suspense fallback={<div className="tqw-apartment-stage__loading" aria-hidden="true" />}>
            <ApartmentScene state={state} station={station} reducedMotion={settings.reducedMotion} onTarget={handleTarget}
              onStation={chooseStation} onGesture={unlockSound} onReady={() => { setSceneReady(true); readyRef.current(); }}
              onContextLost={onContextLost} onError={() => { setSceneLost(true); onSceneError(); }} />
          </Suspense>
        </SceneBoundary>
        {cue ? <button type="button" className="tqw-apartment-cue" data-room-cue={cue.id}
          style={{ left: `${Math.max(4, Math.min(96, cue.x))}%`, top: `${Math.max(8, Math.min(88, cue.y))}%` }}
          onPointerEnter={() => { if (cueHideTimer.current !== null) window.clearTimeout(cueHideTimer.current); cueHideTimer.current = null; }}
          onFocus={() => { if (cueHideTimer.current !== null) window.clearTimeout(cueHideTimer.current); cueHideTimer.current = null; }}
          onBlur={() => { cueHideTimer.current = window.setTimeout(() => setCue(null), 350); }}
          onClick={() => perform({ type: 'touch', object: cue.id })}>
          {APARTMENT_OBJECTS.find((object) => object.id === cue.id)?.action ?? 'Touch'}
        </button> : null}
        <div className="tqw-apartment-mobile-controls" aria-label="Room stations">
          <button type="button" aria-label="Previous room view" onClick={() => moveStation(-1)}>Back</button>
          <button type="button" aria-label="Next room view" onClick={() => moveStation(1)}>Forward</button>
        </div>
      </section>
      {places}
      {activeFinding && readouts[activeFinding] ? <aside className="tqw-apartment-readout" role="status" aria-live="polite">
        <button type="button" className="tqw-apartment-readout__close" aria-label="Close found text" onClick={() => setActiveFinding(null)}>Close</button>
        <Finding item={readouts[activeFinding]} />
      </aside> : null}
    </main>}
  </div>;
}
