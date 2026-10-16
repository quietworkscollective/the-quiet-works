import { OFFICE_LEGIBILITY as COPY } from '@tqw/engine';
/** The same public fittings in reading order; the indicator board stays static and dark. */
export function OfficeApplicationReadout({ stamps: _stamps }: { stamps: number }) {
  return <section aria-label={COPY.board} className="tqw-application-readout">
    <p>{COPY.sign}</p>
    <p>{COPY.certificate}</p><p>{COPY.certificateBody.join(' ')}</p>
    <p>{COPY.approvalLine} __________________</p>
    <p>{COPY.form}</p><p>{COPY.applicant}</p><p>{COPY.evidence}</p>
    <p>{COPY.stampHere}</p>
    <ol>{COPY.lamps.map(lamp=><li key={lamp} data-lit="false">{lamp}</li>)}</ol>
  </section>;
}
