import { assertFinite, assertNonNegative, assertPositive } from "./units.js";

export type SchedulerMethod =
  | "ideal-fixed-spacing"
  | "first-eligible"
  | "round-robin"
  | "minimum-separation"
  | "current-priority"
  | "free-running";

export interface PhaseSchedulerConfig {
  method: SchedulerMethod;
  phaseCount: number;
  minimumSeparation?: number;
  basePeriod?: number;
  phaseOffsets?: readonly number[];
  currentPriority?: "lowest-current" | "highest-current";
}

export interface PulseRequest {
  phase: number;
  requestedAt: number;
  eligibleAt?: number;
  measuredCurrent?: number;
}

export interface PulseGrant {
  phase: number;
  requestedAt: number;
  grantedAt: number;
  waitTime: number;
}

export interface SchedulerDecision {
  phase: number;
  status: "granted" | "waiting" | "delayed" | "denied";
  reason: string;
}

export interface PhaseSchedulerState {
  lastUpdateAt: number;
  lastGlobalGrantAt: number | null;
  nextRoundRobinPhase: number;
  requestCount: number[];
  grantCount: number[];
  deniedCount: number[];
  totalWaitTime: number[];
  maxWaitTime: number[];
  pendingSince: Array<number | null>;
  lastGrantAt: Array<number | null>;
  collisionCount: number;
  /** Absolute ideal-slot key most recently consumed. Null for all other
   * methods. Kept in state so repeated calls at one timestamp cannot grant
   * multiple pulses inside a nominal slot. */
  lastFixedSlotIndex: number | null;
}

export interface SchedulerStepResult {
  state: PhaseSchedulerState;
  grants: PulseGrant[];
  decisions: SchedulerDecision[];
  fairness: SchedulerFairness;
}

export interface SchedulerFairness {
  jainIndex: number;
  grantSpread: number;
  maxObservedWait: number;
  starvedPhases: number[];
}

export function validateSchedulerConfig(config: PhaseSchedulerConfig): void {
  if (!Number.isInteger(config.phaseCount) || config.phaseCount < 1 || config.phaseCount > 64) {
    throw new RangeError("phaseCount must be an integer from 1 through 64");
  }
  assertNonNegative(config.minimumSeparation ?? 0, "minimumSeparation");
  if (config.method === "ideal-fixed-spacing") assertPositive(config.basePeriod ?? 0, "basePeriod");
  if (config.basePeriod !== undefined) assertPositive(config.basePeriod, "basePeriod");
  if (config.phaseOffsets !== undefined) {
    if (config.phaseOffsets.length !== config.phaseCount) {
      throw new RangeError("phaseOffsets length must equal phaseCount");
    }
    config.phaseOffsets.forEach((offset, index) => {
      assertFinite(offset, `phaseOffsets[${index}]`);
      if (offset < 0 || offset >= 1) throw new RangeError("phase offsets must be in [0, 1)");
    });
  }
}

export function createSchedulerState(config: PhaseSchedulerConfig, time = 0): PhaseSchedulerState {
  validateSchedulerConfig(config);
  assertNonNegative(time, "time");
  return {
    lastUpdateAt: time,
    lastGlobalGrantAt: null,
    nextRoundRobinPhase: 0,
    requestCount: Array.from({ length: config.phaseCount }, () => 0),
    grantCount: Array.from({ length: config.phaseCount }, () => 0),
    deniedCount: Array.from({ length: config.phaseCount }, () => 0),
    totalWaitTime: Array.from({ length: config.phaseCount }, () => 0),
    maxWaitTime: Array.from({ length: config.phaseCount }, () => 0),
    pendingSince: Array.from({ length: config.phaseCount }, () => null),
    lastGrantAt: Array.from({ length: config.phaseCount }, () => null),
    collisionCount: 0,
    lastFixedSlotIndex: null
  };
}

function cloneState(state: PhaseSchedulerState): PhaseSchedulerState {
  return {
    ...state,
    requestCount: [...state.requestCount],
    grantCount: [...state.grantCount],
    deniedCount: [...state.deniedCount],
    totalWaitTime: [...state.totalWaitTime],
    maxWaitTime: [...state.maxWaitTime],
    pendingSince: [...state.pendingSince],
    lastGrantAt: [...state.lastGrantAt]
  };
}

