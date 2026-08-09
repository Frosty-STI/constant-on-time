import { validateCotConfig, type CotControllerConfig } from "./controllers/cot.js";
import { assertFiniteRecord } from "./diagnostics.js";
import {
  validateBuckPlantConfig,
  validatePwmDrive,
  type BuckPlantConfig,
  type PwmDriveConfig
} from "./plant.js";

export type ScenarioController =
  | { kind: "open-loop-pwm"; pwm: PwmDriveConfig }
  | { kind: "constant-on-time"; cot: CotControllerConfig };

export interface SimulationScenarioV1 {
  schemaVersion: 1;
  name: string;
  description?: string;
  seed: number;
  plant: BuckPlantConfig;
  controller: ScenarioController;
  duration: number;
  integrationStep: number;
  tags?: readonly string[];
}

export type SimulationScenario = SimulationScenarioV1;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateScenario(scenario: SimulationScenario): void {
  assertFiniteRecord(scenario, "scenario");
  if (scenario.schemaVersion !== 1) throw new RangeError("unsupported scenario schemaVersion");
  if (typeof scenario.name !== "string" || scenario.name.trim().length === 0 || scenario.name.length > 120) {
    throw new RangeError("scenario name must contain 1 to 120 characters");
  }
  if (scenario.description !== undefined && typeof scenario.description !== "string") {
    throw new TypeError("scenario description must be a string");
  }
  if (!Number.isInteger(scenario.seed)) throw new RangeError("scenario seed must be an integer");
  if (!(scenario.duration > 0)) throw new RangeError("scenario duration must be greater than zero");
  if (!(scenario.integrationStep > 0)) throw new RangeError("scenario integrationStep must be greater than zero");
  if (scenario.integrationStep > scenario.duration) {
    throw new RangeError("scenario integrationStep must not exceed duration");
  }
  validateBuckPlantConfig(scenario.plant);
  if (scenario.controller.kind === "open-loop-pwm") {
    validatePwmDrive(scenario.controller.pwm, scenario.plant.phases.length);
  } else if (scenario.controller.kind === "constant-on-time") {
    validateCotConfig(scenario.controller.cot);
  } else {
    throw new RangeError("unsupported scenario controller kind");
  }
  if (scenario.tags !== undefined) {
    if (!Array.isArray(scenario.tags) || scenario.tags.some((tag) => typeof tag !== "string")) {
      throw new TypeError("scenario tags must be strings");
    }
  }
}

function sortedClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedClone(value[key])])
    );
  }
  return value;
}

export function exportScenario(scenario: SimulationScenario, pretty = true): string {
  validateScenario(scenario);
  return JSON.stringify(sortedClone(scenario), null, pretty ? 2 : undefined);
}

export function importScenario(text: string): SimulationScenario {
  if (typeof text !== "string" || text.length === 0) throw new TypeError("scenario JSON is required");
  if (text.length > 5_000_000) throw new RangeError("scenario JSON exceeds the 5 MB safety limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SyntaxError(`Invalid scenario JSON: ${error instanceof Error ? error.message : "parse failed"}`, { cause: error });
  }
  if (!isObject(parsed)) throw new TypeError("scenario root must be an object");
  const scenario = parsed as unknown as SimulationScenario;
  validateScenario(scenario);
  // Round-trip through JSON to ensure callers cannot mutate the parser's object
  // through unusual prototypes or shared references.
  return JSON.parse(JSON.stringify(scenario)) as SimulationScenario;
}
