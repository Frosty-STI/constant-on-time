# Capstone: build and defend a configurable multiphase COT model

The capstone is complete when you can explain every block, sign, state,
parameter, exclusion, and validation result. A waveform that merely resembles a
buck converter is not sufficient.

Use the supplied [`pspice/testbenches/capstone.cir`](../pspice/testbenches/capstone.cir)
only after building the same behavior progressively. It combines two mismatched
phases, adaptive on-time, fixed eligibility windows, per-phase current limit,
current balance, phase shedding, dead time, and line/load events. It is an
educational architecture, not a model of a named controller.

Cadence PSpice execution is still pending. See
[`pspice/validation-status.md`](../pspice/validation-status.md).

## Before stage 1

Write these on the first page of your lab record:

- positive `iL` direction;
- positive capacitor-current direction;
- high-side, low-side, and each dead-time current path;
- exact requested input/output/load range;
- selected abstraction level;
- what the model will not capture; and
- the analytical values for duty, `di/dt`, ripple, phase spacing, and CCM
  boundary at the nominal point.

For the checked-in nominal values (`VIN=12 V`, `VOUT=5 V`, `L=2 µH`,
`f=500 kHz`), predict before simulating:

- `D = 0.4167`;
- `TON = 833.3 ns` for the representative feed-forward law;
- on-slope `+3.5 MA/s`;
- off-slope `-2.5 MA/s`; and
- single-phase ripple `2.9167 A_pp` in the ideal CCM calculation.

Those are derived values for the stated ideal assumptions, not guaranteed
measurements after losses, scheduling, and feedback are enabled.

## Progressive build

### Stage 1 — Ideal buck phase

Start with `averaged_buck.cir`, then `switched_buck.cir`.

**Add:** VIN, complementary ideal switching, one L, one C, one load.

**Predict:** conversion ratio, both slopes, ripple, average inductor current,
average capacitor current.

**Accept only if:**

- steady output matches the correct ideal relationship for the selected model;
- measured on/off slopes match within the selected numerical tolerance;
- average inductor voltage and capacitor current approach zero in equilibrium;
- halving maximum step leaves averages and event order materially unchanged; and
- the averaged deck is never used to claim switching ripple.

**Still excluded:** loss, dead time, current limit, ripple comparator, DCM logic.

### Stage 2 — Nonideal buck phase

Open `nonideal_buck.cir`.

**Add separately:** DCR, channel resistance, capacitor ESR, dead time, diode
drop.

**Predict the sign:** more required duty, ESR-correlated ripple, low-side diode
clamp during positive-current dead time.

**Accept only if:** each effect appears when enabled and disappears when disabled;
energy and polarity remain credible; gate overlap is absent.

**Still excluded:** nonlinear Coss/Qrr, gate charge, thermal drift, layout ESL.

### Stage 3 — Single-phase COT controller

First isolate `COT_REQUEST` and `COT_ONESHOT`; then use
`single_phase_cot.cir`.

**Add:** feedback comparator, disclosed smoothing/hysteresis, delay state,
one-shot, minimum off-time, complementary gate driver.

**Predict:** which ripple crossing requests a pulse, expected width, earliest
next eligible time, nominal frequency range.

**Accept only if:** request, gate, ready, and switch node occur in the defended
order; measured `TON`/`TOFFMIN` converge with timestep; output regulation is
caused by threshold crossings rather than a hidden PWM clock.

**Still excluded:** universal commercial behavior, exact digital delay,
proprietary servo/ripple implementation.

### Stage 4 — Ripple-generation system

Separate natural and injected ripple.

**Add:** output ESR ripple on `FB`, then a separately plotted signal on
`RIPPLE`.

**Sweep:** natural ripple amplitude, injected amplitude, phase, delay, smoothing,
hysteresis, and zero-noise/noise cases.

**Accept only if:** comparator crossings are traceable to the plotted sum;
removing necessary ripple produces the predicted jitter/chatter/failure; wrong
phase is distinguishable from too little amplitude.

**Still excluded:** any claim that one ripple rule covers all COT controllers.

### Stage 5 — Current limiting

Use `current_limit.cir`.

**Add:** sense scale/offset, comparator, disclosed comparator delay,
trip-to-abort path, and minimum rearm time.

**Predict:** threshold current, delay overshoot `di/dt * delay`, truncated gate
width, output behavior under an impossible load demand.