function validateSchedulerState(config: PhaseSchedulerConfig, state: PhaseSchedulerState): void {
  assertNonNegative(state.lastUpdateAt, "state.lastUpdateAt");
  if (!Number.isInteger(state.nextRoundRobinPhase) || state.nextRoundRobinPhase < 0 || state.nextRoundRobinPhase >= config.phaseCount) {
    throw new RangeError("invalid nextRoundRobinPhase");
  }
  if (state.lastFixedSlotIndex !== null && !Number.isInteger(state.lastFixedSlotIndex)) {
    throw new RangeError("invalid lastFixedSlotIndex");
  }
  for (const array of [
    state.requestCount,
    state.grantCount,
    state.deniedCount,
    state.totalWaitTime,
    state.maxWaitTime,
    state.pendingSince,
    state.lastGrantAt
  ]) {
    if (array.length !== config.phaseCount) throw new RangeError("scheduler-state array length mismatch");
  }
}

function chooseRoundRobin(candidates: readonly PulseRequest[], start: number, phaseCount: number): PulseRequest {
  for (let offset = 0; offset < phaseCount; offset += 1) {
    const phase = (start + offset) % phaseCount;
    const candidate = candidates.find((request) => request.phase === phase);
    if (candidate !== undefined) return candidate;
  }
  const fallback = candidates[0];
  if (fallback === undefined) throw new RangeError("round-robin selection requires a candidate");
  return fallback;
}

interface FixedSlot {
  phase: number;
  key: number;
}

function fixedSlotAt(config: PhaseSchedulerConfig, time: number): FixedSlot | null {
  const period = config.basePeriod;
  if (period === undefined) throw new RangeError("fixed-spacing scheduler requires basePeriod");
  const tolerance = Math.max(1e-15, period * 1e-9);
  if (config.phaseOffsets === undefined) {
    const slotInterval = period / config.phaseCount;
    const key = Math.round(time / slotInterval);
    if (Math.abs(time - key * slotInterval) > tolerance) return null;
    const phase = ((key % config.phaseCount) + config.phaseCount) % config.phaseCount;
    return { phase, key };
  }
  let best: FixedSlot | null = null;
  let bestDistance = Infinity;
  config.phaseOffsets.forEach((offset, phase) => {
    const cycle = Math.round(time / period - offset);
    const target = (cycle + offset) * period;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { phase, key: cycle * config.phaseCount + phase };
    }
  });
  return bestDistance <= tolerance ? best : null;
}

function selectOne(
  config: PhaseSchedulerConfig,
  state: PhaseSchedulerState,
  candidates: readonly PulseRequest[],
  time: number
): PulseRequest | undefined {
  if (candidates.length === 0) return undefined;
  if (config.method === "ideal-fixed-spacing") {
    const slot = fixedSlotAt(config, time);
    if (slot === null || state.lastFixedSlotIndex === slot.key) return undefined;
    return candidates.find((candidate) => candidate.phase === slot.phase);
  }
  if (config.method === "round-robin") {
    return chooseRoundRobin(candidates, state.nextRoundRobinPhase, config.phaseCount);
  }
  if (config.method === "current-priority") {
    const direction = config.currentPriority ?? "lowest-current";
    return [...candidates].sort((a, b) => {
      const aCurrent = a.measuredCurrent ?? 0;
      const bCurrent = b.measuredCurrent ?? 0;
      const currentOrder = direction === "lowest-current" ? aCurrent - bCurrent : bCurrent - aCurrent;
      return currentOrder || a.requestedAt - b.requestedAt || a.phase - b.phase;
    })[0];
  }
  return [...candidates].sort((a, b) => a.requestedAt - b.requestedAt || a.phase - b.phase)[0];
}

export function schedulerFairness(
  state: PhaseSchedulerState,
  time = state.lastUpdateAt,
  starvationThreshold = Infinity
): SchedulerFairness {
  assertFinite(time, "time");
  if (Number.isNaN(starvationThreshold) || starvationThreshold < 0) {
    throw new RangeError("starvationThreshold must not be negative or NaN");
  }
  const total = state.grantCount.reduce((sum, count) => sum + count, 0);
  const squares = state.grantCount.reduce((sum, count) => sum + count * count, 0);
  const jainIndex = squares === 0 ? 1 : (total * total) / (state.grantCount.length * squares);
  const grantSpread = Math.max(...state.grantCount) - Math.min(...state.grantCount);
  const observedWaits = state.maxWaitTime.map((maxWait, phase) => {
    const pending = state.pendingSince[phase];
    return Math.max(maxWait, pending === null || pending === undefined ? 0 : Math.max(0, time - pending));
  });
  const starvedPhases = state.pendingSince.flatMap((pending, phase) =>
    pending !== null && time - pending >= starvationThreshold ? [phase] : []
  );
  return {
    jainIndex,
    grantSpread,
    maxObservedWait: Math.max(0, ...observedWaits),
    starvedPhases
  };
}

