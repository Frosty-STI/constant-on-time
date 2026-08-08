import { describe, expect, it } from 'vitest';

import { matchesTextPrediction } from './PredictionPanel';

describe('text prediction grading', () => {
  it('accepts normalized exact answers and explicit aliases', () => {
    expect(matchesTextPrediction('YES', 'yes')).toBe(true);
    expect(matchesTextPrediction('low-side MOSFET body diode', 'low-side body diode')).toBe(true);
    expect(matchesTextPrediction('RC pair', 'R-C pair')).toBe(true);
  });

  it('rejects fragments and unrelated containing strings', () => {
    expect(matchesTextPrediction('y', 'capacitance')).toBe(false);
    expect(matchesTextPrediction('c', 'capacitance')).toBe(false);
    expect(matchesTextPrediction('phase', 'phase 2')).toBe(false);
    expect(matchesTextPrediction('yes indeed', 'yes')).toBe(false);
  });
});
