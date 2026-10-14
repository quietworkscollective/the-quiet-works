import { gramophone } from '../../../../audio/music/index.ts';
import { useGramophone, useSoundOn } from '../../../../audio/music/useGramophone.ts';
import { GRAMOPHONE_COPY } from './copy.ts';
import { readingOf } from './reading.ts';
import { gramophoneUi } from './ui.ts';

/**
 * The gramophone's DOM equivalent: the text reading and the real controls, for screen readers, the
 * keyboard and text mode. Every 3D interaction has one (AGENTS.md #7): the same verbs, the same
 * words, acting on the same shared state, so they cannot disagree with the object.
 *
 * The controls are visually hidden until one has focus, and then it appears beside the fitting it
 * stands for, with a steady 2 px indicator, and stays as long as the focus does (see
 * `gramophone.css`). The cue labels that appear for a sighted visitor who is near the gramophone and
 * looking at it are the same words, drawn by the scene (`Gramophone.tsx`); they are decoration for
 * the pointer, hidden from assistive technology, and these buttons are the accessible way in.
 *
 * It is a plain component on purpose: the corridor's "Places and actions" disclosure, or text mode,
 * can render it as it is.
 */
export function GramophoneActions() {
  const state = useGramophone();
  const soundOn = useSoundOn();
  const reading = readingOf(state, soundOn);

  return (
    <section className="tqw-gramophone" aria-label={GRAMOPHONE_COPY.group} data-needle={state.needle} data-record={state.record}>
      <p className="tqw-gramophone__reading">{reading.text}</p>
      <div className="tqw-gramophone__actions" role="group" aria-label={GRAMOPHONE_COPY.group}>
        {reading.actions.map((action) => (
          <button
            key={action.target}
            type="button"
            className="tqw-gramophone__action"
            data-target={action.target}
            data-verb={action.verb}
            onFocus={() => gramophoneUi.setFocus(action.target)}
            onBlur={() => {
              gramophoneUi.setFocus(null);
              gramophoneUi.disarm(action.target);
            }}
            onPointerDown={() => gramophoneUi.arm(action.target, action.verb)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') gramophoneUi.arm(action.target, action.verb);
            }}
            onClick={() => gramophone.press(gramophoneUi.take(action.target, action.verb))}
          >
            {action.label}
          </button>
        ))}
      </div>
      {/* What a sighted visitor sees when near and looking: the same words, beside the fitting. Not read out, not in the tab order. */}
      {reading.actions.map((action) => (
        <span
          key={action.target}
          className="tqw-gramophone__cue"
          data-target={action.target}
          data-shown="false"
          role="presentation"
          aria-hidden="true"
          onPointerDown={() => gramophoneUi.arm(action.target, action.verb)}
          onClick={() => gramophone.press(gramophoneUi.take(action.target, action.verb))}
        >
          {action.label}
        </span>
      ))}
    </section>
  );
}
