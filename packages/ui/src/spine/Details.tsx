import { useId } from 'react';
import { CONTRIBUTIONS_COPY } from '@tqw/engine';
import type { DetailsProps } from './types.ts';

const TOPICS = [
  {
    title: CONTRIBUTIONS_COPY.topics[0].title,
    body: 'Rooms are built by hand and open one at a time. A closed door stays marked until its room is ready.',
  },
  {
    title: CONTRIBUTIONS_COPY.topics[1].title,
    body: 'Changes arrive as pull requests and a maintainer reviews each one. Project code is Apache 2.0; art and writing are CC BY 4.0. Personal stories need explicit consent.',
  },
  {
    title: CONTRIBUTIONS_COPY.topics[2].title,
    body: 'Discoveries stay in this browser, on this device only. Nothing is sent anywhere. There is no account or analytics, and forgetting erases the local record.',
  },
] as const;

const CONTRIBUTION_GUIDE = 'https://github.com/quietworkscollective/the-quiet-works/blob/main/docs/commons/AGENT_DOSSIER.md';

/**
 * Contributions and details (ADR 0003): what UNHELD is, how it grows, how to contribute, and what
 * stays on the visitor's device, in a five-column introduction beside the topics (stacked below 760 px).
 * It describes only what exists: no public submission facility is promised. Sitewide links stay
 * at the footer.
 */
export function Details(_props: DetailsProps) {
  const titleId = useId();
  return (
    <section id="details" className="tqw-details" aria-labelledby={titleId}>
      <div className="tqw-details__inner">
        <div className="tqw-details__intro">
          <h2 id={titleId} className="tqw-details__title">
            {CONTRIBUTIONS_COPY.title}
          </h2>
          <p className="tqw-details__lead">{CONTRIBUTIONS_COPY.intro}</p>
        </div>
        <div className="tqw-details__topics">
          {TOPICS.map((topic) => (
            <div key={topic.title} className="tqw-details__topic">
              <h3 className="tqw-details__topic-title">{topic.title}</h3>
              <p className="tqw-details__topic-body">{topic.body}</p>
            </div>
          ))}
          <a className="tqw-details__link" href={CONTRIBUTION_GUIDE}>
            Read the contribution guide
          </a>
        </div>
      </div>
    </section>
  );
}
