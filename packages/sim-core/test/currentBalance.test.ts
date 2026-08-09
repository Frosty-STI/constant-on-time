import { describe, expect, it } from "vitest";
import {
  createCurrentBalanceState,
  updateCurrentBalance
} from "../src/currentBalance.js";

describe("differential current-balance loop", () => {
  const config = { proportionalGain: 0.2, integralGain: 100, maxTrim: 0.5 };

  it("produces zero common-mode trim for symmetric phases", () => {
    const result = updateCurrentBalance(config, createCurrentBalanceState(3), [5, 5, 5], 1e-5);
    expect(result.errors).toEqual([0, 0, 0]);
    expect(result.trims).toEqual([0, 0, 0]);
    expect(result.rmsSharingError).toBe(0);
  });

  it("raises the under-current phase and lowers the over-current phase", () => {
    const result = updateCurrentBalance(config, createCurrentBalanceState(2), [4, 6], 1e-5);
    expect(result.targetCurrent).toBe(5);
    expect(result.trims[0]).toBeGreaterThan(0);
    expect(result.trims[1]).toBeLessThan(0);
    expect((result.trims[0] ?? 0) + (result.trims[1] ?? 0)).toBeCloseTo(0, 14);
  });

  it("reduces sharing error in a simple trim-to-current surrogate plant", () => {
    let currents = [4, 6];
    let state = createCurrentBalanceState(2);
    const initialError = Math.abs((currents[1] ?? 0) - (currents[0] ?? 0));
    for (let index = 0; index < 30; index += 1) {
      const result = updateCurrentBalance(config, state, currents, 1e-4);
      state = result.state;
      currents = currents.map((current, phase) => current + (result.trims[phase] ?? 0) * 0.1);
    }
    expect(Math.abs((currents[1] ?? 0) - (currents[0] ?? 0))).toBeLessThan(initialError);
  });

  it("limits trim and warns when sharing bandwidth approaches voltage-loop bandwidth", () => {
    const result = updateCurrentBalance(
      {
        proportionalGain: 10,
        integralGain: 1000,
        maxTrim: 0.1,
        sharingLoopBandwidth: 20e3,
        voltageLoopBandwidth: 50e3
      },
      createCurrentBalanceState(2),
      [0, 10],
      1e-3
    );
    expect(Math.max(...result.trims.map(Math.abs))).toBeLessThanOrEqual(0.1);
    expect(result.warnings[0]).toMatch(/high relative/);
  });
});
