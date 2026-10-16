import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  HATCH_INTERIOR,
  OFFICE_LEGIBILITY,
  STAMP_WORD,
  TEXT_MODE_NOTICE,
  TEXT_MODE_SCENE,
  type CertificationState,
} from '@tqw/engine';
import { splitStencil, TextOffice } from './TextOffice.tsx';
import { stamped, stateAfter } from './testUtils.ts';

function resolved(): CertificationState {
  return stateAfter(
    { type: 'PRESS' }, { type: 'RELEASE' }, { type: 'RESPONSE_SETTLED', step: 1 },
    { type: 'DRAWER_OPENED' }, { type: 'INSPECTION_MARKED' }, { type: 'PULL_HATCH' },
  );
}

function marked(): CertificationState {
  return stateAfter(
    { type: 'PRESS' }, { type: 'RELEASE' }, { type: 'RESPONSE_SETTLED', step: 1 },
    { type: 'DRAWER_OPENED' }, { type: 'INSPECTION_MARKED' },
  );
}

function setup(
  state: CertificationState,
  extra: { reducedMotion?: boolean; noticeAction?: ReactNode; notice?: string } = {},
) {
  const handlers = {
    onPressStart: vi.fn(),
    onPressEnd: vi.fn(),
    onOpenMemo: vi.fn(),
    onReset: vi.fn(),
  };
  const view = render(
    <TextOffice
      state={state}
      notice={extra.notice ?? TEXT_MODE_NOTICE.chosen}
      noticeAction={extra.noticeAction}
      reducedMotion={extra.reducedMotion ?? false}
      {...handlers}
    />,
  );
  const imprints = () => view.container.querySelectorAll('.tqw-imprint');
  return { ...handlers, ...view, imprints };
}

