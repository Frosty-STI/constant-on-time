import { assertFinite, assertNonNegative, assertPositive } from "../units.js";

export type CotOnTimeLaw =
  | { kind: "fixed"; onTime: number }
  | { kind: "adaptive-vout-vin"; nominalFrequency: number; outputVoltageTarget?: number };

export interface CotControllerConfig {
  referenceVoltage: number;
  feedbackGain?: number;
  onTimeLaw: CotOnTimeLaw;
  minimumOnTime: number;
  maximumOnTime: number;
  minimumOffTime: number;
  comparatorDelay?: number;
  comparatorHysteresis?: number;
  injectedRippleGain?: number;
  currentLimit?: number;
}

export interface CotControllerState {
  lastUpdateAt: number;
  isOn: boolean;
  pulseStartedAt: number;
  lastPulseEndedAt: number;
  comparatorLow: boolean;
  pendingTriggerAt: number | null;
  activeOnTime: number;
  pulseCount: number;
  currentLimitStopCount: number;
  /** True while the most recent sensed-current sample is at or above the
   * configured limit. It exposes the minimum-on-time reevaluation boundary
   * to event-driven callers. */
  currentLimitPending: boolean;
}

export interface CotControllerInput {
  time: number;
  vin: number;
  feedback: number;
  naturalRipple?: number;
  injectedRipple?: number;
  noise?: number;
  sensedCurrent?: number;
  /** A scheduler may hold a valid request without losing it. Defaults true. */
  grantPulse?: boolean;
}

export interface CotStepResult {
  state: CotControllerState;
  switchHigh: boolean;
  pulseRequested: boolean;
  pulseStarted: boolean;
  pulseEnded: boolean;
  endReason: "one-shot" | "current-limit" | null;
  comparatorInput: number;
  lowerThreshold: number;
  upperThreshold: number;
  requestedOnTime: number;
  appliedOnTime: number;
  nextEventAt: number | null;
}

export interface RippleInjectionWaveform {
  source: "output-esr" | "switch-node-rc" | "synthetic";
  waveform: "sawtooth" | "triangle" | "sine";
  amplitudePeakToPeak: number;
  frequency: number;
  phaseDegrees?: number;
  dcOffset?: number;
}

/** Deterministic generic ripple waveform. Source is metadata that prevents an
 * educational synthetic waveform from being mistaken for natural ESR ripple. */
export function rippleInjectionAt(config: RippleInjectionWaveform, time: number): number {
  assertNonNegative(config.amplitudePeakToPeak, "amplitudePeakToPeak");
  assertPositive(config.frequency, "frequency");
  assertFinite(config.phaseDegrees ?? 0, "phaseDegrees");
  assertFinite(config.dcOffset ?? 0, "dcOffset");
  assertFinite(time, "time");
  const cycle =
    ((time * config.frequency + (config.phaseDegrees ?? 0) / 360) % 1 + 1) % 1;
  let normalized: number;
  if (config.waveform === "sine") normalized = Math.sin(2 * Math.PI * cycle);
  else if (config.waveform === "triangle") normalized = 1 - 4 * Math.abs(cycle - 0.5);
  else normalized = 2 * cycle - 1;
  return (config.dcOffset ?? 0) + (config.amplitudePeakToPeak / 2) * normalized;
}

export function validateCotConfig(config: CotControllerConfig): void {
  assertPositive(config.referenceVoltage, "referenceVoltage");
  assertPositive(config.feedbackGain ?? 1, "feedbackGain");
  assertPositive(config.minimumOnTime, "minimumOnTime");
  assertPositive(config.maximumOnTime, "maximumOnTime");
  if (config.maximumOnTime < config.minimumOnTime) {
    throw new RangeError("maximumOnTime must be at least minimumOnTime");
  }
  assertNonNegative(config.minimumOffTime, "minimumOffTime");
  assertNonNegative(config.comparatorDelay ?? 0, "comparatorDelay");
  assertNonNegative(config.comparatorHysteresis ?? 0, "comparatorHysteresis");
  assertFinite(config.injectedRippleGain ?? 1, "injectedRippleGain");
  if (config.currentLimit !== undefined) assertPositive(config.currentLimit, "currentLimit");
  if (config.onTimeLaw.kind === "fixed") {
    assertPositive(config.onTimeLaw.onTime, "onTimeLaw.onTime");
  } else {
    assertPositive(config.onTimeLaw.nominalFrequency, "onTimeLaw.nominalFrequency");
    if (config.onTimeLaw.outputVoltageTarget !== undefined) {
      assertPositive(config.onTimeLaw.outputVoltageTarget, "onTimeLaw.outputVoltageTarget");
    }
  }
}

