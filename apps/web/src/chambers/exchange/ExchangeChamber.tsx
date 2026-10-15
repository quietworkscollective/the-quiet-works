import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { openSealed, parseSealedFile, type SealedItem } from '@tqw/engine';
import type { ExchangeEvent, ExchangeObjectId, ExchangeTransition } from './state.ts';
import { EXCHANGE_OBJECTS, EXCHANGE_TOKENS, nextExchangeTick } from './state.ts';
import { exchangeVisitStore } from './store.ts';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import exchangeProvenance from './provenance.json';

const ExchangeScene = lazy(() => import('./scene/ExchangeScene.tsx'));
const SEALED = parseSealedFile(sealedExchange);
const SOUND: Record<ExchangeTransition['cues'][number], { kind: 'metal' | 'cloth' | 'bell'; caption: string }> = {
  'soft-tick': { kind: 'metal', caption: '[A small relay ticks]' },
  'relay-click': { kind: 'metal', caption: '[A relay clicks]' },
  'cord-fall': { kind: 'cloth', caption: '[A cord settles against the board]' },
  'night-switch': { kind: 'metal', caption: '[The night-service switch closes]' },
  'old-ring': { kind: 'bell', caption: '[A telephone rings]' },
  'lamp-test': { kind: 'bell', caption: '[The line lamps test in sequence]' },
  'dial-tone': { kind: 'bell', caption: '[A quiet dial tone begins]' },
  'page-turn': { kind: 'cloth', caption: '[A page turns]' },
  'desk-bell': { kind: 'bell', caption: '[The desk bell rings once]' },
};

function captionFor(event: ExchangeEvent): string | null {
  if (event.type === 'answer-handset') return '[The handset is lifted]';
  return null;
}

function Finding({ item }: { item: SealedItem }) {
  return (
    <section className="tqw-exchange-finding" aria-label={item.title ?? 'Found text'}>
      {item.label ? <p>{item.label}</p> : null}
      {item.title ? <h2>{item.title}</h2> : null}
      {item.body.map((line, index) => <p key={index}>{line}</p>)}
    </section>
  );
}

