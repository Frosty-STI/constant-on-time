import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export interface IdealBuckInputs {
  vin: number;
  vout: number;
  switchingFrequency: number;
  inductance: number;
  loadCurrent: number;
  phases?: number;
}

export interface IdealBuckOperatingPoint {
  dutyRatio: number;
  onTime: number;
  period: number;
  onSlope: number;
  offSlope: number;
  ripplePeakToPeak: number;
  averagePhaseCurrent: number;
  peakPhaseCurrent: number;
  valleyPhaseCurrent: number;
  ccmBoundaryPerPhase: number;
  ccmBoundaryTotal: number;
  conductionMode: "CCM" | "boundary" | "DCM";
}

export function idealDutyRatio(vin: number, vout: number): number {
  assertPositive(vin, "vin");
  assertNonNegative(vout, "vout");
  if (vout > vin) throw new RangeError("An ideal buck operating point requires vout <= vin");
  return vout / vin;
}

export function inductorOnSlope(vin: number, vout: number, inductance: number): number {
  assertPositive(vin, "vin");
  assertNonNegative(vout, "vout");
  assertPositive(inductance, "inductance");
  return (vin - vout) / inductance;
}

/** Negative di/dt during a ground-referenced freewheel interval. */
export function inductorOffSlope(vout: number, inductance: number): number {
  assertNonNegative(vout, "vout");
  assertPositive(inductance, "inductance");
  return -vout / inductance;
}

export function idealInductorRipplePeakToPeak(
  vin: number,
  vout: number,
  switchingFrequency: number,
  inductance: number
): number {
  const duty = idealDutyRatio(vin, vout);
  assertPositive(switchingFrequency, "switchingFrequency");
  assertPositive(inductance, "inductance");
  return inductorOnSlope(vin, vout, inductance) * duty / switchingFrequency;
}

export function ccmBoundaryCurrent(ripplePeakToPeak: number): number {
  assertNonNegative(ripplePeakToPeak, "ripplePeakToPeak");
  return ripplePeakToPeak / 2;
}

export function idealBuckOperatingPoint(inputs: IdealBuckInputs): IdealBuckOperatingPoint {
  const phases = inputs.phases ?? 1;
  if (!Number.isInteger(phases) || phases < 1) throw new RangeError("phases must be a positive integer");
  assertNonNegative(inputs.loadCurrent, "loadCurrent");
  const dutyRatio = idealDutyRatio(inputs.vin, inputs.vout);
  const period = 1 / inputs.switchingFrequency;
  const ripplePeakToPeak = idealInductorRipplePeakToPeak(
    inputs.vin,
    inputs.vout,
    inputs.switchingFrequency,
    inputs.inductance
  );
  const averagePhaseCurrent = inputs.loadCurrent / phases;
  const boundary = ccmBoundaryCurrent(ripplePeakToPeak);
  const tolerance = Math.max(1e-12, boundary * 1e-9);
  const conductionMode =
    Math.abs(averagePhaseCurrent - boundary) <= tolerance
      ? "boundary"
      : averagePhaseCurrent > boundary
        ? "CCM"
        : "DCM";
  return {
    dutyRatio,
    onTime: dutyRatio * period,
    period,
    onSlope: inductorOnSlope(inputs.vin, inputs.vout, inputs.inductance),
    offSlope: inductorOffSlope(inputs.vout, inputs.inductance),
    ripplePeakToPeak,
    averagePhaseCurrent,
    peakPhaseCurrent: averagePhaseCurrent + ripplePeakToPeak / 2,
    valleyPhaseCurrent: averagePhaseCurrent - ripplePeakToPeak / 2,
    ccmBoundaryPerPhase: boundary,
    ccmBoundaryTotal: phases * boundary,
    conductionMode
  };
}

/** First-order CCM estimate. The capacitive term assumes triangular capacitor
 * current; the ESR term assumes ESR dominates instantaneously. ESL is omitted. */
export function outputRippleEstimate(
  inductorRipplePeakToPeak: number,
  switchingFrequency: number,
  capacitance: number,
  esr = 0
): { capacitive: number; esr: number; totalUpperBound: number } {
  assertNonNegative(inductorRipplePeakToPeak, "inductorRipplePeakToPeak");
  assertPositive(switchingFrequency, "switchingFrequency");
  assertPositive(capacitance, "capacitance");
  assertNonNegative(esr, "esr");
  const capacitive = inductorRipplePeakToPeak / (8 * switchingFrequency * capacitance);
  const esrRipple = inductorRipplePeakToPeak * esr;
  return { capacitive, esr: esrRipple, totalUpperBound: capacitive + esrRipple };
}

export function voltSecondBalanceResidual(
  onVoltage: number,
  onTime: number,
  offVoltage: number,
  offTime: number
): number {
  [onVoltage, onTime, offVoltage, offTime].forEach((value, index) =>
    assertFinite(value, `argument ${index}`)
  );
  if (onTime < 0 || offTime < 0) throw new RangeError("times must not be negative");
  return onVoltage * onTime + offVoltage * offTime;
}

export function chargeBalanceResidual(capacitorCurrents: readonly number[], dt: number): number {
  assertPositive(dt, "dt");
  if (capacitorCurrents.length === 0) throw new RangeError("at least one current sample is required");
  return capacitorCurrents.reduce((sum, current) => {
    assertFinite(current, "capacitor current");
    return sum + current * dt;
  }, 0);
}

export function effectiveRippleFrequency(switchingFrequency: number, phases: number): number {
  assertPositive(switchingFrequency, "switchingFrequency");
  if (!Number.isInteger(phases) || phases < 1) throw new RangeError("phases must be a positive integer");
  return switchingFrequency * phases;
}

function triangleAt(normalizedTime: number, duty: number): number {
  const t = ((normalizedTime % 1) + 1) % 1;
  if (duty <= 0 || duty >= 1) return 0;
  return t < duty ? -0.5 + t / duty : 0.5 - (t - duty) / (1 - duty);
}

/** Exact peak-to-peak factor for the sum of ideal, identical, uniformly
 * interleaved triangular phase currents. Piecewise-linear extrema occur at
 * switching breakpoints, so no arbitrary sampling resolution is involved. */
export function idealInterleavedRippleFactor(dutyRatio: number, phases: number): number {
  assertFinite(dutyRatio, "dutyRatio");
  if (dutyRatio < 0 || dutyRatio > 1) throw new RangeError("dutyRatio must be in [0, 1]");
  if (!Number.isInteger(phases) || phases < 1) throw new RangeError("phases must be a positive integer");
  if (dutyRatio === 0 || dutyRatio === 1) return 0;

  const breakpoints: number[] = [];
  for (let phase = 0; phase < phases; phase += 1) {
    const offset = phase / phases;
    breakpoints.push(offset, (offset + dutyRatio) % 1);
  }
  const sums = breakpoints.map((time) => {
    let sum = 0;
    for (let phase = 0; phase < phases; phase += 1) {
      sum += triangleAt(time - phase / phases, dutyRatio);
    }
    return sum;
  });
  return Math.max(...sums) - Math.min(...sums);
}

export function idealInterleavedSumRipple(
  perPhaseRipplePeakToPeak: number,
  dutyRatio: number,
  phases: number
): number {
  assertNonNegative(perPhaseRipplePeakToPeak, "perPhaseRipplePeakToPeak");
  return perPhaseRipplePeakToPeak * idealInterleavedRippleFactor(dutyRatio, phases);
}