export function createCotState(config: CotControllerConfig, time = 0): CotControllerState {
  validateCotConfig(config);
  assertNonNegative(time, "time");
  return {
    lastUpdateAt: time,
    isOn: false,
    pulseStartedAt: time,
    lastPulseEndedAt: time - config.minimumOffTime,
    comparatorLow: false,
    pendingTriggerAt: null,
    activeOnTime: config.minimumOnTime,
    pulseCount: 0,
    currentLimitStopCount: 0,
    currentLimitPending: false
  };
}

export function requestedCotOnTime(
  config: CotControllerConfig,
  vin: number
): { requested: number; applied: number } {
  validateCotConfig(config);
  assertPositive(vin, "vin");
  const requested =
    config.onTimeLaw.kind === "fixed"
      ? config.onTimeLaw.onTime
      : (config.onTimeLaw.outputVoltageTarget ??
          config.referenceVoltage / (config.feedbackGain ?? 1)) /
        (vin * config.onTimeLaw.nominalFrequency);
  return {
    requested,
    applied: Math.max(config.minimumOnTime, Math.min(config.maximumOnTime, requested))
  };
}

function cloneState(state: CotControllerState): CotControllerState {
  return { ...state };
}

function validateCotState(state: CotControllerState): void {
  assertNonNegative(state.lastUpdateAt, "state.lastUpdateAt");
  assertFinite(state.pulseStartedAt, "state.pulseStartedAt");
  assertFinite(state.lastPulseEndedAt, "state.lastPulseEndedAt");
  assertPositive(state.activeOnTime, "state.activeOnTime");
  if (state.pendingTriggerAt !== null) assertFinite(state.pendingTriggerAt, "state.pendingTriggerAt");
  if (!Number.isInteger(state.pulseCount) || state.pulseCount < 0) throw new RangeError("invalid pulseCount");
  if (!Number.isInteger(state.currentLimitStopCount) || state.currentLimitStopCount < 0) {
    throw new RangeError("invalid currentLimitStopCount");
  }
  if (typeof state.currentLimitPending !== "boolean") throw new RangeError("invalid currentLimitPending");
}

export function nextCotEventAt(config: CotControllerConfig, state: CotControllerState): number | null {
  validateCotConfig(config);
  validateCotState(state);
  if (state.isOn) {
    const oneShotEnd = state.pulseStartedAt + state.activeOnTime;
    const limitCheck = state.pulseStartedAt + config.minimumOnTime;
    return state.currentLimitPending && limitCheck > state.lastUpdateAt + 1e-15
      ? Math.min(oneShotEnd, limitCheck)
      : oneShotEnd;
  }
  if (state.pendingTriggerAt !== null) {
    const event = Math.max(state.pendingTriggerAt, state.lastPulseEndedAt + config.minimumOffTime);
    // Once a request is qualified and waiting on an external scheduler grant,
    // there is no future internal controller deadline. Returning the current
    // time would make a caller following nextEventAt spin forever.
    return event > state.lastUpdateAt + 1e-15 ? event : null;
  }
  return null;
}

/** Discrete-event COT one-shot model. Call at comparator samples and at each
 * returned nextEventAt boundary. A scheduler can deny a request by passing
 * grantPulse=false; the qualified request remains pending. */
