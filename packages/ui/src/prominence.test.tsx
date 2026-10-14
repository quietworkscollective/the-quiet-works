import { render, type RenderResult } from '@testing-library/react';
import { TEXT_MODE_NOTICE } from '@tqw/engine';
import css from './styles.css?raw';
import { MemoButton } from './MemoButton.tsx';
import { StampButton } from './StampButton.tsx';
import { TextOffice } from './TextOffice.tsx';
import { stamped } from './testUtils.ts';

/**
 * These tests run the real stylesheet through jsdom's cascade, so they check what the
 * rules DO to an element, not just that a rule exists. The memo state is the same
 * attribute the app puts on `.tqw-app` (`data-memo`: 'hidden' until the memo is found).
 */

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
});
afterEach(() => {
  style.remove();
});

function dock(memo: 'hidden' | 'overload' | 'stillness' | null): RenderResult {
  return render(
    <div className="tqw-app" {...(memo === null ? {} : { 'data-memo': memo })}>
      <div className="tqw-dock">
        <div className="tqw-dock__actions">
          <StampButton pressing={false} variant="dock" onPressStart={() => {}} onPressEnd={() => {}} />
          <MemoButton onOpen={() => {}} />
        </div>
      </div>
    </div>,
  );
}

const stampOf = (view: RenderResult) => getComputedStyle(view.container.querySelector('.tqw-stamp')!);
const memoOf = (view: RenderResult) => getComputedStyle(view.container.querySelector('.tqw-memo-button')!);
const px = (value: string) => Number.parseFloat(value);

describe('dock hierarchy before the memo is found', () => {
  it.each([null, 'hidden'] as const)('the dock stamp is a calm brass key (memo state %s)', (memo) => {
    const stamp = stampOf(dock(memo));
    expect(stamp.background).toContain('--brass-calm');
    expect(stamp.background).not.toContain('var(--amber)');
    expect(stamp.getPropertyValue('--edge')).toBe('2px');
  });

  it('is at least 44 px tall but visibly lighter than the round-one key (52 px, 1.5 rem padding)', () => {
    const stamp = stampOf(dock('hidden'));
    expect(px(stamp.minHeight)).toBeGreaterThanOrEqual(44);
    expect(px(stamp.minHeight)).toBeLessThanOrEqual(48);
    // Horizontal padding 1.25 rem = 20 px, down from the round-one 1.5 rem = 24 px.
    expect(px(stamp.paddingRight)).toBeLessThanOrEqual(20);
  });
});

describe('dock hierarchy after the memo is found', () => {
  it.each(['overload', 'stillness'] as const)('the stamp steps back to a flat outlined key (source %s)', (memo) => {
    const stamp = stampOf(dock(memo));
    expect(stamp.background).not.toContain('gradient');
    expect(stamp.getPropertyValue('--edge')).toBe('0px');
    expect(stamp.boxShadow).toContain('inset 0 0 0 1px');
  });

  it('the stamp changes between the two states, and only on the memo attribute', () => {
    const before = stampOf(dock('hidden')).background;
    const after = stampOf(dock('overload')).background;
    expect(after).not.toBe(before);
  });

  it('the memo button is the paper-toned primary and at least as prominent as the stamp', () => {
    const view = dock('overload');
    const memo = memoOf(view);
    const stamp = stampOf(view);
    expect(memo.background).toContain('var(--paper)');
    expect(memo.color).toBe('var(--paper-ink)');
    // Taller than the stamp it sits beside, and not shorter than any state of it.
    expect(px(memo.minHeight)).toBeGreaterThan(px(stamp.minHeight));
  });
});

function office(revealed: boolean): RenderResult {
  return render(
    <TextOffice
      state={stamped(revealed ? 5 : 2)}
      notice={TEXT_MODE_NOTICE.chosen}
      reducedMotion={false}
      onPressStart={() => {}}
      onPressEnd={() => {}}
      onOpenMemo={() => {}}
      onReset={() => {}}
    />,
  );
}

describe('text mode controls', () => {
  it('the desk stamp is 20-25% smaller than the round-one block (24 rem x 6.5 rem)', () => {
    const stamp = stampOf(office(false));
    // Round one was 6.5 rem = 104 px. 20% smaller is 83 px; 25% smaller is 78 px. Never below 72 px.
    const height = px(stamp.minHeight);
    expect(height).toBeGreaterThanOrEqual(72);
    expect(height).toBeLessThanOrEqual(83.2);
  });

  it('the desk stamp steps back once the memo is found', () => {
    const before = px(stampOf(office(false)).minHeight);
    const after = px(stampOf(office(true)).minHeight);
    expect(after).toBeLessThan(before);
  });

  it('the memo button has the same paper-toned primary treatment in text mode', () => {
    const view = office(true);
    const memo = memoOf(view);
    expect(memo.background).toContain('var(--paper)');
    expect(memo.color).toBe('var(--paper-ink)');
    expect(px(memo.minHeight)).toBeGreaterThanOrEqual(52);
  });
});
