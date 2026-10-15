import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CHAMBERS } from '@tqw/engine';
import { publicDoorDescription } from './chamberCopy.ts';
import { DoorList, doorLabel } from './DoorList.tsx';
import type { DoorListItem, DoorListProps } from './types.ts';

const doors: readonly DoorListItem[] = CHAMBERS.map((c) => ({
  id: c.id,
  title: c.title,
  status: c.status,
  description: c.doorDescription,
}));

function setup(props: Partial<DoorListProps> = {}) {
  const handlers = { onFocusDoor: vi.fn(), onOpenDoor: vi.fn() };
  const view = render(<DoorList doors={doors} focus={null} variant="overlay" {...handlers} {...props} />);
  return { ...handlers, view };
}

afterEach(() => cleanup());

describe('doorLabel', () => {
  it('is "<title>, open the door" or "<title>, not yet open"', () => {
    expect(doorLabel('The Certification Office', 'open')).toBe('The Certification Office, open the door');
    expect(doorLabel('The Apartment', 'sealed')).toBe('The Apartment, not yet open');
  });
});

describe.each(['overlay', 'list'] as const)('DoorList (%s)', (variant) => {
  it('lists every door in corridor order as a button, named and worded the same', () => {
    setup({ variant });
    const buttons = within(screen.getByRole('navigation', { name: 'Doors' })).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(doors.map((door) => doorLabel(door.title, door.status)));
    // The e2e suite matches on text: it has to be the same words, comma included.
    expect(buttons.map((b) => b.textContent)).toEqual(buttons.map((b) => b.getAttribute('aria-label')));
  });

  it('says each door\'s status in text, never in colour alone', () => {
    setup({ variant });
    const statuses = [...document.querySelectorAll('.tqw-door__status')].map((s) => s.textContent);
    expect(statuses).toEqual(doors.map((door) => door.status === 'open' ? 'open the door' : 'not yet open'));
  });

  it('asks the corridor to turn to a door when it takes focus', () => {
    const { onFocusDoor } = setup({ variant });
    fireEvent.focus(screen.getByRole('button', { name: 'The Tomorrow Engine, not yet open' }));
    expect(onFocusDoor).toHaveBeenCalledWith('tomorrow-engine');
  });

  it('opens a door when it is activated, sealed or not (the corridor decides what happens)', () => {
    const { onOpenDoor } = setup({ variant });
    fireEvent.click(screen.getByRole('button', { name: 'The Certification Office, open the door' }));
    fireEvent.click(screen.getByRole('button', { name: 'The Apartment, not yet open' }));
    expect(onOpenDoor.mock.calls.map(([id]) => id)).toEqual(['certification-office', 'apartment']);
  });

  it('marks the focused door as current', () => {
    setup({ variant, focus: 'apartment' });
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current.map((b) => b.getAttribute('data-door'))).toEqual(['apartment']);
  });

  it('carries each door\'s status as data for styling', () => {
    setup({ variant });
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-status'))).toEqual(doors.map((door) => door.status));
  });
});

describe('DoorList variants', () => {
  it('the overlay is only the doors: no descriptions on top of the 3D view', () => {
    setup({ variant: 'overlay' });
    expect(document.querySelector('.tqw-door__description')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Doors' }).className).toContain('tqw-doors--overlay');
  });

  it('the list reads each door with its description', () => {
    setup({ variant: 'list' });
    const items = within(screen.getByRole('navigation', { name: 'Doors' })).getAllByRole('listitem');
    expect(items).toHaveLength(CHAMBERS.length);
    CHAMBERS.forEach((chamber, index) => {
      expect(within(items[index]!).getByText(chamber.doorDescription)).toBeTruthy();
    });
    expect(screen.getByRole('navigation', { name: 'Doors' }).className).toContain('tqw-doors--list');
  });

  it('shows only the release status for sealed door descriptions in production', () => {
    const sealed = doors.find((door) => door.id === 'exchange')!;
    const open = doors.find((door) => door.id === 'certification-office')!;
    expect(publicDoorDescription({ ...sealed, status: 'sealed' }, true)).toBe('Not yet open.');
    expect(publicDoorDescription(open, true)).toBe(open.description);
  });

  it('keeps the comma between title and status as real text, for the machine', () => {
    setup({ variant: 'overlay' });
    const button = screen.getByRole('button', { name: 'The Certification Office, open the door' });
    expect(button.querySelector('.tqw-door__sep')?.textContent).toBe(', ');
  });
});
