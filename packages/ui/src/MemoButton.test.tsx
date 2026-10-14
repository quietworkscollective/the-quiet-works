import { fireEvent, render, screen } from '@testing-library/react';
import { MemoButton } from './MemoButton.tsx';

describe('MemoButton', () => {
  it('is a button that reads "Read Memo 001" and opens the memo once per click', () => {
    const onOpen = vi.fn();
    render(<MemoButton onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Read Memo 001' });
    expect(button).toHaveProperty('type', 'button');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
