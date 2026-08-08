import { assertFinite, assertPositive } from "./units.js";

export type StateVector = readonly number[];
export type DerivativeFunction = (time: number, state: StateVector) => StateVector;

function validateVector(vector: StateVector, expectedLength: number, name: string): void {
  if (vector.length !== expectedLength) {
    throw new RangeError(`${name} returned ${vector.length} states; expected ${expectedLength}`);
  }
  vector.forEach((value, index) => assertFinite(value, `${name}[${index}]`));
}

function addScaled(base: StateVector, delta: StateVector, scale: number): number[] {
  return base.map((value, index) => value + (delta[index] ?? 0) * scale);
}

/** Classical explicit fourth-order Runge-Kutta step. It is accurate and easy
 * to audit for smooth intervals, but does not discover switching events. The
 * caller must split a step at every known discontinuity. */
export function rk4Step(
  derivative: DerivativeFunction,
  time: number,
  state: StateVector,
  dt: number
): number[] {
  assertFinite(time, "time");
  assertPositive(dt, "dt");
  if (state.length === 0) throw new RangeError("state must contain at least one value");
  validateVector(state, state.length, "state");

  const k1 = derivative(time, state);
  validateVector(k1, state.length, "k1");
  const k2 = derivative(time + dt / 2, addScaled(state, k1, dt / 2));
  validateVector(k2, state.length, "k2");
  const k3 = derivative(time + dt / 2, addScaled(state, k2, dt / 2));
  validateVector(k3, state.length, "k3");
  const k4 = derivative(time + dt, addScaled(state, k3, dt));
  validateVector(k4, state.length, "k4");

  const next = state.map(
    (value, index) =>
      value +
      (dt / 6) *
        ((k1[index] ?? 0) + 2 * (k2[index] ?? 0) + 2 * (k3[index] ?? 0) + (k4[index] ?? 0))
  );
  validateVector(next, state.length, "RK4 result");
  return next;
}

export function nextEventAfter(
  time: number,
  eventTimes: readonly number[],
  tolerance = 1e-15
): number | undefined {
  assertFinite(time, "time");
  assertNonNegativeTolerance(tolerance);
  let next: number | undefined;
  for (const event of eventTimes) {
    assertFinite(event, "event time");
    if (event > time + tolerance && (next === undefined || event < next)) next = event;
  }
  return next;
}

function assertNonNegativeTolerance(tolerance: number): void {
  assertFinite(tolerance, "tolerance");
  if (tolerance < 0) throw new RangeError("tolerance must not be negative");
}

export interface IntegrationResult {
  time: number;
  state: number[];
  steps: number;
  eventStops: number;
}

/** Integrate to an exact stop time, reducing steps so no known event is crossed.
 * Events only define discontinuity boundaries; the derivative callback decides
 * which mode applies on each side. */
export function integrateTo(
  derivative: DerivativeFunction,
  initialTime: number,
  initialState: StateVector,
  stopTime: number,
  maxStep: number,
  eventTimes: readonly number[] = []
): IntegrationResult {
  assertFinite(initialTime, "initialTime");
  assertFinite(stopTime, "stopTime");
  assertPositive(maxStep, "maxStep");
  if (stopTime < initialTime) throw new RangeError("stopTime must not precede initialTime");
  let time = initialTime;
  let state = [...initialState];
  let steps = 0;
  let eventStops = 0;
  const epsilon = Math.max(1e-15, Math.abs(stopTime) * 1e-14);

  while (time < stopTime - epsilon) {
    const event = nextEventAfter(time, eventTimes, epsilon / 10);
    let target = Math.min(stopTime, time + maxStep);
    if (event !== undefined && event < target - epsilon / 10) {
      target = event;
      eventStops += 1;
    } else if (event !== undefined && Math.abs(event - target) <= epsilon / 10) {
      target = event;
      eventStops += 1;
    }
    const dt = target - time;
    if (dt <= 0) break;
    state = rk4Step(derivative, time, state, dt);
    time = target;
    steps += 1;
  }
  return { time: stopTime, state, steps, eventStops };
}

export interface EventStepResult {
  time: number;
  state: number[];
  eventTime?: number;
}

export function stepToNextEvent(
  derivative: DerivativeFunction,
  time: number,
  state: StateVector,
  eventTimes: readonly number[],
  maxStep: number
): EventStepResult {
  const eventTime = nextEventAfter(time, eventTimes);
  if (eventTime === undefined) return { time, state: [...state] };
  const result = integrateTo(derivative, time, state, eventTime, maxStep, eventTimes);
  return { time: result.time, state: result.state, eventTime };
}
