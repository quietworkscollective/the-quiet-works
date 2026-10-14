import { OFFICE_LEGIBILITY as COPY } from '@tqw/engine';
/** The same public fittings in reading order; sealed discoveries have their own readers. */
export function OfficeApplicationReadout({ stamps }: { stamps: number }) {
  return <section aria-label={COPY.board} className="tqw-application-readout">
    <p>{COPY.sign}</p>
    <p>{COPY.certificate}</p><p>{COPY.certificateBody.join(' ')}</p>
    <p>{COPY.approvalLine} __________________</p>
    <p>{COPY.form}</p><p>{COPY.applicant}</p><p>{COPY.evidence}</p>
    <ol>{COPY.lamps.map((lamp,i)=><li key={lamp} data-lit={i < Math.min(stamps,4)}>
      {lamp}{i<Math.min(stamps,4) ? ` — ${COPY.catches[i]}` : ''}{i===4 ? ` — ${COPY.emptySocket}` : ''}
    </li>)}</ol>
    {stamps>=5 ? <p>{COPY.officer} {COPY.vacancy}</p> : null}
  </section>;
}
