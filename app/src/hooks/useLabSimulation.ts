import { useCallback, useEffect, useState } from 'react';

import type { LabDefinition } from '../domain/labs';
import { runLab } from '../domain/labModels';
import type { LabResult } from '../domain/labModels';

export interface LabCalculation {
  readonly result: LabResult | null;
  readonly error: string | null;
  readonly pending: boolean;
  readonly runSweep: (parameterKey: string, values: readonly number[]) => Promise<readonly SweepPoint[]>;
}

export interface SweepPoint {
  readonly parameterValue: number;
  readonly result: LabResult;
}

interface WorkerResponse {
  readonly requestId: number;
  readonly result: LabResult | null;
  readonly error: string | null;
  readonly sweep?: readonly SweepPoint[];
}

const calculateOnMainThread = (
  lab: LabDefinition,
  parameters: Readonly<Record<string, number>>,
  seed: number,
): LabCalculation => {
  try {
    return { result: runLab(lab, parameters, seed), error: null, pending: false, runSweep: () => Promise.resolve([]) };
  } catch (caught) {
    return { result: null, error: caught instanceof Error ? caught.message : 'Simulation configuration is invalid.', pending: false, runSweep: () => Promise.resolve([]) };
  }
};

export const useLabSimulation = (
  lab: LabDefinition,
  parameters: Readonly<Record<string, number>>,
  seed: number,
): LabCalculation => {
  const [calculation, setCalculation] = useState<Omit<LabCalculation, 'runSweep'>>({ result: null, error: null, pending: true });

  useEffect(() => {
    setCalculation({ result: null, error: null, pending: true });
    if (typeof Worker === 'undefined') {
      setCalculation(calculateOnMainThread(lab, parameters, seed));
      return undefined;
    }
    const worker = new Worker(new URL('../workers/sim.worker.ts', import.meta.url), { type: 'module', name: 'cot-lab-simulation' });
    const requestId = 1;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      setCalculation({ result: event.data.result, error: event.data.error, pending: false });
      worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      setCalculation(calculateOnMainThread(lab, parameters, seed));
    };
    worker.postMessage({ requestId, labId: lab.id, parameters, seed });
    return () => worker.terminate();
  }, [lab, parameters, seed]);

  const runSweep = useCallback((parameterKey: string, values: readonly number[]): Promise<readonly SweepPoint[]> => {
    if (values.length < 2 || values.length > 9 || values.some((value) => !Number.isFinite(value))) {
      return Promise.reject(new RangeError('A parameter sweep requires 2–9 finite values.'));
    }
    if (typeof Worker === 'undefined') {
      try {
        return Promise.resolve(values.map((parameterValue) => ({
          parameterValue,
          result: runLab(lab, { ...parameters, [parameterKey]: parameterValue }, seed),
        })));
      } catch (caught) {
        return Promise.reject(caught instanceof Error ? caught : new Error('Parameter sweep failed.'));
      }
    }
    return new Promise((resolve, reject) => {
      const sweepWorker = new Worker(new URL('../workers/sim.worker.ts', import.meta.url), { type: 'module', name: 'cot-lab-parameter-sweep' });
      const requestId = Date.now() % Number.MAX_SAFE_INTEGER;
      sweepWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        sweepWorker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.sweep ?? []);
      };
      sweepWorker.onerror = () => {
        sweepWorker.terminate();
        reject(new Error('The parameter-sweep worker failed.'));
      };
      sweepWorker.postMessage({ kind: 'sweep', requestId, labId: lab.id, parameters, seed, parameterKey, values });
    });
  }, [lab, parameters, seed]);

  return { ...calculation, runSweep };
};
