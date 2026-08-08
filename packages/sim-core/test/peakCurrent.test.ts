import { describe, expect, it } from "vitest";
import {
  peakCurrentStability,
  simulatePeakCurrentCycles,
  stepPeakCurrentCycle,
  type PeakCurrentCycleConfig
} from "../src/controllers/peakCurrent.js";

function config(overrides: Partial<PeakCurrentCycleConfig> = {}): PeakCurrentCycleConfig {
  return {
    vin: 12,
    vout: 8,
    inductance: 1e-6,
    switchingFrequency: 500e3,
    currentCommand: 12.6666666667,
    allowReverseCurrent: true,
    ...overrides
  };
}

describe("simplified peak-current sampled-data map", () => {
  it("reports the textbook uncompensated subharmonic pole above 50% duty", () => {
    const stability = peakCurrentStability(config());
    expect(stability.eigenvalue).toBeCloseTo(-2, 12);
    expect(stability.stable).toBe(false);
    expect(stability.minimumArtificialRampSlope).toBeCloseTo(2e6, 5);
    expect(stability.assumptions).toContain("fixed switching period");
  });

  it("shows the cycle-to-cycle perturbation ratio predicted by the map", () => {
    const nominalValley = 7.3333333333;
    const nominal = stepPeakCurrentCycle(config(), nominalValley);
    const perturbed = stepPeakCurrentCycle(config(), nominalValley + 0.1);
    const ratio = (perturbed.nextValleyCurrent - nominal.nextValleyCurrent) / 0.1;
    expect(ratio).toBeCloseTo(-2, 8);
  });

  it("stabilizes the alternating-cycle pole with adequate artificial ramp", () => {
    const ramp = 4e6;
    const nominalOnTime = (8 / 12) / 500e3;
    const nominalPeak = 7.3333333333 + 4e6 * nominalOnTime;
    const cfg = config({
      artificialRampSlope: ramp,
      currentCommand: nominalPeak + ramp * nominalOnTime
    });
    const stability = peakCurrentStability(cfg);
    expect(stability.eigenvalue).toBeCloseTo(-0.5, 12);
    expect(stability.stable).toBe(true);
    const baseline = stepPeakCurrentCycle(cfg, 7.3333333333);
    const perturbed = stepPeakCurrentCycle(cfg, 7.4333333333);
    expect((perturbed.nextValleyCurrent - baseline.nextValleyCurrent) / 0.1).toBeCloseTo(-0.5, 8);
  });

  it("models blanking, delay, and min/max timing explicitly", () => {
    const delayed = stepPeakCurrentCycle(
      config({
        currentCommand: 1,
        leadingEdgeBlanking: 0.2e-6,
        propagationDelay: 0.1e-6,
        minimumOnTime: 0.4e-6,
        maximumOnTime: 1e-6
      }),
      0
    );
    expect(delayed.comparatorTripTime).toBeCloseTo(0.25e-6, 14);
    expect(delayed.onTime).toBeCloseTo(0.4e-6, 14);
    const saturated = stepPeakCurrentCycle(config({ currentCommand: 100, maximumOnTime: 1e-6 }), 0);
    expect(saturated.onTime).toBeCloseTo(1e-6, 14);
  });

  it("rejects contradictory or super-period timing clamps", () => {
    expect(() => stepPeakCurrentCycle(config({ minimumOnTime: 1.1e-6, maximumOnTime: 1e-6 }), 0)).toThrow(/minimumOnTime/);
    expect(() => stepPeakCurrentCycle(config({ minimumOnTime: 2.1e-6 }), 0)).toThrow(/minimumOnTime/);
    expect(() => stepPeakCurrentCycle(config({ maximumOnTime: 2.1e-6 }), 0)).toThrow(/clock period/);
  });

  it("applies current limit as a lower comparator command", () => {
    const cycle = stepPeakCurrentCycle(config({ currentCommand: 20, currentLimit: 10 }), 0);
    expect(cycle.limited).toBe(true);
    expect(cycle.comparatorTripTime).toBeCloseTo(2.5e-6, 12);
    // Trip exceeds the period, so the timing limiter safely clamps it.
    expect(cycle.onTime).toBeCloseTo(2e-6, 14);
  });

  it("produces a deterministic sequence and clamps DCM valley when requested", () => {
    const sequenceA = simulatePeakCurrentCycles(config({ allowReverseCurrent: false, currentCommand: 2 }), 0, 8);
    const sequenceB = simulatePeakCurrentCycles(config({ allowReverseCurrent: false, currentCommand: 2 }), 0, 8);
    expect(sequenceA).toEqual(sequenceB);
    expect(sequenceA.every((cycle) => cycle.nextValleyCurrent >= 0)).toBe(true);
  });
});
