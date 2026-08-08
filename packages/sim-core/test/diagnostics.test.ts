import { describe, expect, it } from "vitest";
import { assessTimeStep, assertFiniteRecord } from "../src/diagnostics.js";

describe("numerical diagnostics", () => {
  it("accepts a step fine enough for switching and controller events", () => {
    const result = assessTimeStep({
      integrationStep: 1e-9,
      switchingFrequency: 500e3,
      phaseCount: 4,
      minimumOnTime: 100e-9,
      minimumOffTime: 100e-9,
      deadTime: 20e-9,
      comparatorDelay: 10e-9
    });
    expect(result.safeForRequestedTiming).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.recommendedMaximum).toBeCloseTo(2e-9, 15);
  });

  it("warns when a time step hides switching, dead-time, and delay events", () => {
    const result = assessTimeStep({
      integrationStep: 100e-9,
      switchingFrequency: 500e3,
      phaseCount: 4,
      deadTime: 20e-9,
      comparatorDelay: 10e-9
    });
    expect(result.safeForRequestedTiming).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "SWITCHING_RESOLUTION",
        "INTERLEAVED_EVENT_RESOLUTION",
        "DEAD_TIME_RESOLUTION",
        "COMPARATOR_DELAY_RESOLUTION"
      ])
    );
    expect(result.warnings.some((warning) => warning.severity === "error")).toBe(true);
  });

  it("finds nonfinite values deeply instead of allowing silent plot corruption", () => {
    expect(() => assertFiniteRecord({ trace: [{ value: 1 }, { value: Infinity }] })).toThrow(
      /trace\[1\].value/
    );
  });
});
