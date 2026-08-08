import { describe, expect, it } from "vitest";
import { SeededRandom, gaussianMismatch, indexedGaussian } from "../src/random.js";

describe("deterministic noise and mismatch", () => {
  it("repeats a seeded pseudo-random sequence exactly", () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    expect(Array.from({ length: 20 }, () => a.uniform())).toEqual(
      Array.from({ length: 20 }, () => b.uniform())
    );
  });

  it("provides call-order-independent indexed noise", () => {
    const values = [0, 1, 5, 100].map((index) => indexedGaussian(99, index, 0, 0.1));
    expect([100, 5, 1, 0].map((index) => indexedGaussian(99, index, 0, 0.1)).reverse()).toEqual(values);
    expect(indexedGaussian(99, 5)).not.toBe(indexedGaussian(100, 5));
  });

  it("generates positive, reproducible component mismatch", () => {
    const options = { nominal: 1e-6, count: 8, sigmaFraction: 0.1, seed: 7 };
    const a = gaussianMismatch(options);
    const b = gaussianMismatch(options);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(1);
    expect(a.every((value) => value > 0)).toBe(true);
  });
});
