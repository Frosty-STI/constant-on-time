# Constant On-Time Lab — Product and Technical Specification

## 1. Mission

Constant On-Time Lab is a local-first, source-traceable learning environment that takes a learner from buck-converter fundamentals to the independent construction, debugging, and validation of a generic configurable multiphase constant-on-time (COT) PSpice model.

The project is educational and implementation-oriented. Every major concept is taught in three layers:

1. physical intuition,
2. mathematical derivation, and
3. modeling or implementation consequence.

The application title is **Constant On-Time Lab**. The human-readable project name is **Constant On-Time**. The target private GitHub repository is `Frosty-STI/constant-on-time`.

## 2. Boundaries and non-goals

### Allowed material

- Public technical documentation and manufacturer application notes
- Legitimately accessible textbooks, papers, proceedings, and lecture notes
- Public Cadence PSpice and Analog Behavioral Modeling documentation
- Original equations, explanations, simulations, diagrams, exercises, and synthetic examples
- Generic component values and explicitly labeled educational controller architectures

### Prohibited material

- Employer or customer schematics, specifications, data, or unreleased device details
- Proprietary models, restricted libraries, internal controller architectures, or private lab results
- Credentials, tokens, cookies, private keys, or browser-session material
- Redistribution of copyrighted sources without explicit permission
- Claims that a generic behavioral model reproduces every commercial controller

### Explicit non-goals

- Replacing Cadence PSpice or certifying a design for production
- Reproducing any specific proprietary controller
- Guaranteeing PSpice compatibility without execution in Cadence PSpice
- Inferring high-frequency switching behavior from averaged models beyond their valid range

## 3. Definition of the learner outcome

Completion means the learner can:

- derive steady-state conversion, current-slope, ripple, volt-second-balance, and charge-balance relationships;
- interpret switched waveforms and distinguish CCM, DCM, boundary, reverse-current, and numerical-artifact behavior;
- distinguish power phase, interleaving angle, Bode phase, phase margin, switching frequency, crossover frequency, and the different loop bandwidths;
- build total loop gain from compensator, modulator, plant, sensing, and feedback terms;
- compare voltage-mode, peak/valley-current-mode, hysteretic, ripple-based, fixed/adaptive-on-time, and hybrid architectures without false dichotomies;
- explain the timing, ripple, delay, current-limit, and light-load behavior of a generic COT controller;
- explain interleaving, ripple cancellation, current sharing, scheduling, phase shedding, mismatch, fairness, and loop interaction in multiphase systems;
- select and defend an appropriate PSpice abstraction level;
- implement and validate generic behavioral blocks for comparators, hysteresis, one-shots, latches, delays, blanking, minimum timing, scheduling, current sensing, and balancing;
- recognize convergence artifacts, insufficient time resolution, algebraic loops, polarity errors, unrealistic ideals, and out-of-domain model use; and
- state the assumptions, captured behavior, excluded behavior, and validation evidence for every capstone block.

## 4. Research questions

Research is complete only when the source library can answer the following questions with traceable citations and clearly marked assumptions.

### 4.1 Power-stage physics

1. What is the conduction path and inductor voltage for high-side conduction, low-side conduction, asynchronous freewheel, dead time with positive current, dead time with reverse current, and diode-emulation turn-off?
2. Under which assumptions is \(V_o = D V_{in}\) exact, approximate, or wrong?
3. How do nonideal switch resistance, DCR, diode drop, dead time, and reverse current change volt-second balance?
4. How are inductor ripple, capacitor current, capacitive ripple, ESR ripple, and ESL-related edge behavior derived?
5. What defines CCM, DCM, boundary conduction, and reverse-current operation for synchronous and asynchronous stages?
6. How do phase count and interleaving alter summed current, capacitor current, input ripple, effective ripple frequency, and RMS stress?

### 4.2 Dynamic and loop behavior

1. What are the averaged states and perturbation assumptions for a buck converter?
2. How are control-to-output, line-to-output, and output-impedance transfer functions derived and interpreted?
3. How do load, ESR, DCR, and parasitics move or damp plant poles and zeros?
4. What do “power-stage bandwidth” and “buck bandwidth” mean in different engineering contexts?
5. When are crossover frequency and closed-loop bandwidth close, and when are they materially different?
6. How do phase margin, gain margin, sensitivity peaking, damping, and time-domain overshoot relate without being interchangeable?
7. Which switching-frequency-to-crossover heuristics are supported, and what assumptions make them fail?

### 4.3 Error amplifiers and compensation

1. How do operational and transconductance error amplifiers differ at the compensation pin?
2. How do feedback-divider gain, modulator gain, plant gain, and sensing gain combine into loop gain?
3. How are Type I, II, and III compensators derived from physical networks?
4. What constraints determine useful pole and zero placement?
5. What is required for a valid loop-injection measurement, and how can the injection point or source impedance corrupt it?

