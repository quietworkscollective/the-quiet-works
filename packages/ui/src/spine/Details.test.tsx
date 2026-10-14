import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CONTRIBUTIONS_COPY } from '@tqw/engine';
import { Details } from './Details.tsx';

afterEach(() => cleanup());

describe('Details', () => {
  it('is a section named by its h2 title', () => {
    render(<Details onOpenPage={vi.fn()} />);
    const section = screen.getByRole('region', { name: CONTRIBUTIONS_COPY.title });
    expect(within(section).getByRole('heading', { level: 2, name: CONTRIBUTIONS_COPY.title })).toBeTruthy();
    expect(section.id).toBe('details');
  });

  it('sets the introduction beside the topics, and the topics as h3s in order', () => {
    render(<Details onOpenPage={vi.fn()} />);
    expect(screen.getByText(CONTRIBUTIONS_COPY.intro)).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(CONTRIBUTIONS_COPY.topics.map((topic) => topic.title));
    for (const topic of CONTRIBUTIONS_COPY.topics) expect(screen.getByText(topic.body)).toBeTruthy();
  });

  it('links About, Credits and Privacy, opening each as a page without navigating', () => {
    const onOpenPage = vi.fn();
    render(<Details onOpenPage={onOpenPage} />);
    const nav = screen.getByRole('navigation', { name: 'More about UNHELD' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/about', '/credits', '/privacy']);
    expect(links.map((a) => a.textContent)).toEqual(['About', 'Credits', 'Privacy']);
    expect(fireEvent.click(links[2] as HTMLElement)).toBe(false);
    expect(onOpenPage).toHaveBeenCalledWith('privacy');
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
