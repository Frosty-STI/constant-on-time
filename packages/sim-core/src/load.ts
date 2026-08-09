import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export type LoadModel =
  | { kind: "resistive"; resistance: number }
  | { kind: "constant-current"; current: number }
  | { kind: "parallel"; resistance: number; current: number };

export interface LoadStep {
  at: number;
  load: LoadModel;
}

export interface DynamicLoadProfile {
  initial: LoadModel;
  steps?: readonly LoadStep[];
}

export function validateLoad(load: LoadModel): void {
  if (load.kind === "resistive") {
    assertPositive(load.resistance, "load resistance");
  } else if (load.kind === "constant-current") {
    assertNonNegative(load.current, "load current");
  } else {
    assertPositive(load.resistance, "load resistance");
    assertNonNegative(load.current, "load current");
  }
}

export function validateLoadProfile(profile: DynamicLoadProfile): void {
  validateLoad(profile.initial);
  let previousTime = -Infinity;
  for (const step of profile.steps ?? []) {
    assertNonNegative(step.at, "load-step time");
    if (step.at <= previousTime) throw new RangeError("load steps must be strictly increasing in time");
    validateLoad(step.load);
    previousTime = step.at;
  }
}

export function activeLoadAt(profile: DynamicLoadProfile, time: number): LoadModel {
  assertFinite(time, "time");
  validateLoadProfile(profile);
  let selected = profile.initial;
  for (const step of profile.steps ?? []) {
    if (time < step.at) break;
    selected = step.load;
  }
  return selected;
}

export function loadCurrent(load: LoadModel, outputVoltage: number): number {
  validateLoad(load);
  assertFinite(outputVoltage, "outputVoltage");
  if (load.kind === "constant-current") return load.current;
  if (load.kind === "resistive") return outputVoltage / load.resistance;
  return outputVoltage / load.resistance + load.current;
}

export function loadStepTimes(profile: DynamicLoadProfile): number[] {
  validateLoadProfile(profile);
  return (profile.steps ?? []).map((step) => step.at);
}
