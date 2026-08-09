# PSpice compatibility and validation status

Status date: **2026-08-08**

## Honest top-line status

| Evidence class | Result | What it proves |
|---|---|---|
| Structural lint | **PASS**: 7 libraries, 21 decks | Includes exist; braces/continuations are balanced; subcircuits close; calls resolve; top-level decks have one `.END` |
| Independent arithmetic/structure | **PASS**: 20 named relationship groups | Nominal relationships plus controller invariants, finite-input rejection, all 28 supported generated phase/scheduler/timing configurations, disable observability, and checked-artifact reproducibility are internally consistent |
| Manual syntax-oriented review | **Completed** against Cadence ABM documentation | The chosen element classes and expression patterns are PSpice-oriented; it cannot prove parser acceptance or runtime behavior |
| Cadence PSpice A/D execution | **NOT RUN** | No PSpice executable or license is available in this build environment |
| Alternative-SPICE execution | **NOT RUN** | `ngspice`, Xyce, LTspice/Wine, and other SPICE executables were not installed |
| PSpice version | **Not applicable yet** | Must be recorded from the first actual run |

The commands actually run were:

```text
$ python3 pspice/scripts/netlist_lint.py
PSpice structural lint: PASS (7 libraries, 21 decks)
Scope: structure/includes/subcircuit references only; PSpice not executed.

$ python3 pspice/scripts/analytical_checks.py
PASS ideal conversion duty: 0.416666667
PASS nominal on-time (s): 8.33333333e-07
PASS high-side current slope (A/s): 3500000
PASS low-side current slope (A/s): -2500000
PASS volt-second/ripple balance (A): 2.91666667
PASS peak-to-peak ripple (A): 2.91666667
PASS CCM boundary current (A): 1.45833333
PASS four-phase spacing (s): 5e-07
PASS ideal effective ripple frequency (Hz): 2000000
PASS capacitor charge balance (C): 0
PASS adaptive TON at 12 V (s): 8.33333333e-07
PASS adaptive TON at 9 V (s): 1.11111111e-06
PASS current-balance trim polarity: 0.03, -0.03
PASS held-request inhibit gate structure: COT_ONESHOT
PASS held-request inhibit gate structure: COT_ONESHOT_CMD
PASS held-request inhibit regression fixture structure
PASS held-request remaining off-lock (s): 3e-07
PASS post-lock timer charge lower-bound (s): 4.60517019e-09
PASS current-priority complementary Boolean selector structure
PASS current-priority boundary regression fixture structure
PASS scheduler exact G1 at 1-V logic: 1
PASS scheduler exact G2 at 1-V logic: 0
PASS scheduler exact complementary sum at 1-V logic: 1
PASS scheduler below G1 at 1-V logic: 1
PASS scheduler below G2 at 1-V logic: 0
PASS scheduler below complementary sum at 1-V logic: 1
PASS scheduler above G1 at 1-V logic: 0
PASS scheduler above G2 at 1-V logic: 1
PASS scheduler above complementary sum at 1-V logic: 1
PASS scheduler exact G1 at 5-V logic: 5
PASS scheduler exact G2 at 5-V logic: 0
PASS scheduler exact complementary sum at 5-V logic: 5
PASS scheduler below G1 at 5-V logic: 5
PASS scheduler below G2 at 5-V logic: 0
PASS scheduler below complementary sum at 5-V logic: 5
PASS scheduler above G1 at 5-V logic: 0
PASS scheduler above G2 at 5-V logic: 5
PASS scheduler above complementary sum at 5-V logic: 5
PASS cumulative N-phase generator matrix: 2..8 phases, 28 configurations
PASS generator rejects NaN/Infinity numeric inputs
PASS generator disable/zero-command observability and permit-gap validation
PASS checked eight-phase cumulative capstone reproducibility
PASS generated body-diode offset and N-phase balance-cell structure
Analytical checks: PASS (20 relationship groups; no circuit simulator invoked)
```

## File-by-file matrix

“Reviewed” below means structural plus human syntax review, **not** PSpice
validation. “Not run” is intentional and must remain visible until the named
simulator actually executes the file.

