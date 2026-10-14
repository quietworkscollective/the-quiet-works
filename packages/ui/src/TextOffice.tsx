import { OfficeApplicationReadout } from './OfficeApplicationReadout.tsx';
import { useId, type CSSProperties } from 'react';
import { HATCH_INTERIOR, OFFICE_PAPER_BEATS, STAMP_WORD, TEXT_MODE_SCENE } from '@tqw/engine';
import { imprintPose, MAX_IMPRINTS } from './imprints.ts';
import { MachineReadout } from './MachineReadout.tsx';
import { MemoButton } from './MemoButton.tsx';
import { StampButton } from './StampButton.tsx';
import type { TextOfficeProps } from './types.ts';

/** Lamps on the machine, one per escalation step. Decorative. */
const LAMPS = 5;

function poseStyle(index: number, position: 'left' | 'centre' | 'right'): CSSProperties {
  const { tilt, dx, dy } = imprintPose(index);
  return { '--tilt': `${tilt}deg`, '--dx': `${dx + (position === 'left' ? -40 : position === 'right' ? 40 : 0)}px`, '--dy': `${dy}px` } as CSSProperties;
}

/**
 * Splits the stencil at its dash, so the supporting line ("RECEIVING AUTHORITY —") can sit
 * quietly above the verdict ("NOT INSTALLED"), which is the punchline. The two parts
 * rejoin, with a space, to exactly the authored string.
 */
export function splitStencil(text: string): { lead: string; verdict: string } {
  const at = text.lastIndexOf(' — ');
  if (at === -1) return { lead: '', verdict: text };
  return { lead: text.slice(0, at + 2), verdict: text.slice(at + 3) };
}

/**
 * The Certification Office as a document first and a picture second.
 *
 * Reading order: heading, notice, the opening line of the scene, the machine (its demand),
 * the controls, the rest of the scene, then the form. The opening line, the demand and the
 * first action come first so they share one screen on a phone; the remaining prose follows
 * straight after, in the order a person would read it. The composition (enamel machine,
 * amber display, paper strip, form with ink imprints) is layered on by CSS alone, with no
 * images.
 */
export function TextOffice({
  state,
  impressionPosition = 'centre',
  notice,
  noticeAction,
  reducedMotion,
  onPressStart,
  onPressEnd,
  onOpenMemo,
  onReset,
}: TextOfficeProps) {
  const machineId = useId();
  const formId = useId();
  const revealed = state.memo.revealed;
  const imprints = Math.min(state.stamps, MAX_IMPRINTS);
  const lit = Math.min(state.stamps, LAMPS);
  const [opening, ...rest] = TEXT_MODE_SCENE;
  const stencil = splitStencil(HATCH_INTERIOR);
  const beat = state.stamps <= 5 ? state.stamps : 6 + (state.stamps - 6) % 3;

  return (
    <div
      className="tqw-office"
      data-reduced-motion={reducedMotion}
      data-phase={state.phase}
      data-memo={revealed ? 'revealed' : 'hidden'}
    >
      <div className="tqw-office__intro">
        <h1 className="tqw-office__title">The Certification Office</h1>
        <div className="tqw-office__notice-row">
          <p role="note" className="tqw-office__notice">
            {notice}
          </p>
          {noticeAction}
        </div>
        <div className="tqw-office__scene">{opening !== undefined ? <p>{opening}</p> : null}</div>
      </div>

      <OfficeApplicationReadout stamps={state.stamps} />
      <div className="tqw-office__desk">
        <div className="tqw-office__bench">
          <section className="tqw-machine" aria-labelledby={machineId}>
            <h2 id={machineId} className="tqw-visually-hidden">
              The machine
            </h2>
            <div className="tqw-machine__body">
              <div className="tqw-machine__lamps" aria-hidden="true">
                {Array.from({ length: LAMPS }, (_, i) => (
                  <span key={i} className="tqw-machine__lamp" data-lit={i < lit} />
                ))}
              </div>
              <MachineReadout state={state} visible />
              <div
                className="tqw-hatch"
                data-open={revealed}
                role={revealed ? 'group' : undefined}
                aria-label={revealed ? 'Front hatch' : undefined}
                aria-hidden={revealed ? undefined : true}
              >
                <div className="tqw-hatch__interior">
                  <span className="tqw-hatch__paper" aria-hidden="true" />
                  {revealed ? (
                    <p className="tqw-hatch__stencil">
                      {stencil.lead !== '' ? <span className="tqw-hatch__lead">{stencil.lead}</span> : null}
                      {stencil.lead !== '' ? ' ' : null}
                      <span className="tqw-hatch__verdict">{stencil.verdict}</span>
                    </p>
                  ) : null}
                </div>
                <div className="tqw-hatch__door" aria-hidden="true" />
              </div>
            </div>
          </section>

          <div className="tqw-office__actions">
            <StampButton
              pressing={state.pressing}
              onPressStart={onPressStart}
              onPressEnd={onPressEnd}
              variant="desk"
            />
            <div className="tqw-office__secondary">
              {revealed ? <MemoButton onOpen={onOpenMemo} /> : null}
              {state.stamps > 0 || revealed ? (
                <button type="button" className="tqw-link-button" onClick={onReset}>
                  Start over
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="tqw-office__sheet">
          {rest.length > 0 ? (
            <div className="tqw-office__scene-rest">
              {rest.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          <div className="tqw-paper-action" data-beat={beat} role="group" aria-label="Paper action">
            <p>{OFFICE_PAPER_BEATS[beat]}</p>
            <div className="tqw-paper-action__stock" aria-hidden="true">
              {beat === 2 ? <span className="tqw-paper-action__expiry">EXPIRED</span> : null}
              {beat === 3 ? <span className="tqw-paper-action__carbon">Unsigned copy</span> : null}
              {beat === 4 ? Array.from({ length: 6 }, (_, i) => <span key={i} className="tqw-paper-action__fold">Approval →</span>) : null}
              {beat === 5 ? <span className="tqw-paper-action__empty">RECEIVING AUTHORITY — NOT INSTALLED</span> : null}
            </div>
          </div>
          <section className="tqw-form" aria-labelledby={formId}>
            <h2 id={formId} className="tqw-form__title">
              <span className="tqw-form__no">Form W-1</span>
              <span className="tqw-visually-hidden"> — </span>
              <span className="tqw-form__name">Application for Certification of Worth</span>
            </h2>
            <div className="tqw-form__fields" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <ul
              className="tqw-form__stamps"
              aria-label="Stamp impressions"
              aria-hidden={imprints === 0 ? true : undefined}
              data-full={imprints === MAX_IMPRINTS}
            >
              {Array.from({ length: imprints }, (_, i) => {
                const newest = i === imprints - 1;
                return (
                  <li
                    // Past the cap the last impression is re-stamped, so it remounts to replay the settle.
                    key={newest ? `${i}:${state.stamps}` : i}
                    className="tqw-imprint"
                    data-newest={newest}
                    style={poseStyle(i, impressionPosition)}
                  >
                    <span className="tqw-imprint__word">{STAMP_WORD}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
