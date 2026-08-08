import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export interface Complex {
  re: number;
  im: number;
}

export const complex = {
  add: (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im }),
  multiply: (a: Complex, b: Complex): Complex => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re
  }),
  divide: (a: Complex, b: Complex): Complex => {
    const denominator = b.re * b.re + b.im * b.im;
    if (denominator === 0) throw new RangeError("complex division by zero");
    return {
      re: (a.re * b.re + a.im * b.im) / denominator,
      im: (a.im * b.re - a.re * b.im) / denominator
    };
  },
  scale: (a: Complex, gain: number): Complex => ({ re: a.re * gain, im: a.im * gain }),
  magnitude: (a: Complex): number => Math.hypot(a.re, a.im),
  phaseDegrees: (a: Complex): number => (Math.atan2(a.im, a.re) * 180) / Math.PI
};

function sAt(frequency: number): Complex {
  assertPositive(frequency, "frequency");
  return { re: 0, im: 2 * Math.PI * frequency };
}

function onePlusSOver(s: Complex, angularFrequency: number): Complex {
  return { re: 1 + s.re / angularFrequency, im: s.im / angularFrequency };
}

export interface BuckSmallSignalConfig {
  vin: number;
  inductance: number;
  capacitance: number;
  loadResistance: number;
  capacitorEsr?: number;
}

export function validateBuckSmallSignal(config: BuckSmallSignalConfig): void {
  assertPositive(config.vin, "vin");
  assertPositive(config.inductance, "inductance");
  assertPositive(config.capacitance, "capacitance");
  assertPositive(config.loadResistance, "loadResistance");
  assertNonNegative(config.capacitorEsr ?? 0, "capacitorEsr");
}

/** Continuous-conduction voltage-mode duty-to-output model for an ideal
 * inductor feeding a resistive load in parallel with a series ESR-capacitance
 * branch. The passive-network denominator is exact for those elements:
 *
 *   Gvd(s) = Vin(1 + s Resr C)
 *            / [1 + s(L/R + Resr C) + s^2 L C(1 + Resr/R)]
 *
 * PWM sampling, delays, inductor DCR, and switching harmonics are not
 * included. */
export function buckControlToOutput(config: BuckSmallSignalConfig, frequency: number): Complex {
  validateBuckSmallSignal(config);
  const s = sAt(frequency);
  const esr = config.capacitorEsr ?? 0;
  const numerator = complex.scale(
    { re: 1 + s.re * esr * config.capacitance, im: s.im * esr * config.capacitance },
    config.vin
  );
  const dampingTime = config.inductance / config.loadResistance + esr * config.capacitance;
  const sSquared = complex.multiply(s, s);
  const denominator = complex.add(
    complex.add({ re: 1, im: 0 }, complex.scale(s, dampingTime)),
    complex.scale(
      sSquared,
      config.inductance * config.capacitance * (1 + esr / config.loadResistance)
    )
  );
  return complex.divide(numerator, denominator);
}

/** CCM line-to-output response at a fixed duty operating point. The denominator
 * and ESR zero match the control-to-output approximation. */
export function buckLineToOutput(
  config: BuckSmallSignalConfig,
  dutyRatio: number,
  frequency: number
): Complex {
  validateBuckSmallSignal(config);
  assertFinite(dutyRatio, "dutyRatio");
  if (dutyRatio < 0 || dutyRatio > 1) throw new RangeError("dutyRatio must be in [0, 1]");
  return complex.scale(buckControlToOutput(config, frequency), dutyRatio / config.vin);
}

export function buckResonantFrequency(config: BuckSmallSignalConfig): number {
  validateBuckSmallSignal(config);
  return 1 / (2 * Math.PI * Math.sqrt(config.inductance * config.capacitance));
}

export function capacitorEsrZero(config: BuckSmallSignalConfig): number | null {
  validateBuckSmallSignal(config);
  const esr = config.capacitorEsr ?? 0;
  return esr === 0 ? null : 1 / (2 * Math.PI * esr * config.capacitance);
}

/** Small-signal output impedance of the passive L-C-load network with the duty
 * perturbation set to zero. */
