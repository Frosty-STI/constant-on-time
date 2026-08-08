import { describe, expect, it } from 'vitest';

import { LABS, defaultParameters } from './labs';
import { runLab } from './labModels';

describe('interactive laboratory models', () => {
  it('executes every required laboratory with finite default output', () => {
    expect(LABS).toHaveLength(17);
    for (const lab of LABS) {
      const result = runLab(lab, defaultParameters(lab), 0x12345678);
      expect(result.x.length, lab.id).toBeGreaterThan(1);
      expect(result.signals.length, lab.id).toBeGreaterThan(0);
      for (const signal of result.signals) {
        expect(signal.values, `${lab.id}:${signal.name}`).toHaveLength(result.x.length);
        expect(signal.values.every(Number.isFinite), `${lab.id}:${signal.name}`).toBe(true);
      }
      expect(result.metrics.length, lab.id).toBeGreaterThan(0);
      expect(result.summary.length, lab.id).toBeGreaterThan(20);
    }
  });

  it('matches the ideal 12 V to 5 V ripple derivation', () => {
    const lab = LABS.find((candidate) => candidate.id === 'inductor-ripple');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, defaultParameters(lab));
    const expected = ((12 - 5) / 1e-6) * (5 / 12) / 500e3;
    expect(result.expectedPrediction).toBeCloseTo(expected, 10);
  });

  it('is deterministic for the same stochastic seed', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-pulse');
    expect(lab).toBeDefined();
    if (!lab) return;
    const parameters = defaultParameters(lab);
    expect(runLab(lab, parameters, 42).signals[0]?.values).toEqual(runLab(lab, parameters, 42).signals[0]?.values);
    expect(runLab(lab, parameters, 42).signals[0]?.values).not.toEqual(runLab(lab, parameters, 43).signals[0]?.values);
  });

  it('rejects nonfinite, out-of-range, and boost-like configurations', () => {
    const lab = LABS.find((candidate) => candidate.id === 'inductor-ripple');
    expect(lab).toBeDefined();
    if (!lab) return;
    expect(() => runLab(lab, { ...defaultParameters(lab), inductance: Number.NaN })).toThrow(/finite/i);
    expect(() => runLab(lab, { ...defaultParameters(lab), phases: 20 })).toThrow(/between/i);
    expect(() => runLab(lab, { ...defaultParameters(lab), vin: 5, vout: 12 })).toThrow(/below input/i);
  });

  it('rejects relationally impossible timing and phase-count combinations', () => {
    const cot = LABS.find((candidate) => candidate.id === 'cot-pulse');
    const scheduler = LABS.find((candidate) => candidate.id === 'cot-scheduler');
    expect(cot).toBeDefined();
    expect(scheduler).toBeDefined();
    if (!cot || !scheduler) return;
    expect(() => runLab(cot, { ...defaultParameters(cot), minTon: 900, maxTon: 500 })).toThrow(/minimum on-time/i);
    expect(() => runLab(scheduler, { ...defaultParameters(scheduler), phases: 1 })).toThrow(/at least two phases/i);
    expect(() => runLab(scheduler, { ...defaultParameters(scheduler), phases: 2.5 })).toThrow(/integer/i);
  });

  it('uses a single one-shot in the fast PSpice signal path', () => {
    const lab = LABS.find((candidate) => candidate.id === 'pspice-blocks');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, { ...defaultParameters(lab), architecture: 0 });
    expect(result.summary.match(/One-shot/g)).toHaveLength(1);
    expect(result.summary).toMatch(/parallel/i);
  });

  it('reports phase spacing and degrades cancellation when misaligned', () => {
    const lab = LABS.find((candidate) => candidate.id === 'interleaving');
    expect(lab).toBeDefined();
    if (!lab) return;
    const defaults = { ...defaultParameters(lab), phases: 4 };
    const ideal = runLab(lab, defaults);
    const misaligned = runLab(lab, { ...defaults, phaseError: 30 });
    expect(ideal.expectedPrediction).toBe(90);
    const summedRipple = (result: typeof ideal) => Number(result.metrics.find((metric) => metric.label === 'Summed ripple')?.value);
    expect(summedRipple(misaligned)).toBeGreaterThan(summedRipple(ideal));
  });

  it('uses time-weighted RMS for nonuniform event-aligned interleaving samples', () => {
    const lab = LABS.find((candidate) => candidate.id === 'interleaving');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, { ...defaultParameters(lab), phases: 4, phaseError: 60, dt: 200 });
    const capacitor = result.signals.find((signal) => signal.name === 'iC');
    expect(capacitor).toBeDefined();
    if (!capacitor) return;
    let integral = 0;
    for (let index = 1; index < result.x.length; index += 1) {
      const delta = (result.x[index] ?? 0) - (result.x[index - 1] ?? 0);
      integral += 0.5 * ((capacitor.values[index - 1] ?? 0) ** 2 + (capacitor.values[index] ?? 0) ** 2) * delta;
    }
    const expected = Math.sqrt(integral / ((result.x[result.x.length - 1] ?? 0) - (result.x[0] ?? 0)));
    expect(Number(result.metrics.find((metric) => metric.label === 'Capacitor RMS current')?.value)).toBeCloseTo(expected, 12);
  });

  it('flags excessive current-sharing loop interaction', () => {
    const lab = LABS.find((candidate) => candidate.id === 'current-sharing');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, { ...defaultParameters(lab), shareBandwidth: 40, voltageBandwidth: 50 });
    expect(result.expectedPrediction).toBe('yes');
    expect(result.warnings.join(' ')).toMatch(/bandwidth/i);
  });

  it('biases the higher-resistance phase lower before balancing correction', () => {
    const lab = LABS.find((candidate) => candidate.id === 'current-sharing');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, {
      ...defaultParameters(lab),
      phases: 2,
      lMismatch: 0,
      dcrMismatch: 0,
      resistanceVariation: 20,
      thermalVariation: 0,
      timingMismatch: 0,
      balanceGain: 0,
    });
    const p1 = result.signals.find((signal) => signal.name === 'Iavg P1')?.values[0];
    const p2 = result.signals.find((signal) => signal.name === 'Iavg P2')?.values[0];
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p2 as number).toBeLessThan(p1 as number);
  });

  it('maps the cited Type III op-amp network to two phase-lead zero-pole pairs', () => {
    const lab = LABS.find((candidate) => candidate.id === 'error-amplifier');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, defaultParameters(lab));
    const metric = (label: string) => Number(result.metrics.find((candidate) => candidate.label === label)?.value);
    expect(metric('fp1 · R2 C1 C2')).toBeGreaterThan(metric('fz1 · R2 C2'));
    expect(metric('fp2 · R3 C3')).toBeGreaterThan(metric('fz2 · (R1+R3) C3'));
    expect(result.expectedPrediction).toBe('R2 and C2');
    expect(result.summary).toMatch(/SLVA301 Figure 12/i);
  });

  it('makes switching-to-crossover separation visible in the tuning lab', () => {
    const lab = LABS.find((candidate) => candidate.id === 'crossover-tuning');
    expect(lab).toBeDefined();
    if (!lab) return;
    const lowFrequency = runLab(lab, { ...defaultParameters(lab), fs: 100 });
    const highFrequency = runLab(lab, { ...defaultParameters(lab), fs: 1000 });
    const separation = (result: typeof lowFrequency) => Number(result.metrics.find((metric) => metric.label === 'Switching / crossover separation')?.value);
    expect(separation(highFrequency)).toBeCloseTo(10 * separation(lowFrequency), 10);
  });

  it('reports no unique control-mode winner when the selected metric is tied', () => {
    const lab = LABS.find((candidate) => candidate.id === 'control-comparison');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, defaultParameters(lab));
    expect(result.expectedPrediction).toBe('No unique winner');
    expect(result.summary).toMatch(/tied.*no unique winner/i);
  });

  it('preserves negative-current continuity in asynchronous and diode-emulation current-path states', () => {
    const lab = LABS.find((candidate) => candidate.id === 'current-path');
    expect(lab).toBeDefined();
    if (!lab) return;
    for (const state of [3, 5]) {
      const result = runLab(lab, { ...defaultParameters(lab), state, current: -5 });
      expect(Number(result.metrics.find((metric) => metric.label === 'Switch node')?.value)).toBeCloseTo(12.7, 12);
      const current = result.signals.find((signal) => signal.name === 'iL')?.values ?? [];
      expect(current[0]).toBeCloseTo(-5, 12);
      expect(current[current.length - 1]).toBeLessThan(0);
      expect(current[current.length - 1]).toBeGreaterThan(-5);
      expect(result.warnings.join(' ')).toMatch(/slews to zero/i);
    }
  });

  it('distinguishes synchronous low-side reverse current from negative-current dead time', () => {
    const lab = LABS.find((candidate) => candidate.id === 'current-path');
    expect(lab).toBeDefined();
    if (!lab) return;
    const lowSideReverse = runLab(lab, { ...defaultParameters(lab), state: 4, current: -5 });
    const deadTimeReverse = runLab(lab, { ...defaultParameters(lab), state: 2, current: -5 });
    expect(Number(lowSideReverse.metrics.find((metric) => metric.label === 'Switch node')?.value)).toBe(0);
    expect(Number(deadTimeReverse.metrics.find((metric) => metric.label === 'Switch node')?.value)).toBeCloseTo(12.7, 12);
  });

  it('integrates the COT output state and preserves chronological controller events', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-pulse');
    expect(lab).toBeDefined();
    if (!lab) return;
    const defaults = defaultParameters(lab);
    const lowC = runLab(lab, { ...defaults, capacitance: 10 }, 9);
    const highC = runLab(lab, { ...defaults, capacitance: 1000 }, 9);
    const lowVout = lowC.signals.find((signal) => signal.name === 'vOUT')?.values;
    const highVout = highC.signals.find((signal) => signal.name === 'vOUT')?.values;
    expect(lowVout).toBeDefined();
    expect(highVout).toBeDefined();
    expect(lowVout).not.toEqual(highVout);
    expect(lowC.events.every((event, index) => index === 0 || event.x >= (lowC.events[index - 1]?.x ?? -Infinity))).toBe(true);
    expect(lowC.events.some((event) => event.kind === 'request')).toBe(true);
  });

  it('derives adaptive COT timing from VOUT/(VIN·fNOM), not the fixed-ton control', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-pulse');
    expect(lab).toBeDefined();
    if (!lab) return;
    const adaptive = { ...defaultParameters(lab), onTimeLaw: 1 };
    const shortFixedControl = runLab(lab, { ...adaptive, ton: 200 }, 17);
    const longFixedControl = runLab(lab, { ...adaptive, ton: 5000 }, 17);
    expect(shortFixedControl.signals.map((signal) => signal.values)).toEqual(longFixedControl.signals.map((signal) => signal.values));
    expect(Number(shortFixedControl.metrics.find((metric) => metric.label === 'On-time')?.value)).toBeCloseTo(5 / (12 * 500e3), 12);
  });

  it('queues scheduler requests without overwriting them and sorts its event timeline', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-scheduler');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, defaultParameters(lab), 11);
    const numericMetric = (label: string) => Number(result.metrics.find((metric) => metric.label === label)?.value);
    expect(numericMetric('Pulse requests')).toBe(numericMetric('Granted pulses') + numericMetric('Still pending'));
    expect(result.events.every((event, index) => index === 0 || event.x >= (result.events[index - 1]?.x ?? -Infinity))).toBe(true);
    expect(result.events.some((event) => event.kind === 'waiting' || event.kind === 'delayed')).toBe(true);
  });

  it('places ideal scheduler grants on exact slots and reports the stored round-robin pointer', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-scheduler');
    expect(lab).toBeDefined();
    if (!lab) return;
    const defaults = { ...defaultParameters(lab), phases: 4, requestJitter: 0 };
    const fixed = runLab(lab, { ...defaults, strategy: 0 }, 1);
    const grants = fixed.events.filter((event) => event.kind === 'grant');
    const slot = 1 / (500e3 * 4);
    expect(grants.every((grant) => Math.abs(grant.x / slot - Math.round(grant.x / slot)) < 1e-8)).toBe(true);
    expect(new Set(grants.map((grant) => Math.round(grant.x / slot))).size).toBe(grants.length);

    const roundRobin = runLab(lab, { ...defaults, strategy: 2, requestJitter: 1000 }, 1);
    const lastGrant = [...roundRobin.events].reverse().find((event) => event.kind === 'grant');
    expect(lastGrant).toBeDefined();
    const expectedNext = ((lastGrant?.phase ?? 0) + 1) % 4 + 1;
    expect(roundRobin.expectedPrediction).toBe(`phase ${expectedNext}`);
  });

  it('makes the scheduler load control visible in its disclosed priority-current signals', () => {
    const lab = LABS.find((candidate) => candidate.id === 'cot-scheduler');
    expect(lab).toBeDefined();
    if (!lab) return;
    expect(lab.parameters.some((parameter) => parameter.key === 'inductance')).toBe(false);
    const light = runLab(lab, { ...defaultParameters(lab), load: 1 });
    const heavy = runLab(lab, { ...defaultParameters(lab), load: 100 });
    const priority = (result: typeof light) => result.signals.find((signal) => signal.name === 'priority sensed I P1')?.values;
    expect(priority(light)).not.toEqual(priority(heavy));
  });

  it('makes every disclosed mismatch or debugging control observable', () => {
    const conduction = LABS.find((candidate) => candidate.id === 'conduction-identification');
    const interleaving = LABS.find((candidate) => candidate.id === 'interleaving');
    const broken = LABS.find((candidate) => candidate.id === 'broken-model');
    expect(conduction && interleaving && broken).toBeTruthy();
    if (!conduction || !interleaving || !broken) return;
    const reverse = { ...defaultParameters(conduction), modeCase: 3 };
    expect(Math.min(...runLab(conduction, { ...reverse, diodeEmulation: 1 }).signals[0]!.values)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...runLab(conduction, { ...reverse, diodeEmulation: 0 }).signals[0]!.values)).toBeLessThan(0);

    const idealSense = runLab(interleaving, { ...defaultParameters(interleaving), senseMismatch: 0 });
    const mismatchedSense = runLab(interleaving, { ...defaultParameters(interleaving), senseMismatch: 20 });
    const senseSpread = (result: typeof idealSense) => Number(result.metrics.find((metric) => metric.label === 'Sense-indicated spread')?.value);
    expect(senseSpread(mismatchedSense)).toBeGreaterThan(senseSpread(idealSense));

    const switchCase = { ...defaultParameters(broken), faultCase: 5 };
    expect(runLab(broken, { ...switchCase, switchRoff: 0.001 }, 2).signals[0]?.values)
      .not.toEqual(runLab(broken, { ...switchCase, switchRoff: 1_000_000 }, 2).signals[0]?.values);
  });

  it('gives all 18 debugging faults distinct evidence and a corrective action', () => {
    const lab = LABS.find((candidate) => candidate.id === 'broken-model');
    expect(lab).toBeDefined();
    if (!lab) return;
    const signatures = new Set<string>();
    for (let faultCase = 0; faultCase < 18; faultCase += 1) {
      const result = runLab(lab, { ...defaultParameters(lab), faultCase }, 3);
      signatures.add((result.signals[0]?.values ?? []).slice(0, 120).map((sample) => sample.toPrecision(8)).join(','));
      expect(result.metrics.find((metric) => metric.label === 'Evidence')?.value).toBeTruthy();
      expect(result.metrics.find((metric) => metric.label === 'Recommended corrective action')?.value).toBeTruthy();
    }
    expect(signatures.size).toBe(18);
  });
});
