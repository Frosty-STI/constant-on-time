# Start here

## Your exact first lesson

Open **Module 1, Lesson 1.1: “Two switch states, one inductor”** in Constant On-Time Lab. Before running anything, draw the current path and write the inductor voltage for high-side on and low-side on.

Then open **`MIT622-L05` — David J. Perreault, “Lecture 5: Intro to DC/DC, Part 1”**:

https://ocw.mit.edu/courses/6-622-power-electronics-spring-2023/resources/mit6_622s23_lecture_05_mp4/

The source and URL were verified on 2026-08-08. Watch the periodic steady-state and buck portions, then return to the current-path puzzle. Do not start with a controller datasheet. A COT controller only makes sense after the switch-state physics is automatic.

## The first 90 minutes

1. Take the Module 0 diagnostic. Skip only skills you can demonstrate, not terms you recognize.
2. Watch `MIT622-L05` and derive volt-second balance without notes.
3. Complete the high-side-on, low-side-on, and dead-time cases in the current-path puzzle.
4. Set `Vin = 12 V`, `Vo = 1.2 V`, `L = 1 µH`, and `fs = 500 kHz` in the ripple sandbox. Predict both slopes and ripple before reveal.
5. Write one sentence answering: “What must a switched PSpice buck phase get right before any controller is added?”

## How to use the lab

Every lesson follows the same loop: mechanism → prediction → parameter change → simulation → discrepancy explanation → derivation → PSpice consequence → transfer question. A green-looking waveform is never sufficient evidence. State the abstraction, assumptions, and expected invariant first.

Use the evidence labels consistently:

- **Exact:** true inside a stated mathematical model.
- **Derived:** shown from constitutive laws and stated switching states.
- **Approximation:** valid only under listed limits.
- **Heuristic:** a starting point, not a physical law.
- **Architecture-specific:** tied to the cited controller or paper.
- **Modeling choice:** deliberately invented for the educational model.
- **Validation pending:** not executed in the target PSpice release.

## Do not skip these gates

- Do not tune a loop before you can predict the plant waveform.
- Do not call a phase-margin number valid until you can name the loop and injection point.
- Do not call a controller “COT” without separately stating what starts and what ends a pulse.
- Do not call phases balanced because their firing times are evenly spaced.
- Do not call a netlist PSpice-validated unless it ran in Cadence PSpice and the log is preserved.

## Source navigation

- Short rigorous path: `docs/sources/core-reading-path.md`
- All source metadata: `sources/manifest.json`
- Equations and validity: `docs/FORMULA_SHEET.md`
- Control labels: `docs/CONTROL_MODE_TAXONOMY.md`
- PSpice status: `pspice/validation-status.md`
