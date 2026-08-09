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
| 11 | `testbenches/capstone.cir` | Can you defend the fixed two-phase integrated interactions? |
| 12 | `validation/generated-8phase-example.cir` | Does the cumulative generated 2–8-phase architecture preserve and expose every later-stage interaction? |

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
- `VBDROP` adds a fixed series offset to both body-diode paths. It is **in
  addition to**, not a replacement for, the nonlinear `D_BODY_COTLAB` junction
  voltage, so it must not be interpreted as the total forward drop.
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

`CURRENT_BALANCE_CELL ISENSE IREFERENCE ENABLE IAVG TRIM ERROR` is the reusable
cell used by generated N-phase decks. The generator forms an active-weighted
average from all `IAVGk` outputs, then each cell compares its filtered sensed
current with that reference. A positive error gives a positive feedback trim,
reducing that phase's future pulse demand. Setting generated `KBAL=0` disables
actuation while retaining `IAVG`, `ISHAREAVG`, and `SHAREERRk` observations.

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
the current-priority scheduler's exact/near-boundary complementary grants. It
also builds all 28 combinations of 2–8 phase count, fixed/adaptive on-time, and
fixed-window/free-running scheduling; checks every cumulative block count;
tests balance/shed disable and zero-commanded-load observability, rejects unsafe
permit-slot gaps, verifies the body-diode/balance-cell structures, and proves
that the checked eight-phase deck is generator-current.

## Generate the configurable 2–8-phase cumulative capstone

The generator now carries the ladder's later stages into one inspectable
2–8-phase deck: fixed or representative adaptive COT, scheduler visibility,
current limit, active-weighted N-phase current balance, staged phase shedding
and re-entry, startup gating, line/load steps, ripple injection, output ESL,
and deterministic component, sensing, and timing mismatch.

```bash
python3 pspice/scripts/generate_multiphase.py \
  --phases 6 --scheduler fixed-window --on-time-law adaptive \
  --vin 12 --vout 5 --frequency 500000 \
  --load 2 --load-step 16 \
  --l-mismatch-pct 1.5 --dcr-mismatch-pct 3 \
  --sense-gain-mismatch-pct 1 --sense-offset-mv 8 \
  --timing-mismatch-pct 2 --phase-offset-skew-ns 3 \
  --balance-bandwidth 2000 \
  --output pspice/testbenches/generated_6phase.cir
```

The script refuses to overwrite a file unless `--force` is present. A generated
eight-phase cumulative example is preserved at
`validation/generated-8phase-example.cir`; the analytical check regenerates it
in memory from its exact option set and fails on any difference.

Regenerate that exact checked fixture with:

```bash
python3 pspice/scripts/generate_multiphase.py \
  --phases 8 --scheduler fixed-window --on-time-law adaptive \
  --balance on --phase-shedding on --load 2 --load-step 22 \
  --l-mismatch-pct 3 --dcr-mismatch-pct 4 \
  --resistance-mismatch-pct 2 --sense-gain-mismatch-pct 1.5 \
  --sense-offset-mv 12 --timing-mismatch-pct 2 \
  --phase-offset-skew-ns 3 --ripple-amplitude .008 \
  --ripple-phase-degrees 45 --esl 500e-12 \
  --body-diode-extra-drop .05 --max-step 2e-9 \
  --output pspice/validation/generated-8phase-example.cir --force
```

Key controls are explicit rather than hidden in a template:

