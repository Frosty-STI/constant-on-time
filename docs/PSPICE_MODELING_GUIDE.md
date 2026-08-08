# PSpice modeling guide for buck and constant-on-time systems

This guide explains how to choose, construct, and validate a model. It is not a
claim that the supplied decks have already run in Cadence PSpice. Check
[`pspice/validation-status.md`](../pspice/validation-status.md) for the execution
boundary.

## 1. Choose the question before the fidelity

A “more detailed” model is not automatically a better answer. Start with the
smallest abstraction that contains the behavior being questioned.

| Question | Minimum useful model | Behavior intentionally absent |
|---|---|---|
| DC conversion and slow LC response | Averaged CCM phase | Ripple, pulse timing, DCM, dead time |
| Inductor slopes and ripple | Ideal switched phase | Conduction loss, diode details, gate dynamics |
| Loss-related duty shift and dead-time path | Nonideal behavioral phase | Nonlinear MOSFET capacitance, thermal state |
| Voltage-mode loop shape | Averaged plant + linear compensator/modulator | Switching harmonics and sampled-data effects |
| Peak-current pulse event order | Switched phase + clock/set/current-reset logic | Full sampled-data small-signal model |
| COT ripple crossing, jitter, min timing | Switched phase + comparator + one-shot | Proprietary controller internals |
| Phase collision and fairness | Multiple behavioral phases + explicit scheduler | RTL implementation and metastability |
| Switching loss or edge ringing | Manufacturer device model + extracted parasitics | Board-wide electromagnetic coupling unless added |
| Silicon-level controller behavior | Transistor/macro model with verified IP | Anything not exposed by that model |

Move down the table only after the current level passes analytical tests. A
detailed model that has not passed an ideal slope check is harder to debug, not
more credible.

## 2. Declare the state and signs

For phase `k`, the supplied sign convention is

\[
i_{L,k}>0:\quad v_{SW,k}\rightarrow L_k\rightarrow v_o.
\]

The shared capacitor current is a derived physical relationship:

\[
i_C=\sum_{k=1}^{N}i_{L,k}-i_{load}, \qquad
\frac{dv_C}{dt}=\frac{i_C}{C}.
\]

These equations follow KCL and the passive sign convention. They are exact for
the stated lumped circuit; `vOUT=vC+ESR*iC` is exact only for the selected series
ESR model and excludes ESL. In the PSpice ladder, the capacitor and ESR are
physical series elements, so the simulator solves this relation rather than an
ABM source imposing it.

