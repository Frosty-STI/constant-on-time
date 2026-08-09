# Mastery checklist

Mark a box only when you can derive, predict, simulate, and explain the limitation without looking up the answer.

## Power stage

- [ ] Draw every on/off/dead-time current path for positive and negative inductor current.
- [ ] Derive ideal conversion from volt-second balance.
- [ ] Derive on/off slopes and peak-to-peak ripple with units.
- [ ] Explain capacitor current as summed phase current minus load current.
- [ ] Identify CCM, DCM, boundary, reverse-current, skip, and numerical-artifact waveforms.
- [ ] Quantify capacitance and ESR ripple separately.
- [ ] Estimate initial load-step droop from charge deficit and state what is omitted.

## Dynamics and feedback

- [ ] Derive/name control-to-output, line-to-output, and output-impedance responses.
- [ ] Explain LC resonance and load-dependent damping physically.
- [ ] Name every factor in loop gain, including modulator and feedback gain.
- [ ] Distinguish crossover from a named closed-loop bandwidth.
- [ ] Distinguish power phase, phase offset, Bode phase, and phase margin.
- [ ] Build Type II and Type III networks and map each component to a pole/zero.
- [ ] Choose and defend a loop injection point.
- [ ] State why averaged analysis becomes suspect near switching-related frequencies.

## Control architectures

- [ ] For any controller, separately identify pulse-start rule, pulse-end rule, sensing, and frequency law.
- [ ] Animate the peak-current latch, sense ramp, artificial ramp, blanking, and delay.
- [ ] Explain the selected slope-compensation criterion and assumptions.
- [ ] Explain basic and adaptive COT timing without claiming constant frequency.
- [ ] Diagnose insufficient/misphased ripple injection.
- [ ] Explain why COT can include error/servo amplification and loop shaping.
- [ ] Classify a hybrid current-programmed COT architecture.

## Multiphase

- [ ] Derive phase-current summation and ideal spacing.
- [ ] Predict when ripple cancellation improves and when it degrades.
- [ ] Explain why equal timing does not ensure equal current.
- [ ] Measure per-phase average, peak, RMS, frequency, and phase spacing.
- [ ] Compare free-running, fixed-spacing, round-robin, minimum-separation, and current-priority educational schedulers.
- [ ] Detect collision, bunching, starvation, unfairness, and beat behavior.
- [ ] Tune a deliberately slower current-balance loop and recognize interaction with the voltage loop.
- [ ] Explain phase-shedding hysteresis and controlled re-entry.

## PSpice and validation

- [ ] Choose averaged, switched behavioral, macro-model, or transistor detail based on the question.
- [ ] Build comparator, hysteresis, latch, one-shot, delay, min-times, and current limit as inspectable blocks.
- [ ] Explain sign conventions at every behavioral source.
- [ ] Set timestep/event resolution from the shortest modeled timing feature.
- [ ] Diagnose chatter, algebraic loops, ideal-switch convergence, floating nodes, and bad initial conditions.
- [ ] Validate conversion, slopes, volt-second balance, charge balance, symmetry, and mismatch trends.
- [ ] Separate mathematical checks, alternative-SPICE cross-checks, and actual PSpice execution.
- [ ] Explain every capstone block, abstraction, omitted behavior, and falsifying test.

## Capstone sign-off

- [ ] Startup, line step, load step, mismatch, current limit, phase shedding, and re-entry pass stated acceptance criteria.
- [ ] Every significant claim and equation has a citation ID and validity statement.
- [ ] No employer, customer, restricted model, credential, or proprietary parameter is present.
- [ ] PSpice status is stated honestly with version and preserved log if executed.

