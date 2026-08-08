# PSpice behavioral-modeling ladder

This directory is a plain-text, generic learning ladder for a synchronous buck
converter and several educational control architectures. It is intentionally
inspectable: every switching path, timing state, sensing convention, and
measurement appears in a `.lib` or `.cir` file.

> **Validation boundary:** Cadence PSpice is not installed in the build
> environment used to create this repository. The decks have passed structural
> lint and independent analytical arithmetic checks, but they have **not** been
> executed by PSpice. See [validation-status.md](validation-status.md) before
> treating any syntax or waveform as validated.

Nothing here identifies or reproduces a commercial controller. Component values
are synthetic. The phase scheduler, one-shot, current balancer, and phase-shed
state machine are explicit educational abstractions.

## Start here

Read and run the files in this order:

| Stage | Deck | Question to answer |
|---:|---|---|
| 1 | `testbenches/averaged_buck.cir` | What does the CCM average model retain and erase? |
| 2 | `testbenches/switched_buck.cir` | Do the measured slopes and ripple match volt-second balance? |
| 3 | `testbenches/nonideal_buck.cir` | Where do DCR, switch resistance, ESR, and dead time appear? |
| 4 | `testbenches/voltage_mode.cir` | How do error signal, ramp, modulator, and plant form the loop? |
| 4b | `testbenches/loop_gain_averaged.cir` | What is included in a constructed linear loop-gain cascade? |
| 5 | `testbenches/peak_current.cir` | Which event sets and resets the pulse? |
| 6 | `testbenches/single_phase_cot.cir` | Which crossing requests the next fixed-duration pulse? |
| 7 | `testbenches/two_phase_cot.cir` | How do eligibility windows prevent a request collision? |
| 8 | `testbenches/multiphase_cot.cir` | How do phase currents sum and ripple frequency change? |
| 9 | `testbenches/mismatch.cir` | What mismatch remains after a slow balance trim? |
| 10 | `testbenches/phase_shedding.cir` | What happens at shed and re-entry thresholds? |
| 11 | `testbenches/capstone.cir` | Can you defend every block, state, sign, and limitation? |

The focused `oneshot.cir`, `oneshot_inhibit_level_request.cir`,
`scheduler_current_priority_boundary.cir`, `load_step.cir`, `line_step.cir`,
`current_limit.cir`, and `current_balance.cir` decks isolate individual
validations. The held-request fixture checks both one-shot forms when an
inhibit abort is released before the minimum-off lock expires. The scheduler
boundary fixture checks full-scale complementary grants with 1-V and 5-V logic
covered by the independent arithmetic check.

`loop_gain_averaged.cir` is intentionally separate from the switched decks. It
constructs the product of a Type-II-like transconductance compensator, unit duty
modulator, averaged CCM plant, and unity feedback at a fixed operating point.
Because `VERR` has AC magnitude 1, `V(LOOP)` is the constructed return-ratio
cascade. It is not a switched periodic-operating-point result or a claim that an
ordinary `.AC` analysis linearizes COT event timing.

## Sign and scaling conventions

- Node `0` is the global reference.
- Phase current is positive from `VIN`, through the switch node and inductor,
  toward `OUT`.
- `IMONk` is a voltage representation of phase current; the default scale is
  `1 V/A`.
- `ISUM` is the algebraic sum of the phase monitor voltages and therefore also
  uses `1 V/A`.
- Positive capacitor current is `sum(iL) - iLoad`.
- A positive balance `TRIMk` is added to the sensed feedback for phase `k`; it
  makes that phase less likely to request another pulse.
- Gate logic is 0/5 V in the supplied decks. `TONMON` is unusual by design:
  `1 V` represents `1 s`, so a displayed value of `833 nV` means `833 ns`.
- Natural ripple enters through `FB`; synthetic or injected ripple enters the
  separate `RIPPLE` pin. These contributions must not be counted twice.
- Closed-loop decks hold `REF=0` through 5 µs and ramp it to target by 6 µs.
  This creates a defined controller-enable event and a quiescent DC operating
  point before the one-shot runs. The voltage-mode PWM and peak-current clock
  are also explicitly gated during this interval.
