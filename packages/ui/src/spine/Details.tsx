import { useId } from 'react';
import { CONTRIBUTIONS_COPY, PAGE_NAV } from '@tqw/engine';
import type { DetailsProps } from './types.ts';

const PAGES = [
  ['about', '/about'],
  ['credits', '/credits'],
  ['privacy', '/privacy'],
] as const;

/**
 * Contributions and details (ADR 0003): what UNHELD is, how it grows, how to contribute, and what
 * stays on the visitor's device, in a 360 px introduction beside the topics (stacked below 760 px).
 * It describes only what exists: no public submission facility is promised. The About, Credits and
 * Privacy pages stay addressable and are linked from here.
 */
export function Details({ onOpenPage }: DetailsProps) {
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
          {CONTRIBUTIONS_COPY.topics.map((topic) => (
            <div key={topic.title} className="tqw-details__topic">
              <h3 className="tqw-details__topic-title">{topic.title}</h3>
              <p className="tqw-details__topic-body">{topic.body}</p>
            </div>
          ))}
          <nav aria-label="More about UNHELD" className="tqw-details__more">
            {PAGES.map(([id, href]) => (
              <a
                key={id}
                className="tqw-details__link"
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenPage(id);
                }}
              >
                {PAGE_NAV[id]}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
