import { rk4Step } from "./integrator.js";
import {
  activeLoadAt,
  loadStepTimes,
  validateLoadProfile,
  type DynamicLoadProfile,
  type LoadModel
} from "./load.js";
import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export interface BuckPhaseParameters {
  inductance: number;
  dcr?: number;
  highSideResistance?: number;
  lowSideResistance?: number;
  diodeDrop?: number;
  currentSenseGain?: number;
  currentSenseOffset?: number;
  timingOffset?: number;
}

export interface BuckPlantConfig {
  vin: number;
  capacitance: number;
  capacitorEsr?: number;
  /** ESL is an output-only first-difference approximation. It does not feed
   * back into the state equations; see README for its applicability. */
  capacitorEsl?: number;
  phases: readonly BuckPhaseParameters[];
  load: DynamicLoadProfile;
}

export type RequestedGateState = "high-side" | "low-side" | "dead-time";
export type ConductionMode =
  | "high-side"
  | "low-side"
  | "low-body-diode"
  | "high-body-diode"
  | "open";

export interface PhaseDrive {
  gate: RequestedGateState;
  /** Models a catch diode rather than an actively driven low-side MOSFET. */
  asynchronous?: boolean;
  /** Prevents commanded low-side conduction once current reaches zero. */
  diodeEmulation?: boolean;
}

export interface BuckPlantState {
  time: number;
  /** Voltage on the ideal capacitance, excluding ESR and the displayed ESL term. */
  vCap: number;
  phaseCurrents: number[];
  previousCapCurrent: number;
}

export interface BuckPlantSample {
  time: number;
  vCap: number;
  /** Terminal voltage including ESR and the optional output-only ESL estimate. */
  vOut: number;
  vOutWithoutEsl: number;
  phaseCurrents: number[];
  sumInductorCurrent: number;
  loadCurrent: number;
  capacitorCurrent: number;
  conductionModes: ConductionMode[];
  switchNodeVoltages: number[];
  sensedCurrents: number[];
}

export interface PlantStepResult {
  state: BuckPlantState;
  sample: BuckPlantSample;
}

const CURRENT_EPSILON = 1e-12;

function phaseValue(phase: BuckPhaseParameters, key: keyof BuckPhaseParameters, fallback = 0): number {
  const value = phase[key];
  return typeof value === "number" ? value : fallback;
}

export function validateBuckPlantConfig(config: BuckPlantConfig): void {
  assertPositive(config.vin, "vin");
  assertPositive(config.capacitance, "capacitance");
  assertNonNegative(config.capacitorEsr ?? 0, "capacitorEsr");
  assertNonNegative(config.capacitorEsl ?? 0, "capacitorEsl");
  if (config.phases.length < 1) throw new RangeError("at least one phase is required");
  config.phases.forEach((phase, index) => {
    assertPositive(phase.inductance, `phases[${index}].inductance`);
    assertNonNegative(phase.dcr ?? 0, `phases[${index}].dcr`);
    assertNonNegative(phase.highSideResistance ?? 0, `phases[${index}].highSideResistance`);
    assertNonNegative(phase.lowSideResistance ?? 0, `phases[${index}].lowSideResistance`);
    assertNonNegative(phase.diodeDrop ?? 0.7, `phases[${index}].diodeDrop`);
    assertFinite(phase.currentSenseGain ?? 1, `phases[${index}].currentSenseGain`);
    if ((phase.currentSenseGain ?? 1) <= 0) {
      throw new RangeError(`phases[${index}].currentSenseGain must be greater than zero`);
    }
    assertFinite(phase.currentSenseOffset ?? 0, `phases[${index}].currentSenseOffset`);
    assertFinite(phase.timingOffset ?? 0, `phases[${index}].timingOffset`);
  });
  validateLoadProfile(config.load);
}

export function validateBuckPlantState(config: BuckPlantConfig, state: BuckPlantState): void {
  assertNonNegative(state.time, "state.time");
  assertFinite(state.vCap, "state.vCap");
  assertFinite(state.previousCapCurrent, "state.previousCapCurrent");
  if (state.phaseCurrents.length !== config.phases.length) {
    throw new RangeError("state.phaseCurrents length must equal configured phase count");
  }
  state.phaseCurrents.forEach((current, index) => assertFinite(current, `phaseCurrents[${index}]`));
}

