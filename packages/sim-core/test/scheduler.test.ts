import { describe, expect, it } from "vitest";
import {
  createSchedulerState,
  schedulePulseRequests,
  schedulerFairness,
  type PhaseSchedulerConfig
} from "../src/scheduler.js";

describe("multiphase pulse schedulers", () => {
  it("demonstrates starvation risk in a deterministic first-eligible tie", () => {
    const config: PhaseSchedulerConfig = { method: "first-eligible", phaseCount: 2 };
    let state = createSchedulerState(config);
    for (let index = 0; index < 10; index += 1) {
      state = schedulePulseRequests(
        config,
        state,
        index * 1e-6,
        [
          { phase: 0, requestedAt: 0 },
          { phase: 1, requestedAt: 0 }
        ],
        5e-6
      ).state;
    }
    expect(state.grantCount).toEqual([10, 0]);
    expect(schedulerFairness(state, 10e-6, 5e-6).starvedPhases).toContain(1);
    expect(schedulerFairness(state).jainIndex).toBeCloseTo(0.5, 12);
  });

  it("round robin eliminates persistent tie starvation", () => {
    const config: PhaseSchedulerConfig = { method: "round-robin", phaseCount: 4 };
    let state = createSchedulerState(config);
    for (let index = 0; index < 40; index += 1) {
      state = schedulePulseRequests(
        config,
        state,
        index * 1e-6,
        Array.from({ length: 4 }, (_, phase) => ({ phase, requestedAt: 0 }))
      ).state;
    }
    expect(state.grantCount).toEqual([10, 10, 10, 10]);
    expect(schedulerFairness(state).jainIndex).toBeCloseTo(1, 12);
    expect(schedulerFairness(state).grantSpread).toBe(0);
  });

  it("enforces global minimum pulse separation", () => {
    const config: PhaseSchedulerConfig = {
      method: "minimum-separation",
      phaseCount: 2,
      minimumSeparation: 200e-9
    };
    let result = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0 }
    ]);
    expect(result.grants).toHaveLength(1);
    result = schedulePulseRequests(config, result.state, 100e-9, [{ phase: 1, requestedAt: 100e-9 }]);
    expect(result.grants).toHaveLength(0);
    expect(result.decisions[0]?.status).toBe("delayed");
    expect(result.decisions[0]?.reason).toMatch(/minimum pulse separation/);
    result = schedulePulseRequests(config, result.state, 200e-9, [{ phase: 1, requestedAt: 100e-9 }]);
    expect(result.grants[0]?.phase).toBe(1);
    expect(result.grants[0]?.waitTime).toBeCloseTo(100e-9, 15);
  });

  it("reports minimum-off ineligibility as waiting without poll-dependent denials", () => {
    const config: PhaseSchedulerConfig = { method: "round-robin", phaseCount: 2 };
    let result = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0, eligibleAt: 1e-6 }
    ]);
    expect(result.decisions[0]?.status).toBe("waiting");
    expect(result.state.deniedCount).toEqual([0, 0]);
    result = schedulePulseRequests(config, result.state, 0.5e-6, [
      { phase: 0, requestedAt: 0, eligibleAt: 1e-6 }
    ]);
    expect(result.state.deniedCount).toEqual([0, 0]);
  });

  it("explicitly drops an aged request once a configured deadline expires", () => {
    const config: PhaseSchedulerConfig = { method: "round-robin", phaseCount: 2, maximumRequestAge: 500e-9 };
    let result = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0, eligibleAt: 1e-6 }
    ]);
    expect(result.decisions[0]?.status).toBe("waiting");
    result = schedulePulseRequests(config, result.state, 500e-9, [
      { phase: 0, requestedAt: 0, eligibleAt: 1e-6 }
    ]);
    expect(result.decisions[0]).toMatchObject({ status: "denied", phase: 0 });
    expect(result.state.deniedCount).toEqual([1, 0]);
    expect(result.state.pendingSince[0]).toBeNull();
    expect(result.grants).toHaveLength(0);
  });

  it("cancels an omitted active request before counting a later request as new", () => {
    const config: PhaseSchedulerConfig = { method: "round-robin", phaseCount: 2 };
    let result = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0 },
      { phase: 1, requestedAt: 0 }
    ]);
    expect(result.grants[0]?.phase).toBe(0);
    expect(result.state.pendingSince[1]).toBe(0);

    result = schedulePulseRequests(config, result.state, 1e-6, []);
    expect(result.cancelledPhases).toEqual([1]);
    expect(result.state.pendingSince[1]).toBeNull();
    expect(result.fairness.starvedPhases).toEqual([]);

    result = schedulePulseRequests(config, result.state, 20e-6, [
      { phase: 1, requestedAt: 20e-6 }
    ]);
    expect(result.state.requestCount[1]).toBe(2);
    expect(result.grants[0]).toMatchObject({ phase: 1, requestedAt: 20e-6, waitTime: 0 });
  });

  it("rejects silently replacing a still-active request timestamp", () => {
    const config: PhaseSchedulerConfig = { method: "minimum-separation", phaseCount: 1, minimumSeparation: 1e-6 };
    const granted = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0 }
    ]);
    const pending = schedulePulseRequests(config, granted.state, 100e-9, [
      { phase: 0, requestedAt: 100e-9 }
    ]);
    expect(() => schedulePulseRequests(config, pending.state, 200e-9, [
      { phase: 0, requestedAt: 200e-9 }
    ])).toThrow(/keep its original requestedAt/);
  });

  it("uses the under-current phase for lowest-current priority", () => {
    const config: PhaseSchedulerConfig = { method: "current-priority", phaseCount: 3 };
    const result = schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0, measuredCurrent: 4.8 },
      { phase: 1, requestedAt: 0, measuredCurrent: 5.2 },
      { phase: 2, requestedAt: 0, measuredCurrent: 4.5 }
    ]);
    expect(result.grants[0]?.phase).toBe(2);
  });

  it("reports deliberate collisions for free-running phases", () => {
    const config: PhaseSchedulerConfig = {
      method: "free-running",
      phaseCount: 3,
      minimumSeparation: 100e-9
    };
    const result = schedulePulseRequests(
      config,
      createSchedulerState(config),
      0,
      Array.from({ length: 3 }, (_, phase) => ({ phase, requestedAt: 0 }))
    );
    expect(result.grants).toHaveLength(3);
    expect(result.state.collisionCount).toBe(2);
  });

  it("grants once at each exact ideal fixed slot rather than throughout a sector", () => {
    const config: PhaseSchedulerConfig = {
      method: "ideal-fixed-spacing",
      phaseCount: 4,
      basePeriod: 1e-6
    };
    const requests = Array.from({ length: 4 }, (_, phase) => ({ phase, requestedAt: 0 }));
    let result = schedulePulseRequests(config, createSchedulerState(config), 0, requests);
    expect(result.grants[0]?.phase).toBe(0);
    result = schedulePulseRequests(config, result.state, 0, requests);
    expect(result.grants).toHaveLength(0);
    result = schedulePulseRequests(config, result.state, 0.24e-6, requests);
    expect(result.grants).toHaveLength(0);
    result = schedulePulseRequests(config, result.state, 0.25e-6, requests);
    expect(result.grants[0]?.phase).toBe(1);
    result = schedulePulseRequests(config, result.state, 0.26e-6, requests);
    expect(result.grants).toHaveLength(0);
  });

  it("requires an actual current measurement for current-priority arbitration", () => {
    const config: PhaseSchedulerConfig = { method: "current-priority", phaseCount: 2 };
    expect(() => schedulePulseRequests(config, createSchedulerState(config), 0, [
      { phase: 0, requestedAt: 0 },
      { phase: 1, requestedAt: 0, measuredCurrent: 5 }
    ])).toThrow(/require measuredCurrent/);
  });

  it("rejects duplicate and future requests", () => {
    const config: PhaseSchedulerConfig = { method: "round-robin", phaseCount: 2 };
    const state = createSchedulerState(config);
    expect(() =>
      schedulePulseRequests(config, state, 0, [
        { phase: 0, requestedAt: 0 },
        { phase: 0, requestedAt: 0 }
      ])
    ).toThrow(/one request per phase/);
    expect(() => schedulePulseRequests(config, state, 0, [{ phase: 0, requestedAt: 1 }])).toThrow(/future/);
  });
});
