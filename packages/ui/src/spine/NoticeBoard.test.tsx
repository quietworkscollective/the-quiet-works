import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BOARD, CHAMBERS } from '@tqw/engine';
import { NoticeBoard } from './NoticeBoard.tsx';

function setup(open = true) {
  const handlers = { onChoose: vi.fn(), onClose: vi.fn() };
  const view = render(<NoticeBoard open={open} chambers={CHAMBERS} {...handlers} />);
  return { ...handlers, view };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NoticeBoard', () => {
  function focusScrollerWhenShown() {
    const showModal = HTMLDialogElement.prototype.showModal;
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      showModal.call(this);
      const scroller = this.querySelector<HTMLElement>('.tqw-board__clippings')!;
      // Native dialog focusing can select a scroll area even though Tab skips that area.
      scroller.tabIndex = -1;
      scroller.focus();
    });
  }

  it('starts at the first open room action when native dialog focus selects the scroller', () => {
    focusScrollerWhenShown();
    setup();
    const first = screen.getByRole('button', { name: 'Go in: The Certification Office' });
    expect(document.activeElement).toBe(first);
  });

  it('starts at Close when every clipping is sealed', () => {
    focusScrollerWhenShown();
    const chambers = CHAMBERS.map(chamber => ({ ...chamber, status: 'sealed' as const }));
    render(<NoticeBoard open chambers={chambers} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close the notice board' }));
  });

  it('is a dialog named "Notice board" with its introduction', () => {
    setup();
    const board = screen.getByRole('dialog', { name: 'Notice board' });
    expect(within(board).getByRole('heading', { level: 2, name: 'Notice board' })).toBeTruthy();
    expect(within(board).getByText(BOARD.intro)).toBeTruthy();
  });

  it('pins one clipping per chamber, in corridor order, with headline, dek and dateline', () => {
    setup();
    const clippings = within(screen.getByRole('dialog')).getAllByRole('listitem');
    expect(clippings).toHaveLength(CHAMBERS.length);
    CHAMBERS.forEach((chamber, index) => {
      const clipping = clippings[index]!;
      expect(within(clipping).getByRole('heading', { level: 3, name: chamber.clipping.headline })).toBeTruthy();
      expect(within(clipping).getByText(chamber.clipping.dek)).toBeTruthy();
      expect(within(clipping).getByText(chamber.clipping.dateline)).toBeTruthy();
    });
  });

  it('cuts the clippings from bone, buff and grey-green stock in turn', () => {
    setup();
    const stocks = within(screen.getByRole('dialog'))
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-stock'));
    const order = ['bone', 'buff', 'grey-green'] as const;
    expect(stocks).toEqual(CHAMBERS.map((_, index) => order[index % order.length]));
  });

  it('lets the visitor go in at an open clipping, named for its chamber', () => {
    const { onChoose } = setup();
    const go = screen.getByRole('button', { name: 'Go in: The Certification Office' });
    expect(go.textContent).toBe('Go in');
    fireEvent.click(go);
    expect(onChoose).toHaveBeenCalledWith('certification-office');
  });

  it('gives a sealed clipping no way in, and says its status in words naming the chamber', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    for (const sealed of CHAMBERS.filter((c) => c.status === 'sealed')) {
      expect(screen.queryByRole('button', { name: `Go in: ${sealed.title}` })).toBeNull();
      expect(dialog.textContent).toContain(`${sealed.title}: Not yet open`);
    }
    expect(within(dialog).getAllByRole('button', { name: /^Go in:/ })).toHaveLength(CHAMBERS.filter((chamber) => chamber.status === 'open').length);
  });

  it('marks each clipping\'s status for styling without relying on it for meaning', () => {
    setup();
    const statuses = within(screen.getByRole('dialog'))
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-status'));
    expect(statuses).toEqual(CHAMBERS.map((c) => c.status));
  });

  it('closes from its own button', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close the notice board' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the dialog reports its own close (Escape)', () => {
    const { onClose } = setup();
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not shown while closed', () => {
    setup(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not echo a close it was asked for', () => {
    const { onClose, view } = setup(true);
    view.rerender(<NoticeBoard open={false} chambers={CHAMBERS} onChoose={vi.fn()} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
  });
});
