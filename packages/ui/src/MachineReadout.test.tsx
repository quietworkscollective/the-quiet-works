import { render, screen } from '@testing-library/react';
import { ESCALATION, INITIAL_DISPLAY } from '@tqw/engine';
import { LONG_LINE, MachineReadout } from './MachineReadout.tsx';
import { stamped, stateAfter } from './testUtils.ts';

const MEMO_NOTICE = 'A memo has slid out of the machine.';

describe('MachineReadout', () => {
  it('is one polite, atomic live region', () => {
    render(<MachineReadout state={stamped(0)} visible />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('reads the display line before any stamp, with a hidden prefix and no receipt', () => {
    render(<MachineReadout state={stamped(0)} visible />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('The machine reads:');
    expect(status.textContent).toContain(INITIAL_DISPLAY);
    expect(status.querySelector('.tqw-readout__receipt')).toBeNull();
    expect(status.querySelector('.tqw-readout__sep')).toBeNull();
  });

  it('carries both the display and the receipt after a stamp', () => {
    render(<MachineReadout state={stamped(1)} visible />);
    const status = screen.getByRole('status');
    expect(status.querySelector('.tqw-readout__display')?.textContent).toBe(ESCALATION[0]!.display);
    expect(status.querySelector('.tqw-readout__receipt')?.textContent).toBe(ESCALATION[0]!.receipt);
    expect(status.textContent).toContain('—');
  });

  it('hides the prefix visually but keeps it for assistive technology', () => {
    render(<MachineReadout state={stamped(0)} visible />);
    const prefix = screen.getByText('The machine reads:');
    expect(prefix.className).toContain('tqw-visually-hidden');
  });

  it('renders the same live region visually hidden when not visible', () => {
    render(<MachineReadout state={stamped(2)} visible={false} />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('tqw-visually-hidden');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain(ESCALATION[1]!.display);
  });

  it('shows no visually-hidden class on the visible region', () => {
    render(<MachineReadout state={stamped(1)} visible />);
    expect(screen.getByRole('status').className).not.toContain('tqw-visually-hidden');
  });
});

describe('MachineReadout memo announcement', () => {
  it('announces the memo in the update that reveals it', () => {
    const { rerender } = render(<MachineReadout state={stamped(4)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);

    rerender(<MachineReadout state={stamped(5)} visible />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain(MEMO_NOTICE);
    expect(screen.getByText(MEMO_NOTICE, { exact: false }).className).toContain('tqw-visually-hidden');
  });

  it('drops the notice at the next change so later replies are read alone', () => {
    const { rerender } = render(<MachineReadout state={stamped(4)} visible />);
    rerender(<MachineReadout state={stamped(5)} visible />);
    rerender(<MachineReadout state={stamped(6)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
  });

  it('also announces a memo revealed by stillness', () => {
    const { rerender } = render(<MachineReadout state={stamped(0)} visible />);
    rerender(<MachineReadout state={stateAfter({ type: 'STILLNESS' })} visible />);
    expect(screen.getByRole('status').textContent).toContain(MEMO_NOTICE);
  });

  it('does not announce a memo that was already revealed when the readout mounted', () => {
    render(<MachineReadout state={stamped(5)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
  });

  it('announces again if the office is reset and the memo is found again', () => {
    const { rerender } = render(<MachineReadout state={stamped(4)} visible />);
    rerender(<MachineReadout state={stamped(5)} visible />);
    rerender(<MachineReadout state={stamped(0)} visible />);
    rerender(<MachineReadout state={stamped(4)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
    rerender(<MachineReadout state={stamped(5)} visible />);
    expect(screen.getByRole('status').textContent).toContain(MEMO_NOTICE);
  });
});

describe('MachineReadout long lines', () => {
  const displayOf = () => screen.getByRole('status').querySelector('.tqw-readout__display')!;

  it('marks short identifiers as not long, so they keep their generous tracking', () => {
    render(<MachineReadout state={stamped(2)} visible />);
    // PROOF OUTDATED
    expect(displayOf().getAttribute('data-long')).toBe('false');
  });

  it.each([
    [3, 'PLEASE HAVE SOMEONE ELSE CONFIRM'],
    [4, 'CONFIRMATION REQUIRES APPROVAL'],
  ])('marks the status sentence at stamp %i as long: %s', (stamps, text) => {
    render(<MachineReadout state={stamped(stamps)} visible />);
    expect(displayOf().textContent).toBe(text);
    expect(displayOf().getAttribute('data-long')).toBe('true');
  });

  it('switches at exactly one character past the threshold', () => {
    const at = { ...stamped(1), display: 'A'.repeat(LONG_LINE) };
    const over = { ...stamped(1), display: 'A'.repeat(LONG_LINE + 1) };
    const { rerender } = render(<MachineReadout state={at} visible />);
    expect(displayOf().getAttribute('data-long')).toBe('false');
    rerender(<MachineReadout state={over} visible />);
    expect(displayOf().getAttribute('data-long')).toBe('true');
  });
});