export function createBuckPlantState(
  config: BuckPlantConfig,
  options: { time?: number; vCap?: number; phaseCurrents?: readonly number[] } = {}
): BuckPlantState {
  validateBuckPlantConfig(config);
  const phaseCurrents = options.phaseCurrents
    ? [...options.phaseCurrents]
    : Array.from({ length: config.phases.length }, () => 0);
  const state = {
    time: options.time ?? 0,
    vCap: options.vCap ?? 0,
    phaseCurrents,
    previousCapCurrent: 0
  };
  validateBuckPlantState(config, state);
  const algebraic = solveOutput(config, state.time, state.vCap, state.phaseCurrents);
  state.previousCapCurrent = algebraic.capacitorCurrent;
  return state;
}

interface AlgebraicOutput {
  outputVoltage: number;
  loadCurrent: number;
  capacitorCurrent: number;
  sumInductorCurrent: number;
}

function loadConductanceAndSink(load: LoadModel): { conductance: number; sink: number } {
  if (load.kind === "resistive") return { conductance: 1 / load.resistance, sink: 0 };
  if (load.kind === "constant-current") return { conductance: 0, sink: load.current };
  return { conductance: 1 / load.resistance, sink: load.current };
}

/** Solves the ESR/load algebraic relation exactly for supported linear loads:
 * vout = vCap + ESR*(sum(iL) - G*vout - Iconst). */
export function solveOutput(
  config: BuckPlantConfig,
  time: number,
  vCap: number,
  phaseCurrents: readonly number[]
): AlgebraicOutput {
  const load = activeLoadAt(config.load, time);
  const { conductance, sink } = loadConductanceAndSink(load);
  const sumInductorCurrent = phaseCurrents.reduce((sum, current) => sum + current, 0);
  const esr = config.capacitorEsr ?? 0;
  const outputVoltage = (vCap + esr * (sumInductorCurrent - sink)) / (1 + esr * conductance);
  const loadCurrentValue = conductance * outputVoltage + sink;
  return {
    outputVoltage,
    loadCurrent: loadCurrentValue,
    capacitorCurrent: sumInductorCurrent - loadCurrentValue,
    sumInductorCurrent
  };
}

export function resolveConductionMode(
  drive: PhaseDrive,
  inductorCurrent: number
): ConductionMode {
  assertFinite(inductorCurrent, "inductorCurrent");
  if (drive.gate === "high-side") return "high-side";
  if (drive.gate === "low-side") {
    if (drive.asynchronous === true) {
      if (inductorCurrent > CURRENT_EPSILON) return "low-body-diode";
      if (inductorCurrent < -CURRENT_EPSILON) return "high-body-diode";
      return "open";
    }
    if (drive.diodeEmulation === true && inductorCurrent < -CURRENT_EPSILON) return "high-body-diode";
    if (drive.diodeEmulation === true && inductorCurrent <= CURRENT_EPSILON) return "open";
    return "low-side";
  }
  if (Math.abs(inductorCurrent) <= CURRENT_EPSILON) return "open";
  if (inductorCurrent > 0) return "low-body-diode";
  return "high-body-diode";
}

export function switchNodeVoltage(
  config: BuckPlantConfig,
  phase: BuckPhaseParameters,
  mode: ConductionMode,
  inductorCurrent: number,
  outputVoltage: number
): number {
  switch (mode) {
    case "high-side":
      return config.vin - inductorCurrent * phaseValue(phase, "highSideResistance");
    case "low-side":
      return -inductorCurrent * phaseValue(phase, "lowSideResistance");
    case "low-body-diode":
      return -phaseValue(phase, "diodeDrop", 0.7);
    case "high-body-diode":
      return config.vin + phaseValue(phase, "diodeDrop", 0.7);
    case "open":
      // With zero current, both inductor terminals float to the same voltage.
      return outputVoltage;
  }
}

function derivatives(
  config: BuckPlantConfig,
  drives: readonly PhaseDrive[],
  time: number,
  vector: readonly number[]
): number[] {
  const phaseCurrents = vector.slice(0, config.phases.length);
  const vCap = vector[config.phases.length];
  if (vCap === undefined) throw new RangeError("state vector is missing vCap");
  const algebraic = solveOutput(config, time, vCap, phaseCurrents);
  const currentDerivatives = config.phases.map((phase, index) => {
    const current = phaseCurrents[index];
    const drive = drives[index];
    if (current === undefined || drive === undefined) throw new RangeError("drive/state phase mismatch");
    const mode = resolveConductionMode(drive, current);
    if (mode === "open") return 0;
    const switchNode = switchNodeVoltage(config, phase, mode, current, algebraic.outputVoltage);
    return (switchNode - algebraic.outputVoltage - current * phaseValue(phase, "dcr")) / phase.inductance;
  });
  return [...currentDerivatives, algebraic.capacitorCurrent / config.capacitance];
}