/** The Exchange stays local to this visit. Its timed transitions use bounded wake-ups, not a render loop. */
export default function ExchangeChamber(props: ChamberProps) {
  const { settings, text, sound, caption, onReady, onContextLost, onSceneError, onLeave, discoveries } = props;
  const [store] = useState(exchangeVisitStore);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [sceneReady, setSceneReady] = useState(false);
  const roomReady = text !== null || sceneReady;
  const [placesOpen, setPlacesOpen] = useState(false);
  const [readout, setReadout] = useState<SealedItem | null>(null);
  const [readyRef] = useState(() => ({ current: onReady }));
  const captionRef = useRef(caption);
  const toneCaptioned = useRef(false);
  const [lost, setLost] = useState(false);

  useEffect(() => { readyRef.current = onReady; }, [onReady, readyRef]);
  useEffect(() => { captionRef.current = caption; }, [caption]);
  useEffect(() => {
    if (text !== null) readyRef.current();
  }, [text, readyRef]);

  const perform = useCallback((event: ExchangeEvent, gesture = true) => {
    if (gesture) {
      sound.unlock();
      if (!toneCaptioned.current && !settings.muted) {
        captionRef.current('[A low switchboard hum under quiet line noise]');
        toneCaptioned.current = true;
      }
    }
    const result = store.dispatch(event);
    for (const cue of result.cues) {
      const playback = SOUND[cue];
      sound.play({ type: 'object', kind: playback.kind });
      captionRef.current(playback.caption);
    }
    const ordinaryCaption = captionFor(event);
    if (ordinaryCaption && !result.cues.length) captionRef.current(ordinaryCaption);
    for (const found of result.found) {
      discoveries?.record('exchange', found);
      const token = EXCHANGE_TOKENS[found.id];
      if (!token) continue;
      void openSealed(SEALED, found.id, token).then(item => {
        if (item) setReadout(item);
      });
    }
  }, [discoveries, settings.muted, sound, store]);

  const unlockSound = useCallback(() => {
    sound.unlock();
    if (!toneCaptioned.current && !settings.muted) {
      captionRef.current('[A low switchboard hum under quiet line noise]');
      toneCaptioned.current = true;
    }
  }, [settings.muted, sound]);

  useEffect(() => {
    if (!roomReady) return;
    const next = nextExchangeTick(state);
    if (next === null) return;
    const timer = window.setTimeout(() => perform({ type: 'tick', elapsedMs: next }, false), Math.max(0, next - state.elapsedMs));
    return () => window.clearTimeout(timer);
  }, [perform, roomReady, state]);

  const ready = useCallback(() => {
    setSceneReady(true);
    readyRef.current();
  }, [readyRef]);
  const contextLost = useCallback(() => { setLost(true); onContextLost(); }, [onContextLost]);
  const sceneError = useCallback(() => { setLost(true); onSceneError(); }, [onSceneError]);
  const leave = useCallback(() => { unlockSound(); sound.play({ type: 'object', kind: 'metal' }); captionRef.current('[A door latch clicks]'); onLeave(); }, [onLeave, sound, unlockSound]);
  const inspect = useCallback((object: ExchangeObjectId) => perform({ type: 'inspect', object }), [perform]);
  const modeText = text !== null || lost;

  return (
    <div className="tqw-app tqw-exchange" data-mode={modeText ? 'text' : '3d'} data-phase={state.phase}
      data-station="threshold" data-places={placesOpen} data-lights={state.litLines.join(',')} data-connected={state.connectedLines.join(',')}
      data-operator={state.operatorLamp} data-findings={state.discoveries.join(',')}
      data-reduced-motion={settings.reducedMotion} data-muted={settings.muted}>
      {modeText ? (
        <main className="tqw-text tqw-exchange-text">
          <h1>The Exchange</h1>
          <p>{text?.reason === 'unsupported' ? 'This room is available as a set of places and actions.' : 'The room is ready as a set of places and actions.'}</p>
          {text?.retry ? <button type="button" className="tqw-link-button" onClick={text.retry}>Try the 3D view again</button> : null}
          {readout ? <Finding item={readout} /> : null}
        </main>
      ) : (
        <main className="tqw-stage" aria-label="The Exchange room">
          <h1 className="tqw-visually-hidden">The Exchange</h1>
          <SceneBoundary fallback={null} onError={sceneError}>
            <Suspense fallback={<div className="tqw-stage__loading" aria-hidden="true" />}>
              <ExchangeScene state={state} reducedMotion={settings.reducedMotion} onReady={ready} onContextLost={contextLost} onGesture={unlockSound} onError={sceneError} />
            </Suspense>
          </SceneBoundary>
        </main>
      )}
      <details className="tqw-places" onToggle={event => setPlacesOpen(event.currentTarget.open)}>
        <summary>Places and actions</summary>
        <div className="tqw-places__content" onWheel={event => event.stopPropagation()}>
          <nav aria-label="Room stations">
            <button type="button" data-station-target="threshold" onClick={() => window.dispatchEvent(new CustomEvent('exchange:station', { detail: 'threshold' }))}>View the threshold</button>
            <button type="button" data-station-target="desk" onClick={() => window.dispatchEvent(new CustomEvent('exchange:station', { detail: 'desk' }))}>View the desk</button>
            <button type="button" data-station-target="ladder" onClick={() => window.dispatchEvent(new CustomEvent('exchange:station', { detail: 'ladder' }))}>View the ladder</button>
            <button type="button" data-station-target="window-seat" onClick={() => window.dispatchEvent(new CustomEvent('exchange:station', { detail: 'window-seat' }))}>View the window seat</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('exchange:turn', { detail: -1 }))}>Turn left</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('exchange:turn', { detail: 1 }))}>Turn right</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('exchange:pitch', { detail: -8 }))}>Look down</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('exchange:pitch', { detail: 8 }))}>Look up</button>
          </nav>
          <p>Arrow keys turn. Drag to look. Keys 1 to 4 choose a station.</p>
          <section aria-labelledby="exchange-object-actions">
            <h2 id="exchange-object-actions">Objects</h2>
            <ul>{EXCHANGE_OBJECTS.map(object => <li key={object.id}><button type="button" data-object-action={object.id} onClick={() => inspect(object.id)}>{object.action}</button></li>)}</ul>
          </section>
          <section aria-labelledby="exchange-line-actions">
            <h2 id="exchange-line-actions">Lines</h2>
            <ol>{Array.from({ length: 12 }, (_, index) => index + 1).map(line => (
              <li key={line}><button type="button" disabled={!state.litLines.includes(line)} onClick={() => perform({ type: 'connect', target: line })}>Connect line {line}</button></li>
            ))}</ol>
            {state.operatorLamp ? <button type="button" onClick={() => perform({ type: 'connect', target: 'operator' })}>Connect the operator line</button> : null}
            {state.phase === 'operator-ringing' ? <button type="button" onClick={() => perform({ type: 'answer-handset' })}>Answer the handset</button> : null}
            {state.rulePage > 0 && state.rulePage < 13 ? <button type="button" onClick={() => perform({ type: 'read-next-rule' })}>Read the next rule</button> : null}
          </section>
          {readout ? <Finding item={readout} /> : null}
          <button type="button" onClick={leave}>Return to the corridor</button>
        </div>
      </details>
      <p className="tqw-exchange-credit">{exchangeProvenance.credit}</p>
      {readout && !modeText ? <aside className="tqw-context-cue tqw-exchange-cue" role="status" aria-live="polite">
        <button type="button" aria-label="Close found text" onClick={() => setReadout(null)}>×</button><Finding item={readout} />
      </aside> : null}
    </div>
  );
}
