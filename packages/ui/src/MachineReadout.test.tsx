import { render, screen } from '@testing-library/react';
import { ESCALATION, INITIAL_DISPLAY } from '@tqw/engine';
import { LONG_LINE, MachineReadout } from './MachineReadout.tsx';
import { stamped, stateAfter } from './testUtils.ts';

const MEMO_NOTICE = 'A memo has slid out of the machine.';

function resolved() {
  return stateAfter(
    { type: 'PRESS' }, { type: 'RELEASE' }, { type: 'RESPONSE_SETTLED', step: 1 },
    { type: 'DRAWER_OPENED' }, { type: 'INSPECTION_MARKED' }, { type: 'PULL_HATCH' },
  );
}

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
    render(<MachineReadout state={stamped(1)} visible={false} />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('tqw-visually-hidden');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain(ESCALATION[0]!.display);
  });

  it('shows no visually-hidden class on the visible region', () => {
    render(<MachineReadout state={stamped(1)} visible />);
    expect(screen.getByRole('status').className).not.toContain('tqw-visually-hidden');
  });
});

describe('MachineReadout memo announcement', () => {
  it('announces the memo in the update that reveals it', () => {
    const { rerender } = render(<MachineReadout state={stamped(1)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);

    rerender(<MachineReadout state={resolved()} visible />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain(MEMO_NOTICE);
    expect(screen.getByText(MEMO_NOTICE, { exact: false }).className).toContain('tqw-visually-hidden');
  });

  it('drops the notice at the next change so later replies are read alone', () => {
    const { rerender } = render(<MachineReadout state={stamped(1)} visible />);
    rerender(<MachineReadout state={resolved()} visible />);
    rerender(<MachineReadout state={stamped(1)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
  });

  it('waiting does not announce or reveal a memo', () => {
    const { rerender } = render(<MachineReadout state={stamped(0)} visible />);
    rerender(<MachineReadout state={stateAfter({ type: 'STILLNESS' })} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
  });

  it('does not announce a memo that was already revealed when the readout mounted', () => {
    render(<MachineReadout state={resolved()} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
  });

  it('announces again if the office is reset and the memo is found again', () => {
    const { rerender } = render(<MachineReadout state={stamped(1)} visible />);
    rerender(<MachineReadout state={resolved()} visible />);
    rerender(<MachineReadout state={stamped(0)} visible />);
    rerender(<MachineReadout state={stamped(1)} visible />);
    expect(screen.getByRole('status').textContent).not.toContain(MEMO_NOTICE);
    rerender(<MachineReadout state={resolved()} visible />);
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

  it('keeps the new short refusal line in the compact layout', () => {
    render(<MachineReadout state={stamped(1)} visible />);
    expect(displayOf().textContent).toBe('APPROVAL HELD');
    expect(displayOf().getAttribute('data-long')).toBe('false');
  });

  it('marks the authored repeat reply as long', () => {
    const state = { ...stamped(1), display: 'APPLICATION ALREADY RECEIVED' };
    render(<MachineReadout state={state} visible />);
    const text = 'APPLICATION ALREADY RECEIVED';
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
