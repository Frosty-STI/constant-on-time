# `@constant-on-time/sim-core`

Deterministic, UI-independent TypeScript models for Constant On-Time Lab. The
package deliberately separates physical switching models, analytical models,
controller event logic, and presentation. It performs no file, network,
telemetry, clock, or browser-storage access.

## Model boundary

The switched plant uses one inductor-current state per phase and one shared
ideal-capacitor voltage state. Current is positive from each switch node,
through its inductor, into the output. Capacitor current is positive into the
capacitor:

```text
diL[k]/dt = (vSW[k] - vOUT - iL[k] * DCR[k]) / L[k]
dvC/dt    = (sum(iL[k]) - iLOAD) / C
```

The actual switch-node voltage comes from the active conduction path:

| Conduction path | `vSW` model | Reverse current |
| --- | --- | --- |
| High-side MOSFET | `VIN - iL * RHS` | Returns energy to the input |
| Low-side MOSFET | `-iL * RLS` | Allowed in synchronous mode |
| Low-side body diode | `-VD` | Forward freewheel only |
| High-side body diode | `VIN + VD` | Used for negative dead-time current |
| Open / diode emulation at zero | `vOUT`, `diL/dt = 0` | Clamped at zero |

This distinction matters during dead time. Positive inductor current commutates
through the low-side body diode, while negative current commutates through the
high-side body diode unless asynchronous or diode-emulation behavior forbids
reverse current.

Capacitor ESR is solved together with supported linear loads rather than through
an unreported algebraic iteration:

```text
vOUT = [vC + ESR * (sum(iL) - ICONST)] / [1 + ESR / RLOAD]
```

Optional capacitor ESL is intentionally an **output-only first-difference
estimate**, `ESL * d(iC)/dt`. It appears in the reported terminal voltage but
does not feed back into the state equations. That is useful for explaining an
edge spike, not for predicting an ESL resonance. A higher-order capacitor model
is required for that job.

## Numerical method and events

`rk4Step` is classical explicit fourth-order Runge-Kutta. It is understandable
and accurate on each smooth interval, but it does not discover events. Known PWM
edges, controller edges, and load-step times must split an integration interval.
`simulateBuckPlant`, `pwmEventTimes`, `integrateTo`, and `stepToNextEvent` support
that workflow. A declared load step is evaluated on the left side while
integrating to the boundary and on the right side in the returned sample.

`assessTimeStep` reports when the requested interval is too coarse relative to:

- switching period;
- interleaved edge spacing;
- minimum on-time and off-time;
- dead time;
- comparator delay; or
- ripple timing.

RK4 is explicit and is not a SPICE solver. It has no Newton iteration, adaptive
local-truncation-error control, parasitic node capacitance, or automatic
stiffness handling. Ideal discontinuities can still be under-resolved. Diode
emulation clamps a step that crosses zero; exact zero-crossing interpolation is
not claimed.

## Controllers

The COT controller is a generic educational one-shot, not a replica of a
particular commercial controller. It provides:

- fixed on-time or the adaptive feedforward law `ton = VOUT,target/(VIN*fNOM)`;
- minimum and maximum on-time clamps;
- minimum off-time;
- comparator hysteresis and delay;
- explicit natural ripple, injected ripple, and noise inputs;
- scheduler-held pulse requests;
- cycle current limit after minimum on-time; and
- deterministic sine, triangle, or sawtooth ripple helpers with source metadata.

Call `stepCotController` at comparator samples and each returned `nextEventAt`.
A multiphase scheduler can call it once with `grantPulse: false`, arbitrate the
qualified requests, and call the winning phase with `grantPulse: true`.

The peak-current module is a simplified fixed-frequency sampled-data cycle map.
It shows the alternating-cycle pole

```text
lambda = (ma - m2) / (m1 + ma)
```

and the corresponding ideal criterion `ma > (m2 - m1)/2`. Its returned
assumptions are part of the API. The criterion does not include blanking,
propagation delay, saturation, discontinuous conduction, a moving outer-loop
command, or a commercial controller's internal implementation. Those timing
effects are available in the cycle simulation but are excluded from the
closed-form eigenvalue on purpose.

