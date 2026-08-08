import { useCallback, useEffect, useRef, useState } from 'react';

import type { LabEvent } from '../domain/labModels';

export interface PlaybackController {
  readonly index: number;
  readonly running: boolean;
  readonly play: () => void;
  readonly pause: () => void;
  readonly reset: () => void;
  readonly stepInterval: () => void;
  readonly stepEvent: () => void;
  readonly setIndex: (index: number) => void;
}

export const usePlayback = (x: readonly number[], events: readonly LabEvent[]): PlaybackController => {
  const [index, setIndexState] = useState(0);
  const [running, setRunning] = useState(false);
  const lastTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    setIndexState(0);
    setRunning(false);
  }, [x]);

  useEffect(() => {
    if (!running || x.length < 2) return undefined;
    const tick = (timestamp: number) => {
      const last = lastTimeRef.current ?? timestamp;
      if (timestamp - last >= 24) {
        setIndexState((current) => {
          if (current >= x.length - 1) {
            setRunning(false);
            return x.length - 1;
          }
          return Math.min(current + Math.max(1, Math.floor(x.length / 240)), x.length - 1);
        });
        lastTimeRef.current = timestamp;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = null;
    };
  }, [running, x]);

  const setIndex = useCallback((next: number) => setIndexState(clampIndex(next, x.length)), [x.length]);
  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => { setRunning(false); setIndexState(0); }, []);
  const stepInterval = useCallback(() => setIndexState((current) => clampIndex(current + 1, x.length)), [x.length]);
  const stepEvent = useCallback(() => {
    setIndexState((current) => {
      const currentX = x[current] ?? Number.NEGATIVE_INFINITY;
      const nextEvent = events.find((event) => event.x > currentX + Number.EPSILON);
      if (!nextEvent) return x.length - 1;
      const nextIndex = x.findIndex((sample) => sample >= nextEvent.x);
      return nextIndex >= 0 ? nextIndex : x.length - 1;
    });
  }, [events, x]);

  return { index, running, play, pause, reset, stepInterval, stepEvent, setIndex };
};

const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(index, Math.max(0, length - 1)));
