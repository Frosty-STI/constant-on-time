import { describe, expect, it } from "vitest";
import {
  engineeringParts,
  formatEngineering,
  parseEngineering
} from "../src/units.js";

describe("engineering units", () => {
  it.each([
    ["4.7uH", 4.7e-6],
    ["220 nF", 220e-9],
    ["1.2 kΩ", 1200],
    ["3megHz", 3e6],
    ["-25mA", -0.025],
    ["2.5e3 V", 2500]
  ])("parses %s into SI", (text, expected) => {
    expect(parseEngineering(text)).toBeCloseTo(expected, 14);
  });

  it("keeps milli and mega case-sensitive", () => {
    expect(parseEngineering("1mV")).toBe(1e-3);
    expect(parseEngineering("1MV")).toBe(1e6);
  });

  it("validates dimensions when requested", () => {
    expect(parseEngineering("5V", { expectedUnit: "V" })).toBe(5);
    expect(() => parseEngineering("5A", { expectedUnit: "V" })).toThrow(/Expected V/);
    expect(() => parseEngineering("5", { expectedUnit: "V" })).toThrow(/no unit/);
    expect(parseEngineering("5", { expectedUnit: "V", allowUnitless: true })).toBe(5);
  });

  it("formats values with engineering prefixes", () => {
    expect(formatEngineering(4.7e-6, { unit: "H" })).toBe("4.7 µH");
    expect(formatEngineering(0.0025, { unit: "A", significantDigits: 3 })).toBe("2.5 mA");
    expect(formatEngineering(1200, { unit: "Ohm" })).toBe("1.2 kΩ");
    expect(engineeringParts(0)).toEqual({ value: 0, prefix: "", exponent: 0, unit: "" });
  });

  it("rejects malformed, nonfinite, and unknown-unit inputs", () => {
    expect(() => parseEngineering("1qq")) .toThrow();
    expect(() => parseEngineering("NaN")) .toThrow();
    expect(() => parseEngineering(Infinity)).toThrow(/finite/);
    expect(() => formatEngineering(NaN)).toThrow(/finite/);
  });
});
