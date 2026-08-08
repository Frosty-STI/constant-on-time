import { describe, expect, it } from "vitest";
import {
  createBuckPlantState,
  pwmDrivesAt,
  pwmDrivesForPlantAt,
  pwmEventTimes,
  resolveConductionMode,
  sampleBuckPlant,
  simulateBuckPlant,
  solveOutput,
  stepBuckPlant,
  switchNodeVoltage,
  validatePwmDrive,
  type BuckPlantConfig,
  type PhaseDrive
} from "../src/plant.js";

function baseConfig(overrides: Partial<BuckPlantConfig> = {}): BuckPlantConfig {
  return {
    vin: 12,
    capacitance: 1,
    phases: [{ inductance: 1e-6 }],
    load: { initial: { kind: "constant-current", current: 1 } },
    ...overrides
  };
}

describe("switch-state physics", () => {
  it("selects the physically appropriate conduction path", () => {
    expect(resolveConductionMode({ gate: "high-side" }, 2)).toBe("high-side");
    expect(resolveConductionMode({ gate: "low-side" }, -2)).toBe("low-side");
    expect(resolveConductionMode({ gate: "dead-time" }, 2)).toBe("low-body-diode");
    expect(resolveConductionMode({ gate: "dead-time" }, -2)).toBe("high-body-diode");
    expect(resolveConductionMode({ gate: "dead-time", diodeEmulation: true }, -2)).toBe("high-body-diode");
    expect(resolveConductionMode({ gate: "low-side", asynchronous: true }, -2)).toBe("high-body-diode");
    expect(resolveConductionMode({ gate: "low-side", asynchronous: true }, 2)).toBe("low-body-diode");
    expect(resolveConductionMode({ gate: "low-side", asynchronous: true }, 0)).toBe("open");
  });

  it("uses correct switch-node voltages for forward and reverse dead-time current", () => {
    const config = baseConfig();
    const phase = { inductance: 1e-6, diodeDrop: 0.7, highSideResistance: 0.1, lowSideResistance: 0.05 };
    expect(switchNodeVoltage(config, phase, "high-side", 2, 5)).toBeCloseTo(11.8, 12);
    expect(switchNodeVoltage(config, phase, "low-side", 2, 5)).toBeCloseTo(-0.1, 12);
    expect(switchNodeVoltage(config, phase, "low-body-diode", 2, 5)).toBeCloseTo(-0.7, 12);
    expect(switchNodeVoltage(config, phase, "high-body-diode", -2, 5)).toBeCloseTo(12.7, 12);
  });

  it.each([
    [{ gate: "high-side" } satisfies PhaseDrive, 7e6],
    [{ gate: "low-side" } satisfies PhaseDrive, -5e6],
    [{ gate: "dead-time" } satisfies PhaseDrive, -5.7e6]
  ])("changes slope with the actual switching state", (drive, expectedSlope) => {
    const config = baseConfig({ phases: [{ inductance: 1e-6, diodeDrop: 0.7 }] });
    const state = createBuckPlantState(config, { vCap: 5, phaseCurrents: [1] });
    const dt = 1e-11;
    const result = stepBuckPlant(config, state, [drive], dt);
    expect(((result.state.phaseCurrents[0] ?? 0) - 1) / dt).toBeCloseTo(expectedSlope, -2);
  });

  it("routes negative dead-time current through the high-side body diode", () => {
    const config = baseConfig({ phases: [{ inductance: 1e-6, diodeDrop: 0.7 }] });
    const state = createBuckPlantState(config, { vCap: 5, phaseCurrents: [-1] });
    const result = stepBuckPlant(config, state, [{ gate: "dead-time" }], 1e-11);
    expect(((result.state.phaseCurrents[0] ?? 0) + 1) / 1e-11).toBeCloseTo(7.7e6, -2);
    expect(result.sample.conductionModes[0]).toBe("high-body-diode");
  });

  it("includes DCR and switch resistance in phase slope", () => {
    const config = baseConfig({
      phases: [{ inductance: 1e-6, dcr: 0.05, highSideResistance: 0.1 }],
      load: { initial: { kind: "constant-current", current: 5 } }
    });
    const state = createBuckPlantState(config, { vCap: 5, phaseCurrents: [5] });
    const result = stepBuckPlant(config, state, [{ gate: "high-side" }], 1e-11);
    expect(((result.state.phaseCurrents[0] ?? 0) - 5) / 1e-11).toBeCloseTo(6.25e6, -2);
  });

  it("prevents reverse current in diode emulation but permits it synchronously", () => {
    const config = baseConfig();
    const nearZero = createBuckPlantState(config, { vCap: 5, phaseCurrents: [1e-3] });
    const emulated = stepBuckPlant(config, nearZero, [{ gate: "low-side", diodeEmulation: true }], 1e-9);
    const synchronous = stepBuckPlant(config, nearZero, [{ gate: "low-side" }], 1e-9);
    expect(emulated.state.phaseCurrents[0]).toBe(0);
    expect(synchronous.state.phaseCurrents[0]).toBeLessThan(0);
  });

  it("preserves already-negative inductor current until a body-diode zero crossing", () => {
    const config = baseConfig({ phases: [{ inductance: 1e-6, diodeDrop: 0.7 }] });
    const negative = createBuckPlantState(config, { vCap: 5, phaseCurrents: [-1] });
    const tiny = stepBuckPlant(config, negative, [{ gate: "dead-time", diodeEmulation: true }], 1e-12);
    expect(tiny.state.phaseCurrents[0]).toBeGreaterThan(-1);
    expect(tiny.state.phaseCurrents[0]).toBeLessThan(0);
    expect(tiny.sample.conductionModes[0]).toBe("high-body-diode");
    const crossed = stepBuckPlant(config, negative, [{ gate: "dead-time", diodeEmulation: true }], 1e-6);
    expect(crossed.state.phaseCurrents[0]).toBe(0);
    expect(crossed.sample.conductionModes[0]).toBe("open");
  });

  it.each([
    { initialCurrent: 1e-3, step: 1e-9 },
    { initialCurrent: -1e-3, step: 10e-9 }
  ])("clamps unflagged dead-time body-diode current at its zero crossing", ({ initialCurrent, step }) => {
    const config = baseConfig({ phases: [{ inductance: 1e-6, diodeDrop: 0.7 }] });
    const initial = createBuckPlantState(config, { vCap: 5, phaseCurrents: [initialCurrent] });
    const crossed = stepBuckPlant(config, initial, [{ gate: "dead-time" }], step);
    expect(crossed.state.phaseCurrents[0]).toBe(0);
    expect(crossed.sample.conductionModes[0]).toBe("open");
  });

  it.each([
    { gate: "high-side", diodeEmulation: true } satisfies PhaseDrive,
    { gate: "high-side", asynchronous: true } satisfies PhaseDrive
  ])("allows high-side conduction to carry negative current continuously through zero", (drive) => {
    const config = baseConfig();
    const negative = createBuckPlantState(config, { vCap: 5, phaseCurrents: [-1] });
    const stillNegative = stepBuckPlant(config, negative, [drive], 100e-9);
    expect(stillNegative.state.phaseCurrents[0]).toBeGreaterThan(-1);
    expect(stillNegative.state.phaseCurrents[0]).toBeLessThan(0);

    const crossed = stepBuckPlant(config, stillNegative.state, [drive], 100e-9);
    expect(crossed.state.phaseCurrents[0]).toBeGreaterThan(0);
    expect(crossed.sample.conductionModes[0]).toBe("high-side");
  });
});

