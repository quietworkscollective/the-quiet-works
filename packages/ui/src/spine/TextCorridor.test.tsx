import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CHAMBERS, TEXT_MODE_CORRIDOR } from '@tqw/engine';
import { TextCorridor } from './TextCorridor.tsx';
import type { DoorListItem } from './types.ts';

const doors: readonly DoorListItem[] = CHAMBERS.map((c) => ({
  id: c.id,
  title: c.title,
  status: c.status,
  description: c.doorDescription,
}));

function setup(notice?: React.ReactNode) {
  const handlers = { onFocusDoor: vi.fn(), onOpenDoor: vi.fn(), onOpenBoard: vi.fn() };
  render(
    <TextCorridor
      doors={{ doors, focus: null, onFocusDoor: handlers.onFocusDoor, onOpenDoor: handlers.onOpenDoor }}
      onOpenBoard={handlers.onOpenBoard}
      notice={notice}
    />,
  );
  return handlers;
}

afterEach(() => cleanup());

describe('TextCorridor', () => {
  it('carries no brand block: the hero above it is the one place UNHELD is set', () => {
    setup();
    const main = screen.getByRole('main');
    expect(main.querySelector('.tqw-text-brand')).toBeNull();
    expect(main.querySelector('svg[data-mark]')).toBeNull();
    expect(within(main).queryByRole('heading', { name: 'UNHELD' })).toBeNull();
    expect(main.textContent).not.toContain('A space for everything we carry.');
  });

  it('opens on the corridor: its heading is the first thing in the reading order', () => {
    setup();
    const main = screen.getByRole('main');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('The corridor');
    expect(main.firstElementChild).toBe(heading);
  });

  it('reads the corridor prose, paragraph by paragraph, before the door list', () => {
    setup();
    const heading = screen.getByRole('heading', { level: 1 });
    const list = screen.getByRole('navigation', { name: 'Doors' });
    let previous: Element = heading;
    for (const paragraph of TEXT_MODE_CORRIDOR) {
      const p = screen.getByText(paragraph);
      expect(previous.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(p.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      previous = p;
    }
  });

  it('lists every door with its description after the prose, and the board button', () => {
    const { onOpenBoard, onOpenDoor } = setup();
    const list = screen.getByRole('navigation', { name: 'Doors' });
    expect(within(list).getAllByRole('button')).toHaveLength(CHAMBERS.length);
    expect(within(list).getByText(CHAMBERS[0]!.doorDescription)).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'The Certification Office, open the door' }));
    expect(onOpenDoor).toHaveBeenCalledWith('certification-office');
    fireEvent.click(screen.getByRole('button', { name: 'Notice board' }));
    expect(onOpenBoard).toHaveBeenCalledTimes(1);
  });

  it('shows the reason for text mode first, above the corridor', () => {
    setup(<p role="note">Text mode. The corridor and every door are written out here.</p>);
    const note = screen.getByRole('note');
    const main = screen.getByRole('main');
    const children = [...main.children];
    expect(children.indexOf(note)).toBe(0);
    expect(children.indexOf(screen.getByRole('heading', { level: 1 }))).toBe(1);
  });
});
