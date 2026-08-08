# Annotated bibliography

The canonical metadata is `sources/manifest.json`; `sources/bibliography.csv` is a flat export. This document is a human routing index, not a substitute for the sources. Access was checked 2026-08-08.

## Foundations and plant dynamics

- **FPE3 — Erickson and Maksimović, *Fundamentals of Power Electronics*.** The rigorous backbone: equilibrium, DCM, averaging, transfer functions, controller design, and averaged-switch simulation. Use its stated model conditions; do not treat averaged waveforms as switch waveforms.
- **MIT622-L05, MIT622-L07, MIT622-L08.** Open university lectures that build steady-state, ripple, ratings, and DCM intuition. Idealizations are deliberate teaching abstractions.
- **TI-SLVA057 — Rogers, *Understanding Buck Power Stages*.** An equation-rich manufacturer treatment of the buck plant in CCM/DCM. It excludes the controller, which makes it valuable for isolating plant physics.
- **TI-SLVA477 and ADI-BUCK-EQ.** Independent manufacturer references for component sizing and ripple estimates. Agreement across the two is useful; their heuristics still need conditions and tolerances.
- **VORPERIAN-CCM and VORPERIAN-DCM.** The PWM-switch papers give reusable circuit-oriented averaged models. They intentionally discard switching-event detail.

## Feedback, loop gain, and measurement

- **TI-SLVA301.** Builds voltage-mode buck loop gain from plant, modulator, error amplifier/compensator, and feedback. It is the antidote to plotting only a compensator and calling it “the loop.”
- **MIDDLEBROOK-1975.** Foundational injection and return-ratio measurement paper. The injection point and impedance conditions matter.
- **BROWN-1981.** High-value warning that conventional averaged analysis and loop interpretation degrade near half switching frequency. Read before pursuing aggressive crossover.
- **CAD-ABM-PLOT.** Useful for computed PSpice measurements and traces; graphical agreement is not validation.

## Peak-current-mode control

- **MIT622-L27.** Modern educational introduction to current-mode feedback, models, and ripple instability.
- **TI-SNVA555.** Practical explanation of current-loop operation, modulator gain, sampling gain, and slope compensation.
- **TI-SLVAE22.** Connects slope compensation and power-stage gain to measurement.
- **RIDLEY-1991.** Advanced continuous-time representation incorporating important sampled-data behavior. Its validity limit and assumptions must remain visible.
- **TAN-MIDDLEBROOK-1995.** Unified model for current-programmed converters. Best treated as an advanced reference after mastering sign and normalization conventions.

## Control and modulation taxonomy

- **KAPAT-2020.** Broad IEEE review that separates modulation, control, and tuning. It is the central taxonomy reference.
- **RIDLEY-1990-COT.** Direct evidence that current programming and constant-on/off-time timing laws can coexist. This prevents falsely orthogonal labels.

## Constant on-time, adaptive on-time, and ripple

- **TI-SLVA281.** Strong introductory COT/AOT architecture comparison, including jitter; vendor branded, so generalize cautiously.
- **TI-SLVA453.** Concrete external ripple-injection network for low-ESR capacitors.
- **TI-SNVA166.** Separates output ripple from an ESR-independent internal/derived control ripple approach.
- **TI-SNVA874.** Shows that a COT ripple network has its own dynamics and startup/short-circuit consequences.
- **TI-SLVA546.** Detailed vendor frequency-response model with plant, divider, comparator/ripple dynamics, and fixed-on-time delay.
- **TI-SLVAF11.** Connects output capacitance and an internal ripple-injection zero to D-CAP2/D-CAP3 stability boundaries.
- **TI-SLYY205.** Accessible map of branded D-CAP generations and minimum-off-time/ripple tradeoffs.
- **LIU-COT-2023.** Modern peer-reviewed small-signal COT analysis across duty ratio. Advanced and architecture-specific.
- **SUN-COT-2019.** Representative pseudo-constant-frequency COT IC with internal inductor-current-ripple injection.
- **ON-FAN23SV10M.** Product-level timing, protection, and light-load example. Use it to see concrete limits, never as the universal COT block diagram.

## Multiphase conversion

- **TI-SLVA882.** Practical baseline for phases, 360°/N spacing, component sizing, and ripple cancellation.
- **TI-SLYT139.** Relates interleaved design to large, fast load transients and parasitics.
- **TI-SSZTC61.** Concise static/dynamic current-sharing overview and mismatch/sensing motivation.
- **INFINEON-APEC03.** A concrete average current-share-bus architecture scalable across many phases.
- **INFINEON-DUALPHASE.** Useful special case for multiple stages driven by shared timing.
- **IEEE-COT4PH-2017.** Peer-reviewed four-phase COT example comparing saw-tooth-wave and PLL coordination. It is representative evidence for active coordination, not a universal scheduler architecture.

## PSpice and behavioral modeling

- **CAD-PSPICE-UG.** Primary official syntax/workflow reference: ABM, expressions, Laplace/frequency blocks, transient analysis, convergence, sweeps, and Monte Carlo. Installed-version execution is still mandatory.
- **CAD-DCDC-APP and CAD-FORWARD-APP.** Official converter-oriented PSpice workflows and hierarchical ABM examples. Their topologies do not prove this project's buck/COT netlists.
- **CAD-PSPICE-PRODUCT and TI-PSPICE-FOR-TI.** Current capability and edition context. Product pages are not syntax authorities.
- **ADI-AN1144.** Measurement-artifact reference that supports the debugging lab's physical-versus-instrument-versus-numerical distinction.
- **TI-SLVA958.** A source-discovery index only; verify each linked report before citing a claim.