**Accept only if:** sense polarity is correct; gate ends after trip in the
expected direction; current does not silently exceed the threshold without a
documented delay/slope reason; repeated limiting respects minimum off-time.

**Still excluded:** thermal protection, foldback, leading-edge current spikes
unless explicitly modeled.

### Stage 6 — Two-phase operation

Use `two_phase_cot.cir`.

**Add:** second identical phase and shared C/output/load.

**Predict:** per-phase average load current, summed ripple, 180° eligibility,
which pulses may overlap physically.

**Accept only if:** `ISUM=IMON1+IMON2`, both phases have correct sign/slope,
phase spacing matches the actual grants rather than nominal labels, and no phase
is assumed balanced merely because timing is symmetric.

### Stage 7 — Phase scheduling

Compare fixed windows with `PHASE_SCHEDULER.lib` policies.

**Add:** raw requests, permit/token, grants, denied/delayed indicators, global
separation if the policy claims it.

**Challenge:** simultaneous requests, a request just outside a window,
continuous phase-1 request, current-priority tie, disabled phase.

**Accept only if:** safety and fairness claims are stated as invariants and the
traces demonstrate them. `FIRST_ELIGIBLE_2` should demonstrate starvation risk;
it must not be mislabeled fair.

### Stage 8 — N-phase configurability

Generate a 2–8 phase deck:

```bash
python3 pspice/scripts/generate_multiphase.py \
  --phases 6 --scheduler fixed-window \
  --l-mismatch-pct 1.5 --dcr-mismatch-pct 3 \
  --output pspice/testbenches/generated_6phase.cir
```

**Verify for each N:** number of phase instances, phase start spacing, `ISUM`
terms, load per phase, per-phase current limit, and actual phase frequency.

**Accept only if:** generated source is preserved, input arguments are recorded,
and N-dependent behavior is measured rather than inferred. The generator’s
fixed-window/free-running choices do not represent every valid scheduler.

### Stage 9 — Current balancing

Use `mismatch.cir` and isolate one mismatch at a time.

**Add in order:** L mismatch, DCR mismatch, channel resistance, sense gain,
sense offset, timing skew, balance filter, bounded trim.

**Predict:** which phase carries more physical current; which monitor reports
more; trim polarity; approximate balance response time.

**Sweep:** `KBAL`, `BW`, and clamp. Observe output loop and phase currents.

**Accept only if:** the balance loop improves the chosen sharing metric without
creating unacceptable voltage-loop interaction; physical and sensed currents
are not conflated; perfect sharing is not forced.

### Stage 10 — Phase shedding

Use `phase_shedding.cir`.

**Add:** separate `ISHED`/`IADD`, state ramp, request gating, an enable-aware
driver that forces both FETs off, re-entry policy, and balance reset/enable
decision. Do not use PWM-low as phase disable in a synchronous stage; PWM-low
normally commands the low-side FET on.

**Predict:** active phase count for each load, output droop at re-entry, returning
phase current slew.

**Accept only if:** no partial unsafe gate pulse occurs, threshold chatter is
absent for a static in-band load, and phase re-entry does not inherit an
unbounded stale trim.

### Stage 11 — Delay and timing nonidealities

**Add one at a time:** comparator lag, phase skew, dead time, min on/off, max on,
blanking where applicable.

**Predict:** current overshoot from delay, pulse-width floor/ceiling, maximum
duty, phase-spacing error.

**Accept only if:** timing is cursor-measured at named thresholds and invariant
under appropriate timestep refinement. Remember: supplied `TDELAY` is a
first-order 50% approximation, not exact transport delay.

### Stage 12 — Component mismatch

Create a corner table rather than one random case:

| Corner | L | DCR | sense gain/offset | delay | ESR/C |
|---|---|---|---|---|---|
| symmetric nominal | nominal | nominal | ideal | nominal | nominal |
| physical mismatch | min/max | min/max | ideal | nominal | nominal |
| sensing mismatch | nominal | nominal | gain/offset min/max | nominal | nominal |
| timing mismatch | nominal | nominal | ideal | min/max | nominal |
| combined bounded | bounded set | bounded set | bounded set | bounded set | bounded set |

Use deterministic values before Monte Carlo. Preserve random seeds and realized
values if statistical analysis is later added.

### Stage 13 — Startup

Run:

