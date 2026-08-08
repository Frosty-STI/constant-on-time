import { describe, expect, it } from "vitest";
import {
  ccmBoundaryCurrent,
  chargeBalanceResidual,
  effectiveRippleFrequency,
  idealBuckOperatingPoint,
  idealDutyRatio,
  idealInductorRipplePeakToPeak,
  idealInterleavedRippleFactor,
  idealInterleavedSumRipple,
  outputRippleEstimate,
  voltSecondBalanceResidual
} from "../src/equations.js";

describe("ideal buck equations", () => {
  it("derives duty, slopes, and ripple from volt-second balance", () => {
    const point = idealBuckOperatingPoint({
      vin: 12,
      vout: 5,
      switchingFrequency: 500e3,
      inductance: 1e-6,
      loadCurrent: 10,
      phases: 2
    });
    expect(point.dutyRatio).toBeCloseTo(5 / 12, 12);
    expect(point.onSlope).toBeCloseTo(7e6, 5);
    expect(point.offSlope).toBeCloseTo(-5e6, 5);
    expect(point.ripplePeakToPeak).toBeCloseTo(35 / 6, 10);
    expect(point.averagePhaseCurrent).toBe(5);
    expect(point.conductionMode).toBe("CCM");
    expect(
      voltSecondBalanceResidual(12 - 5, point.onTime, -5, point.period - point.onTime)
    ).toBeCloseTo(0, 15);
  });

  it("identifies the CCM boundary and DCM side", () => {
    const ripple = idealInductorRipplePeakToPeak(12, 5, 500e3, 1e-6);
    expect(ccmBoundaryCurrent(ripple)).toBeCloseTo(ripple / 2, 12);
    const boundaryLoad = ripple / 2;
    expect(
      idealBuckOperatingPoint({
        vin: 12,
        vout: 5,
        switchingFrequency: 500e3,
        inductance: 1e-6,
        loadCurrent: boundaryLoad
      }).conductionMode
    ).toBe("boundary");
    expect(
      idealBuckOperatingPoint({
        vin: 12,
        vout: 5,
        switchingFrequency: 500e3,
        inductance: 1e-6,
        loadCurrent: 0.5
      }).conductionMode
    ).toBe("DCM");
  });

  it("separates capacitive and ESR ripple estimates", () => {
    const result = outputRippleEstimate(2, 500e3, 100e-6, 5e-3);
    expect(result.capacitive).toBeCloseTo(5e-3, 12);
    expect(result.esr).toBeCloseTo(10e-3, 12);
    expect(result.totalUpperBound).toBeCloseTo(15e-3, 12);
  });

  it("integrates capacitor charge with sign", () => {
    expect(chargeBalanceResidual([1, 1, -1, -1], 1e-6)).toBeCloseTo(0, 15);
    expect(chargeBalanceResidual([2, -1], 1e-6)).toBeCloseTo(1e-6, 15);
  });

  it("calculates exact ideal interleaving cancellation at special duties", () => {
    expect(idealInterleavedRippleFactor(0.5, 2)).toBeCloseTo(0, 12);
    expect(idealInterleavedRippleFactor(1 / 3, 3)).toBeCloseTo(0, 12);
    expect(idealInterleavedRippleFactor(0.25, 1)).toBeCloseTo(1, 12);
    expect(idealInterleavedSumRipple(4, 0.5, 2)).toBeCloseTo(0, 12);
    expect(effectiveRippleFrequency(400e3, 4)).toBe(1.6e6);
  });

  it("rejects impossible ideal buck operating points", () => {
    expect(() => idealDutyRatio(5, 12)).toThrow(/vout <= vin/);
    expect(() => idealInductorRipplePeakToPeak(12, 5, 0, 1e-6)).toThrow();
  });
});
