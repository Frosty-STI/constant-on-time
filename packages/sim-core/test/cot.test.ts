import { describe, expect, it } from "vitest";
import {
  createCotState,
  rippleInjectionAt,
  requestedCotOnTime,
  stepCotController,
  type CotControllerConfig
} from "../src/controllers/cot.js";

function config(overrides: Partial<CotControllerConfig> = {}): CotControllerConfig {
  return {
    referenceVoltage: 1,
    onTimeLaw: { kind: "fixed", onTime: 1e-6 },
    minimumOnTime: 0.5e-6,
    maximumOnTime: 2e-6,
    minimumOffTime: 0.3e-6,
    comparatorDelay: 0.1e-6,
    comparatorHysteresis: 20e-3,
    ...overrides
  };
}

describe("constant-on-time one-shot", () => {
  it("qualifies a comparator request through propagation delay", () => {
    const cfg = config();
    let state = createCotState(cfg);
    let result = stepCotController(cfg, state, { time: 0, vin: 12, feedback: 0.98 });
    expect(result.state.comparatorLow).toBe(true);
    expect(result.pulseRequested).toBe(false);
    state = result.state;
    result = stepCotController(cfg, state, { time: 0.05e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseStarted).toBe(false);
    result = stepCotController(cfg, result.state, { time: 0.1e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseRequested).toBe(true);
    expect(result.pulseStarted).toBe(true);
    expect(result.switchHigh).toBe(true);
  });

  it("enforces one-shot duration, then minimum off-time before retrigger", () => {
    const cfg = config();
    let result = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 0.98
    });
    result = stepCotController(cfg, result.state, { time: 0.1e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseStarted).toBe(true);
    result = stepCotController(cfg, result.state, { time: 1.1e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseEnded).toBe(true);
    expect(result.endReason).toBe("one-shot");
    expect(result.nextEventAt).toBeCloseTo(1.5e-6, 14);
    result = stepCotController(cfg, result.state, { time: 1.4e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseStarted).toBe(false);
    result = stepCotController(cfg, result.state, { time: 1.5e-6, vin: 12, feedback: 0.98 });
    expect(result.pulseStarted).toBe(true);
  });

  it("uses comparator hysteresis to reject small reversals", () => {
    const cfg = config({ comparatorDelay: 1e-6 });
    let result = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 0.989
    });
    expect(result.state.comparatorLow).toBe(true);
    result = stepCotController(cfg, result.state, { time: 0.1e-6, vin: 12, feedback: 1.005 });
    expect(result.state.comparatorLow).toBe(true);
    result = stepCotController(cfg, result.state, { time: 0.2e-6, vin: 12, feedback: 1.011 });
    expect(result.state.comparatorLow).toBe(false);
    expect(result.state.pendingTriggerAt).toBeNull();
  });

  it("holds a qualified pulse request when a scheduler denies it", () => {
    const cfg = config({ comparatorDelay: 0 });
    const denied = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 0.9,
      grantPulse: false
    });
    expect(denied.pulseRequested).toBe(true);
    expect(denied.pulseStarted).toBe(false);
    expect(denied.nextEventAt).toBeNull();
    const granted = stepCotController(cfg, denied.state, {
      time: 0.2e-6,
      vin: 12,
      feedback: 0.9,
      grantPulse: true
    });
    expect(granted.pulseStarted).toBe(true);
  });

  it("does not let current limit violate minimum on-time", () => {
    const cfg = config({ comparatorDelay: 0, currentLimit: 5 });
    let result = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 0.9,
      sensedCurrent: 0
    });
    expect(result.pulseStarted).toBe(true);
    result = stepCotController(cfg, result.state, {
      time: 0.2e-6,
      vin: 12,
      feedback: 0.9,
      sensedCurrent: 6
    });
    expect(result.switchHigh).toBe(true);
    result = stepCotController(cfg, result.state, {
      time: 0.5e-6,
      vin: 12,
      feedback: 0.9,
      sensedCurrent: 6
    });
    expect(result.pulseEnded).toBe(true);
    expect(result.endReason).toBe("current-limit");
    expect(result.state.currentLimitStopCount).toBe(1);
  });

  it("exposes the minimum-on boundary when current limit is already asserted at pulse start", () => {
    const cfg = config({ comparatorDelay: 0, currentLimit: 5 });
    let result = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 0.9,
      sensedCurrent: 6
    });
    expect(result.pulseStarted).toBe(true);
    expect(result.nextEventAt).toBeCloseTo(0.5e-6, 15);
    result = stepCotController(cfg, result.state, {
      time: result.nextEventAt ?? -1,
      vin: 12,
      feedback: 0.9,
      sensedCurrent: 6
    });
    expect(result.pulseEnded).toBe(true);
    expect(result.endReason).toBe("current-limit");
  });

  it("clamps requested fixed on-time to minimum and maximum", () => {
    const tooLong = config({ onTimeLaw: { kind: "fixed", onTime: 10e-6 } });
    const tooShort = config({ onTimeLaw: { kind: "fixed", onTime: 0.1e-6 } });
    expect(requestedCotOnTime(tooLong, 12)).toEqual({ requested: 10e-6, applied: 2e-6 });
    expect(requestedCotOnTime(tooShort, 12)).toEqual({ requested: 0.1e-6, applied: 0.5e-6 });
  });

  it("implements the adaptive Vout/(Vin*f) feedforward law", () => {
    const cfg = config({
      feedbackGain: 0.2,
      minimumOnTime: 0.05e-6,
      maximumOnTime: 5e-6,
      onTimeLaw: { kind: "adaptive-vout-vin", nominalFrequency: 500e3 }
    });
    expect(requestedCotOnTime(cfg, 12).requested).toBeCloseTo(5 / (12 * 500e3), 14);
    expect(requestedCotOnTime(cfg, 24).requested).toBeCloseTo(5 / (24 * 500e3), 14);
    expect(requestedCotOnTime(cfg, 12).requested / requestedCotOnTime(cfg, 24).requested).toBeCloseTo(2, 12);
  });

  it("combines natural ripple, injected ripple, and noise explicitly", () => {
    const cfg = config({ comparatorDelay: 0, injectedRippleGain: 2 });
    const result = stepCotController(cfg, createCotState(cfg), {
      time: 0,
      vin: 12,
      feedback: 1.01,
      naturalRipple: -0.005,
      injectedRipple: -0.01,
      noise: 0.002
    });
    expect(result.comparatorInput).toBeCloseTo(0.987, 12);
    expect(result.pulseStarted).toBe(true);
  });

  it("generates reproducible injected ripple with an explicit phase", () => {
    const waveform = {
      source: "synthetic" as const,
      waveform: "sine" as const,
      amplitudePeakToPeak: 20e-3,
      frequency: 500e3,
      phaseDegrees: 90
    };
    expect(rippleInjectionAt(waveform, 0)).toBeCloseTo(10e-3, 12);
    expect(rippleInjectionAt(waveform, 1 / 500e3)).toBeCloseTo(10e-3, 12);
    expect(rippleInjectionAt({ ...waveform, phaseDegrees: -90 }, 0)).toBeCloseTo(-10e-3, 12);
  });

  it("rejects nonmonotonic time and impossible timing", () => {
    const cfg = config();
    const state = createCotState(cfg, 1e-6);
    expect(() => stepCotController(cfg, state, { time: 0, vin: 12, feedback: 1 })).toThrow(/monotonic/);
    expect(() => config({ minimumOnTime: 2e-6, maximumOnTime: 1e-6 })).not.toThrow();
    expect(() => createCotState(config({ minimumOnTime: 2e-6, maximumOnTime: 1e-6 }))).toThrow(/maximumOnTime/);
  });
});