describe('TextOffice document', () => {
  it('has the room as its level-one heading', () => {
    setup(stamped(0));
    expect(screen.getByRole('heading', { level: 1, name: 'The Certification Office' })).toBeTruthy();
  });

  it('puts the notice in a note, followed by its action', () => {
    setup(stamped(0), {
      notice: TEXT_MODE_NOTICE.contextLost,
      noticeAction: <button type="button">Try the 3D view again</button>,
    });
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(TEXT_MODE_NOTICE.contextLost);
    const action = screen.getByRole('button', { name: 'Try the 3D view again' });
    expect(note.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('describes the room with the authored scene text', () => {
    setup(stamped(0));
    for (const paragraph of TEXT_MODE_SCENE) expect(screen.getByText(paragraph)).toBeTruthy();
  });

  it('titles the form', () => {
    setup(stamped(0));
    const title = screen.getByRole('heading', { level: 2, name: OFFICE_LEGIBILITY.form });
    expect(title.textContent).toBe(OFFICE_LEGIBILITY.form);
  });

  it('reads in order: heading, notice, opening line, machine, controls, rest of the scene, form', () => {
    const { container } = setup(stamped(1));
    const order = [
      container.querySelector('h1'),
      container.querySelector('[role="note"]'),
      container.querySelector('.tqw-office__scene'),
      container.querySelector('.tqw-machine'),
      container.querySelector('.tqw-office__actions'),
      container.querySelector('.tqw-office__scene-rest'),
      container.querySelector('.tqw-form'),
    ];
    order.forEach((node, i) => {
      expect(node, `item ${i}`).not.toBeNull();
      const next = order[i + 1];
      if (next) expect(node!.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING, `item ${i} before ${i + 1}`).toBeTruthy();
    });
  });

  it('puts only the opening line before the machine, so the demand and the first action share a screen', () => {
    const { container } = setup(stamped(0));
    const [opening, ...rest] = TEXT_MODE_SCENE;
    const intro = container.querySelector('.tqw-office__scene');
    expect(intro?.textContent).toBe(opening);
    expect(intro?.querySelectorAll('p')).toHaveLength(1);
    const after = container.querySelector('.tqw-office__scene-rest');
    expect(Array.from(after?.querySelectorAll('p') ?? []).map((p) => p.textContent)).toEqual(rest);
    expect(container.querySelector('.tqw-machine')?.contains(after)).toBe(false);
  });

  it('marks whether the memo has been found, which restyles the controls', () => {
    const before = setup(stamped(1));
    expect(before.container.querySelector('.tqw-office')?.getAttribute('data-memo')).toBe('hidden');
    before.unmount();
    const after = setup(resolved());
    expect(after.container.querySelector('.tqw-office')?.getAttribute('data-memo')).toBe('revealed');
  });

  it('carries the reduced-motion preference on its root', () => {
    const { container, rerender, ...rest } = setup(stamped(0), { reducedMotion: true });
    expect(container.querySelector('.tqw-office')?.getAttribute('data-reduced-motion')).toBe('true');
    rerender(
      <TextOffice
        state={stamped(0)}
        notice={TEXT_MODE_NOTICE.chosen}
        reducedMotion={false}
        onPressStart={rest.onPressStart}
        onPressEnd={rest.onPressEnd}
        onOpenMemo={rest.onOpenMemo}
        onReset={rest.onReset}
      />,
    );
    expect(container.querySelector('.tqw-office')?.getAttribute('data-reduced-motion')).toBe('false');
  });
});

describe('TextOffice machine', () => {
  it('has exactly one live region, and it is the machine readout', () => {
    const { container } = setup(stamped(2));
    const regions = container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]');
    expect(regions).toHaveLength(1);
    expect(screen.getByRole('status').className).toContain('tqw-readout');
    expect(screen.getByRole('status').className).not.toContain('tqw-visually-hidden');
  });

  it('shows the display on the amber window and the receipt on the strip', () => {
    const state = stamped(1);
    setup(state);
    const status = screen.getByRole('status');
    expect(status.querySelector('.tqw-readout__display')?.textContent).toBe(state.display);
    expect(status.querySelector('.tqw-readout__receipt')?.textContent).toBe(state.receipt);
  });

  it('keeps the hatch shut, with nothing stencilled and nothing exposed, until the memo is revealed', () => {
    const { container } = setup(marked());
    expect(container.querySelector('.tqw-hatch__stencil')).toBeNull();
    const hatch = container.querySelector('.tqw-hatch');
    expect(hatch?.getAttribute('data-open')).toBe('false');
    expect(hatch?.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the hatch and stencils its interior once the memo is revealed', () => {
    const { container } = setup(resolved());
    expect(container.querySelector('.tqw-hatch__stencil')?.textContent).toBe(HATCH_INTERIOR);
    const hatch = container.querySelector('.tqw-hatch');
    expect(hatch?.getAttribute('data-open')).toBe('true');
    expect(screen.getByRole('group', { name: 'Front hatch' })).toBe(hatch);
  });

  it('waiting does not reveal the hatch or memo', () => {
    const { container } = setup(stateAfter({ type: 'STILLNESS' }));
    expect(container.querySelector('.tqw-hatch__stencil')).toBeNull();
    expect(container.querySelector('.tqw-hatch')?.getAttribute('data-open')).toBe('false');
  });

  it('sets the verdict apart from the supporting line, and rejoins to the authored stencil', () => {
    const { container } = setup(resolved());
    const stencil = container.querySelector('.tqw-hatch__stencil')!;
    const lead = stencil.querySelector('.tqw-hatch__lead')?.textContent;
    const verdict = stencil.querySelector('.tqw-hatch__verdict')?.textContent;
    expect(lead).toBe('RECEIVING AUTHORITY —');
    expect(verdict).toBe('NEVER INSTALLED');
    expect(`${lead} ${verdict}`).toBe(HATCH_INTERIOR);
  });

  it('keeps every board indicator off after a stamp', () => {
    const { container } = setup(stamped(1));
    const lit = container.querySelectorAll('.tqw-machine__lamp[data-lit="true"]');
    expect(lit).toHaveLength(0);
    expect(container.querySelectorAll('.tqw-machine__lamp')).toHaveLength(5);
  });
});

describe('TextOffice form imprints', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [5, 1],
  ])('shows at most one application mark: %i press attempts -> %i', (stamps, expected) => {
    const { imprints } = setup(stamped(stamps));
    expect(imprints()).toHaveLength(expected);
  });

  it('stamps every imprint with the stamp word', () => {
    const { imprints } = setup(stamped(1));
    const words = Array.from(imprints()).map((li) => li.textContent);
    expect(words).toEqual([STAMP_WORD]);
  });

  it('lists the imprints for assistive technology and hides the empty list', () => {
    const empty = setup(stamped(0));
    expect(screen.queryByRole('list', { name: 'Stamp impressions' })).toBeNull();
    empty.unmount();
    setup(stamped(1));
    expect(screen.getByRole('list', { name: 'Stamp impressions' }).children).toHaveLength(1);
  });

  it('marks only the newest imprint to settle', () => {
    const { imprints } = setup(stamped(1));
    const flags = Array.from(imprints()).map((li) => li.getAttribute('data-newest'));
    expect(flags).toEqual(['true']);
  });

  it('gives each imprint a stable pose as custom properties', () => {
    const first = setup(stamped(1));
    const a = Array.from(first.imprints()).map((li) => li.getAttribute('style'));
    first.unmount();
    const second = setup(stamped(1));
    const b = Array.from(second.imprints()).map((li) => li.getAttribute('style'));
    expect(a).toEqual(b);
    expect(a[0]).toMatch(/--tilt:\s*-?[\d.]+deg/);
    expect(new Set(a).size).toBe(1);
  });

  it('does not add another impression on repeat press attempts', () => {
    const full = setup(stamped(1));
    const before = full.imprints()[0];
    full.rerender(
      <TextOffice
        state={stamped(2)}
        notice={TEXT_MODE_NOTICE.chosen}
        reducedMotion={false}
        onPressStart={full.onPressStart}
        onPressEnd={full.onPressEnd}
        onOpenMemo={full.onOpenMemo}
        onReset={full.onReset}
      />,
    );
    const after = full.imprints()[0];
    expect(full.imprints()).toHaveLength(1);
    expect(after).toBe(before);
  });
});