export function stepCotController(
  config: CotControllerConfig,
  state: CotControllerState,
  input: CotControllerInput
): CotStepResult {
  validateCotConfig(config);
  validateCotState(state);
  assertFinite(input.time, "input.time");
  assertPositive(input.vin, "input.vin");
  assertFinite(input.feedback, "input.feedback");
  assertFinite(input.naturalRipple ?? 0, "input.naturalRipple");
  assertFinite(input.injectedRipple ?? 0, "input.injectedRipple");
  assertFinite(input.noise ?? 0, "input.noise");
  if (input.sensedCurrent !== undefined) assertFinite(input.sensedCurrent, "input.sensedCurrent");
  if (input.time < state.lastUpdateAt) throw new RangeError("controller time must be monotonic");

  const next = cloneState(state);
  next.lastUpdateAt = input.time;
  const hysteresis = config.comparatorHysteresis ?? 0;
  const lowerThreshold = config.referenceVoltage - hysteresis / 2;
  const upperThreshold = config.referenceVoltage + hysteresis / 2;
  const comparatorInput =
    input.feedback +
    (input.naturalRipple ?? 0) +
    (config.injectedRippleGain ?? 1) * (input.injectedRipple ?? 0) +
    (input.noise ?? 0);

  if (next.comparatorLow) {
    if (comparatorInput >= upperThreshold) {
      next.comparatorLow = false;
      if (!next.isOn) next.pendingTriggerAt = null;
    }
  } else if (comparatorInput <= lowerThreshold) {
    next.comparatorLow = true;
    if (!next.isOn) next.pendingTriggerAt = input.time + (config.comparatorDelay ?? 0);
  }

  const onTime = requestedCotOnTime(config, input.vin);
  let pulseEnded = false;
  let pulseStarted = false;
  let endReason: CotStepResult["endReason"] = null;

  if (next.isOn) {
    const elapsed = input.time - next.pulseStartedAt;
    next.currentLimitPending =
      config.currentLimit !== undefined &&
      input.sensedCurrent !== undefined &&
      input.sensedCurrent >= config.currentLimit;
    const limitReached = next.currentLimitPending && elapsed >= config.minimumOnTime;
    const oneShotExpired = elapsed >= next.activeOnTime || elapsed >= config.maximumOnTime;
    if (limitReached || oneShotExpired) {
      next.isOn = false;
      next.lastPulseEndedAt = input.time;
      pulseEnded = true;
      endReason = limitReached ? "current-limit" : "one-shot";
      if (limitReached) next.currentLimitStopCount += 1;
      next.pendingTriggerAt = null;
      next.currentLimitPending = false;
    }
  }

  const earliestEligible = next.lastPulseEndedAt + config.minimumOffTime;
  if (!next.isOn && next.comparatorLow && next.pendingTriggerAt === null) {
    next.pendingTriggerAt = Math.max(input.time, earliestEligible) + (config.comparatorDelay ?? 0);
  }
  const pulseRequested =
    !next.isOn &&
    next.comparatorLow &&
    next.pendingTriggerAt !== null &&
    input.time >= next.pendingTriggerAt &&
    input.time >= earliestEligible;

  if (pulseRequested && (input.grantPulse ?? true)) {
    next.isOn = true;
    next.pulseStartedAt = input.time;
    next.activeOnTime = onTime.applied;
    next.pendingTriggerAt = null;
    next.pulseCount += 1;
    pulseStarted = true;
    next.currentLimitPending =
      config.currentLimit !== undefined &&
      input.sensedCurrent !== undefined &&
      input.sensedCurrent >= config.currentLimit;
  }

  const nextEvent = nextCotEventAt(config, next);
  return {
    state: next,
    switchHigh: next.isOn,
    pulseRequested,
    pulseStarted,
    pulseEnded,
    endReason,
    comparatorInput,
    lowerThreshold,
    upperThreshold,
    requestedOnTime: onTime.requested,
    appliedOnTime: next.isOn ? next.activeOnTime : onTime.applied,
    nextEventAt: nextEvent
  };
}
