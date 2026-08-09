import { assertNonNegative, assertPositive } from "./units.js";

export type TimeStepWarningCode =
  | "SWITCHING_RESOLUTION"
  | "INTERLEAVED_EVENT_RESOLUTION"
  | "MINIMUM_ON_TIME_RESOLUTION"
  | "MINIMUM_OFF_TIME_RESOLUTION"
  | "DEAD_TIME_RESOLUTION"
  | "COMPARATOR_DELAY_RESOLUTION"
  | "RIPPLE_TIMING_RESOLUTION";

export interface TimeStepWarning {
  code: TimeStepWarningCode;
  severity: "warning" | "error";
  message: string;
  requestedStep: number;
  recommendedMaximum: number;
}

export interface TimeStepAssessment {
  integrationStep: number;
  warnings: TimeStepWarning[];
  safeForRequestedTiming: boolean;
  recommendedMaximum: number;
}

export interface TimingResolutionRequest {
  integrationStep: number;
  switchingFrequency: number;
  phaseCount?: number;
  minimumOnTime?: number;
  minimumOffTime?: number;
  deadTime?: number;
  comparatorDelay?: number;
  rippleTimingInterval?: number;
}

export function assessTimeStep(request: TimingResolutionRequest): TimeStepAssessment {
  assertPositive(request.integrationStep, "integrationStep");
  assertPositive(request.switchingFrequency, "switchingFrequency");
  const phaseCount = request.phaseCount ?? 1;
  if (!Number.isInteger(phaseCount) || phaseCount < 1) throw new RangeError("phaseCount must be positive");
  for (const [name, value] of [
    ["minimumOnTime", request.minimumOnTime],
    ["minimumOffTime", request.minimumOffTime],
    ["deadTime", request.deadTime],
    ["comparatorDelay", request.comparatorDelay],
    ["rippleTimingInterval", request.rippleTimingInterval]
  ] as const) {
    if (value !== undefined) assertNonNegative(value, name);
  }

  const warnings: TimeStepWarning[] = [];
  const candidates: number[] = [];
  const addCheck = (
    code: TimeStepWarningCode,
    label: string,
    interval: number,
    subdivisions: number,
    errorMultiplier = 4
  ): void => {
    if (interval <= 0) return;
    const recommendedMaximum = interval / subdivisions;
    candidates.push(recommendedMaximum);
    if (request.integrationStep > recommendedMaximum) {
      warnings.push({
        code,
        severity: request.integrationStep > recommendedMaximum * errorMultiplier ? "error" : "warning",
        message: `${label} is under-resolved; use ${subdivisions} or more integration intervals across it.`,
        requestedStep: request.integrationStep,
        recommendedMaximum
      });
    }
  };

  const period = 1 / request.switchingFrequency;
  addCheck("SWITCHING_RESOLUTION", "Switching period", period, 40);
  if (phaseCount > 1) {
    addCheck("INTERLEAVED_EVENT_RESOLUTION", "Nominal interleaved event spacing", period / phaseCount, 10);
  }
  addCheck("MINIMUM_ON_TIME_RESOLUTION", "Minimum on-time", request.minimumOnTime ?? 0, 5);
  addCheck("MINIMUM_OFF_TIME_RESOLUTION", "Minimum off-time", request.minimumOffTime ?? 0, 5);
  addCheck("DEAD_TIME_RESOLUTION", "Dead time", request.deadTime ?? 0, 5);
  addCheck("COMPARATOR_DELAY_RESOLUTION", "Comparator delay", request.comparatorDelay ?? 0, 5);
  addCheck("RIPPLE_TIMING_RESOLUTION", "Ripple timing interval", request.rippleTimingInterval ?? 0, 10);
  return {
    integrationStep: request.integrationStep,
    warnings,
    safeForRequestedTiming: warnings.length === 0,
    recommendedMaximum: Math.min(...candidates)
  };
}

export function assertFiniteRecord(value: unknown, path = "value"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteRecord(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => assertFiniteRecord(entry, `${path}.${key}`));
  }
}
