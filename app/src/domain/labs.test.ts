import { describe, expect, it } from 'vitest';

import { LABS, LAB_BY_ID, LAB_IDS, MODULES } from './labs';

describe('curriculum and lab catalog', () => {
  it('contains the complete dependency sequence and named laboratories', () => {
    expect(MODULES).toHaveLength(13);
    expect(LABS.map((lab) => lab.id)).toEqual(LAB_IDS);
    expect(LAB_BY_ID.size).toBe(17);
  });

  it('discloses assumptions, sources, equations, and transfer questions for every lab', () => {
    for (const lab of LABS) {
      expect(lab.included.length, lab.id).toBeGreaterThan(1);
      expect(lab.excluded.length, lab.id).toBeGreaterThan(1);
      expect(lab.sources.length, lab.id).toBeGreaterThan(0);
      expect(lab.equation.length, lab.id).toBeGreaterThan(3);
      expect(lab.transferQuestion, lab.id).toMatch(/\?$/);
      expect(lab.parameters.length, lab.id).toBeGreaterThan(0);
    }
  });
});