| Concern | Generator controls | Emitted behavior |
|---|---|---|
| Timing law | `--on-time-law`, `--fixed-on-time`, `--ton-min`, `--ton-max`, `--min-off-time` | Fixed `TONBASE` or representative `TPER*VREF/VIN`, followed by per-phase clamp |
| Scheduling | `--scheduler`, `--window-fraction` | Fixed eligibility windows or intentionally colliding free-running requests; `REQCk`, `REQk`, `DENIEDk`, and `PERMITk` are probed |
| Startup/events | `--startup-enable`, `--startup-ramp`, load/line step times and values | Explicit `CTRLEN`, reference ramp, delayed load enable, finite load step, and finite line step |
| Phase shedding | `--phase-shedding`, `--phase-add-step`, `--phase-shed-hysteresis`, `--phase-reentry-ramp` | Phase 1 remains mandatory; phases 2..N use progressively higher add/shed thresholds and both gates are disabled while inactive |
| Current sharing | `--balance`, `--balance-bandwidth`, `--balance-gain`, `--balance-trim` | Active-weighted sensed-current reference and one bounded low-bandwidth feedback trim per phase |
| Mismatch | L, DCR, switch-resistance, sense-gain, sense-offset, local timing mismatch, and permit-slot skew controls | Deterministic symmetric outer-phase extremes, recorded numerically in every phase instance; `--timing-mismatch-pct` scales comparator delay, limit delay, dead time, and on-time command, while the separate `--phase-offset-skew-ns` displaces fixed permit slots |
| Power path | L/DCR/RHS/RLS, C/ESR/ESL, `--body-diode-extra-drop` | Nonideal switched phases and shared output network; diode option adds to junction voltage |
| Comparator/limit | comparator delay/hysteresis, ripple amplitude/phase, limit/delay | Per-phase request comparator and current-limit abort with explicit first-order delay |

`--load` is a nonnegative baseline ideal-current load in amperes (zero disables
that commanded ideal-current branch) and `--load-step` is an
added current, not a resistance, constant-power load, or silently inferred
value. `LOADEN` ramps only after reference startup so the ideal sink does not
force current at zero output. Use `--help` for the complete parameter list.

`--load 0 --load-step 0` is **not an exact open-circuit test** because the
generated `RBLEED` remains connected (100 Ω by default, drawing 50 mA at 5 V).
Use a deliberately large finite `--bleed-resistance` for a near-no-load study,
retain it for a well-defined DC path, and disclose the residual current.

The generated fixed windows are an educational allocation policy, not an
internal clocked round-robin queue. `DENIEDk` shows an ungranted instantaneous
request; there is no stored request queue. The free-running option is included
specifically to expose collision and bunching risk, not as a recommended
multiphase controller.

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
  current with temperature compensation. The generated N-phase reference
  changes when an `ACTIVEk` decision changes, and no bumpless-transfer scheme
  is modeled.
- The phase-shed block does not model soft-start reference ramping for the
  returning phase. Its state ramps, but the enable-aware gate driver changes
  state at the digital threshold; it is not a controlled phase-current ramp.
- On re-entry with `GATEk=0`, that synchronous driver immediately commands the
  low-side switch. The resulting negative-current possibility is physical for
  this abstraction, but many applications would add first-pulse arming or
  diode emulation. Neither is silently assumed here; inspect `IMONk` and extend
  the policy if reverse current is prohibited.
- Generated shedding decisions use the commanded `LOADACT` signal, not an
  independently measured total current. Threshold tolerances and estimator
  dynamics therefore remain modeling extensions.
- `BUCK_PHASE` has no diode reverse-recovery charge, output capacitance, or
  nonlinear gate behavior. `VBDROP` is only a series voltage offset on the
  existing diode model. Dead-time spikes are therefore incomplete.
- No loop-injection AC testbench is claimed for the switched COT models. Use an
  averaged linear model or a supported periodic/sampled-data method and state
  exactly what transfer function was measured.
- Alternative SPICE engines differ in ABM, switch, parameter, measurement, and
  convergence syntax. Passing elsewhere would not prove PSpice compatibility.

Continue with [the modeling guide](../docs/PSPICE_MODELING_GUIDE.md),
[debugging guide](../docs/PSPICE_DEBUGGING_GUIDE.md), and
[capstone guide](../docs/CAPSTONE_GUIDE.md).