export function buckOpenLoopOutputImpedance(config: BuckSmallSignalConfig, frequency: number): Complex {
  validateBuckSmallSignal(config);
  const s = sAt(frequency);
  const zL = complex.scale(s, config.inductance);
  const zC = complex.add(
    { re: config.capacitorEsr ?? 0, im: 0 },
    complex.divide({ re: 1, im: 0 }, complex.scale(s, config.capacitance))
  );
  const admittance = complex.add(
    complex.add(
      { re: 1 / config.loadResistance, im: 0 },
      complex.divide({ re: 1, im: 0 }, zL)
    ),
    complex.divide({ re: 1, im: 0 }, zC)
  );
  return complex.divide({ re: 1, im: 0 }, admittance);
}

export type CompensatorConfig =
  | { type: "I"; gain: number }
  | { type: "II"; gain: number; zeroHz: number; poleHz: number }
  | { type: "III"; gain: number; zeroHz: readonly [number, number]; poleHz: readonly [number, number] };

export function validateCompensator(config: CompensatorConfig): void {
  assertPositive(config.gain, "compensator gain");
  if (config.type === "II") {
    assertPositive(config.zeroHz, "zeroHz");
    assertPositive(config.poleHz, "poleHz");
  } else if (config.type === "III") {
    config.zeroHz.forEach((value, index) => assertPositive(value, `zeroHz[${index}]`));
    config.poleHz.forEach((value, index) => assertPositive(value, `poleHz[${index}]`));
  }
}

/** Pole/zero form with an origin pole. Gain is the numerator coefficient in
 * rad/s, not the magnitude at 1 Hz. */
export function evaluateCompensator(config: CompensatorConfig, frequency: number): Complex {
  validateCompensator(config);
  const s = sAt(frequency);
  let response = complex.divide({ re: config.gain, im: 0 }, s);
  if (config.type === "I") return response;
  if (config.type === "II") {
    response = complex.multiply(response, onePlusSOver(s, 2 * Math.PI * config.zeroHz));
    response = complex.divide(response, onePlusSOver(s, 2 * Math.PI * config.poleHz));
    return response;
  }
  response = complex.multiply(response, onePlusSOver(s, 2 * Math.PI * config.zeroHz[0]));
  response = complex.multiply(response, onePlusSOver(s, 2 * Math.PI * config.zeroHz[1]));
  response = complex.divide(response, onePlusSOver(s, 2 * Math.PI * config.poleHz[0]));
  response = complex.divide(response, onePlusSOver(s, 2 * Math.PI * config.poleHz[1]));
  return response;
}

export interface LoopModelConfig {
  plant: BuckSmallSignalConfig;
  compensator: CompensatorConfig;
  modulatorGain: number;
  feedbackGain: number;
  additionalDelay?: number;
}

export function evaluateLoopGain(config: LoopModelConfig, frequency: number): Complex {
  assertPositive(config.modulatorGain, "modulatorGain");
  assertPositive(config.feedbackGain, "feedbackGain");
  assertNonNegative(config.additionalDelay ?? 0, "additionalDelay");
  const plant = buckControlToOutput(config.plant, frequency);
  const compensator = evaluateCompensator(config.compensator, frequency);
  const delayAngle = -2 * Math.PI * frequency * (config.additionalDelay ?? 0);
  const delay = { re: Math.cos(delayAngle), im: Math.sin(delayAngle) };
  return complex.scale(complex.multiply(complex.multiply(plant, compensator), delay), config.modulatorGain * config.feedbackGain);
}

export function closedLoopFromLoopGain(loopGain: Complex): Complex {
  return complex.divide(loopGain, complex.add({ re: 1, im: 0 }, loopGain));
}

export function closedLoopOutputImpedance(
  config: LoopModelConfig,
  frequency: number
): Complex {
  const openLoop = buckOpenLoopOutputImpedance(config.plant, frequency);
  const loopGain = evaluateLoopGain(config, frequency);
  return complex.divide(openLoop, complex.add({ re: 1, im: 0 }, loopGain));
}

export interface BodePoint {
  frequency: number;
  magnitude: number;
  magnitudeDb: number;
  phaseDegrees: number;
  response: Complex;
}

export function logarithmicFrequencies(startHz: number, stopHz: number, points: number): number[] {
  assertPositive(startHz, "startHz");
  assertPositive(stopHz, "stopHz");
  if (stopHz <= startHz) throw new RangeError("stopHz must exceed startHz");
  if (!Number.isInteger(points) || points < 2) throw new RangeError("points must be an integer of at least two");
  const start = Math.log10(startHz);
  const span = Math.log10(stopHz) - start;
  return Array.from({ length: points }, (_, index) => 10 ** (start + (span * index) / (points - 1)));
}