- cold start at minimum/nominal/maximum VIN;
- no load and nominal load;
- phase 2 initially disabled and enabled;
- prebiased output below and above target; and
- contradictory IC as a deliberate fault, clearly labeled.

Measure output overshoot, time to regulation, first pulse width, current limit,
reverse current, phase-add timing, and balance-trim state. A controller that
regulates only from a hand-initialized steady state has not passed startup.

### Stage 14 — Load and line transients

Use `load_step.cir`, `line_step.cir`, and capstone events.

For each event, record:

- pre/post operating point;
- edge time;
- initial capacitor-current deficit;
- inductor current slew limit;
- output minimum/maximum and time;
- first pulse request/grant sequence;
- phase addition/removal;
- current-limit activity;
- settling criterion and time; and
- steady frequency per phase before/after.

Do not infer loop bandwidth from a single large-signal load step. Compare it to
an explicitly valid frequency-domain model/measurement when making bandwidth or
phase-margin claims.

### Stage 15 — Validation and adversarial debugging

Run every case below and write the expected symptom before the result:

- comparator `VHYST=0` with marginal ripple;
- timestep too coarse for dead time;
- wrong current-sense polarity;
- swapped phase permits;
- free-running simultaneous requests;
- balance disabled under mismatch;
- balance bandwidth made intentionally excessive;
- missing minimum off-time;
- current limit just below/above nominal peak;
- ripple injection with wrong phase;
- phase re-entry at the load-step edge;
- VIN low enough to hit `TONMAX`; and
- averaged model queried for switching ripple.

Use the [debugging guide](PSPICE_DEBUGGING_GUIDE.md). Passing the adversarial
cases means the model fails in the expected, explainable way and recovers when
the root cause is corrected; it does not mean forcing every case to look stable.

## Capstone signal dictionary

| Signal | Meaning | Scaling / sign |
|---|---|---|
| `IN` | input rail | volts |
| `OUT` | load terminal/output including ESR effect | volts |
| `NCAP` | ideal capacitor state-side node | volts |
| `LOADMON` | requested load-current profile at nominal regulation | 1 V/A |
| `LOADEN` | startup load-enable ramp | 0..1 V |
| `LOADACT` | ideal current load actually applied | 1 V/A |
| `SW1`, `SW2` | phase switch nodes | volts |
| `IMON1`, `IMON2` | measured phase currents | 1 V/A, positive into output |
| `SENSE1`, `SENSE2` | gain/offset-affected current-sense signals | 1 V/A nominal |
| `ISUM` | sum of current monitors | 1 V/A |
| `ICAPMON` | `ISUM-LOADACT-OUT/100` (includes checked-in bleed load) | 1 V/A |
| `REQC1`, `REQC2` | raw phase comparator requests | 0/5 V |
| `REQ1`, `REQ2` | scheduled/phase-enabled requests | 0/5 V |
| `PERMIT1`, `PERMIT2` | fixed eligibility windows | 0/1 V |
| `GATE1`, `GATE2` | one-shot PWM commands | 0/5 V |
| `GH1`/`GL1`, `GH2`/`GL2` | actual high-/low-side switch commands after dead time and enable | 0/5 V |
| `TRIP1`, `TRIP2` | current-limit trips | 0/5 V |
| `READY1`, `READY2` | minimum-off eligibility | 0/5 V |
| `TONMON` | adaptive time command | 1 V/s |
| `TRIM1`, `TRIM2` | current-balance feedback shifts | volts |
| `SHAREERR` | filtered monitor difference | 1 V/A |
| `ACTIVE2` | phase-2 enable state | 0/1 V |
| `SHEDSTATE` | analog phase-shed memory | 0..1 V |

## Capstone parameter ownership

The complete requested parameter space is distributed across blocks:

| Parameter family | Where represented |
|---|---|
| VIN, target, load, C, ESR | top-level testbench |
| phase count | generator / number of instances |
| L, DCR, RHS, RLS, monitor export scale | `BUCK_PHASE` instance |
| fixed/adaptive on-time law, min/max on, min off | COT controller/one-shot |
| dead time / phase-disable gate state | `COMPLEMENTARY_DRIVER`; enable-aware wrapper for a shed phase |
| body-diode drop | `D_BODY_COTLAB` model (global library model) |
| current-sense gain/offset | explicit ABM `SENSEk` source at caller |
| current limit and limit-comparator delay | `COT_CURRENT_LIMIT` threshold / `TDELAY` |
| comparator smoothing, hysteresis, delay | `COT_REQUEST` |
| injected ripple amplitude/source/phase | top-level `RIPPLE` source |
| balance gain/bandwidth/clamp | `CURRENT_BALANCE_2` |
| phase separation/scheduler | permits or scheduler library |
| mismatch | per-instance values / generator options |
| shed/re-entry thresholds | `PHASE_SHEDDING_2` |

