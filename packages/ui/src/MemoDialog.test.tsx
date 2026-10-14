import { act, fireEvent, render, screen } from '@testing-library/react';
import { MEMO_001, type MemoSource } from '@tqw/engine';
import { MemoDialog } from './MemoDialog.tsx';

function dialogOf(container: HTMLElement): HTMLDialogElement {
  const dialog = container.querySelector('dialog');
  if (!dialog) throw new Error('no dialog rendered');
  return dialog;
}

function setup(open: boolean, source: MemoSource | null = 'overload') {
  const onClose = vi.fn();
  const view = render(<MemoDialog memo={MEMO_001} source={source} open={open} onClose={onClose} />);
  const rerender = (next: boolean, nextSource: MemoSource | null = source) =>
    view.rerender(<MemoDialog memo={MEMO_001} source={nextSource} open={next} onClose={onClose} />);
  return { onClose, rerender, dialog: dialogOf(view.container), container: view.container };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MemoDialog open and close', () => {
  it('stays closed until `open` is true', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { dialog } = setup(false);
    expect(show).not.toHaveBeenCalled();
    expect(dialog.open).toBe(false);
  });

  it('opens with showModal() when `open` becomes true', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { dialog, rerender } = setup(false);
    rerender(true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
  });

  it('opens straight away when mounted already open', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { dialog } = setup(true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
  });

  it('does not call showModal again while it is already open', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { rerender } = setup(false);
    rerender(true);
    rerender(true, 'stillness');
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('reports a native close event (Escape) to onClose exactly once', () => {
    const { dialog, rerender, onClose } = setup(true);
    act(() => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // The parent then closes its state; the dialog is already closed and must stay quiet.
    rerender(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Close memo button closes the dialog and reports once', () => {
    const { dialog, onClose } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close memo' }));
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with close() when the parent turns `open` off, without echoing onClose back', () => {
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { dialog, rerender, onClose } = setup(true);
    rerender(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('after a parent-driven close, a later Escape close is still reported', () => {
    const { dialog, rerender, onClose } = setup(true);
    rerender(false);
    rerender(true);
    act(() => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MemoDialog content', () => {
  it('is labelled by its title', () => {
    const { dialog } = setup(true);
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(MEMO_001.title);
    expect(screen.getByRole('heading', { name: MEMO_001.title })).toBeTruthy();
  });

  it('moves focus to the heading when it opens', () => {
    const { rerender } = setup(false);
    rerender(true);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: MEMO_001.title }));
  });

  it('shows the from line, every body paragraph and the honest footnote', () => {
    setup(true);
    expect(screen.getByText(MEMO_001.from)).toBeTruthy();
    for (const paragraph of MEMO_001.body) expect(screen.getByText(paragraph)).toBeTruthy();
    expect(screen.getByText('Fictional office correspondence.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close memo' })).toBeTruthy();
  });

  it.each<MemoSource>(['overload', 'stillness'])('renders the provenance for source "%s"', (source) => {
    const { container } = setup(true, source);
    const provenance = container.querySelector('.tqw-memo__provenance');
    expect(provenance?.textContent).toBe(MEMO_001.provenance[source]);
  });

  it('shows only the provenance of its own source', () => {
    setup(true, 'stillness');
    expect(screen.queryByText(MEMO_001.provenance.overload)).toBeNull();
    expect(screen.getByText(MEMO_001.provenance.stillness)).toBeTruthy();
  });

  it('omits the provenance line when there is no source', () => {
    const { container } = setup(true, null);
    expect(container.querySelector('.tqw-memo__provenance')).toBeNull();
  });
});