export function bodeSweep(
  response: (frequency: number) => Complex,
  startHz: number,
  stopHz: number,
  points = 401
): BodePoint[] {
  let previousPhase: number | undefined;
  return logarithmicFrequencies(startHz, stopHz, points).map((frequency) => {
    const value = response(frequency);
    assertFinite(value.re, "response.re");
    assertFinite(value.im, "response.im");
    const magnitude = complex.magnitude(value);
    let phaseDegrees = complex.phaseDegrees(value);
    if (previousPhase !== undefined) {
      while (phaseDegrees - previousPhase > 180) phaseDegrees -= 360;
      while (phaseDegrees - previousPhase < -180) phaseDegrees += 360;
    }
    previousPhase = phaseDegrees;
    return {
      frequency,
      magnitude,
      magnitudeDb: 20 * Math.log10(magnitude),
      phaseDegrees,
      response: value
    };
  });
}

function interpolateLogFrequency(a: BodePoint, b: BodePoint, target: number, field: "magnitudeDb" | "phaseDegrees"): number {
  const av = a[field];
  const bv = b[field];
  const fraction = bv === av ? 0 : (target - av) / (bv - av);
  return 10 ** (Math.log10(a.frequency) + fraction * (Math.log10(b.frequency) - Math.log10(a.frequency)));
}

function interpolateValueAtLogFrequency(a: BodePoint, b: BodePoint, frequency: number, field: "magnitudeDb" | "phaseDegrees"): number {
  const fraction = (Math.log10(frequency) - Math.log10(a.frequency)) / (Math.log10(b.frequency) - Math.log10(a.frequency));
  return a[field] + fraction * (b[field] - a[field]);
}

export type CrossingDirection = "upward" | "downward" | "flat";

export interface GainCrossover {
  /** Frequency where |T| = 1. */
  frequency: number;
  /** 180 degrees plus the unwrapped loop phase at this crossing. */
  phaseMargin: number;
  /** Direction of magnitude travel with increasing frequency. */
  direction: CrossingDirection;
}

export interface PhaseCrossover {
  /** Frequency where the unwrapped loop phase reaches a negative-real-axis
   * angle: ..., -900, -540, -180, 180, ... degrees. */
  frequency: number;
  /** The unwrapped negative-real-axis angle crossed. */
  phaseDegrees: number;
  /** Negative of loop magnitude in dB at this crossing. */
  gainMarginDb: number;
  /** Direction of phase travel with increasing frequency. */
  direction: CrossingDirection;
}

export interface LoopMargins {
  /** Controlling unity-gain crossing. A downward crossing with the lowest
   * phase margin is preferred; if none exists, the lowest-margin crossing is
   * returned. Preserved for compatibility with the original single-crossing
   * API. */
  crossoverFrequency: number | null;
  phaseMargin: number | null;
  /** Phase crossing with the lowest gain margin. Preserved for compatibility
   * with the original single-crossing API. */
  phaseCrossoverFrequency: number | null;
  gainMarginDb: number | null;
  /** Every distinct unity-gain crossing in ascending frequency order. */
  gainCrossovers: GainCrossover[];
  /** Every distinct negative-real-axis phase crossing in ascending frequency order. */
  phaseCrossovers: PhaseCrossover[];
}

interface TargetCrossing {
  frequency: number;
  direction: CrossingDirection;
  lowerIndex: number;
  upperIndex: number;
}

function directionFromValues(before: number | undefined, after: number | undefined): CrossingDirection {
  if (before !== undefined && after !== undefined) {
    if (before < 0 && after > 0) return "upward";
    if (before > 0 && after < 0) return "downward";
    return "flat";
  }
  if (before !== undefined) {
    if (before < 0) return "upward";
    if (before > 0) return "downward";
  }
  if (after !== undefined) {
    if (after > 0) return "upward";
    if (after < 0) return "downward";
  }
  return "flat";
}

/** Finds target crossings without counting an exact sample (or an exact-value
 * plateau) once from each adjacent segment. A plateau is represented by one
 * crossing at its logarithmic midpoint and marked flat when it only touches
 * the target. */
