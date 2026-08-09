import { describe, expect, it } from "vitest";
import {
  bodeSweep,
  buckControlToOutput,
  buckLineToOutput,
  buckOpenLoopOutputImpedance,
  buckResonantFrequency,
  capacitorEsrZero,
  closedLoopOutputImpedance,
  closedLoopFromLoopGain,
  complex,
  evaluateCompensator,
  evaluateLoopGain,
  findLoopMargins,
  type BuckSmallSignalConfig,
  type LoopModelConfig
} from "../src/bode.js";

const plant: BuckSmallSignalConfig = {
  vin: 12,
  inductance: 1e-6,
  capacitance: 100e-6,
  loadResistance: 1,
  capacitorEsr: 5e-3
};

describe("analytical Bode helpers", () => {
  it("approaches Vin duty-to-output gain at low frequency", () => {
    const low = buckControlToOutput(plant, 1);
    const high = buckControlToOutput(plant, 1e6);
    expect(complex.magnitude(low)).toBeCloseTo(12, 2);
    expect(complex.magnitude(high)).toBeLessThan(complex.magnitude(low));
    expect(complex.magnitude(buckLineToOutput(plant, 5 / 12, 1))).toBeCloseTo(5 / 12, 3);
    expect(buckResonantFrequency(plant)).toBeCloseTo(1 / (2 * Math.PI * Math.sqrt(1e-10)), 8);
    expect(capacitorEsrZero(plant)).toBeCloseTo(1 / (2 * Math.PI * 5e-3 * 100e-6), 8);
  });

  it("uses the exact ESR-loaded second-order denominator coefficient", () => {
    const highEsrPlant: BuckSmallSignalConfig = {
      vin: 12,
      inductance: 2e-6,
      capacitance: 220e-6,
      loadResistance: 0.02,
      capacitorEsr: 0.5
    };
    const frequency = 40e3;
    const omega = 2 * Math.PI * frequency;
    const esr = highEsrPlant.capacitorEsr ?? 0;
    const expected = complex.divide(
      { re: highEsrPlant.vin, im: highEsrPlant.vin * omega * esr * highEsrPlant.capacitance },
      {
        re:
          1 -
          omega ** 2 *
            highEsrPlant.inductance *
            highEsrPlant.capacitance *
            (1 + esr / highEsrPlant.loadResistance),
        im:
          omega *
          (highEsrPlant.inductance / highEsrPlant.loadResistance +
            esr * highEsrPlant.capacitance)
      }
    );
    const actual = buckControlToOutput(highEsrPlant, frequency);
    expect(actual.re).toBeCloseTo(expected.re, 12);
    expect(actual.im).toBeCloseTo(expected.im, 12);
  });

  it("evaluates Type I, II, and III pole-zero forms", () => {
    const typeI = evaluateCompensator({ type: "I", gain: 1000 }, 100);
    const typeII = evaluateCompensator({ type: "II", gain: 1000, zeroHz: 100, poleHz: 10e3 }, 100);
    const typeIII = evaluateCompensator(
      { type: "III", gain: 1000, zeroHz: [100, 300], poleHz: [10e3, 30e3] },
      100
    );
    expect(complex.magnitude(typeII)).toBeGreaterThan(complex.magnitude(typeI));
    expect(complex.magnitude(typeIII)).toBeGreaterThan(complex.magnitude(typeII));
  });

  it("includes modulator and feedback gains in total loop gain", () => {
    const base: LoopModelConfig = {
      plant,
      compensator: { type: "II", gain: 1000, zeroHz: 1e3, poleHz: 100e3 },
      modulatorGain: 1,
      feedbackGain: 1
    };
    const scaled = { ...base, modulatorGain: 0.5, feedbackGain: 0.2 };
    expect(complex.magnitude(evaluateLoopGain(scaled, 10e3))).toBeCloseTo(
      0.1 * complex.magnitude(evaluateLoopGain(base, 10e3)),
      12
    );
  });

  it("computes a 90-degree phase margin for an ideal integrator crossover", () => {
    const points = bodeSweep(
      (frequency) => ({ re: 0, im: -1000 / frequency }),
      10,
      100e3,
      401
    );
    const margins = findLoopMargins(points);
    expect(margins.crossoverFrequency).toBeCloseTo(1000, 6);
    expect(margins.phaseMargin).toBeCloseTo(90, 8);
    expect(margins.gainMarginDb).toBeNull();
  });

  it("unwraps phase so pure delay can cross minus 180 degrees", () => {
    const delay = 250e-6;
    const points = bodeSweep((frequency) => {
      const magnitude = 1000 / frequency;
      const angle = -Math.PI / 2 - 2 * Math.PI * frequency * delay;
      return { re: magnitude * Math.cos(angle), im: magnitude * Math.sin(angle) };
    }, 10, 10e3, 1001);
    const margins = findLoopMargins(points);
    expect(margins.crossoverFrequency).toBeCloseTo(1000, 2);
    expect(margins.phaseMargin).toBeCloseTo(0, 1);
    expect(margins.phaseCrossoverFrequency).toBeCloseTo(1000, 1);
    expect(margins.gainMarginDb).toBeCloseTo(0, 1);
    expect(margins.phaseCrossovers.map((crossing) => crossing.phaseDegrees)).toEqual([-180, -540, -900]);
  });

  it("enumerates every swept negative-real-axis winding", () => {
    const point = (frequency: number, magnitudeDb: number, phaseDegrees: number) => ({
      frequency,
      magnitudeDb,
      magnitude: 10 ** (magnitudeDb / 20),
      phaseDegrees,
      response: { re: 1, im: 0 }
    });
    const margins = findLoopMargins([
      point(10, 12, -100),
      point(100, 3, -300),
      point(1e3, -6, -600)
    ]);
    expect(margins.phaseCrossovers.map((crossing) => crossing.phaseDegrees)).toEqual([-180, -540]);
    expect(margins.phaseCrossovers.every((crossing) => crossing.direction === "downward")).toBe(true);
  });

  it("enumerates unity crossings and selects the worst downward phase margin", () => {
    const point = (frequency: number, magnitudeDb: number, phaseDegrees: number) => ({
      frequency,
      magnitudeDb,
      magnitude: 10 ** (magnitudeDb / 20),
      phaseDegrees,
      response: { re: 1, im: 0 }
    });
    const margins = findLoopMargins([
      point(10, -10, 60),
      point(100, 0, 60),
      point(1e3, 10, -30),
      point(10e3, 0, -147.55),
      point(100e3, -10, -170)
    ]);
    expect(margins.gainCrossovers).toHaveLength(2);
    expect(margins.gainCrossovers.map((crossing) => crossing.direction)).toEqual(["upward", "downward"]);
    expect(margins.gainCrossovers[0]?.phaseMargin).toBeCloseTo(-120, 8);
    expect(margins.gainCrossovers[1]?.phaseMargin).toBeCloseTo(32.45, 8);
    expect(margins.crossoverFrequency).toBeCloseTo(10e3, 8);
    expect(margins.phaseMargin).toBeCloseTo(32.45, 8);
  });

  it("wraps multi-winding unity-crossing margin to signed negative-real-axis clearance", () => {
    const marginAt = (phaseDegrees: number) => findLoopMargins([
      { frequency: 10, magnitudeDb: 10, magnitude: 10 ** 0.5, phaseDegrees, response: { re: 1, im: 0 } },
      { frequency: 100, magnitudeDb: -10, magnitude: 10 ** -0.5, phaseDegrees, response: { re: 1, im: 0 } }
    ]).phaseMargin;
    expect(marginAt(-500)).toBeCloseTo(40, 12);
    expect(marginAt(-540)).toBeCloseTo(0, 12);
    expect(marginAt(-580)).toBeCloseTo(-40, 12);
  });

  it("enumerates phase crossings and reports the lowest gain margin", () => {
    const point = (frequency: number, magnitudeDb: number, phaseDegrees: number) => ({
      frequency,
      magnitudeDb,
      magnitude: 10 ** (magnitudeDb / 20),
      phaseDegrees,
      response: { re: 1, im: 0 }
    });
    const margins = findLoopMargins([
      point(10, 20, -170),
      point(100, 10, -190),
      point(1e3, 0, -170),
      point(10e3, -5, -190)
    ]);
    expect(margins.phaseCrossovers).toHaveLength(3);
    expect(margins.phaseCrossovers.map((crossing) => crossing.direction)).toEqual([
      "downward",
      "upward",
      "downward"
    ]);
    expect(margins.phaseCrossovers.map((crossing) => crossing.gainMarginDb)).toEqual([
      -15,
      -5,
      2.5
    ]);
    expect(margins.phaseCrossoverFrequency).toBeCloseTo(Math.sqrt(10 * 100), 12);
    expect(margins.gainMarginDb).toBeCloseTo(-15, 12);
  });

  it("counts an exact unity plateau once", () => {
    const points = [
      { frequency: 10, magnitudeDb: -10, magnitude: 10 ** -0.5, phaseDegrees: -90, response: { re: 1, im: 0 } },
      { frequency: 100, magnitudeDb: 0, magnitude: 1, phaseDegrees: -100, response: { re: 1, im: 0 } },
      { frequency: 1e3, magnitudeDb: 0, magnitude: 1, phaseDegrees: -120, response: { re: 1, im: 0 } },
      { frequency: 10e3, magnitudeDb: 10, magnitude: 10 ** 0.5, phaseDegrees: -140, response: { re: 1, im: 0 } }
    ];
    const margins = findLoopMargins(points);
    expect(margins.gainCrossovers).toHaveLength(1);
    expect(margins.gainCrossovers[0]?.frequency).toBeCloseTo(Math.sqrt(100 * 1e3), 12);
    expect(margins.gainCrossovers[0]?.direction).toBe("upward");
  });

  it("labels a target touch without a sign change as flat", () => {
    const points = [
      { frequency: 10, magnitudeDb: 10, magnitude: 10 ** 0.5, phaseDegrees: -90, response: { re: 1, im: 0 } },
      { frequency: 100, magnitudeDb: 0, magnitude: 1, phaseDegrees: -100, response: { re: 1, im: 0 } },
      { frequency: 1e3, magnitudeDb: 0, magnitude: 1, phaseDegrees: -120, response: { re: 1, im: 0 } },
      { frequency: 10e3, magnitudeDb: 20, magnitude: 10, phaseDegrees: -140, response: { re: 1, im: 0 } }
    ];
    const margins = findLoopMargins(points);
    expect(margins.gainCrossovers).toHaveLength(1);
    expect(margins.gainCrossovers[0]?.direction).toBe("flat");
  });

  it("forms a bounded closed-loop response", () => {
    const result = closedLoopFromLoopGain({ re: 100, im: 0 });
    expect(result.re).toBeCloseTo(100 / 101, 12);
    expect(result.im).toBe(0);
  });

  it("returns a finite passive output impedance", () => {
    const impedance = buckOpenLoopOutputImpedance(plant, 10e3);
    expect(complex.magnitude(impedance)).toBeGreaterThan(0);
    expect(Number.isFinite(impedance.re)).toBe(true);
    expect(Number.isFinite(impedance.im)).toBe(true);
    const loop: LoopModelConfig = {
      plant,
      compensator: { type: "I", gain: 1000 },
      modulatorGain: 1,
      feedbackGain: 0.2
    };
    expect(complex.magnitude(closedLoopOutputImpedance(loop, 1e3))).toBeLessThan(
      complex.magnitude(buckOpenLoopOutputImpedance(plant, 1e3))
    );
  });
});