describe("shared output state and nonideal output network", () => {
  it("solves capacitor ESR and a resistive load without an algebraic loop", () => {
    const config = baseConfig({
      capacitorEsr: 0.1,
      load: { initial: { kind: "resistive", resistance: 1 } }
    });
    const solved = solveOutput(config, 0, 5, [6]);
    expect(solved.outputVoltage).toBeCloseTo(5.6 / 1.1, 12);
    expect(solved.loadCurrent).toBeCloseTo(solved.outputVoltage, 12);
    expect(solved.capacitorCurrent).toBeCloseTo(6 - solved.outputVoltage, 12);
  });

  it("sums every phase current into one shared capacitor state", () => {
    const config = baseConfig({
      capacitance: 100e-6,
      phases: [{ inductance: 1e-6 }, { inductance: 1e-6 }],
      load: { initial: { kind: "constant-current", current: 5 } }
    });
    const state = createBuckPlantState(config, { vCap: 5, phaseCurrents: [3, 4] });
    const sample = sampleBuckPlant(config, state, [{ gate: "low-side" }, { gate: "low-side" }]);
    expect(sample.sumInductorCurrent).toBe(7);
    expect(sample.capacitorCurrent).toBe(2);
    const stepped = stepBuckPlant(config, state, [{ gate: "low-side" }, { gate: "low-side" }], 1e-9);
    expect(stepped.state.vCap).toBeGreaterThan(state.vCap);
  });

  it("applies a deterministic load step at its declared time", () => {
    const config = baseConfig({
      load: {
        initial: { kind: "constant-current", current: 1 },
        steps: [{ at: 1e-6, load: { kind: "constant-current", current: 4 } }]
      }
    });
    expect(solveOutput(config, 0.9e-6, 5, [3]).capacitorCurrent).toBe(2);
    expect(solveOutput(config, 1e-6, 5, [3]).capacitorCurrent).toBe(-1);
  });

  it("exposes ESL as a labeled output-only finite-difference approximation", () => {
    const noEsl = baseConfig({ capacitorEsl: 0 });
    const withEsl = baseConfig({ capacitorEsl: 10e-9 });
    const stateA = createBuckPlantState(noEsl, { vCap: 5, phaseCurrents: [1] });
    const stateB = createBuckPlantState(withEsl, { vCap: 5, phaseCurrents: [1] });
    const a = stepBuckPlant(noEsl, stateA, [{ gate: "high-side" }], 1e-9).sample;
    const b = stepBuckPlant(withEsl, stateB, [{ gate: "high-side" }], 1e-9).sample;
    expect(b.vOutWithoutEsl).toBeCloseTo(a.vOutWithoutEsl, 10);
    expect(b.vOut).not.toBeCloseTo(b.vOutWithoutEsl, 8);
  });
});

