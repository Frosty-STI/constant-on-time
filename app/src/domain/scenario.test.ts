import { describe, expect, it } from 'vitest';

import { LABS, defaultParameters } from './labs';
import { createLabScenario, createParameterSweepValues, parseLabScenario, serializeLabScenario } from './scenario';

describe('per-lab scenario documents', () => {
  const lab = LABS.find((candidate) => candidate.id === 'inductor-ripple');

  it('round-trips a versioned deterministic scenario', () => {
    expect(lab).toBeDefined();
    if (!lab) return;
    const scenario = createLabScenario(lab, defaultParameters(lab), 0x1234abcd);
    expect(parseLabScenario(serializeLabScenario(scenario), lab)).toEqual(scenario);
  });

  it('rejects wrong labs, unknown keys, and nonfinite values', () => {
    expect(lab).toBeDefined();
    if (!lab) return;
    const base = createLabScenario(lab, defaultParameters(lab), 1);
    expect(() => parseLabScenario(JSON.stringify({ ...base, labId: 'cot-pulse' }), lab)).toThrow(/targets/i);
    expect(() => parseLabScenario(JSON.stringify({ ...base, parameters: { ...base.parameters, secretKnob: 2 } }), lab)).toThrow(/unknown/i);
    expect(() => parseLabScenario(JSON.stringify({ ...base, parameters: { ...base.parameters, vin: null } }), lab)).toThrow(/finite/i);
  });

  it('accepts every catalog default and rejects relationally impossible buck scenarios', () => {
    for (const candidate of LABS) {
      const scenario = createLabScenario(candidate, defaultParameters(candidate), 7);
      expect(parseLabScenario(serializeLabScenario(scenario), candidate)).toEqual(scenario);
    }
    expect(lab).toBeDefined();
    if (!lab) return;
    const base = createLabScenario(lab, defaultParameters(lab), 1);
    expect(() => parseLabScenario(JSON.stringify({ ...base, parameters: { ...base.parameters, vout: 12 } }), lab)).toThrow(/below input/i);
  });

  it('enforces integer and step-aligned values', () => {
    expect(lab).toBeDefined();
    if (!lab) return;
    const base = createLabScenario(lab, defaultParameters(lab), 1);
    expect(() => parseLabScenario(JSON.stringify({ ...base, parameters: { ...base.parameters, phases: 2.5 } }), lab)).toThrow(/integer/i);
    expect(() => parseLabScenario(JSON.stringify({ ...base, parameters: { ...base.parameters, vin: 12.1 } }), lab)).toThrow(/step/i);
  });

  it('enforces timing-clamp ordering and a true multiphase phase count', () => {
    const cot = LABS.find((candidate) => candidate.id === 'cot-pulse');
    const interleaving = LABS.find((candidate) => candidate.id === 'interleaving');
    expect(cot).toBeDefined();
    expect(interleaving).toBeDefined();
    if (!cot || !interleaving) return;
    const cotScenario = createLabScenario(cot, defaultParameters(cot), 1);
    expect(() => parseLabScenario(JSON.stringify({
      ...cotScenario,
      parameters: { ...cotScenario.parameters, minTon: 505, maxTon: 500 },
    }), cot)).toThrow(/minimum on-time/i);
    const multiphaseScenario = createLabScenario(interleaving, defaultParameters(interleaving), 1);
    expect(() => parseLabScenario(JSON.stringify({
      ...multiphaseScenario,
      parameters: { ...multiphaseScenario.parameters, phases: 1 },
    }), interleaving)).toThrow(/at least two phases/i);
  });

  it('quantizes sweep values to parameter steps and removes duplicates', () => {
    const phases = lab?.parameters.find((parameter) => parameter.key === 'phases');
    expect(phases).toBeDefined();
    if (!phases) return;
    expect(createParameterSweepValues(phases, 1, 2, 9)).toEqual([1, 2]);
  });

  it('uses the HTML min-based step grid without escaping requested sweep bounds', () => {
    const parameter = {
      key: 'example', label: 'Example', unit: 'V', min: 0.1, max: 10,
      step: 0.5, defaultValue: 2.1, description: 'Synthetic grid regression.',
    } as const;
    const values = createParameterSweepValues(parameter, 1.6, 2.4, 5);
    expect(values).toEqual([1.6, 2.1]);
    expect(values.every((value) => value >= 1.6 && value <= 2.4)).toBe(true);
    expect(createParameterSweepValues(parameter, 0.1, 0.4, 3)).toEqual([0.1]);
  });
});