### 4.4 Peak-current-mode control

1. Which event starts and ends a pulse in representative peak- and valley-current architectures?
2. What is meant by the “inner current loop,” and which simplifications are valid below half the switching frequency?
3. How does a discrete cycle-to-cycle map produce alternating-cycle behavior?
4. What slope-compensation criterion is being used, under which duty, ramp, sampling, and model assumptions?
5. How do blanking, filtering, propagation delay, noise, current-sense gain/polarity, and min/max timing affect behavior?
6. Why do current-mode simplifications not remove all output-filter or sampled-data dynamics?

### 4.5 Constant-on-time and related control

1. What exactly is held constant in fixed-on-time and adaptive-on-time implementations?
2. Which event requests a pulse, which event terminates it, and what makes the next pulse eligible?
3. How does natural, ESR-derived, synthetic, emulated, or injected ripple establish comparator timing?
4. What ripple amplitude and phase conditions are required for representative architectures, and which requirements are controller-specific?
5. How do hysteresis, delay, minimum off-time, pulse width limits, noise, and load state change frequency, jitter, and regulation?
6. Which COT architectures use no error amplifier, and which use a servo, integrator, or full error amplifier?
7. When does a COT design need explicit compensation or stability shaping?
8. How do pulse skipping, DCM, diode emulation, current limit, and line feedforward alter the simplistic COT story?
9. In what sense can a controller combine constant/adaptive on-time timing with current-mode information?

### 4.6 Multiphase COT

1. What valid architectures exist for free-running, locked, scheduled, or centrally allocated phase pulses?
2. How do phase collision, pulse bunching, beat behavior, starvation, and unfair scheduling arise?
3. How should fixed-spacing, first-eligible, round-robin, minimum-separation, and current-priority educational schedulers behave?
4. What invariants demonstrate scheduler safety and fairness?
5. How can current sharing use average, peak, valley, DCR, or other current information?
6. Why should the current-sharing loop generally be separated in bandwidth from the primary voltage loop, and what exceptions exist?
7. How do mismatch, phase shedding, re-entry, and large load steps couple regulation, balance, and scheduling?

### 4.7 PSpice behavioral modeling

1. Which Cadence ABM elements and expressions are supported for sources, controlled switches, tables, limits, conditionals, derivatives, and integrals?
2. What PSpice-compatible patterns implement comparators, hysteresis, RS latches, one-shots, delays, blanking, and minimum on/off timing?
3. Which constructs risk algebraic loops, discontinuous Newton iterations, hidden state, or timestep-dependent behavior?
4. Which syntax is portable to alternative SPICE engines, and which is explicitly PSpice-specific?
5. How should discontinuities be smoothed without hiding the assumption?
6. How should timestep, tolerances, initial conditions, startup sources, and switch impedances be chosen and reported?
7. How are loop response, per-phase frequency, spacing, current mismatch, startup, load/line steps, and phase shedding measured?
8. What can be syntax-reviewed or cross-checked without Cadence, and what must remain “not PSpice validated”?

## 5. Curriculum architecture

The dependency graph is implemented as modules 0–12:

0. prerequisites and diagnostic assessment
1. switching buck power stage
2. ripple, modes, and component tradeoffs
3. dynamic power-stage behavior
4. feedback and loop terminology
5. error amplifiers and compensation
6. peak-current-mode control
7. constant-on-time control
8. control-mode comparison and taxonomy
9. multiphase fundamentals
10. multiphase COT architectures
11. PSpice modeling methods
12. progressive capstone

Each lesson contains: objective, prerequisites, intuition, prediction prompt, interactive experiment, derivation, PSpice consequence, transfer question, mastery check, sources, assumptions, and terminology caveats.

## 6. Required interactive laboratories

The application exposes seventeen named experiences:

- Current-path puzzle
- Inductor-ripple sandbox
- Capacitor/output-ripple sandbox
- CCM/DCM waveform identification
- Buck operating-point designer
- Pole-and-zero explorer
- Crossover-frequency tuning lab
- Error-amplifier builder
- Peak-current-mode pulse simulator
- Constant-on-time pulse simulator
- COT ripple-injection challenge
- Control-mode comparison lab
- Multiphase interleaving visualizer
- Multiphase COT scheduler simulator
- Current-sharing challenge
- PSpice block-construction puzzle
- Broken-model debugging laboratory

Every lab discloses abstraction level, equations, assumptions, included/excluded effects, integration or event method, time resolution, operating range, limitations, and source IDs.

## 7. Numerical engine

### 7.1 State

For \(N\) phases, the primary switched state is:

\[
\mathbf{x} = [i_{L,1},\ldots,i_{L,N},v_C]
\]

where output terminal voltage may include capacitor ESR and optional ESL as a documented algebraic or augmented-state relation.