function preventsReverseCurrent(drive: PhaseDrive): boolean {
  // An enabled high-side channel can conduct in either direction. During
  // dead time either body diode carries the stored current only until its
  // zero crossing, after which both devices are off. An enabled synchronous
  // low-side channel can conduct both signs, while asynchronous/diode-
  // emulation freewheel intervals clamp at zero.
  if (drive.gate === "high-side") return false;
  if (drive.gate === "dead-time") return true;
  return drive.asynchronous === true || drive.diodeEmulation === true;
}

function makeSample(
  config: BuckPlantConfig,
  state: BuckPlantState,
  drives: readonly PhaseDrive[],
  dtForEsl?: number
): BuckPlantSample {
  const algebraic = solveOutput(config, state.time, state.vCap, state.phaseCurrents);
  const eslDerivative =
    dtForEsl !== undefined && dtForEsl > 0
      ? (algebraic.capacitorCurrent - state.previousCapCurrent) / dtForEsl
      : 0;
  const vOut = algebraic.outputVoltage + (config.capacitorEsl ?? 0) * eslDerivative;
  const conductionModes = config.phases.map((_, index) => {
    const drive = drives[index];
    const current = state.phaseCurrents[index];
    if (drive === undefined || current === undefined) throw new RangeError("drive/state phase mismatch");
    return resolveConductionMode(drive, current);
  });
  const switchNodeVoltages = config.phases.map((phase, index) =>
    switchNodeVoltage(
      config,
      phase,
      conductionModes[index] ?? "open",
      state.phaseCurrents[index] ?? 0,
      algebraic.outputVoltage
    )
  );
  return {
    time: state.time,
    vCap: state.vCap,
    vOut,
    vOutWithoutEsl: algebraic.outputVoltage,
    phaseCurrents: [...state.phaseCurrents],
    sumInductorCurrent: algebraic.sumInductorCurrent,
    loadCurrent: algebraic.loadCurrent,
    capacitorCurrent: algebraic.capacitorCurrent,
    conductionModes,
    switchNodeVoltages,
    sensedCurrents: config.phases.map(
      (phase, index) =>
        (state.phaseCurrents[index] ?? 0) * phaseValue(phase, "currentSenseGain", 1) +
        phaseValue(phase, "currentSenseOffset")
    )
  };
}

export function sampleBuckPlant(
  config: BuckPlantConfig,
  state: BuckPlantState,
  drives: readonly PhaseDrive[]
): BuckPlantSample {
  validateBuckPlantConfig(config);
  validateBuckPlantState(config, state);
  if (drives.length !== config.phases.length) throw new RangeError("one drive is required per phase");
  return makeSample(config, state, drives);
}

export function stepBuckPlant(
  config: BuckPlantConfig,
  state: BuckPlantState,
  drives: readonly PhaseDrive[],
  dt: number
): PlantStepResult {
  validateBuckPlantConfig(config);
  validateBuckPlantState(config, state);
  assertPositive(dt, "dt");
  if (drives.length !== config.phases.length) throw new RangeError("one drive is required per phase");
  const vector = [...state.phaseCurrents, state.vCap];
  const initialDerivatives = derivatives(config, drives, state.time, vector);
  const intervalEnd = state.time + dt;
  const integrated = rk4Step(
    (time, values) => {
      // At a declared load discontinuity the last RK4 sample belongs to the
      // left-hand interval. The returned sample below is evaluated on the
      // right-hand side of the event.
      const leftLimitTime = time >= intervalEnd ? state.time + dt * (1 - 1e-12) : time;
      return derivatives(config, drives, leftLimitTime, values);
    },
    state.time,
    vector,
    dt
  );
  const phaseCurrents = integrated.slice(0, config.phases.length);
  for (let index = 0; index < phaseCurrents.length; index += 1) {
    const drive = drives[index];
    const prior = state.phaseCurrents[index];
    const next = phaseCurrents[index];
    if (drive === undefined || prior === undefined || next === undefined) {
      throw new RangeError("drive/state phase mismatch");
    }
    const initialSlope = initialDerivatives[index] ?? 0;
    const reachesZeroFromPositive = prior > CURRENT_EPSILON && initialSlope < 0 && prior / -initialSlope <= dt + 1e-15;
    if (preventsReverseCurrent(drive) && prior >= -CURRENT_EPSILON && (next < 0 || reachesZeroFromPositive)) phaseCurrents[index] = 0;
    const reachesZeroFromNegative = prior < -CURRENT_EPSILON && initialSlope > 0 && -prior / initialSlope <= dt + 1e-15;
    if (preventsReverseCurrent(drive) && prior < -CURRENT_EPSILON && (next > 0 || reachesZeroFromNegative)) phaseCurrents[index] = 0;
  }
  const vCap = integrated[config.phases.length];
  if (vCap === undefined) throw new RangeError("integrator result is missing vCap");
  const provisional: BuckPlantState = {
    time: state.time + dt,
    vCap,
    phaseCurrents,
    previousCapCurrent: state.previousCapCurrent
  };
  const sample = makeSample(config, provisional, drives, dt);
  const nextState: BuckPlantState = {
    ...provisional,
    previousCapCurrent: sample.capacitorCurrent
  };
  return { state: nextState, sample };
}

