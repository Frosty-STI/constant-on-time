/// <reference lib="webworker" />

import { LAB_BY_ID } from '../domain/labs';
import type { LabId } from '../domain/labs';
import { runLab } from '../domain/labModels';

interface SimulationRequest {
  readonly kind?: 'run';
  readonly requestId: number;
  readonly labId: LabId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly seed: number;
}

interface SweepRequest {
  readonly kind: 'sweep';
  readonly requestId: number;
  readonly labId: LabId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly seed: number;
  readonly parameterKey: string;
  readonly values: readonly number[];
}

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener('message', (event: MessageEvent<SimulationRequest | SweepRequest>) => {
  const { requestId, labId, parameters, seed } = event.data;
  try {
    const lab = LAB_BY_ID.get(labId);
    if (!lab) throw new Error(`Unknown laboratory: ${labId}`);
    if (event.data.kind === 'sweep') {
      const request = event.data;
      if (request.values.length < 2 || request.values.length > 9) throw new RangeError('A parameter sweep requires 2–9 points.');
      const parameter = lab.parameters.find((candidate) => candidate.key === request.parameterKey);
      if (!parameter) throw new RangeError(`Unknown sweep parameter: ${request.parameterKey}`);
      const sweep = request.values.map((parameterValue) => ({
        parameterValue,
        result: runLab(lab, { ...parameters, [parameter.key]: parameterValue }, seed),
      }));
      worker.postMessage({ requestId, result: null, sweep, error: null });
      return;
    }
    worker.postMessage({ requestId, result: runLab(lab, parameters, seed), error: null });
  } catch (caught) {
    worker.postMessage({
      requestId,
      result: null,
      error: caught instanceof Error ? caught.message : 'Simulation configuration is invalid.',
    });
  }
});

export {};