### 7.2 Conducting-state equations

Each phase resolves an actual conducting state before integration:

- high-side channel,
- low-side channel,
- high-side/low-side dead time with appropriate body-diode path,
- discontinuous zero-current state when diode emulation is enabled, or
- explicitly enabled reverse-current state.

The sign convention is positive phase current from the switch node through the inductor into the output. Capacitor current is:

\[
i_C = \sum_k i_{L,k} - i_{load}
\]

### 7.3 Integration and event handling

- Deterministic fixed-step RK4 is the default educational integrator.
- Event boundaries (clock edge, one-shot expiration, delay expiration, minimum-off eligibility, load/line step) are inserted into the step schedule so a step does not silently straddle a known event.
- Comparator crossings use bounded linear interpolation within a step where available.
- Seeded xorshift or equivalent deterministic PRNG supplies optional noise and mismatch.
- A warning is required when \(\Delta t\) is too coarse relative to switching period, minimum timing, comparator delay, or injected ripple phase resolution.

### 7.4 Analytical validation

Tests cover conversion ratio, current slopes, peak-to-peak ripple, volt-second balance, charge balance, CCM/DCM boundary, phase summation, interleaving frequency, symmetry, mismatch, scheduler invariants, timing enforcement, deterministic seeds, and conservation-oriented sanity checks.

## 8. Application architecture

- React + TypeScript + Vite application under `app/`
- Pure TypeScript simulation package under `packages/sim-core/`
- Structured lessons and citations under `packages/lesson-content/`
- Web Worker adapter for longer simulations
- Plot components implemented with local package dependencies and no CDN runtime assets
- KaTeX equations bundled by the build
- Versioned localStorage persistence with JSON import/export/reset
- Vitest unit/component tests and Playwright browser/visual/accessibility/offline tests

The runtime must make no network request unless the learner explicitly opens a cited source.

## 9. Local learner data model

The versioned progress object stores:

- module and concept mastery state,
- completed readings,
- lab prediction and result records,
- puzzle attempts,
- simulator presets,
- notes,
- bookmarks,
- deterministic seed,
- schema version and export timestamp.

Imports are schema-validated, reject prototype-polluting keys, and report actionable errors. Reset requires an explicit local confirmation.

## 10. PSpice model ladder

Plain-text libraries and test benches progress through:

1. averaged buck
2. ideal switched buck
3. nonideal synchronous buck
4. voltage-mode controller
5. peak-current-mode controller
6. single-phase COT
7. two-phase COT
8. generated/configurable N-phase COT
9. current balancing
10. phase shedding/re-entry
11. capstone validation bench

Each file is tracked in a compatibility matrix containing intended simulator, syntax-review status, alternative-SPICE status, PSpice execution status, risks, and remaining work. Alternative-engine success is never called PSpice validation.

## 11. Source traceability

- `sources/manifest.json` is the canonical machine-readable source inventory.
- `sources/bibliography.csv` is the tabular export.
- Core path contains approximately 10–15 rigorous sources.
- Extended library contains at least 30 non-padding sources.
- Significant claims and equations cite stable IDs such as `[SRC-ERICKSON-2020]`.
- Every entry records access/licensing notes and limitations.
- Link checking distinguishes reachable, redirected, access-limited, and manually verified sources.

## 12. Quality gates

### Technical

- No silent averaged/switched-model mixing
- No unqualified claims that all COT controllers omit error amplifiers or compensation
- Correct inductor and capacitor sign conventions
- Modulator and feedback gains included in loop plots
- Current-sharing dynamics separated and disclosed
- Scheduler safety/fairness tests
- PSpice status stated honestly

### Product

- Desktop-first and tablet-usable
- Keyboard accessible with visible focus
- Sufficient contrast and reduced-motion support
- Line style/marker/label as well as color differentiates waveforms
- Axes, units, legends, cursors, assumptions, limitations, and sources visible
- Controls reject NaN, infinity, and impossible states with explanations
- Offline production build verified

### Repository

- Logical commits on `agent/initial-build`
- CI for lint, tests, build, link checks, secret scan, dependency audit, browser tests, and offline verification
- Private visibility verified directly before reporting success
- PR merged only after required checks pass

## 13. Definition of done

The work is complete only when the application, source library, curriculum, numerical engine, exercises, PSpice ladder, tests, screenshots, and handoff documentation are present; all feasible local checks pass; repository publication state is verified; and any unavailable Cadence validation is explicitly recorded as outstanding rather than implied.

## 14. First learner action

The initial lesson is **Module 1.1 — Two switch states, one continuous inductor current** after the Module 0 diagnostic. Its first source is the open-access introductory buck-converter section of Erickson and Maksimović’s *Fundamentals of Power Electronics* materials, with exact section metadata finalized in the verified source manifest.