export interface PwmDriveConfig {
  switchingFrequency: number;
  dutyRatio: number;
  deadTime?: number;
  phaseOffsets?: readonly number[];
  /** Additive per-phase timing error in seconds. */
  timingOffsets?: readonly number[];
  asynchronous?: boolean;
  diodeEmulation?: boolean;
}

export function validatePwmDrive(config: PwmDriveConfig, phaseCount: number): void {
  assertPositive(config.switchingFrequency, "switchingFrequency");
  assertFinite(config.dutyRatio, "dutyRatio");
  if (config.dutyRatio < 0 || config.dutyRatio > 1) throw new RangeError("dutyRatio must be in [0, 1]");
  assertNonNegative(config.deadTime ?? 0, "deadTime");
  const period = 1 / config.switchingFrequency;
  if ((config.deadTime ?? 0) * 2 >= period) throw new RangeError("two dead-time intervals must fit within a period");
  if ((config.deadTime ?? 0) > 0 && (config.deadTime ?? 0) * 2 >= (1 - config.dutyRatio) * period) {
    throw new RangeError("two dead-time intervals leave no low-side conduction interval");
  }
  if (config.phaseOffsets !== undefined && config.phaseOffsets.length !== phaseCount) {
    throw new RangeError("phaseOffsets length must equal phase count");
  }
  config.phaseOffsets?.forEach((offset, index) => {
    assertFinite(offset, `phaseOffsets[${index}]`);
    if (offset < 0 || offset >= 1) throw new RangeError("phaseOffsets must be normalized to [0, 1)");
  });
  if (config.timingOffsets !== undefined && config.timingOffsets.length !== phaseCount) {
    throw new RangeError("timingOffsets length must equal phase count");
  }
  config.timingOffsets?.forEach((offset, index) => assertFinite(offset, `timingOffsets[${index}]`));
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function pwmDrivesAt(
  time: number,
  phaseCount: number,
  config: PwmDriveConfig
): PhaseDrive[] {
  validatePwmDrive(config, phaseCount);
  assertFinite(time, "time");
  const period = 1 / config.switchingFrequency;
  const onTime = config.dutyRatio * period;
  const deadTime = config.deadTime ?? 0;
  return Array.from({ length: phaseCount }, (_, phaseIndex) => {
    const normalizedOffset = config.phaseOffsets?.[phaseIndex] ?? phaseIndex / phaseCount;
    const timingOffset = config.timingOffsets?.[phaseIndex] ?? 0;
    const local = modulo(time - normalizedOffset * period - timingOffset, period);
    let gate: RequestedGateState;
    if (local < onTime) gate = "high-side";
    else if (local < onTime + deadTime || local >= period - deadTime) gate = "dead-time";
    else gate = "low-side";
    return {
      gate,
      ...(config.asynchronous === true ? { asynchronous: true } : {}),
      ...(config.diodeEmulation === true ? { diodeEmulation: true } : {})
    };
  });
}

export function pwmEventTimes(
  startTime: number,
  stopTime: number,
  phaseCount: number,
  config: PwmDriveConfig
): number[] {
  validatePwmDrive(config, phaseCount);
  if (stopTime < startTime) throw new RangeError("stopTime must not precede startTime");
  const period = 1 / config.switchingFrequency;
  const onTime = config.dutyRatio * period;
  const deadTime = config.deadTime ?? 0;
  const events: number[] = [];
  for (let phase = 0; phase < phaseCount; phase += 1) {
    const normalizedOffset = config.phaseOffsets?.[phase] ?? phase / phaseCount;
    const offset = normalizedOffset * period + (config.timingOffsets?.[phase] ?? 0);
    const firstCycle = Math.floor((startTime - offset) / period) - 1;
    const lastCycle = Math.ceil((stopTime - offset) / period) + 1;
    for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
      const origin = offset + cycle * period;
      for (const event of [origin, origin + onTime, origin + onTime + deadTime, origin + period - deadTime]) {
        if (event > startTime + 1e-15 && event <= stopTime + 1e-15) events.push(event);
      }
    }
  }
  return [...new Set(events.map((event) => Number(event.toPrecision(15))))].sort((a, b) => a - b);
}

