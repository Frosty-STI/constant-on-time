import { z } from 'zod';

const STORAGE_KEY = 'constant-on-time-lab.progress.v1';
const MAX_IMPORT_BYTES = 1_000_000;

const masterySchema = z.enum(['not-started', 'developing', 'proficient', 'teach-back']);

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  conceptMastery: z.record(z.string(), masterySchema),
  completedReadings: z.array(z.string()).max(5000),
  puzzleResults: z.record(z.string(), z.object({
    attempts: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    lastAttempt: z.string(),
  })),
  simulatorPresets: z.record(z.string(), z.record(z.string(), z.number().finite())),
  notes: z.record(z.string(), z.string().max(20_000)),
  bookmarks: z.array(z.string()).max(5000),
  seed: z.number().int().nonnegative().max(0xffffffff),
  updatedAt: z.string(),
});

export type Mastery = z.infer<typeof masterySchema>;
export type ProgressState = z.infer<typeof progressSchema>;

export const initialProgress = (): ProgressState => ({
  schemaVersion: 1,
  conceptMastery: {},
  completedReadings: [],
  puzzleResults: {},
  simulatorPresets: {},
  notes: {},
  bookmarks: [],
  seed: 0x0c072024,
  updatedAt: new Date(0).toISOString(),
});

const containsUnsafeKeys = (input: string): boolean => /"(?:__proto__|prototype|constructor)"\s*:/.test(input);

export const parseProgress = (input: string): ProgressState => {
  if (new Blob([input]).size > MAX_IMPORT_BYTES) throw new Error('Progress file exceeds the 1 MB local import limit.');
  if (containsUnsafeKeys(input)) throw new Error('Progress file contains an unsafe object key.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    throw new Error('Progress file is not valid JSON.');
  }
  const result = progressSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Progress schema is invalid: ${result.error.issues[0]?.message ?? 'unknown validation error'}.`);
  return result.data;
};

export const loadProgress = (storage: Pick<Storage, 'getItem'> = localStorage): ProgressState => {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return initialProgress();
  try {
    return parseProgress(stored);
  } catch {
    return initialProgress();
  }
};

export const saveProgress = (progress: ProgressState, storage: Pick<Storage, 'setItem'> = localStorage): void => {
  const next = progressSchema.parse({ ...progress, updatedAt: new Date().toISOString() });
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const serializeProgress = (progress: ProgressState): string =>
  JSON.stringify(progressSchema.parse({ ...progress, updatedAt: new Date().toISOString() }), null, 2);

export const resetStoredProgress = (storage: Pick<Storage, 'removeItem'> = localStorage): ProgressState => {
  storage.removeItem(STORAGE_KEY);
  return initialProgress();
};

export const progressStorageKey = STORAGE_KEY;