## Multiphase support

The plant supports arbitrary phase arrays. Per-phase parameters include L, DCR,
MOSFET resistance, diode drop, sense gain and offset, and timing error. PWM
helpers support explicit normalized phase offsets plus additive timing mismatch.

Schedulers include:

- ideal fixed spacing;
- first eligible;
- round robin;
- minimum separation;
- lowest- or highest-current priority; and
- simplified free running.

Their state records requests, grants, denials, wait time, collisions, Jain's
fairness index, and threshold-based starvation. These are behavioral teaching
architectures, not claims about any vendor's pulse-allocation method.

`updateCurrentBalance` implements a differential PI trim. It removes common mode
so the current-sharing loop does not directly replace the voltage-regulation
loop. It warns when declared current-sharing bandwidth reaches one third of the
voltage-loop bandwidth, a visible caution rather than a universal stability
boundary.

## Analytical helpers

The analytical module supplies ideal duty, slopes, ripple, CCM boundary,
volt-second and charge residuals, exact ideal interleaved triangular-ripple
cancellation, and output-ripple estimates. The Bode module supplies:

- a CCM voltage-mode duty-to-output approximation;
- passive output impedance;
- Type I, II, and III pole-zero compensators;
- explicit modulator and feedback gain;
- optional pure delay;
- loop and closed-loop response; and
- crossover, phase-margin, phase-crossover, and gain-margin extraction.

The small-signal plant omits switching sampling, controller-specific modulation,
and most parasitics. It must not be silently combined with a switched trace or
used near switching frequency as though it were exact.

## Scenario safety

Versioned JSON scenarios validate finite values, physical ranges, controller
timing, phase counts, load-step ordering, and schema version. Export order is
stable for reproducible fixtures. Imported JSON is limited to 5 MB and cloned
before return. `SeededRandom`, `indexedGaussian`, and `gaussianMismatch` make
noise and mismatch repeatable without using global randomness.

## Minimal example

```ts
import {
  createBuckPlantState,
  pwmDrivesAt,
  pwmEventTimes,
  simulateBuckPlant
} from "@constant-on-time/sim-core";

const plant = {
  vin: 12,
  capacitance: 100e-6,
  capacitorEsr: 5e-3,
  phases: [{ inductance: 1e-6 }, { inductance: 1e-6 }],
  load: { initial: { kind: "constant-current", current: 10 } }
} as const;

const pwm = { switchingFrequency: 500e3, dutyRatio: 5 / 12 };
const state = createBuckPlantState(plant, {
  vCap: 5,
  phaseCurrents: [5, 5]
});

const result = simulateBuckPlant(plant, {
  startState: state,
  stopTime: 20e-6,
  maxStep: 2e-9,
  driveAt: (time) => pwmDrivesAt(time, 2, pwm),
  eventTimes: pwmEventTimes(0, 20e-6, 2, pwm)
});
```

## Verification

Run from this directory:

```bash
npm install
npm run check
npm test
npm run build
```

The tests target equations and state evolution rather than screenshots. They
cover ideal conversion and ripple, volt-second and charge balance, CCM boundary,
RK4 accuracy and event stops, all switch/dead-time paths, reverse-current and
diode-emulation behavior, ESR/ESL behavior, shared N-phase state, phase symmetry
and mismatch, load steps, COT timing and limiting, adaptive on-time, injected
ripple, sampled-data slope compensation, scheduling fairness/starvation,
current balancing, deterministic seeds, Bode helpers, scenario validation, and
nonfinite-value rejection.

## Known limitations

- No semiconductor charge, switching loss, nonlinear capacitance, magnetic
  saturation, thermal state, or EMI model.
- No adaptive time-step or automatic event/root discovery.
- The output-only ESL approximation does not model resonance.
- The COT, peak-current, scheduler, and sharing blocks are generic educational
  abstractions.
- The Bode plant is a CCM continuous-time approximation.
- This package is not a PSpice compatibility validator. Matching it does not
  prove that a PSpice netlist is syntactically or numerically valid.