/** Convenience wrapper that applies the mismatch stored on each plant phase in
 * addition to any PWM timingOffsets supplied by the caller. */
export function pwmDrivesForPlantAt(
  time: number,
  plant: BuckPlantConfig,
  pwm: PwmDriveConfig
): PhaseDrive[] {
  const period = 1 / pwm.switchingFrequency;
  const combined = plant.phases.map(
    (phase, index) => (pwm.timingOffsets?.[index] ?? 0) + (phase.timingOffset ?? 0)
  );
  return pwmDrivesAt(time, plant.phases.length, { ...pwm, timingOffsets: combined.map((value) => value % period) });
}

export function pwmEventTimesForPlant(
  startTime: number,
  stopTime: number,
  plant: BuckPlantConfig,
  pwm: PwmDriveConfig
): number[] {
  const combined = plant.phases.map(
    (phase, index) => (pwm.timingOffsets?.[index] ?? 0) + (phase.timingOffset ?? 0)
  );
  return pwmEventTimes(startTime, stopTime, plant.phases.length, { ...pwm, timingOffsets: combined });
}

export interface BuckSimulationOptions {
  startState: BuckPlantState;
  stopTime: number;
  maxStep: number;
  driveAt: (time: number, state: Readonly<BuckPlantState>) => readonly PhaseDrive[];
  eventTimes?: readonly number[];
  maxSamples?: number;
}

export interface BuckSimulationResult {
  finalState: BuckPlantState;
  samples: BuckPlantSample[];
  integrationSteps: number;
  eventStops: number;
}

export function simulateBuckPlant(
  config: BuckPlantConfig,
  options: BuckSimulationOptions
): BuckSimulationResult {
  validateBuckPlantConfig(config);
  validateBuckPlantState(config, options.startState);
  assertPositive(options.maxStep, "maxStep");
  if (options.stopTime < options.startState.time) throw new RangeError("stopTime must not precede state time");
  const maxSamples = options.maxSamples ?? 1_000_000;
  if (!Number.isInteger(maxSamples) || maxSamples < 1) throw new RangeError("maxSamples must be positive");
  const eventTimes = [...(options.eventTimes ?? []), ...loadStepTimes(config.load)]
    .filter((event) => event > options.startState.time && event <= options.stopTime)
    .sort((a, b) => a - b);
  let eventIndex = 0;
  let state: BuckPlantState = {
    ...options.startState,
    phaseCurrents: [...options.startState.phaseCurrents]
  };
  const initialDrives = options.driveAt(state.time, state);
  const samples: BuckPlantSample[] = [sampleBuckPlant(config, state, initialDrives)];
  let integrationSteps = 0;
  let eventStops = 0;
  const epsilon = Math.max(1e-15, Math.abs(options.stopTime) * 1e-14);

  while (state.time < options.stopTime - epsilon) {
    while ((eventTimes[eventIndex] ?? Infinity) <= state.time + epsilon) eventIndex += 1;
    const nextEvent = eventTimes[eventIndex];
    let target = Math.min(options.stopTime, state.time + options.maxStep);
    if (nextEvent !== undefined && nextEvent < target - epsilon / 10) {
      target = nextEvent;
      eventStops += 1;
    } else if (nextEvent !== undefined && Math.abs(nextEvent - target) <= epsilon / 10) {
      target = nextEvent;
      eventStops += 1;
    }
    const drives = options.driveAt(state.time + epsilon / 100, state);
    const result = stepBuckPlant(config, state, drives, target - state.time);
    state = result.state;
    samples.push(result.sample);
    integrationSteps += 1;
    if (samples.length > maxSamples) throw new RangeError("simulation exceeded maxSamples");
  }
  return { finalState: state, samples, integrationSteps, eventStops };
}
