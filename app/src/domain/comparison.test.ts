import { describe, expect, it } from 'vitest';

import { nearestXIndex } from './comparison';

describe('pinned-comparison cursor mapping', () => {
  it('maps a cursor to the nearest x value instead of reusing an unrelated index', () => {
    expect(nearestXIndex([0, 0.25, 0.5, 0.75, 1], 0.62)).toBe(2);
    expect(nearestXIndex([0, 10, 20], 17)).toBe(2);
  });

  it('clamps outside the baseline domain and tolerates an empty trace', () => {
    expect(nearestXIndex([2, 4, 6], -10)).toBe(0);
    expect(nearestXIndex([2, 4, 6], 10)).toBe(2);
    expect(nearestXIndex([], 1)).toBe(0);
  });
});
