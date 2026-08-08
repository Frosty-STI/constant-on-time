import { describe, expect, it } from "vitest";
import { integrateTo, rk4Step, stepToNextEvent } from "../src/integrator.js";

describe("RK4 integrator and event boundaries", () => {
  it("integrates an exponential with fourth-order accuracy", () => {
    let state = [1];
    let time = 0;
    for (let index = 0; index < 10; index += 1) {
      state = rk4Step((_time, values) => [values[0] ?? 0], time, state, 0.1);
      time += 0.1;
    }
    expect(state[0]).toBeCloseTo(Math.E, 5);
  });

  it("integrates coupled position and velocity states", () => {
    const result = integrateTo(
      (_time, state) => [state[1] ?? 0, -9.81],
      0,
      [0, 10],
      1,
      0.1
    );
    expect(result.state[0]).toBeCloseTo(10 - 9.81 / 2, 10);
    expect(result.state[1]).toBeCloseTo(0.19, 10);
  });

  it("splits integration exactly at declared discontinuities", () => {
    const result = integrateTo(
      (time) => [time < 0.5 ? 1 : -1],
      0,
      [0],
      1,
      0.4,
      [0.5]
    );
    expect(result.eventStops).toBe(1);
    // The derivative itself is discontinuous at the endpoint; explicit RK4
    // samples that endpoint on the new side. Accuracy converges with maxStep.
    expect(Math.abs(result.state[0] ?? 1)).toBeLessThan(0.05);
  });

  it("steps directly to the next event", () => {
    const result = stepToNextEvent(() => [2], 0.2, [1], [0.1, 0.5, 0.8], 0.05);
    expect(result.time).toBeCloseTo(0.5, 12);
    expect(result.eventTime).toBe(0.5);
    expect(result.state[0]).toBeCloseTo(1.6, 12);
  });

  it("rejects a nonfinite derivative instead of propagating a silent NaN", () => {
    expect(() => rk4Step(() => [NaN], 0, [1], 0.1)).toThrow(/finite/);
    expect(() => rk4Step(() => [1, 2], 0, [1], 0.1)).toThrow(/expected 1/);
  });
});