describe("N-phase PWM regression", () => {
  it("requires both dead-time intervals to fit inside the off interval", () => {
    const base = { switchingFrequency: 500e3, dutyRatio: 0.9 };
    expect(() => validatePwmDrive({ ...base, deadTime: 150e-9 }, 1)).toThrow(
      /two dead-time intervals leave no low-side conduction interval/
    );
    expect(() => validatePwmDrive({ ...base, deadTime: 100e-9 }, 1)).toThrow(
      /two dead-time intervals leave no low-side conduction interval/
    );
    expect(() => validatePwmDrive({ ...base, deadTime: 99e-9 }, 1)).not.toThrow();
    expect(() => validatePwmDrive({ switchingFrequency: 500e3, dutyRatio: 1, deadTime: 0 }, 1)).not.toThrow();
    expect(pwmDrivesAt(1e-6, 1, { switchingFrequency: 500e3, dutyRatio: 1, deadTime: 0 })[0]?.gate).toBe("high-side");
  });

  it("generates uniform phase spacing and explicit switching events", () => {
    const pwm = { switchingFrequency: 500e3, dutyRatio: 0.4, deadTime: 20e-9 };
    const period = 1 / pwm.switchingFrequency;
    expect(pwmDrivesAt(0, 2, pwm).map((drive) => drive.gate)).toEqual(["high-side", "low-side"]);
    expect(pwmDrivesAt(period / 2, 2, pwm).map((drive) => drive.gate)).toEqual(["low-side", "high-side"]);
    const events = pwmEventTimes(0, period, 2, pwm);
    expect(events.some((event) => Math.abs(event - period / 2) < 1e-15)).toBe(true);
  });

  it("applies deliberate per-phase timing mismatch", () => {
    const pwm = { switchingFrequency: 1e6, dutyRatio: 0.4 };
    const period = 1 / pwm.switchingFrequency;
    const plant = baseConfig({
      phases: [
        { inductance: 1e-6 },
        { inductance: 1e-6, timingOffset: 0.1 * period }
      ]
    });
    expect(pwmDrivesForPlantAt(period / 2, plant, pwm).map((drive) => drive.gate)).toEqual([
      "low-side",
      "low-side"
    ]);
    expect(pwmDrivesForPlantAt(0.6 * period, plant, pwm)[1]?.gate).toBe("high-side");
  });

  it("preserves phase-current symmetry and exposes mismatch", () => {
    const symmetric = baseConfig({
      phases: [{ inductance: 1e-6 }, { inductance: 1e-6 }],
      load: { initial: { kind: "constant-current", current: 2 } }
    });
    const mismatch = { ...symmetric, phases: [{ inductance: 1e-6 }, { inductance: 1.1e-6 }] };
    const drives: PhaseDrive[] = [{ gate: "high-side" }, { gate: "high-side" }];
    const symResult = stepBuckPlant(
      symmetric,
      createBuckPlantState(symmetric, { vCap: 5, phaseCurrents: [1, 1] }),
      drives,
      10e-9
    );
    expect(symResult.state.phaseCurrents[0]).toBeCloseTo(symResult.state.phaseCurrents[1] ?? 0, 12);
    const mismatchResult = stepBuckPlant(
      mismatch,
      createBuckPlantState(mismatch, { vCap: 5, phaseCurrents: [1, 1] }),
      drives,
      10e-9
    );
    expect(mismatchResult.state.phaseCurrents[0]).toBeGreaterThan(mismatchResult.state.phaseCurrents[1] ?? 0);
  });

  it("holds an analytically initialized ideal operating point over many cycles", () => {
    const switchingFrequency = 500e3;
    const period = 1 / switchingFrequency;
    const dutyRatio = 5 / 12;
    const ripple = ((12 - 5) / 1e-6) * dutyRatio * period;
    const config: BuckPlantConfig = {
      vin: 12,
      capacitance: 100e-6,
      phases: [{ inductance: 1e-6 }],
      load: { initial: { kind: "resistive", resistance: 1 } }
    };
    const pwm = { switchingFrequency, dutyRatio };
    const initial = createBuckPlantState(config, { vCap: 5, phaseCurrents: [5 - ripple / 2] });
    const stopTime = 20 * period;
    const result = simulateBuckPlant(config, {
      startState: initial,
      stopTime,
      maxStep: period / 200,
      driveAt: (time) => pwmDrivesAt(time, 1, pwm),
      eventTimes: pwmEventTimes(0, stopTime, 1, pwm)
    });
    const lastCycle = result.samples.filter((sample) => sample.time >= stopTime - period);
    const averageOutput = lastCycle.reduce((sum, sample) => sum + sample.vOut, 0) / lastCycle.length;
    const averageCapCurrent = lastCycle.reduce((sum, sample) => sum + sample.capacitorCurrent, 0) / lastCycle.length;
    expect(averageOutput).toBeCloseTo(5, 1);
    expect(Math.abs(averageCapCurrent)).toBeLessThan(0.2);
    expect(result.eventStops).toBeGreaterThan(0);
  });

  it("rejects phase-count and nonfinite-state mismatches", () => {
    const config = baseConfig();
    expect(() => stepBuckPlant(config, createBuckPlantState(config), [], 1e-9)).toThrow(/one drive/);
    expect(() =>
      stepBuckPlant(
        config,
        { time: 0, vCap: NaN, phaseCurrents: [0], previousCapCurrent: 0 },
        [{ gate: "low-side" }],
        1e-9
      )
    ).toThrow(/finite/);
  });
});
