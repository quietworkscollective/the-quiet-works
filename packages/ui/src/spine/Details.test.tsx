import { cleanup, render, screen, within } from '@testing-library/react';
import { CONTRIBUTIONS_COPY } from '@tqw/engine';
import { Details } from './Details.tsx';

afterEach(() => cleanup());

describe('Details', () => {
  it('pairs three short topics with a direct link to the Commons contribution guide', () => {
    const { container } = render(<Details onOpenPage={vi.fn()} />);
    const bodies = [...container.querySelectorAll('.tqw-details__topic-body')].map((body) => body.textContent ?? '');
    expect(bodies).toHaveLength(3);
    expect(bodies.every((body) => body.trim().split(/\s+/).length <= 30)).toBe(true);
    const contribution = container.querySelectorAll('.tqw-details__topic')[1] as HTMLElement;
    const body = contribution.querySelector('.tqw-details__topic-body') as HTMLElement;
    const guide = within(contribution).getByRole('link', { name: 'Read the contribution guide' });
    expect(guide.getAttribute('href')).toBe(
      'https://github.com/quietworkscollective/the-quiet-works/blob/main/docs/commons/AGENT_DOSSIER.md',
    );
    expect(body.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bodies[1]).not.toMatch(/Apache|Creative Commons|CC BY/i);
  });

  it('is a section named by its h2 title', () => {
    render(<Details onOpenPage={vi.fn()} />);
    const section = screen.getByRole('region', { name: CONTRIBUTIONS_COPY.title });
    expect(within(section).getByRole('heading', { level: 2, name: CONTRIBUTIONS_COPY.title })).toBeTruthy();
    expect(section.id).toBe('details');
  });

  it('sets the introduction beside the topics, and the topics as h3s in order', () => {
    const { container } = render(<Details onOpenPage={vi.fn()} />);
    expect(screen.getByText(CONTRIBUTIONS_COPY.intro)).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(CONTRIBUTIONS_COPY.topics.map((topic) => topic.title));
    expect(container.querySelectorAll('.tqw-details__topic-body')).toHaveLength(3);
  });

  it('leaves the legal pages and licences to the footer', () => {
    render(<Details onOpenPage={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: 'More about UNHELD' })).toBeNull();
    for (const name of ['About', 'Credits', 'Privacy', 'Licences']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('promises no public submission facility that does not exist', () => {
    const { container } = render(<Details onOpenPage={vi.fn()} />);
    expect(container.querySelector('form, input, textarea')).toBeNull();
    expect(container.textContent).not.toMatch(/submit your|send us your|upload your/i);
  });

  it('says what stays on the device and what does not (one small record, nothing sent)', () => {
    const { container } = render(<Details onOpenPage={vi.fn()} />);
    expect(container.textContent).toMatch(/device only/i);
    expect(container.textContent).toMatch(/nothing is sent anywhere/i);
  });
});
