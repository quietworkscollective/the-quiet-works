import { render } from '@testing-library/react';
import { Captions } from './Captions.tsx';

describe('Captions', () => {
  it('is hidden from assistive technology, since the live region already carries the meaning', () => {
    const { container } = render(<Captions lines={[{ id: 1, text: '[stamp thuds onto paper]' }]} />);
    const root = container.firstElementChild;
    expect(root?.className).toBe('tqw-captions');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lists lines oldest first so the newest is last', () => {
    const { container } = render(
      <Captions
        lines={[
          { id: 1, text: 'first' },
          { id: 2, text: 'second' },
        ]}
      />,
    );
    const text = Array.from(container.querySelectorAll('.tqw-captions__line')).map((p) => p.textContent);
    expect(text).toEqual(['first', 'second']);
  });

  it('shows at most the three newest lines', () => {
    const lines = [1, 2, 3, 4, 5].map((id) => ({ id, text: `line ${id}` }));
    const { container } = render(<Captions lines={lines} />);
    const text = Array.from(container.querySelectorAll('.tqw-captions__line')).map((p) => p.textContent);
    expect(text).toEqual(['line 3', 'line 4', 'line 5']);
  });
});