- Static startup decks use passive resistive loads. Dynamic ideal-current
  increments begin only after startup; the capstone exposes `LOADEN` and
  `LOADACT`. This avoids asking an ideal current sink to draw finite current at
  0 V and accidentally creating reverse current or a powered DC solution.

## Libraries and interfaces

### `lib/BUCK_PHASE.lib`

`BUCK_PHASE VIN OUT GHS GLS SW IMON`

- Includes high-side and low-side channel resistance, inductor DCR, body-diode
  paths, an exposed switch node, and a zero-volt current sensor.
- During dead time with positive inductor current, the low-side body diode can
  clamp `SW` below ground. With reverse current, the high-side body diode can
  conduct toward `VIN`.
- Does not include MOSFET capacitance, gate charge, reverse recovery detail,
  nonlinear inductance, saturation, thermal state, layout parasitics, or EMI.

`BUCK_PHASE_IDEAL` retains finite switch resistance and body-diode paths for a
solvable switched network. `BUCK_AVERAGED` replaces the switch node with
`d*VIN`; it is a CCM, low-frequency abstraction and has no switching events.

`COMPLEMENTARY_DRIVER PWM GHS GLS` delays each rising gate edge and gives each
falling edge a diode-bypassed discharge path. The requested `DEAD` is the
approximate 50% crossing separation, not a gate-charge calculation.

`COMPLEMENTARY_DRIVER_ENABLE PWM ENABLE GHS GLS` wraps that driver for phase
shedding. `ENABLE=0` forces **both** switch commands low. Do not model a shed
synchronous phase by forcing only `PWM=0`: that would command its low-side
switch on and create an unintended output-to-ground path through the inductor.
`VENHIGH` defines the asserted enable-signal voltage independently of the gate
logic voltage.

### `lib/COT_ONESHOT.lib`

`COT_ONESHOT REQ INHIBIT Q READY`

- A level request charges an internal timer only when `READY` is high and
  `INHIBIT` is low.
- A controlled current discharges the timer, making the pulse duration
  approximately `TON`.
- A near-full timer start threshold sets the output state. The timer then
  discharges to `VTH` in approximately `TON`.
- The output pulse holds an off-lock capacitor high; its later decay enforces
  `TOFFMIN`.
- `INHIBIT` blocks timer charging, discharges the timer, and ends the pulse.
  A request held high throughout the abort cannot precharge the timer; after
  inhibit releases, it remains ineligible until the off-lock raises `READY`.
  This supports a simplified current-limit reset.

`COT_ONESHOT_CMD REQ INHIBIT TONCMD Q READY` uses a time-varying on-time command
clamped to `TONMIN..TONMAX`. Both forms have finite trigger/abort RC error. The
dynamic form reads `TONCMD` continuously during a pulse; it does not sample and
hold the command at the start event. The models do not reproduce digital
inertial delay, metastability, or a particular monostable circuit.

Require `0 < VTH < STARTFRAC*VLOGIC < VLOGIC`, positive timing parameters, and
`TONMIN <= TONMAX`. The decks use `STARTFRAC=0.99`; invalid combinations are
not silently repaired inside the subcircuit.

### `lib/COT_CONTROLLER.lib`

`COT_REQUEST FB REF RIPPLE REQUEST` contains the ripple comparator. `VSOFT`
smooths the transfer. `VHYST` adds bounded positive feedback through the delayed
request state. `TDELAY` is represented by a first-order lag whose 50% crossing
is near the requested delay; it is not exact transport delay.

`COT_CONTROLLER` combines that request, a current comparator, and a static
one-shot. `COT_ADAPTIVE_CONTROLLER` uses the representative law

\[
t_{on}=\operatorname{clamp}\!\left(T_{period}\frac{V_{ref}}{V_{in}},
t_{on,min},t_{on,max}\right).
\]

That law is a documented architecture choice, not the definition of every
adaptive-on-time controller. `COT_DC_SERVO` is an optional slow integrator-like
trim and demonstrates why “COT has no error amplifier” is not universal.
`COT_CURRENT_LIMIT` has its own disclosed first-order `TDELAY`; it is not an
instantaneous or exact-transport comparator and it does not add blanking unless
the caller supplies that behavior.

### `lib/PEAK_CURRENT_CONTROLLER.lib`

`PEAK_CURRENT_CONTROLLER CLOCK VCMD ISENSE RAMP BLANK GATE TRIP READY`

