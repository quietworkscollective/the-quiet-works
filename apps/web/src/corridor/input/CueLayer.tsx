import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { IGNORE_ATTRIBUTE } from '../../firstPerson/bindings.ts';
import { CUE_TUNING } from '../camera/cueTuning.ts';
import { targetId } from '../camera/cueText.ts';
import type { CueStore } from './cues.ts';
import './cues.css';

/**
 * The corridor's DOM cues (ADR 0004, art consult 6, and the founder's "no floating menus"). Nothing
 * here is on screen permanently: the verb label appears beside a door, the board or a prop only when
 * the visitor has found it (within reach, near the centre of view), fading in and out; the first
 * hint shows once; a reader shows what an action revealed. The one standing piece of DOM is the
 * "Places and actions" disclosure, which is for the keyboard and screen readers: it is in the page
 * from the start, early in the Tab order, and takes no room until it has focus.
 *
 * The state comes from the store the camera rig writes; the label and ring are moved by the rig
 * straight onto their elements as CSS custom properties.
 */
export interface CueLayerProps {
  store: CueStore;
  reducedMotion: boolean;
}

/** Event that opens "Places and actions" and puts focus on it: for a header's "Access & controls" to call. */
export const OPEN_PLACES_EVENT = 'tqw:open-places';

/** Controls here are the page's, not the scene's: a press or drag on them never walks or looks. */
const ignore = { [IGNORE_ATTRIBUTE]: '' };

export function CueLayer({ store, reducedMotion }: CueLayerProps) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const root = useRef<HTMLDivElement | null>(null);
  const label = useRef<HTMLElement | null>(null);
  const ring = useRef<HTMLDivElement | null>(null);
  const places = useRef<HTMLDetailsElement | null>(null);

  // The rig moves the label and ring itself; tell it which elements exist after every render.
  useLayoutEffect(() => {
    store.attach({ label: label.current, ring: ring.current });
  });
  useLayoutEffect(() => () => store.attach({ label: null, ring: null }), [store]);

  // The tunable timings and sizes (cueTuning.ts) reach the stylesheet as custom properties on the layer.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--tqw-cue-fade-in', `${CUE_TUNING.fadeInMs}ms`);
    el.style.setProperty('--tqw-cue-fade-out', `${CUE_TUNING.fadeOutMs}ms`);
    el.style.setProperty('--tqw-cue-font', `${CUE_TUNING.labelFontPx}px`);
    el.style.setProperty('--tqw-cue-target', `${CUE_TUNING.labelMinTargetPx}px`);
  }, []);

  // A header control (or anything else) can ask for the disclosure to open and take focus.
  useEffect(() => {
    const open = () => {
      const details = places.current;
      if (!details) return;
      details.open = true;
      details.querySelector<HTMLElement>('summary')?.focus();
    };
    document.addEventListener(OPEN_PLACES_EVENT, open);
    return () => document.removeEventListener(OPEN_PLACES_EVENT, open);
  }, []);

  const { cue } = snap;
  // The DOM door list supplies each door's keyboard and screen-reader action.
  const doorCue = cue?.key.startsWith('door:') === true;
  return (
    <div
      ref={root}
      className="tqw-cues"
      data-reduced={reducedMotion}
      data-keyboard={snap.keyboard}
    >
      <div hidden={!snap.shown}>
        {cue && snap.ring ? <div ref={ring} className="tqw-cue-ring" aria-hidden="true" data-placed="false" /> : null}
        {cue ? (
          cue.asButton && !snap.keyboard ? (
            <button
              key={cue.key}
              ref={(el) => {
                label.current = el;
              }}
              type="button"
              className="tqw-cue tqw-cue--button"
              aria-hidden={doorCue || undefined}
              tabIndex={doorCue ? -1 : undefined}
              data-placed="false"
              data-visible={cue.visible}
              onClick={() => store.actions.activateCue()}
              {...ignore}
            >
              {cue.text}
            </button>
          ) : (
            <div
              key={cue.key}
              ref={(el) => {
                label.current = el;
              }}
              className="tqw-cue"
              aria-hidden="true"
              data-placed="false"
              data-visible={cue.visible}
            >
              {cue.text}
            </div>
          )
        ) : null}

        {snap.hint ? (
          <div className="tqw-hint" role="note" {...ignore}>
            <p className="tqw-hint__text">{snap.hint}</p>
            <button type="button" className="tqw-hint__close" aria-label="Dismiss" onClick={() => store.actions.dismissHint()}>
              <span aria-hidden="true">{'×'}</span>
            </button>
          </div>
        ) : null}

        {snap.reader ? (
          <section className="tqw-reader" aria-label={snap.reader.verb} {...ignore}>
            {snap.reader.text ? <p className="tqw-reader__text">{snap.reader.text}</p> : null}
            {snap.reader.inscriptions.length > 0 ? (
              <ul className="tqw-reader__list">
                {snap.reader.inscriptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <button type="button" className="tqw-reader__close" aria-label="Close" onClick={() => store.actions.closeReader()}>
              <span aria-hidden="true">{'×'}</span>
            </button>
          </section>
        ) : null}

      </div>
      {snap.places.length > 0 ? (
        <details ref={places} className="tqw-places" {...ignore}>
          <summary className="tqw-places__summary">Places and actions</summary>
          <ul className="tqw-places__list">
            {snap.places.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="tqw-places__item"
                  {...(item.target.kind === 'prop' ? { 'data-prop': item.target.id } : { 'data-board': 'true' })}
                  data-place={targetId(item.target)}
                  onClick={() => store.actions.activatePlace(item.target)}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="tqw-cues__live" role="status" aria-live="polite">
        {snap.live}
      </div>
    </div>
  );
}