Not every requested commercial-style parameter is a single knob in
`capstone.cir`; plain-text ownership is kept explicit. If a parameter is added,
state which equation or physical element it changes.

## Required validation matrix

| Test | VIN | Load | Mismatch | Phase mode | Primary acceptance evidence |
|---|---:|---:|---|---|---|
| ideal steady state | nominal | nominal | off | all on | slopes, ripple, balances |
| low/high line | min/max | nominal | off | all on | `TON` law, regulation, duty limit |
| light load | nominal | light | off | shed | reverse/DCM limitation disclosed |
| load step up/down | nominal | min↔max | off | dynamic | droop/overshoot, pulse allocation |
| current limit | min VIN | overload | off | all on | trip/gate/current sequence |
| physical mismatch | nominal | nominal | L/DCR/R | all on | physical current split |
| sense mismatch | nominal | nominal | gain/offset | all on | reported vs physical split |
| timing mismatch | nominal | nominal | delay/skew | all on | actual spacing and current split |
| balance BW sweep | nominal | nominal | combined | all on | sharing and voltage interaction |
| phase shed/re-entry | nominal | ramp/step | bounded | 1↔2 | safe gates and current slew |
| ripple failure | nominal | nominal | off | all on | crossings/jitter tied to ripple |
| timestep refinement | nominal | selected worst | selected worst | selected worst | numerical convergence |

## Model-defense questions

You should be able to answer, without opening the guide:

1. What physically carries current during each gate/dead-time state?
2. Why is each body diode oriented as drawn?
3. Which equation determines `diL/dt` at the cursor?
4. What is stored in each capacitor, including controller-state capacitors?
5. What starts a pulse? What ends it? What prevents the next one?
6. Which signal is natural ripple and which is injected ripple?
7. Why can frequency vary even with an adaptive on-time law?
8. How does current limit terminate a pulse, and what delay overshoot remains?
9. What does the scheduler guarantee, and what does it not guarantee?
10. Why does equal phase spacing not guarantee current sharing?
11. What metric does the balance loop equalize: physical, sensed average, peak,
    or valley current?
12. Why is the balance loop bandwidth selected separately from voltage-loop
    behavior?
13. What state is preserved while load lies between shed/add thresholds?
14. Which observed edge features are missing because Coss/Qrr/layout ESL are
    absent?
15. What evidence separates an instability from a timestep artifact?
16. Why would an alternative-SPICE pass not establish PSpice compatibility?

## Completion report template

```markdown
# Capstone validation report

## Model identity
- Commit / file hashes:
- PSpice version and hotfix:
- Invocation and working directory:

## Architecture
- Pulse start / end / eligibility:
- Ripple source and phase:
- Scheduler policy and invariants:
- Current-balance metric and bandwidth:
- Phase-shed/re-entry policy:

## Abstractions and exclusions
- Power stage:
- Comparator / delay / one-shot:
- Sensing:
- Scheduler:
- Thermal/device/layout omissions:

## Analytical baseline
- Duty / TON:
- On/off slope:
- Ripple:
- CCM boundary:
- Phase spacing / effective frequency:

## Results
- Startup:
- Steady state and balances:
- Load step:
- Line step:
- Mismatch/current sharing:
- Current limit:
- Phase shedding/re-entry:
- Fault/adversarial cases:
- Timestep/tolerance refinement:

## PSpice messages
- Warnings:
- Convergence options/changes:

## Discrepancies and disposition
- Expected vs observed:
- Root cause or remaining hypothesis:

## Final status
- Passed:
- Failed:
- Inconclusive:
- Remaining PSpice work:
```

## First exact action

Run the non-PSpice checks first:

```bash
python3 pspice/scripts/netlist_lint.py
python3 pspice/scripts/analytical_checks.py
```

Then, on a machine with Cadence PSpice A/D, run only
`pspice/testbenches/averaged_buck.cir`. Preserve its `.out` file and compare its
measurements with the analytical baseline before opening the switched deck.