describe('TextOffice controls', () => {
  it('offers the desk stamp button', () => {
    const { container } = setup(stamped(0));
    const stamp = screen.getByRole('button', { name: 'Hold to stamp the form' });
    expect(stamp.getAttribute('data-variant')).toBe('desk');
    expect(container.contains(stamp)).toBe(true);
  });

  it('wires the stamp to the press handlers', () => {
    const { onPressStart, onPressEnd } = setup(stamped(0));
    const stamp = screen.getByRole('button', { name: 'Hold to stamp the form' });
    fireEvent.keyDown(stamp, { key: ' ', code: 'Space' });
    fireEvent.keyUp(stamp, { key: ' ', code: 'Space' });
    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });

  it('shows the memo button only once the memo is revealed', () => {
    const before = setup(stamped(1));
    expect(screen.queryByRole('button', { name: /Read Memo 001/ })).toBeNull();
    before.unmount();
    const after = setup(resolved());
    fireEvent.click(screen.getByRole('button', { name: 'Read Memo 001' }));
    expect(after.onOpenMemo).toHaveBeenCalledTimes(1);
  });

  it('does not reveal a memo when the visitor waits', () => {
    setup(stateAfter({ type: 'STILLNESS' }));
    expect(screen.queryByRole('button', { name: 'Read Memo 001' })).toBeNull();
  });

  it('offers Start over only once there is something to start over from', () => {
    const fresh = setup(stamped(0));
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
    fresh.unmount();

    const used = setup(stamped(1));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(used.onReset).toHaveBeenCalledTimes(1);
    used.unmount();

    setup(resolved());
    expect(screen.getByRole('button', { name: 'Start over' })).toBeTruthy();
  });
});

describe('splitStencil', () => {
  it('splits at the dash and rejoins to the original', () => {
    const { lead, verdict } = splitStencil('A THING — NOT HERE');
    expect(lead).toBe('A THING —');
    expect(verdict).toBe('NOT HERE');
    expect(`${lead} ${verdict}`).toBe('A THING — NOT HERE');
  });

  it('splits at the last dash when there are several', () => {
    expect(splitStencil('ONE — TWO — THREE')).toEqual({ lead: 'ONE — TWO —', verdict: 'THREE' });
  });

  it('treats text with no dash as all verdict', () => {
    expect(splitStencil('NOT INSTALLED')).toEqual({ lead: '', verdict: 'NOT INSTALLED' });
  });
});
