import { describe, expect, it } from "vitest";
import {
  exportScenario,
  importScenario,
  validateScenario,
  type SimulationScenario
} from "../src/scenario.js";

function scenario(): SimulationScenario {
  return {
    schemaVersion: 1,
    name: "Two-phase baseline",
    description: "Synthetic, generic operating point",
    seed: 42,
    plant: {
      vin: 12,
      capacitance: 100e-6,
      capacitorEsr: 5e-3,
      phases: [{ inductance: 1e-6 }, { inductance: 1e-6 }],
      load: {
        initial: { kind: "constant-current", current: 4 },
        steps: [{ at: 100e-6, load: { kind: "constant-current", current: 8 } }]
      }
    },
    controller: {
      kind: "open-loop-pwm",
      pwm: { switchingFrequency: 500e3, dutyRatio: 5 / 12 }
    },
    duration: 200e-6,
    integrationStep: 2e-9,
    tags: ["baseline", "two-phase"]
  };
}

describe("scenario import/export", () => {
  it("round-trips a valid scenario without changing values", () => {
    const original = scenario();
    const text = exportScenario(original);
    expect(importScenario(text)).toEqual(original);
  });

  it("exports keys deterministically", () => {
    expect(exportScenario(scenario())).toBe(exportScenario(scenario()));
    expect(exportScenario(scenario()).split("\n")[1]).toContain("controller");
  });

  it("accepts and validates a COT-controller scenario", () => {
    const cot: SimulationScenario = {
      ...scenario(),
      controller: {
        kind: "constant-on-time",
        cot: {
          referenceVoltage: 1,
          feedbackGain: 0.2,
          onTimeLaw: { kind: "adaptive-vout-vin", nominalFrequency: 500e3 },
          minimumOnTime: 50e-9,
          maximumOnTime: 2e-6,
          minimumOffTime: 100e-9
        }
      }
    };
    expect(() => validateScenario(cot)).not.toThrow();
  });

  it("rejects malformed JSON, unsupported versions, and impossible timing", () => {
    expect(() => importScenario("{")) .toThrow(/Invalid scenario JSON/);
    expect(() => importScenario(JSON.stringify({ ...scenario(), schemaVersion: 2 }))).toThrow(/schemaVersion/);
    expect(() => validateScenario({ ...scenario(), integrationStep: 1 })).toThrow(
      /must not exceed duration/
    );
  });

  it("rejects NaN before JSON can silently convert it to null", () => {
    const invalid = scenario();
    invalid.plant.vin = NaN;
    expect(() => exportScenario(invalid)).toThrow(/finite/);
  });

  it("rejects nonmonotonic load steps", () => {
    const invalid = scenario();
    invalid.plant.load = {
      initial: { kind: "constant-current", current: 1 },
      steps: [
        { at: 2e-6, load: { kind: "constant-current", current: 2 } },
        { at: 1e-6, load: { kind: "constant-current", current: 3 } }
      ]
    };
    expect(() => validateScenario(invalid)).toThrow(/strictly increasing/);
  });
});
