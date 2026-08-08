import { assertFinite, assertNonNegative, assertPositive } from "../units.js";

export interface PeakCurrentCycleConfig {
  vin: number;
  vout: number;
  inductance: number;
  switchingFrequency: number;
  currentCommand: number;
  artificialRampSlope?: number;
  currentSenseGain?: number;
  leadingEdgeBlanking?: number;
  propagationDelay?: number;
  minimumOnTime?: number;
  maximumOnTime?: number;
  currentLimit?: number;
  allowReverseCurrent?: boolean;
}

export interface PeakCurrentCycle {
  cycle: number;
  valleyCurrent: number;
  comparatorTripTime: number;
  onTime: number;
  dutyRatio: number;
  peakCurrent: number;
  nextValleyCurrent: number;
  sensedPeak: number;
  compensationRampAtTrip: number;
  limited: boolean;
}

export interface PeakCurrentStability {
  eigenvalue: number;
  magnitude: number;
  stable: boolean;
  minimumArtificialRampSlope: number;
  assumptions: string[];
}

export function validatePeakCurrentConfig(config: PeakCurrentCycleConfig): void {
  assertPositive(config.vin, "vin");
  assertNonNegative(config.vout, "vout");
  if (config.vout >= config.vin) throw new RangeError("simplified buck cycle map requires vout < vin");
  assertPositive(config.inductance, "inductance");
  assertPositive(config.switchingFrequency, "switchingFrequency");
  assertNonNegative(config.currentCommand, "currentCommand");
  assertNonNegative(config.artificialRampSlope ?? 0, "artificialRampSlope");
  assertPositive(config.currentSenseGain ?? 1, "currentSenseGain");
  assertNonNegative(config.leadingEdgeBlanking ?? 0, "leadingEdgeBlanking");
  assertNonNegative(config.propagationDelay ?? 0, "propagationDelay");
  const period = 1 / config.switchingFrequency;
  const minimumOnTime = config.minimumOnTime ?? 0;
  const maximumOnTime = config.maximumOnTime ?? period;
  assertNonNegative(minimumOnTime, "minimumOnTime");
  assertPositive(maximumOnTime, "maximumOnTime");
  if (minimumOnTime > maximumOnTime) {
    throw new RangeError("minimumOnTime cannot exceed maximumOnTime");
  }
  if (maximumOnTime > period) {
    throw new RangeError("maximumOnTime cannot exceed the clock period in this cycle map");
  }
  if (config.currentLimit !== undefined) assertPositive(config.currentLimit, "currentLimit");
}

/** Perturbation pole for the textbook fixed-frequency, fixed-command, trailing-
 * edge peak-current cycle map. Slopes are expressed at the comparator input. */
export function peakCurrentStability(config: PeakCurrentCycleConfig): PeakCurrentStability {
  validatePeakCurrentConfig(config);
  const gain = config.currentSenseGain ?? 1;
  const m1 = ((config.vin - config.vout) / config.inductance) * gain;
  const m2 = (config.vout / config.inductance) * gain;
  const ma = config.artificialRampSlope ?? 0;
  const eigenvalue = (ma - m2) / (m1 + ma);
  const minimumArtificialRampSlope = Math.max(0, (m2 - m1) / 2);
  return {
    eigenvalue,
    magnitude: Math.abs(eigenvalue),
    stable: Math.abs(eigenvalue) < 1,
    minimumArtificialRampSlope,
    assumptions: [
      "fixed switching period",
      "continuous conduction",
      "fixed outer-loop current command during the perturbation",
      "linear inductor slopes and ideal sampling",
      "no blanking, delay, saturation, or current-limit effect in the eigenvalue"
    ]
  };
}

export function stepPeakCurrentCycle(
  config: PeakCurrentCycleConfig,
  valleyCurrent: number,
  cycle = 0
): PeakCurrentCycle {
  validatePeakCurrentConfig(config);
  assertFinite(valleyCurrent, "valleyCurrent");
  if (!Number.isInteger(cycle) || cycle < 0) throw new RangeError("cycle must be a non-negative integer");
  const period = 1 / config.switchingFrequency;
  const gain = config.currentSenseGain ?? 1;
  const m1Current = (config.vin - config.vout) / config.inductance;
  const m2Current = config.vout / config.inductance;
  const sensedUpSlope = m1Current * gain;
  const artificialSlope = config.artificialRampSlope ?? 0;
  const limitedCommand = Math.min(config.currentCommand, config.currentLimit ?? Infinity);
  const limited = limitedCommand < config.currentCommand;
  const idealTrip = (limitedCommand - valleyCurrent * gain) / (sensedUpSlope + artificialSlope);
  const blanking = config.leadingEdgeBlanking ?? 0;
  const comparatorTripTime = Math.max(0, blanking, idealTrip);
  const onTime = Math.max(
    config.minimumOnTime ?? 0,
    Math.min(
      config.maximumOnTime ?? period,
      period,
      comparatorTripTime + (config.propagationDelay ?? 0)
    )
  );
  const peakCurrent = valleyCurrent + m1Current * onTime;
  const rawNextValley = peakCurrent - m2Current * (period - onTime);
  const nextValleyCurrent = config.allowReverseCurrent === true ? rawNextValley : Math.max(0, rawNextValley);
  return {
    cycle,
    valleyCurrent,
    comparatorTripTime,
    onTime,
    dutyRatio: onTime / period,
    peakCurrent,
    nextValleyCurrent,
    sensedPeak: peakCurrent * gain,
    compensationRampAtTrip: artificialSlope * comparatorTripTime,
    limited
  };
}

export function simulatePeakCurrentCycles(
  config: PeakCurrentCycleConfig,
  initialValleyCurrent: number,
  cycles: number
): PeakCurrentCycle[] {
  if (!Number.isInteger(cycles) || cycles < 1) throw new RangeError("cycles must be a positive integer");
  const results: PeakCurrentCycle[] = [];
  let valley = initialValleyCurrent;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const result = stepPeakCurrentCycle(config, valley, cycle);
    results.push(result);
    valley = result.nextValleyCurrent;
  }
  return results;
}
