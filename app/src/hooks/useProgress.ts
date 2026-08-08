import { useCallback, useEffect, useState } from 'react';

import type { Mastery, ProgressState } from '../state/progress';
import { initialProgress, loadProgress, parseProgress, resetStoredProgress, saveProgress, serializeProgress } from '../state/progress';

export interface ProgressController {
  readonly progress: ProgressState;
  readonly setMastery: (conceptId: string, mastery: Mastery) => void;
  readonly setNote: (contextId: string, note: string) => void;
  readonly toggleReading: (readingId: string) => void;
  readonly toggleBookmark: (conceptId: string) => void;
  readonly recordPrediction: (labId: string, correct: boolean) => void;
  readonly savePreset: (labId: string, parameters: Readonly<Record<string, number>>) => void;
  readonly exportJson: () => string;
  readonly importJson: (json: string) => void;
  readonly reset: () => void;
}

export const useProgress = (): ProgressController => {
  const [progress, setProgress] = useState<ProgressState>(() => (typeof localStorage === 'undefined' ? initialProgress() : loadProgress()));

  useEffect(() => {
    if (typeof localStorage !== 'undefined') saveProgress(progress);
  }, [progress]);

  const update = useCallback((producer: (current: ProgressState) => ProgressState) => {
    setProgress((current) => producer(current));
  }, []);

  const setMastery = useCallback((conceptId: string, mastery: Mastery) => {
    update((current) => ({ ...current, conceptMastery: { ...current.conceptMastery, [conceptId]: mastery } }));
  }, [update]);

  const setNote = useCallback((contextId: string, note: string) => {
    update((current) => ({ ...current, notes: { ...current.notes, [contextId]: note } }));
  }, [update]);

  const toggleReading = useCallback((readingId: string) => {
    update((current) => ({
      ...current,
      completedReadings: current.completedReadings.includes(readingId)
        ? current.completedReadings.filter((item) => item !== readingId)
        : [...current.completedReadings, readingId],
    }));
  }, [update]);

  const toggleBookmark = useCallback((conceptId: string) => {
    update((current) => ({
      ...current,
      bookmarks: current.bookmarks.includes(conceptId)
        ? current.bookmarks.filter((item) => item !== conceptId)
        : [...current.bookmarks, conceptId],
    }));
  }, [update]);

  const recordPrediction = useCallback((labId: string, correct: boolean) => {
    update((current) => {
      const previous = current.puzzleResults[labId] ?? { attempts: 0, correct: 0, lastAttempt: new Date(0).toISOString() };
      return {
        ...current,
        puzzleResults: {
          ...current.puzzleResults,
          [labId]: {
            attempts: previous.attempts + 1,
            correct: previous.correct + (correct ? 1 : 0),
            lastAttempt: new Date().toISOString(),
          },
        },
      };
    });
  }, [update]);

  const savePreset = useCallback((labId: string, parameters: Readonly<Record<string, number>>) => {
    update((current) => ({ ...current, simulatorPresets: { ...current.simulatorPresets, [labId]: { ...parameters } } }));
  }, [update]);

  const exportJson = useCallback(() => serializeProgress(progress), [progress]);
  const importJson = useCallback((json: string) => setProgress(parseProgress(json)), []);
  const reset = useCallback(() => setProgress(typeof localStorage === 'undefined' ? initialProgress() : resetStoredProgress()), []);

  return { progress, setMastery, setNote, toggleReading, toggleBookmark, recordPrediction, savePreset, exportJson, importJson, reset };
};
