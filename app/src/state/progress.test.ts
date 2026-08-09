import { describe, expect, it } from 'vitest';

import { initialProgress, loadProgress, parseProgress, progressStorageKey, resetStoredProgress, saveProgress, serializeProgress } from './progress';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
};

describe('local learner progress', () => {
  it('round-trips the complete versioned schema', () => {
    const progress = {
      ...initialProgress(),
      conceptMastery: { ripple: 'proficient' as const },
      completedReadings: ['FPE3'],
      simulatorPresets: { ripple: { vin: 12, inductance: 1 } },
      notes: { ripple: 'Check the off-slope sign.' },
      bookmarks: ['ripple'],
    };
    const parsed = parseProgress(serializeProgress(progress));
    expect(parsed.conceptMastery.ripple).toBe('proficient');
    expect(parsed.notes.ripple).toContain('off-slope');
  });

  it('persists, loads, and resets without a backend', () => {
    const storage = memoryStorage();
    const progress = { ...initialProgress(), bookmarks: ['cot-pulse'] };
    saveProgress(progress, storage);
    expect(storage.values.has(progressStorageKey)).toBe(true);
    expect(loadProgress(storage).bookmarks).toEqual(['cot-pulse']);
    expect(resetStoredProgress(storage).bookmarks).toEqual([]);
    expect(storage.values.has(progressStorageKey)).toBe(false);
  });

  it('rejects unsafe keys, malformed JSON, oversize input, and invalid schema', () => {
    expect(() => parseProgress('{"__proto__":{"polluted":true}}')).toThrow(/unsafe/i);
    expect(() => parseProgress('{nope')).toThrow(/valid JSON/i);
    expect(() => parseProgress(JSON.stringify({ schemaVersion: 2 }))).toThrow(/schema/i);
    expect(() => parseProgress(' '.repeat(1_000_001))).toThrow(/1 MB/i);
  });

  it('falls back safely when stored data is corrupt', () => {
    const storage = { getItem: () => '{broken' };
    expect(loadProgress(storage)).toEqual(initialProgress());
  });
});