The clock requests a pulse. `ISENSE + RAMP` crossing `VCMD` ends it after the
blanking input releases. The same one-shot supplies maximum on-time behavior.
This is suitable for examining event order and slope-compensation direction;
it is not a complete sampled-data or commercial current-mode model.

### `lib/PHASE_SCHEDULER.lib`

Three two-phase combinational policies are provided:

- `ROUND_ROBIN_2` grants only the externally selected token;
- `FIRST_ELIGIBLE_2` intentionally gives phase 1 fixed priority and can starve
  phase 2;
- `CURRENT_PRIORITY_2` selects one Boolean winner when both phases request.
  Phase 1 wins when `I1-I2 <= TIEBIAS`, including the exact boundary; phase 2
  wins only when `I1-I2 > TIEBIAS`. Thus the default positive bias deliberately
  permits a small phase-1 preference rather than always choosing the strictly
  lower current.

The current-priority winner is computed once and the other winner signal is its
exact complement, so settled simultaneous requests cannot create two
half-scale grants. The hard boundary has no hysteresis and may chatter if noisy
sense signals repeatedly cross it; request/input edge interpolation is still
analog. The library exposes granted and denied signals. Token generation and
global minimum-separation lockout remain explicit responsibilities of the
caller. The fixed eligibility windows in the supplied multiphase decks are
another, separate scheduling abstraction.

### `lib/CURRENT_BALANCE.lib`

`CURRENT_BALANCE_2 I1 I2 ENABLE TRIM1 TRIM2 ERROR` low-pass filters both phase
currents and applies equal/opposite bounded trims. The default balance bandwidth
is deliberately far below switching frequency. It is not guaranteed stable
when inserted into an arbitrary voltage loop; the learner must evaluate the
combined system.

### `lib/PHASE_SHEDDING.lib`

`PHASE_SHEDDING_2 ILOAD FORCE_ON ACTIVE2 STATE` integrates a bounded state high
above `IADD`, low below `ISHED`, and holds between thresholds. `TRAMP` makes
phase re-entry finite rather than instantaneous. The caller still owns pulse
sequencing and safe gate disable.

## Exact local checks (no PSpice required)

From the repository root:

```bash
python3 pspice/scripts/netlist_lint.py
python3 pspice/scripts/analytical_checks.py
```

The first command checks includes, braces, continuations, subcircuit closure,
subcircuit references, and top-level `.END` cards. It is not a SPICE parser.
The second independently checks nominal conversion, slopes, ripple,
volt-second balance, charge balance, CCM boundary, phase spacing, effective
ripple frequency, adaptive on-time direction, balance-trim polarity, the
held-request inhibit gate/lockout regression structure and timing bounds, and
the current-priority scheduler's exact/near-boundary complementary grants.

## Generate a configurable N-phase deck

The generator supports 2–8 phases, deterministic L/DCR mismatch, and either
fixed eligibility windows or deliberately free-running requests:

```bash
python3 pspice/scripts/generate_multiphase.py \
  --phases 6 \
  --scheduler fixed-window \
  --vin 12 --vout 5 --frequency 500000 \
  --load 18 --l-mismatch-pct 1.5 --dcr-mismatch-pct 3 \
  --output pspice/testbenches/generated_6phase.cir
```

The script refuses to overwrite a file unless `--force` is present. A generated
eight-phase example is preserved at
`validation/generated-8phase-example.cir`. Generated decks expose phase count,
input/output target, frequency, load, L, DCR, C, ESR, per-phase current limit,
window width, mismatch, and scheduler style. Detailed dynamic controller
parameters remain editable in the resulting plain text. The generated `load`
value is converted to a passive resistance that draws that current at target
`VOUT`; it is not a constant-power or constant-current load model.

## Run in Cadence PSpice A/D

Use an installed and licensed PSpice A/D release. From a Windows command prompt
configured for that installation:

```bat
cd C:\path\to\constant-on-time
where psp_cmd.exe
psp_cmd.exe pspice\testbenches\single_phase_cot.cir
```

The expected products are a text `.out` report and Probe data for decks with a
`.PROBE` statement. Read the entire `.out` file, including warnings, before
opening waveforms. The supplied batch helper runs every checked-in testbench:

```bat
pspice\scripts\run_all_pspice.bat
```

Executable names and supported flags can vary by Cadence release. If
`psp_cmd.exe` is unavailable, launch PSpice A/D, use **File > Open** to open the
`.cir` file, add it to the simulation queue if prompted, and run it there. The
Cadence user guide explicitly describes queuing `.SIM` and `.CIR` files. Keep
the repository root as the working directory so the quoted `.INC` paths resolve.

After the first PSpice run:

1. record the exact product/version and hotfix shown by **Help > About**;
2. preserve the `.out` file without editing it;
3. confirm the reported maximum step is at most 5 ns for the switched decks;
4. inspect `GHS` and `GLS` for overlap before trusting `OUT`;
5. verify `SW`, every `IMONk`, `ISUM`, request, gate, trip, and scheduler signal;
6. compare `.MEAS` results with `analytical_checks.py` where applicable;
7. update `validation-status.md` file by file, including warnings and any syntax
   changes; and
8. never relabel an alternative-SPICE run as PSpice validation.

## PSpice-oriented syntax choices

The models use Cadence-documented analog behavioral modeling patterns:

- E/G controlled sources with `VALUE={expression}`;
- `IF`, `LIMIT`, and `TANH` expressions;
- parameterized `.SUBCKT` definitions and `{parameter}` values;
- voltage-controlled `VSWITCH` elements;
- `.TRAN`, `.MEAS`, `.PROBE`, `.OPTIONS`, `.IC`, `PULSE`, and `PWL` cards.

Primary syntax reference: Cadence, *PSpice A/D User Guide*, Chapter 6 “Analog
behavioral modeling” in the Cadence-hosted edition, especially the
ABM expression, controlled-source, table/Laplace, and delay sections:
[Cadence-hosted user guide](https://resources.pcb.cadence.com/i/1180526-pspice-user-guide/330).
Cadence also documents `.CIR` inputs and simulation queues in the same guide:
[circuit files](https://resources.pcb.cadence.com/i/1180526/48) and
[queueing `.SIM`/`.CIR`](https://resources.pcb.cadence.com/i/1180526-pspice-user-guide/476).
All were accessed 2026-08-08. Citation ID used in project prose:
`CAD-PSPICE-UG`.

## What to measure

For each switched deck, do not stop at output voltage. Check:

- gate complementarity and dead time;
- switch-node state during high-side, low-side, and dead-time intervals;
- per-state `di/dt` against `(vSW-vOUT-iL*DCR)/L`;
- pulse duration and minimum off-time at cursor resolution;
- comparator request-to-gate latency;
- per-phase average current and `ISUM`;
- average inductor voltage over a settled interval;
- average capacitor current over a settled interval;
- phase-to-phase firing intervals and missed/denied opportunities;
- output minimum/maximum after load and line events; and
- whether each observed oscillation survives timestep and tolerance refinement.

## Known modeling limits

- The one-shot is an analog timer abstraction and contains hard comparator
  transitions. Its exact timing can vary with solver interpolation.
- `TDELAY` is a first-order delay approximation. A release-specific exact-delay
  ABM can be substituted only after verifying syntax and initialization in the
  target PSpice version.
- Fixed-window scheduling may delay a valid request until the next phase window.
  It is not phase locking, a digital round-robin state machine, or a universal
  COT architecture.
- The current-sharing block filters monitor signals, not reconstructed DCR
  current with temperature compensation.
- The phase-shed block does not model soft-start reference ramping for the
  returning phase.
- `BUCK_PHASE` has no diode reverse-recovery charge, output capacitance, or
  nonlinear gate behavior. Dead-time spikes are therefore incomplete.
- No loop-injection AC testbench is claimed for the switched COT models. Use an
  averaged linear model or a supported periodic/sampled-data method and state
  exactly what transfer function was measured.
- Alternative SPICE engines differ in ABM, switch, parameter, measurement, and
  convergence syntax. Passing elsewhere would not prove PSpice compatibility.

Continue with [the modeling guide](../docs/PSPICE_MODELING_GUIDE.md),
[debugging guide](../docs/PSPICE_DEBUGGING_GUIDE.md), and
[capstone guide](../docs/CAPSTONE_GUIDE.md).
