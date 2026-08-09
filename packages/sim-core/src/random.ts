import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

/** Small deterministic PRNG for repeatable educational simulations. This is
 * deliberately not a cryptographic generator. */
export class SeededRandom {
  private state: number;
  private spareGaussian: number | undefined;

  public constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new RangeError("seed must be an integer");
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  public nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  public uniform(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  public uniformBetween(min: number, max: number): number {
    assertFinite(min, "min");
    assertFinite(max, "max");
    if (max < min) throw new RangeError("max must be greater than or equal to min");
    return min + (max - min) * this.uniform();
  }

  public gaussian(mean = 0, standardDeviation = 1): number {
    assertFinite(mean, "mean");
    assertNonNegative(standardDeviation, "standardDeviation");
    if (standardDeviation === 0) return mean;
    if (this.spareGaussian !== undefined) {
      const spare = this.spareGaussian;
      this.spareGaussian = undefined;
      return mean + standardDeviation * spare;
    }

    // Reject exact zero so log(u) remains finite.
    let u1 = this.uniform();
    while (u1 <= Number.EPSILON) u1 = this.uniform();
    const u2 = this.uniform();
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    this.spareGaussian = magnitude * Math.sin(angle);
    return mean + standardDeviation * magnitude * Math.cos(angle);
  }
}

function mixSeed(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

/** A call-order-independent sample, useful when a UI pauses or seeks. */
export function indexedGaussian(
  seed: number,
  index: number,
  mean = 0,
  standardDeviation = 1
): number {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("index must be a non-negative integer");
  return new SeededRandom(mixSeed(seed, index)).gaussian(mean, standardDeviation);
}

export interface MismatchOptions {
  nominal: number;
  count: number;
  sigmaFraction: number;
  seed: number;
  minimum?: number;
}

export function gaussianMismatch(options: MismatchOptions): number[] {
  assertPositive(options.nominal, "nominal");
  assertNonNegative(options.sigmaFraction, "sigmaFraction");
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new RangeError("count must be a positive integer");
  }
  const minimum = options.minimum ?? Number.MIN_VALUE;
  assertNonNegative(minimum, "minimum");
  const random = new SeededRandom(options.seed);
  return Array.from({ length: options.count }, () =>
    Math.max(minimum, random.gaussian(options.nominal, options.nominal * options.sigmaFraction))
  );
}
