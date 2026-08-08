import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export interface CurrentBalanceConfig {
  proportionalGain: number;
  integralGain: number;
  maxTrim: number;
  /** Metadata used to warn about interaction; it does not synthesize gains. */
  sharingLoopBandwidth?: number;
  voltageLoopBandwidth?: number;
}

export interface CurrentBalanceState {
  integrators: number[];
  trims: number[];
}

export interface CurrentBalanceResult {
  state: CurrentBalanceState;
  targetCurrent: number;
  errors: number[];
  trims: number[];
  rmsSharingError: number;
  warnings: string[];
}

export function validateCurrentBalanceConfig(config: CurrentBalanceConfig): void {
  assertNonNegative(config.proportionalGain, "proportionalGain");
  assertNonNegative(config.integralGain, "integralGain");
  assertPositive(config.maxTrim, "maxTrim");
  if (config.sharingLoopBandwidth !== undefined) {
    assertPositive(config.sharingLoopBandwidth, "sharingLoopBandwidth");
  }
  if (config.voltageLoopBandwidth !== undefined) {
    assertPositive(config.voltageLoopBandwidth, "voltageLoopBandwidth");
  }
}

export function createCurrentBalanceState(phaseCount: number): CurrentBalanceState {
  if (!Number.isInteger(phaseCount) || phaseCount < 2) {
    throw new RangeError("current balancing requires at least two phases");
  }
  return {
    integrators: Array.from({ length: phaseCount }, () => 0),
    trims: Array.from({ length: phaseCount }, () => 0)
  };
}

function zeroMean(values: readonly number[]): number[] {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value - mean);
}

function limitVector(values: readonly number[], limit: number): number[] {
  const peak = Math.max(...values.map(Math.abs));
  if (peak <= limit) return [...values];
  const scale = limit / peak;
  return values.map((value) => Math.max(-limit, Math.min(limit, value * scale)));
}

/** Slow differential PI trim. Removing common mode prevents this loop from
 * directly commanding total current; the primary voltage loop retains that job. */
export function updateCurrentBalance(
  config: CurrentBalanceConfig,
  state: CurrentBalanceState,
  measuredCurrents: readonly number[],
  dt: number
): CurrentBalanceResult {
  validateCurrentBalanceConfig(config);
  assertPositive(dt, "dt");
  if (measuredCurrents.length < 2) throw new RangeError("at least two phase currents are required");
  if (state.integrators.length !== measuredCurrents.length || state.trims.length !== measuredCurrents.length) {
    throw new RangeError("current-balance state length does not match measured currents");
  }
  measuredCurrents.forEach((current, index) => assertFinite(current, `measuredCurrents[${index}]`));
  state.integrators.forEach((value, index) => assertFinite(value, `integrators[${index}]`));
  const targetCurrent = measuredCurrents.reduce((sum, current) => sum + current, 0) / measuredCurrents.length;
  const errors = measuredCurrents.map((current) => targetCurrent - current);
  const rawIntegrators = state.integrators.map(
    (integral, index) => integral + (errors[index] ?? 0) * config.integralGain * dt
  );
  const differentialIntegrators = limitVector(zeroMean(rawIntegrators), config.maxTrim);
  const rawTrims = errors.map(
    (error, index) => config.proportionalGain * error + (differentialIntegrators[index] ?? 0)
  );
  const trims = limitVector(zeroMean(rawTrims), config.maxTrim);
  const warnings: string[] = [];
  if (
    config.sharingLoopBandwidth !== undefined &&
    config.voltageLoopBandwidth !== undefined &&
    config.sharingLoopBandwidth >= config.voltageLoopBandwidth / 3
  ) {
    warnings.push(
      "Current-sharing bandwidth is high relative to the voltage loop; the educational decoupling assumption may fail."
    );
  }
  return {
    state: { integrators: differentialIntegrators, trims },
    targetCurrent,
    errors,
    trims,
    rmsSharingError: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
    warnings
  };
}
