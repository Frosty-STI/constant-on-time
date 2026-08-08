import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BlockPuzzle } from './BlockPuzzle';

describe('PSpice block-construction puzzle', () => {
  it('deterministically changes the order without silently solving it', async () => {
    const user = userEvent.setup();
    const { container } = render(<BlockPuzzle architecture={0} includeCurrentLimit includeBalance includeShedding />);
    const readOrder = () => [...container.querySelectorAll('.block-flow li strong')].map((node) => node.textContent);
    const expected = ['Feedback divider', 'Ripple sum', 'Comparator', 'Minimum off-time gate', 'One-shot', 'Buck phase', 'Current sense'];
    const initial = readOrder();
    await user.click(screen.getByRole('button', { name: 'Shuffle' }));
    const shuffled = readOrder();
    expect(shuffled).not.toEqual(initial);
    expect(shuffled).not.toEqual(expected);
  });
});