function findTargetCrossings(
  points: readonly BodePoint[],
  target: number,
  field: "magnitudeDb" | "phaseDegrees"
): TargetCrossing[] {
  const crossings: TargetCrossing[] = [];
  let index = 0;
  while (index < points.length) {
    const point = points[index];
    if (point === undefined) break;
    const value = point[field] - target;
    if (value === 0) {
      const runStart = index;
      let runEnd = index;
      while (runEnd + 1 < points.length && (points[runEnd + 1]?.[field] ?? NaN) - target === 0) {
        runEnd += 1;
      }
      const before = runStart > 0 ? (points[runStart - 1]?.[field] ?? target) - target : undefined;
      const after = runEnd + 1 < points.length ? (points[runEnd + 1]?.[field] ?? target) - target : undefined;
      const startFrequency = points[runStart]?.frequency ?? point.frequency;
      const endFrequency = points[runEnd]?.frequency ?? point.frequency;
      crossings.push({
        frequency: Math.sqrt(startFrequency * endFrequency),
        direction: directionFromValues(before, after),
        lowerIndex: runStart,
        upperIndex: runEnd
      });
      index = runEnd + 1;
      continue;
    }
    const next = points[index + 1];
    if (next !== undefined) {
      const nextValue = next[field] - target;
      if (nextValue !== 0 && value * nextValue < 0) {
        crossings.push({
          frequency: interpolateLogFrequency(point, next, target, field),
          direction: nextValue > value ? "upward" : "downward",
          lowerIndex: index,
          upperIndex: index + 1
        });
      }
    }
    index += 1;
  }
  return crossings;
}

function valueAtCrossing(
  points: readonly BodePoint[],
  crossing: TargetCrossing,
  field: "magnitudeDb" | "phaseDegrees"
): number {
  const lower = points[crossing.lowerIndex];
  const upper = points[crossing.upperIndex];
  if (lower === undefined || upper === undefined) throw new RangeError("crossing references missing Bode points");
  if (crossing.lowerIndex === crossing.upperIndex || lower.frequency === upper.frequency) return lower[field];
  return interpolateValueAtLogFrequency(lower, upper, crossing.frequency, field);
}

export function findLoopMargins(points: readonly BodePoint[]): LoopMargins {
  if (points.length < 2) throw new RangeError("at least two Bode points are required");
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    assertPositive(point.frequency, `points[${index}].frequency`);
    assertFinite(point.magnitudeDb, `points[${index}].magnitudeDb`);
    assertFinite(point.phaseDegrees, `points[${index}].phaseDegrees`);
    if (index > 0 && point.frequency <= (points[index - 1]?.frequency ?? 0)) {
      throw new RangeError("Bode point frequencies must be strictly increasing");
    }
  }

  const gainCrossovers: GainCrossover[] = findTargetCrossings(points, 0, "magnitudeDb").map(
    (crossing) => ({
      frequency: crossing.frequency,
      phaseMargin: 180 + valueAtCrossing(points, crossing, "phaseDegrees"),
      direction: crossing.direction
    })
  );
  const minimumPhase = Math.min(...points.map((point) => point.phaseDegrees));
  const maximumPhase = Math.max(...points.map((point) => point.phaseDegrees));
  const firstWinding = Math.ceil((minimumPhase - 180) / 360);
  const lastWinding = Math.floor((maximumPhase - 180) / 360);
  const phaseCrossovers: PhaseCrossover[] = [];
  for (let winding = firstWinding; winding <= lastWinding; winding += 1) {
    const targetPhase = 180 + 360 * winding;
    for (const crossing of findTargetCrossings(points, targetPhase, "phaseDegrees")) {
      phaseCrossovers.push({
        frequency: crossing.frequency,
        phaseDegrees: targetPhase,
        gainMarginDb: -valueAtCrossing(points, crossing, "magnitudeDb"),
        direction: crossing.direction
      });
    }
  }
  phaseCrossovers.sort((a, b) => a.frequency - b.frequency || a.phaseDegrees - b.phaseDegrees);

  const downwardGainCrossovers = gainCrossovers.filter((crossing) => crossing.direction === "downward");
  const controllingGain = [...(downwardGainCrossovers.length > 0 ? downwardGainCrossovers : gainCrossovers)].sort(
    (a, b) => a.phaseMargin - b.phaseMargin || a.frequency - b.frequency
  )[0];
  const controllingPhase = [...phaseCrossovers].sort(
    (a, b) => a.gainMarginDb - b.gainMarginDb || a.frequency - b.frequency
  )[0];

  return {
    crossoverFrequency: controllingGain?.frequency ?? null,
    phaseMargin: controllingGain?.phaseMargin ?? null,
    phaseCrossoverFrequency: controllingPhase?.frequency ?? null,
    gainMarginDb: controllingPhase?.gainMarginDb ?? null,
    gainCrossovers,
    phaseCrossovers
  };
}