| File | Intended simulator | Syntax review | Alternative SPICE | Cadence PSpice | Principal compatibility risk / remaining work |
|---|---|---|---|---|---|
| `lib/BUCK_PHASE.lib` | PSpice A/D | Reviewed | Not run | Not run | Verify `I(VILSENSE)` visibility, zero/finite `VBDROP` series-source behavior, body-diode convergence, and enable-wrapper gate transitions |
| `lib/COT_ONESHOT.lib` | PSpice A/D | Reviewed | Not run | Not run | Hard `IF` transitions, inhibit/ready timer-gate ordering, timer convergence, `LIMIT`; dynamic command is continuous rather than sampled at pulse start |
| `lib/COT_CONTROLLER.lib` | PSpice A/D | Reviewed | Not run | Not run | Stateful hysteresis feedback, `TANH`, feedback/limit first-order delay initialization, nested parameter functions |
| `lib/PEAK_CURRENT_CONTROLLER.lib` | PSpice A/D | Reviewed | Not run | Not run | Multiplied logic levels and blanking transition interpolation |
| `lib/PHASE_SCHEDULER.lib` | PSpice A/D | Reviewed | Not run | Not run | ABM multiplication and hard `IF` current boundary; current-priority tie goes to phase 1; round-robin token must be externally advanced |
| `lib/CURRENT_BALANCE.lib` | PSpice A/D | Reviewed | Not run | Not run | Parameter expression in R value; generated N-cell active-weighted reference is caller-formed; loop stability and phase-add transfer depend on the assembled system |
| `lib/PHASE_SHEDDING.lib` | PSpice A/D | Reviewed | Not run | Not run | Behavioral current-source sign and diode-clamped state at thresholds |
| `testbenches/averaged_buck.cir` | PSpice A/D | Reviewed | Not run | Not run | Validate averaged ABM and `.MEAS` syntax; check initialized operating point |
| `testbenches/switched_buck.cir` | PSpice A/D | Reviewed | Not run | Not run | Confirm transient startup, rise-count measurement, and body-diode convergence |
| `testbenches/nonideal_buck.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify dead-time edge placement and negative switch-node clamp |
| `testbenches/oneshot.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify timer latch, nominal pulse width, abort width, and minimum-off measurement |
| `testbenches/oneshot_inhibit_level_request.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify both one-shot forms keep Q low after inhibit release until READY, then reassert only after finite timer charge delay |
| `testbenches/voltage_mode.cir` | PSpice A/D | Reviewed | Not run | Not run | Confirm integrator startup and control clamp do not create a hidden operating-point issue |
| `testbenches/loop_gain_averaged.cir` | PSpice A/D | Reviewed | Not run | Not run | Constructed linear cascade only; confirm AC bias and do not equate it to switched COT return ratio |
| `testbenches/peak_current.cir` | PSpice A/D | Reviewed | Not run | Not run | This is not yet a full discrete subharmonic-validation deck; inspect cycle-to-cycle peaks manually |
| `testbenches/single_phase_cot.cir` | PSpice A/D | Reviewed | Not run | Not run | Natural ESR ripple and comparator crossing must be cursor-verified |
| `testbenches/two_phase_cot.cir` | PSpice A/D | Reviewed | Not run | Not run | Fixed-window scheduler timing must be measured; it is not universal architecture |
| `testbenches/multiphase_cot.cir` | PSpice A/D | Reviewed | Not run | Not run | Four simultaneous nonlinear phases may require tighter event stepping or softened gates |
| `testbenches/load_step.cir` | PSpice A/D | Reviewed | Not run | Not run | Check source breakpoint interpolation and reported droop/recovery |
| `testbenches/line_step.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify dynamic `TONMON` units and one-shot use of a time-varying command |
| `testbenches/mismatch.cir` | PSpice A/D | Reviewed | Not run | Not run | Physical currents and mismatched sense signals are separate; sweep each mismatch independently |
| `testbenches/current_limit.cir` | PSpice A/D | Reviewed | Not run | Not run | Confirm abort occurs at threshold plus delay and does not chatter |
| `testbenches/current_balance.cir` | PSpice A/D | Reviewed | Not run | Not run | Isolated block only; final closed-loop stability requires `mismatch.cir`/capstone |
| `testbenches/scheduler.cir` | PSpice A/D | Reviewed | Not run | Not run | Synthetic policy comparison only; round-robin token state is external |
| `testbenches/scheduler_current_priority_boundary.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify exact/below/above bias boundary yields one full-scale complementary grant after request edges settle |
| `testbenches/phase_shedding.cir` | PSpice A/D | Reviewed | Not run | Not run | Verify re-entry state, both FETs off while shed, no partial pulse, and no simultaneous high/low drive |
| `testbenches/capstone.cir` | PSpice A/D | Reviewed | Not run | Not run | Highest interaction/convergence risk; verify shed-phase safe state, then validate only after every prerequisite deck |
| `validation/generated-8phase-example.cir` | PSpice A/D | Reviewed; generator-current | Not run | Not run | Eight-phase nonlinear runtime/memory cost; active-count/reference discontinuity on phase add/shed; synchronous low-side may turn on before first re-entry grant; fixed-window requests have no stored queue; cumulative interactions remain unexecuted |
| `scripts/generate_multiphase.py` | Python 3 | Executed for all 28 phase/scheduler/timing combinations plus disable case | N/A | N/A | Text generation is tested, not PSpice semantics; free-running mode intentionally collides; local `timing-mismatch` and separate permit-slot skew have different meanings |
| `scripts/netlist_lint.py` | Python 3 | Executed, pass | N/A | N/A | Structural grammar only, no expression parsing or dimensional analysis |
| `scripts/analytical_checks.py` | Python 3 | Executed, pass | N/A | N/A | Arithmetic and generated-text contracts only, not a transient solution or PSpice parser |
| `scripts/run_all_pspice.bat` | Windows + PSpice | Reviewed | N/A | Not run | `psp_cmd.exe` name/PATH behavior can vary by release; inspect every `.out` file |

## Manual review checklist completed

- Every `.cir` file has a non-directive title line and one final `.END`.
- Every library subcircuit has a matching named `.ENDS`.
- Every relative include target exists from the repository root.
- Phase-current polarity is consistent from `SW` through `VILSENSE` to `OUT`.
- Capacitor-current monitors use output-node KCL and include every explicit
  load branch (the capstone includes its bleed current).
- High-side and low-side body-diode orientations match the documented current
  sign during dead time and reverse current; generated `VBDROP` has the same
  current-direction polarity on both diode paths and is disclosed as an added
  offset, not total forward voltage.
- Shed-phase decks use an enable-aware driver that forces both FETs off; a low
  PWM command is not misused as a synchronous-phase disable.
- Minimum on-time, maximum on-time, minimum off-time, and current-limit inputs
  are explicit rather than implied.
- Both one-shot forms gate timer charging with `REQ AND NOT INHIBIT`; the
  held-request regression fixture releases inhibit before off-lock expiry and
  measures READY-before-reassert ordering.
- Closed-loop decks provide a quiescent reference ramp before controller enable.
- Static startup loads are passive; ideal-current increments are zero at
  startup, and the capstone load enable is an explicit plotted state.
- The adaptive on-time law is labeled representative, not universal.
- Comparator “delay” is labeled first-order and not transport delay.
- Fixed eligibility windows are labeled an educational scheduler.
- Current-priority simultaneous requests use one Boolean winner and its exact
  complement; phase 1 owns the exact `I1-I2=TIEBIAS` boundary.
- Current-balance bandwidth is below switching frequency and its trim polarity
  is checked independently.
- Generated 2–8-phase cases form the current-sharing reference from only active
  phases, retain sharing-error observation when balance actuation is disabled,
  gate both FET commands on startup/shed, expose requested/granted/denied
  timing, and use a 2 ns default maximum step. Timing mismatch scales local
  comparator, limit, on-time, and dead-time values. Separate permit-slot skew
  deliberately displaces fixed phase opportunities and is gap-validated.
- The generated eight-phase fixture exactly matches its checked generator
  option set, including startup, line/load events, adaptive on-time, limit,
  balance, phase shedding/re-entry, ripple/ESL, component/sense/local-timing
  mismatch, and nonzero permit-slot skew. This proves reproducibility only, not
  circuit execution.
- Averaged and switched decks are separate.
- No alternative-SPICE or PSpice success is claimed.

## Highest-priority PSpice execution plan

Run in this order and stop at the first unexpected warning:

1. `averaged_buck.cir`: establishes ABM expression and parameter parsing.
2. `switched_buck.cir`: establishes `VSWITCH`, body diodes, current monitor, and
   transient measurements.
3. `oneshot.cir`: measure request-to-gate delay, `TON`, abort delay, and
   `TOFFMIN` before connecting the plant.
4. `oneshot_inhibit_level_request.cir`: hold request high through abort/release
   and verify both Q outputs reassert only after their READY outputs.
5. `single_phase_cot.cir`: verify startup and settled threshold crossings.
6. `scheduler_current_priority_boundary.cir`: verify exact/below/above tie-bias
   cases produce one full-scale complementary grant, never two half grants.
7. `two_phase_cot.cir`: verify no permit/request collision and correct spacing.
8. Focused load, line, current-limit, mismatch, and phase-shed decks.
9. `multiphase_cot.cir`, then the two-phase `capstone.cir` only after all prior
   results are understood.
10. The generated eight-phase cumulative capstone last; begin with balance and
    shedding disabled, then re-enable one interaction at a time.

For each run, record:

- PSpice version/hotfix and operating system;
- exact invocation and working directory;
- input SHA-256;
- `.OPTIONS` and any automatic convergence changes;
- complete `.out` text and warning count;
- measured values with units;
- maximum timestep actually used near events;
- representative Probe plots with cursor values; and
- every syntax or topology modification, including why it was required.

## Acceptance gates before changing “Not run”

Change Cadence PSpice status to **Pass** only when the exact checked-in file or a
documented commit-equivalent file ran in PSpice A/D, generated no unexplained
errors/warnings, produced physically consistent waveforms, and passed its
analytical comparisons. Merely opening, parsing, converging, or matching one
output-voltage waveform is insufficient.

Alternative-SPICE status may be changed independently, but it must name the
engine and version. It must never be used to change the PSpice column.