export function schedulePulseRequests(
  config: PhaseSchedulerConfig,
  state: PhaseSchedulerState,
  time: number,
  requests: readonly PulseRequest[],
  starvationThreshold = Infinity
): SchedulerStepResult {
  validateSchedulerConfig(config);
  validateSchedulerState(config, state);
  assertFinite(time, "time");
  if (time < state.lastUpdateAt) throw new RangeError("scheduler time must be monotonic");
  const next = cloneState(state);
  next.lastUpdateAt = time;
  const phasesSeen = new Set<number>();
  requests.forEach((request) => {
    if (!Number.isInteger(request.phase) || request.phase < 0 || request.phase >= config.phaseCount) {
      throw new RangeError("request phase is outside configured range");
    }
    if (phasesSeen.has(request.phase)) throw new RangeError("at most one request per phase is allowed per step");
    phasesSeen.add(request.phase);
    assertFinite(request.requestedAt, "requestedAt");
    if (request.requestedAt > time) throw new RangeError("future request cannot be scheduled yet");
    if (request.eligibleAt !== undefined) assertFinite(request.eligibleAt, "eligibleAt");
    if (request.measuredCurrent !== undefined) assertFinite(request.measuredCurrent, "measuredCurrent");
    if (config.method === "current-priority" && request.measuredCurrent === undefined) {
      throw new RangeError("current-priority requests require measuredCurrent");
    }
    if (next.pendingSince[request.phase] === null) {
      next.pendingSince[request.phase] = request.requestedAt;
      next.requestCount[request.phase] = (next.requestCount[request.phase] ?? 0) + 1;
    }
  });

  const candidates = requests.filter((request) => (request.eligibleAt ?? request.requestedAt) <= time);
  const separationSatisfied =
    next.lastGlobalGrantAt === null || time - next.lastGlobalGrantAt >= (config.minimumSeparation ?? 0) - 1e-15;
  let selected: PulseRequest[] = [];
  if (config.method === "free-running") {
    selected = [...candidates];
  } else if (config.method !== "minimum-separation" || separationSatisfied) {
    const one = selectOne(config, next, candidates, time);
    if (one !== undefined) selected = [one];
  }

  const selectedPhases = new Set(selected.map((request) => request.phase));
  const decisions: SchedulerDecision[] = requests.map((request) => {
    if (selectedPhases.has(request.phase)) {
      return { phase: request.phase, status: "granted", reason: "selected by scheduler" };
    }
    const eligible = (request.eligibleAt ?? request.requestedAt) <= time;
    const reason = !eligible
      ? "phase minimum-off eligibility has not arrived"
      : config.method === "minimum-separation" && !separationSatisfied
        ? "global minimum pulse separation is active"
        : config.method === "ideal-fixed-spacing"
          ? "not this phase's fixed slot"
          : "another eligible phase was selected";
    return { phase: request.phase, status: eligible ? "delayed" : "waiting", reason };
  });

  const grants = selected.map((request) => {
    const pending = next.pendingSince[request.phase] ?? request.requestedAt;
    const waitTime = Math.max(0, time - pending);
    next.grantCount[request.phase] = (next.grantCount[request.phase] ?? 0) + 1;
    next.totalWaitTime[request.phase] = (next.totalWaitTime[request.phase] ?? 0) + waitTime;
    next.maxWaitTime[request.phase] = Math.max(next.maxWaitTime[request.phase] ?? 0, waitTime);
    next.pendingSince[request.phase] = null;
    next.lastGrantAt[request.phase] = time;
    if (config.method === "round-robin") next.nextRoundRobinPhase = (request.phase + 1) % config.phaseCount;
    if (config.method === "ideal-fixed-spacing") next.lastFixedSlotIndex = fixedSlotAt(config, time)?.key ?? next.lastFixedSlotIndex;
    return { phase: request.phase, requestedAt: request.requestedAt, grantedAt: time, waitTime };
  });

  decisions.forEach((decision) => {
    // `deniedCount` records explicit dropped requests only. Waiting or delayed
    // decisions may be observed many times while one request remains pending,
    // so counting those would make the metric depend on scheduler poll rate.
    if (decision.status === "denied") {
      next.deniedCount[decision.phase] = (next.deniedCount[decision.phase] ?? 0) + 1;
    }
  });

  if (grants.length > 0) {
    const tooCloseToPrevious =
      next.lastGlobalGrantAt !== null && time - next.lastGlobalGrantAt < (config.minimumSeparation ?? 0) - 1e-15;
    if (grants.length > 1) next.collisionCount += grants.length - 1;
    if (tooCloseToPrevious) next.collisionCount += grants.length;
    next.lastGlobalGrantAt = time;
  }
  return {
    state: next,
    grants,
    decisions,
    fairness: schedulerFairness(next, time, starvationThreshold)
  };
}
