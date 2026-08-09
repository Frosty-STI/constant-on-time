import type { LabDefinition, LabId, ParameterSpec } from './labs';

export interface LabScenario {
  readonly schemaVersion: 1;
  readonly kind: 'constant-on-time-lab-scenario';
  readonly labId: LabId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly seed: number;
}

export const createLabScenario = (
  lab: LabDefinition,
  parameters: Readonly<Record<string, number>>,
  seed: number,
): LabScenario => ({
  schemaVersion: 1,
  kind: 'constant-on-time-lab-scenario',
  labId: lab.id,
  parameters: Object.fromEntries(lab.parameters.map((parameter) => [parameter.key, parameters[parameter.key] ?? parameter.defaultValue])),
  seed: seed >>> 0,
});

export const serializeLabScenario = (scenario: LabScenario): string => `${JSON.stringify(scenario, null, 2)}\n`;

const stepIndex = (parameter: ParameterSpec, value: number): number =>
  Math.round((value - parameter.min) / parameter.step);

const isAlignedToOrigin = (value: number, step: number, origin: number): boolean => {
  const rawIndex = (value - origin) / step;
  const tolerance = 1e-9 * Math.max(1, Math.abs(rawIndex));
  return Math.abs(rawIndex - Math.round(rawIndex)) <= tolerance;
};

const isStepAligned = (parameter: ParameterSpec, value: number): boolean => {
  if (!(parameter.step > 0)) return false;
  // Match the HTML number-input contract: when min is present it is the step
  // base. Keeping one canonical grid prevents import/sweep/UI disagreement.
  return isAlignedToOrigin(value, parameter.step, parameter.min);
};

export const parameterValidationError = (parameter: ParameterSpec, value: number): string | null => {
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) {
    return `${parameter.label} must be finite and between ${parameter.min} and ${parameter.max} ${parameter.unit}.`;
  }
  if (Number.isInteger(parameter.min) && Number.isInteger(parameter.step) && !Number.isInteger(value)) {
    return `${parameter.label} must be an integer.`;
  }
  if (!isStepAligned(parameter, value)) {
    return `${parameter.label} must conform to a step of ${parameter.step} ${parameter.unit || 'units'} from ${parameter.min}.`;
  }
  return null;
};

export const quantizeParameterValue = (parameter: ParameterSpec, value: number): number => {
  if (!Number.isFinite(value) || !(parameter.step > 0)) {
    throw new RangeError(`${parameter.label} cannot be quantized to an invalid step.`);
  }
  const maximumIndex = Math.floor((parameter.max - parameter.min) / parameter.step + 1e-12);
  const clampedIndex = Math.max(0, Math.min(maximumIndex, stepIndex(parameter, value)));
  return Number((parameter.min + clampedIndex * parameter.step).toPrecision(14));
};

export const createParameterSweepValues = (
  parameter: ParameterSpec,
  start: number,
  stop: number,
  count: number,
): readonly number[] => {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start > stop) {
    throw new RangeError('Sweep bounds must be finite and ordered.');
  }
  if (start < parameter.min || stop > parameter.max) {
    throw new RangeError(`Sweep bounds must stay within ${parameter.min}–${parameter.max} ${parameter.unit || 'units'}.`);
  }
  if (!Number.isInteger(count) || count < 2 || count > 9) {
    throw new RangeError('A parameter sweep requires 2–9 requested points.');
  }
  const distinct = new Map<number, number>();
  const firstAllowedIndex = Math.ceil((start - parameter.min) / parameter.step - 1e-12);
  const lastAllowedIndex = Math.floor((stop - parameter.min) / parameter.step + 1e-12);
  if (firstAllowedIndex > lastAllowedIndex) return [];
  for (let index = 0; index < count; index += 1) {
    const raw = start + (stop - start) * index / (count - 1);
    const quantizedIndex = Math.max(firstAllowedIndex, Math.min(lastAllowedIndex, stepIndex(parameter, raw)));
    const quantized = Number((parameter.min + quantizedIndex * parameter.step).toPrecision(14));
    distinct.set(quantizedIndex, quantized);
  }
  return [...distinct.values()];
};

const validateRelationships = (lab: LabDefinition, parameters: Readonly<Record<string, number>>): void => {
  const vin = parameters.vin;
  const vout = parameters.vout;
  if (vin !== undefined && vout !== undefined && vout >= vin) {
    throw new RangeError('Output target must be below input voltage for this buck-converter scenario.');
  }

  const minTon = parameters.minTon;
  const maxTon = parameters.maxTon;
  if (minTon !== undefined && maxTon !== undefined && minTon > maxTon) {
    throw new RangeError('Minimum on-time must not exceed maximum on-time.');
  }

  if (['interleaving', 'cot-scheduler', 'current-sharing'].includes(lab.id) && (parameters.phases ?? 0) < 2) {
    throw new RangeError('This multiphase laboratory requires at least two phases.');
  }
};

export const validateLabParameters = (lab: LabDefinition, parameters: Readonly<Record<string, number>>): void => {
  for (const parameter of lab.parameters) {
    const error = parameterValidationError(parameter, parameters[parameter.key] as number);
    if (error) throw new RangeError(error);
  }
  validateRelationships(lab, parameters);
};

export const parseLabScenario = (text: string, lab: LabDefinition): LabScenario => {
  if (text.length > 250_000) throw new RangeError('Scenario JSON exceeds the 250 kB local import limit.');
  const input: unknown = JSON.parse(text);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Scenario must be a JSON object.');
  const candidate = input as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || candidate.kind !== 'constant-on-time-lab-scenario') throw new TypeError('Unsupported scenario schema or document kind.');
  if (candidate.labId !== lab.id) throw new RangeError(`This file targets ${String(candidate.labId)}; open that laboratory before importing it.`);
  if (!candidate.parameters || typeof candidate.parameters !== 'object' || Array.isArray(candidate.parameters)) throw new TypeError('Scenario parameters must be an object.');
  const rawParameters = candidate.parameters as Record<string, unknown>;
  const expectedKeys = new Set(lab.parameters.map((parameter) => parameter.key));
  const unknown = Object.keys(rawParameters).find((key) => !expectedKeys.has(key));
  if (unknown) throw new RangeError(`Unknown scenario parameter: ${unknown}.`);
  const parameters: Record<string, number> = {};
  for (const parameter of lab.parameters) {
    const value = rawParameters[parameter.key];
    if (typeof value !== 'number') throw new RangeError(`${parameter.label} must be a finite number.`);
    parameters[parameter.key] = value;
  }
  validateLabParameters(lab, parameters);
  const seed = candidate.seed;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('Scenario seed must be an unsigned 32-bit integer.');
  return createLabScenario(lab, parameters, seed);
};
