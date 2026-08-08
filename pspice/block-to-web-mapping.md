# Web-simulator to PSpice mapping

This mapping preserves concepts and sign conventions, not numerical identity.
The browser engine integrates explicit state equations with deterministic event
handling. The PSpice ladder lets PSpice solve a circuit/ABM network. Different
event interpolation, discontinuity handling, and parasitic choices can produce
different edge-level results even when the high-level architecture matches.

| Web concept or signal | PSpice block/node | Same intent | Deliberate difference |
|---|---|---|---|
| Per-phase inductor state `iL[k]` | `BUCK_PHASE`, `IMONk` | Positive into output; `1 V/A` monitor | PSpice current is an inductor/zero-source branch state |
| Conducting-state resolver | `SHS`, `SLS`, `DHS`, `DLS` in `BUCK_PHASE` | HS, LS, and body-diode paths | PSpice chooses diode conduction through its nonlinear solve |
| Shared capacitor state | `COUT`, optional `RESR` | Responds to `sum(iL)-iLoad` | ESR is a physical series branch rather than an algebraic output equation |
| Switch-node waveform | exposed `SWk` | Shows conducting state and diode clamp | No MOSFET capacitance or reverse recovery |
| Body-diode offset | `VBDROP` in `BUCK_PHASE` | Lets generated phases add a deterministic diode-path offset | Offset is added to the nonlinear junction voltage; it is not an exact total forward drop or temperature model |
| Dead-time event | `COMPLEMENTARY_DRIVER` | Falling edge precedes opposite rising edge | RC/diode threshold approximation rather than an event timestamp |
| Feedback comparator | `COT_REQUEST` | Compares `REF` with `FB+RIPPLE` | `TANH` smoothing and RC delay |
| Comparator hysteresis | `VHYST` in `COT_REQUEST` | State-dependent rising/falling threshold | Positive feedback through delayed request, not a transistor comparator |
| Propagation delay | `TDELAY` in `COT_REQUEST` | Defers request | First-order 50% crossing, not transport delay |
| Fixed one-shot | `COT_ONESHOT` | Fixed nominal `TON`, min-off lockout | Analog timer capacitor/current source |
| Adaptive on-time law | `COT_ONESHOT_CMD`, `TONMON` | Dynamic `TON` with min/max bounds | `1 V/s` time encoding |
| Fixed/adaptive generated timing | `TONBASE`, `TONCMDk` | Selects fixed or representative `TPER*VREF/VIN`; clamps every local command | Local timing mismatch scales command/delays/dead time; separate permit-slot skew changes fixed phase offsets |
| Current-sense gain/offset | `IMONGAIN` plus ABM sense source | Converts physical current to comparator input | Offset is added explicitly by caller |
| Current limit | `COT_CURRENT_LIMIT`, `TRIPk` | Aborts active pulse after disclosed lag | First-order threshold delay; timer discharges; no blanking unless caller adds it |
| Natural feedback ripple | `FB` node including output ESR ripple | Affects threshold crossing | PSpice parasitics determine the ripple |
| Injected ripple | `RIPPLE` pin | Adds a separate timing signal | Caller owns waveform source and phase |
| Fixed phase spacing | `PERMITk` sources | Phase-specific eligibility | Windowed scheduling can defer requests |
| Round-robin scheduler | `ROUND_ROBIN_2` | External token chooses phase | Token state is supplied, not internally clocked |
| First-eligible scheduler | `FIRST_ELIGIBLE_2` | Demonstrates fixed-priority grant | Two-phase combinational example only |
| Current-priority scheduler | `CURRENT_PRIORITY_2` | One Boolean winner; phase 1 owns `I1-I2 <= TIEBIAS` | Hard sensed-current boundary with exact complementary grant |
| Denied/delayed request marker | `DENIEDk`; `REQCk` vs `REQk` | Makes allocation visible | Windowed decks infer delay from traces rather than queue objects |
| Average-current balance | `CURRENT_BALANCE_2`; generated `CURRENT_BALANCE_CELL`, `ISHAREAVG` | Slow sensed-current trim with positive trim reducing pulse demand | Web `u_command > 0` increases an under-current phase's current target; at that command boundary use `TRIM_PSpice = -u_command` after unit scaling. Generated N-phase decks form an active-weighted reference and do not model bumpless transfer when active count changes. |
| Phase shedding | repeated `PHASE_SHEDDING_2`, `ACTIVEk`, `COMPLEMENTARY_DRIVER_ENABLE` | Separate staged add/shed thresholds; disabled phase has both FETs off | Generated cells use commanded `LOADACT`, analog state ramp, and a digital enable threshold rather than a controlled phase-current ramp |
| Startup enable | `CTRLEN`, `PHASEENk`, ramped `REF` and `LOADEN` | Prevents pulses and ideal-load current before the startup event | This is explicit sequencing, not a controller-specific soft-start/current limit |
| Line/load event | `PULSE`/`PWL` source | Deterministic event time | PSpice chooses internal solver points around breakpoints |
| Scenario parameters | `.PARAM`, cumulative 2–8-phase generator CLI | Reproducible synthetic setup including controller, mismatch, events, balance, and shedding | No JSON schema in the netlist itself; generator contract tests prove text structure, not PSpice execution |
| Plot/cursor measure | `.PROBE`, `.MEAS` | Named signals and scalar checks | Probe workflow rather than browser plotting API |

## Required comparison protocol

When comparing the browser and PSpice versions:

1. use identical sign conventions and static parameters;
2. disable all nonidealities not present in both models;
3. align event times and initial conditions explicitly;
4. compare slopes and event intervals before edge overshoot;
5. halve both the browser step and PSpice maximum step;
6. state whether each difference is caused by abstraction, event timing,
   initialization, or likely implementation error; and
7. do not tune an unexplained parameter merely to force one waveform match.