For the steady-state, state-variable, and averaged-model foundations behind
these relationships, see Erickson and Maksimović, *Fundamentals of Power
Electronics*, 3rd ed., “Principles of Steady-State Converter Analysis” and
“Circuit Averaging, Averaged Switch Modeling, and Simulation”
([Springer](https://link.springer.com/book/10.1007/978-3-030-43881-4),
`FPE3`, accessed 2026-08-08).

With positive current, the nominal inductor equations are:

| Conducting state | Approximate switch node | Inductor equation |
|---|---:|---|
| High-side channel | `VIN - iL*RHS` | `L di/dt = VIN - vOUT - iL(RHS+DCR)` |
| Low-side channel | `iL*RLS` above ground | `L di/dt = -vOUT - iL(RLS+DCR)` |
| Both off, positive current | approximately `-VF` | `L di/dt = -VF - vOUT - iL*DCR` |
| Both off, negative current | approximately `VIN+VF` | `L di/dt = VIN+VF-vOUT-iL*DCR` |

For an enabled synchronous low-side channel, negative current can flow through
that channel. For diode emulation, the controller must instead disable the
channel near zero and provide a discontinuous zero-current state. The supplied
`BUCK_PHASE` does not autonomously implement diode emulation; the controller
must command it.

## 3. Stage 1: averaged CCM plant

`BUCK_AVERAGED` creates

\[
v_{SW,avg}=d\,v_{in},\qquad 0\le d\le1.
\]

With zero series loss in equilibrium, inductor volt-second balance gives

\[
d(V_{in}-V_o)+(1-d)(-V_o)=0
\quad\Rightarrow\quad V_o=dV_{in}.
\]

This is a derived result under CCM, equilibrium, ideal switch paths, and a duty
input independent of ripple. It is not a universal identity. With DCR and
channel loss, the required duty increases. In DCM, duty, load, L, and frequency
are coupled. Near switching frequency, an averaged model has discarded the
events being questioned.

Use `averaged_buck.cir` first to check:

1. steady-state `VOUT`;
2. average `IMON` versus load;
3. average inductor voltage near zero; and
4. average capacitor current near zero.

Only then add control-loop dynamics.

## 4. Stage 2: explicit switching state

`BUCK_PHASE` uses two voltage-controlled switches and two body diodes. Channel
resistances are separate elements so one subcircuit can vary them without
parameterized `.MODEL` ambiguity. A zero-volt series source measures inductor
current; its ABM output `IMON` is scaled in V/A.

For the nominal ideal deck:

\[
d=5/12=0.4167,
\]

\[
m_{on}=\frac{12-5}{2\ \mu H}=3.5\ MA/s,
\qquad
m_{off}=\frac{-5}{2\ \mu H}=-2.5\ MA/s,
\]

\[
\Delta i_L=m_{on}t_{on}=2.9167\ A_{pp}.
\]

Those are exact arithmetic results for the stated ideal piecewise-linear model.
They are the quickest detector of a sign, gate, duty, or unit error.

The first transient maximum step should resolve the smallest meaningful event,
not merely the switching period. A useful initial condition for these 500 kHz
decks is 5 ns or less, then a convergence check at 2.5 ns. This is a project
choice, not a universal rule; shorter dead time, delay, or edge dynamics require
smaller steps.

## 5. Add one nonideality at a time

Recommended sequence:

1. inductor DCR;
2. high-side resistance;
3. low-side resistance;
4. capacitor ESR;
5. dead time and body-diode drop;
6. current-sense gain/offset;
7. propagation timing;
8. L/DCR/timing mismatch;
9. device capacitance and reverse recovery only when the question needs them;
10. thermal dependence only after electrical behavior is stable.

For every addition, predict the sign before running. For example, series loss
should increase the duty required for the same output. ESR should add a component
of output ripple in phase with capacitor current. Dead time should expose the
appropriate diode clamp. If the result moves in the opposite direction, inspect
signs before retuning control parameters.

## 6. PSpice ABM patterns used here

Cadence documents analog behavioral controlled sources and expression-based
parts in Chapter 6 of the *PSpice A/D User Guide* (`CAD-PSPICE-UG`). The ladder
uses the corresponding netlist pattern:

```spice
Ename output 0 VALUE={expression}
Gname output 0 VALUE={expression}
```

and the functions `IF`, `LIMIT`, and `TANH`. It uses parameter braces for
component values and subcircuit parameters. See the
[Cadence-hosted guide](https://resources.pcb.cadence.com/i/1180526-pspice-user-guide/330)
(accessed 2026-08-08).

Three modeling rules matter:

- **Bound impossible commands.** Duty, logic normalization, trim, and on-time
  commands use `LIMIT`.
- **Do not hide discontinuities.** `TANH` smoothing is visible as `VSOFT`; hard
  output decisions remain visible as `IF`.
- **Give memory a physical state.** Timers, lockouts, averaging filters, and the
  phase-shed state use capacitors. A direct output-to-input algebraic latch is
  avoided where possible.

## 7. Comparator, hysteresis, and delay

An ideal comparator can force repeated Newton iterations at a threshold. The
`COT_REQUEST` input characteristic is smoothed:

\[
v_{raw}=\frac{V_L}{2}\left[1+\tanh\left(
\frac{v_{ref}-v_{fb}-v_{ripple}+v_h}{V_{soft}}\right)\right].
\]

`VHYST` supplies state-dependent bounded feedback through the delayed request.
`VSOFT` and `VHYST` are different concepts: smoothing makes the numerical
transition finite; hysteresis creates different effective rising/falling
thresholds.

The delay network is first order, with its 50% crossing tuned near `TDELAY`.
That is an engineering approximation. It attenuates and distorts narrow pulses,
unlike ideal transport delay. Replace it with a target-release-supported PSpice
delay primitive only after confirming initialization, interpolation, and syntax
in that release. Cadence documents delay-capable ABM/Laplace constructs in the
same user guide; portability is not assumed.

## 8. One-shot construction

The supplied one-shot is a transparent analog state machine:

1. `REQ` and `READY` close two series switches.
2. The timer capacitor charges toward `VLOGIC`.
3. A start comparator near full scale charges the off-lock state.
4. `QRAW` rises and holds the off-lock state while the timer remains above
   `VTH`.
5. A controlled current removes
   `CTIMER*(STARTFRAC*VLOGIC-VTH)/TON`, so the ideal discharge duration from
   the start threshold to `VTH` is `TON`.
6. When the timer reaches `VTH`, `QRAW` falls and the lock capacitor decays.
7. `READY` returns after the lock crosses 50%, approximately `TOFFMIN` later.
8. `INHIBIT` discharges the timer and truncates the active gate.

This exposes every state but introduces switch resistance, capacitor thresholds,
solver interpolation, and trigger latency. Measure the actual pulse width; do
not assume the parameter is the result. The dynamic-command version continuously
uses `TONCMD` during discharge. If the target architecture samples VIN or a
time command at pulse start, add and validate an explicit sample/hold state;
do not silently treat the supplied continuous command as equivalent.

## 9. Fixed and adaptive on-time

In the fixed model, the pulse end is the one-shot expiration. The next start is
a comparator request after minimum-off eligibility. Therefore “constant on-time”
does not mean constant period.

The adaptive example uses

\[
t_{on}=T_{period}\frac{V_{ref}}{V_{in}}
\]

with min/max clamps. In the ideal lossless case this tends to keep the nominal
period near `Tperiod`, but propagation delay, load, ripple crossing, loss, and
limits still alter frequency. Commercial controllers use several different
on-time laws and ripple/servo architectures; the deck is representative only.

Natural ripple is already present when `FB=OUT` and the output has ESR. An
injected waveform belongs on `RIPPLE`. Before adding it, plot both separately and
record amplitude and phase at the comparator. Do not add a synthetic copy of
the same ESR ripple twice.

Ridley treats constant-frequency, constant-on-time, and constant-off-time
current-mode cases in one modeling framework
([IEEE](https://ieeexplore.ieee.org/document/131213/), `RIDLEY-1990-COT`,
accessed 2026-08-08). TI’s adaptive-on-time study is a useful representative
vendor architecture, but its D-CAP-specific choices are not definitions of all
COT controllers ([TI](https://www.ti.com/lit/pdf/slva281), `TI-SLVA281`,
accessed 2026-08-08).

## 10. Peak-current model boundary

The `PEAK_CURRENT_CONTROLLER` demonstrates:

- clock set event;
- sensed-current plus compensation-ramp comparison;
- leading-edge blank input;
- comparator trip;
- pulse reset; and
- maximum on-time.

It does not by itself establish a rigorous sampled-data small-signal model or a
universal slope-compensation criterion. Ray Ridley’s current-mode control model
is a primary reference for dynamics beyond the simple event animation:
[IEEE record](https://doi.org/10.1109/63.76813)
(`RIDLEY-1991`, accessed 2026-08-08). Treat any alternating-cycle result as
dependent on the selected discrete model, ramp definitions, and duty.

## 11. Multiphase construction

Parallel phases share only `VIN`, `OUT`, and the load by default. They do not
automatically share current or schedule fairly.

Build in this order:

1. identical phases with explicit `360°/N` eligibility;
2. verify per-phase frequency and actual firing intervals;
3. deliberately remove spacing and observe collisions;
4. add L and DCR mismatch;
5. add sense gain and offset mismatch separately;
6. add a current-balance trim with bounded authority;
7. sweep balance bandwidth while observing the voltage loop;
8. add phase-shed thresholds and a re-entry ramp;
9. test load steps at the exact shed/add boundary; and
10. test fairness over a long interval, not just one period.

The fixed-window decks permit one request opportunity per phase per nominal
period. The one-shot can outlast its eligibility window; the window schedules
the start, not the full power pulse. Free-running mode in the generator is
intentionally allowed to collide so the learner can see why coordination exists.

For the physical phase-count, spacing, and ripple-cancellation baseline, see
TI’s *Multiphase Buck Design From Start to Finish (Part 1)*
([TI](https://www.ti.com/lit/an/slva882/slva882.pdf), `TI-SLVA882`, accessed
2026-08-08). Its design workflow is useful background, not evidence that the
educational scheduler reproduces a TI controller.

## 12. Current balance

For two phases, the block computes filtered currents and

\[
e_i=\bar i_1-\bar i_2,
\quad
trim_1=+\operatorname{limit}(K_b e_i/2),
\quad
trim_2=-trim_1.
\]

Each positive trim is added to local feedback, reducing that phase’s pulse
requests. This polarity is checked by `analytical_checks.py`. The filter is a
first-order representation of average-current information, not a DCR thermal
model. Balance bandwidth must be checked in the context of the voltage loop;
“slower” is a starting architecture choice, not proof of stability.

The distinction between an average-current share bus and the main regulation
loop is illustrated by Huang, Schuellein, and Clavette
([Infineon](https://www.infineon.com/dgdl/multiphasebuckapec03.pdf?fileId=5546d462533600a4015357447b2d3f6b),
`INFINEON-APEC03`, accessed 2026-08-08). The supplied two-phase trim is simpler
and should not be read as an implementation of that architecture.

## 13. Phase shedding

The shed state charges above `IADD`, discharges below `ISHED`, and holds between
them. Separate thresholds prevent a static load near one threshold from causing
immediate toggling. `TRAMP` makes activation finite.

Still inspect for:

- a partially cut gate pulse when disable changes;
- returning-phase current overshoot;
- stale balance integrator/trim state;
- output droop while the returning inductor current slews; and
- re-entry chatter caused by the load/current estimate.

The supplied phase-shedding and capstone decks gate new requests and use
`COMPLEMENTARY_DRIVER_ENABLE` to force **both** FETs off when a phase is
disabled. Forcing only PWM low is not a safe disable for a synchronous phase:
the ordinary complementary driver interprets it as low-side conduction. The
wrapper remains a behavioral safe-state abstraction; a production architecture
may require pulse-boundary handoff, zero-current confirmation, or stricter
re-entry sequencing.

## 14. Loop-gain modeling and injection

Do not run ordinary `.AC` analysis on a switching time-domain controller and
assume it yields sampled-data loop gain. Use one of these methods and name it:

- a separately derived averaged linear model;
- a supported periodic operating-point/sampled-data method;
- a closed-loop transient injection with frequency-by-frequency processing; or
- a hardware frequency-response analyzer with a valid injection point.

For a voltage-injection measurement, the loop should retain its DC operating
point and the injection point must satisfy impedance conditions. Middlebrook’s
original paper is the canonical reference for loop-gain injection and
interpretation:
[Measurement of Loop Gain in Feedback Systems](https://doi.org/10.1080/00207217508920421)
(`MIDDLEBROOK-1975`, accessed 2026-08-08). A simulated Bode plot is only as
valid as the plant/controller models and injection topology.

Always state whether a plot is:

- compensator gain;
- modulator gain;
- control-to-output plant;
- feedback-divider/sense gain;
- total return ratio; or
- closed-loop reference-to-output response.

`pspice/testbenches/loop_gain_averaged.cir` demonstrates a constructed linear
cascade at a fixed CCM operating point. It includes a Type-II-like
transconductance compensator, unit duty modulator, averaged plant, and unity
feedback. It does not close and inject the switched COT loop, so its result must
remain labeled a constructed averaged return ratio.

Omitting modulator or feedback gain while labeling the plot “loop gain” is an
architecture error, not a formatting issue.

## 15. Timestep, tolerances, and discontinuities

Start from a resolution budget:

\[
\Delta t_{max}\le \frac{1}{K}\min(T_{sw},t_{dead},t_{delay},t_{blank},
t_{ripple-feature}),
\]

where `K` is chosen from the accuracy goal. The project decks initially use 5
ns maximum step for a 2 µs period, then require refinement. This does not imply
5 ns fully validates a 10 ns physical delay; the delay block is an abstraction, and
edge timing must be verified with a smaller step.

Refine one numerical control at a time:

1. halve maximum step;
2. compare event times, extrema, and average values;
3. tighten `RELTOL`, `VNTOL`, or `ABSTOL` only if the discrepancy indicates it;
4. inspect warnings before raising iteration limits; and
5. document any smoothing, leakage, switch resistance, or parasitic added for
   convergence.

Cadence documents simulation options and convergence workflows in the
[*PSpice A/D User Guide*](https://resources.pcb.cadence.com/i/1180526/437)
(`CAD-PSPICE-UG`, accessed 2026-08-08). Automatic convergence can be a diagnostic
aid, but an unexplained solver change is not validation.

## 16. Parameter sweeps and mismatch

Separate these axes rather than changing everything together:

- VIN min/nom/max;
- load light/nom/max and step rate;
- L and DCR independently;
- high/low channel resistance;
- C, ESR, and initial voltage;
- sense gain and offset;
- comparator threshold, smoothing, and delay;
- on-time/min-off/dead-time tolerances;
- ripple amplitude and phase;
- scheduler skew; and
- balance gain/bandwidth.

Use fixed, recorded values before Monte Carlo. A random result is not debuggable
unless its seed and all realized parameters are preserved. PSpice statistical
syntax is release-dependent; verify it in the target reference guide before
adding distribution functions to these baseline decks.

## 17. Minimum validation record

For every model revision, record:

| Field | Required content |
|---|---|
| Question | Exact physical/control behavior being tested |
| Abstraction | Averaged, ideal switched, behavioral, device, or mixed |
| State/signs | Current/voltage reference directions |
| Parameters | Values, units, corners, and realized mismatch |
| Initial state | Capacitor voltage, inductor current, controller state |
| Solver | Product/version, method/options, max step, tolerances |
| Expected result | Analytical value or bounded physical prediction |
| Actual result | Measured value, waveform, warning list |
| Refinement | Result after halving step/tightening appropriate tolerance |
| Limitations | Important excluded behavior |
| Decision | Pass, fail, or inconclusive with reason |

Use the [debugging guide](PSPICE_DEBUGGING_GUIDE.md) when any relationship fails,
then finish with the [capstone guide](CAPSTONE_GUIDE.md).
