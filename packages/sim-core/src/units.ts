/** Utilities for UI-facing engineering notation. All values returned to the
 * simulation core are SI base units. Prefixes are case-sensitive: m is milli,
 * M is mega, and both u and the micro sign mean micro. */

export type EngineeringUnit =
  | ""
  | "V"
  | "A"
  | "Ohm"
  | "H"
  | "F"
  | "Hz"
  | "s"
  | "W";

const PREFIX_FACTORS: Readonly<Record<string, number>> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  "µ": 1e-6,
  "μ": 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  G: 1e9,
  T: 1e12
};

const DISPLAY_PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [12, "T"],
  [9, "G"],
  [6, "M"],
  [3, "k"],
  [0, ""],
  [-3, "m"],
  [-6, "µ"],
  [-9, "n"],
  [-12, "p"],
  [-15, "f"]
];

const UNIT_ALIASES: Readonly<Record<string, EngineeringUnit>> = {
  "": "",
  v: "V",
  volt: "V",
  volts: "V",
  a: "A",
  amp: "A",
  amps: "A",
  ampere: "A",
  amperes: "A",
  ohm: "Ohm",
  ohms: "Ohm",
  "Ω": "Ohm",
  "Ω": "Ohm",
  h: "H",
  henry: "H",
  henries: "H",
  f: "F",
  farad: "F",
  farads: "F",
  hz: "Hz",
  s: "s",
  sec: "s",
  second: "s",
  seconds: "s",
  w: "W",
  watt: "W",
  watts: "W"
};

export interface ParseEngineeringOptions {
  expectedUnit?: EngineeringUnit;
  allowUnitless?: boolean;
}

export interface EngineeringParts {
  value: number;
  prefix: string;
  exponent: number;
  unit: EngineeringUnit;
}

export function normalizeUnit(raw: string): EngineeringUnit | undefined {
  const exact = UNIT_ALIASES[raw];
  if (exact !== undefined) return exact;
  return UNIT_ALIASES[raw.toLowerCase()];
}

export function parseEngineering(
  input: string | number,
  options: ParseEngineeringOptions = {}
): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("Engineering value must be finite");
    return input;
  }

  const text = input.trim();
  const match = text.match(
    /^([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*(meg|[fpnuµμmMkKGT]?)([A-Za-zΩΩ]*)$/
  );
  if (!match) throw new TypeError(`Invalid engineering value: "${input}"`);

  const numericText = match[1];
  const prefix = match[2] ?? "";
  const rawUnit = match[3] ?? "";
  if (numericText === undefined) throw new TypeError(`Invalid engineering value: "${input}"`);
  const numeric = Number(numericText);
  const factor = PREFIX_FACTORS[prefix];
  const unit = normalizeUnit(rawUnit);
  if (!Number.isFinite(numeric) || factor === undefined || unit === undefined) {
    throw new TypeError(`Invalid engineering value: "${input}"`);
  }

  if (options.expectedUnit !== undefined) {
    const unitMatches = unit === options.expectedUnit;
    const allowedUnitless = unit === "" && options.allowUnitless === true;
    if (!unitMatches && !allowedUnitless) {
      throw new TypeError(
        `Expected ${options.expectedUnit || "a unitless value"}, received ${unit || "no unit"}`
      );
    }
  }

  const value = numeric * factor;
  if (!Number.isFinite(value)) throw new RangeError("Engineering value is outside the finite range");
  return value;
}

export function engineeringParts(value: number, unit: EngineeringUnit = ""): EngineeringParts {
  assertFinite(value, "value");
  if (value === 0) return { value: 0, prefix: "", exponent: 0, unit };

  const rawExponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
  const exponent = Math.max(-15, Math.min(12, rawExponent));
  const prefix = DISPLAY_PREFIXES.find(([candidate]) => candidate === exponent)?.[1] ?? "";
  return { value: value / 10 ** exponent, prefix, exponent, unit };
}

export interface FormatEngineeringOptions {
  unit?: EngineeringUnit;
  significantDigits?: number;
  space?: boolean;
}

export function formatEngineering(value: number, options: FormatEngineeringOptions = {}): string {
  const unit = options.unit ?? "";
  const significantDigits = options.significantDigits ?? 4;
  if (!Number.isInteger(significantDigits) || significantDigits < 1 || significantDigits > 15) {
    throw new RangeError("significantDigits must be an integer from 1 through 15");
  }
  const parts = engineeringParts(value, unit);
  const rounded = Number(parts.value.toPrecision(significantDigits));
  const separator = options.space === false || (!parts.prefix && !unit) ? "" : " ";
  const displayUnit = unit === "Ohm" ? "Ω" : unit;
  return `${rounded}${separator}${parts.prefix}${displayUnit}`;
}

export function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

export function assertPositive(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
}

export function assertNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) throw new RangeError(`${name} must not be negative`);
}
