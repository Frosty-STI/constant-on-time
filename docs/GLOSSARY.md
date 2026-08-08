# Glossary

Terms use the sign convention `iL > 0` from switch node through the inductor into the output and `iC > 0` into the capacitor. Sources: `FPE3`, `TI-SLVA057`, `TI-SLVA301`, `KAPAT-2020`, `TI-SLVA882`, `CAD-PSPICE-UG`.

| Term | Meaning in this project |
|---|---|
| Adaptive on-time (AOT) | On-time deliberately varied with operating conditions, often to make average frequency less sensitive to line/output; implementation-specific. |
| Algebraic loop | A zero-delay cyclic dependency with no dynamic state; it can be ill posed or numerically fragile. |
| Averaged model | Model that replaces switching action with cycle-averaged relations; cannot show individual pulses, ripple, jitter, or collisions. |
| Bode phase | Angle of a complex transfer function versus frequency. Not a power phase. |
| Boundary conduction | Operating point at which inductor current just reaches zero at a switching boundary under the stated conduction rules. |
| Charge balance | In periodic steady state, average capacitor current is zero, so net charge change per period is zero. |
| Closed-loop bandwidth | A bandwidth metric of a named closed-loop transfer function; not automatically equal to loop crossover. |
| CCM | Continuous-conduction mode; inductor current does not enter a zero-current interval under the chosen polarity/conduction definition. |
| Comparator hysteresis | Different effective thresholds depending on output state, used to reduce chatter; not the same as ripple injection. |
| Compensation | Deliberate shaping of loop dynamics. It can be external, internal, distributed among paths, or implicit in an architecture. |
| Constant on-time (COT) | Modulation/timing family in which an initiated pulse lasts a set or law-defined on-time; the start event and outer regulation must still be specified. |
| Control-to-output | Small-signal transfer from control variable (often duty or command) to output voltage under a stated model. |
| Crossover frequency | Frequency where a named loop gain crosses unity; multiple crossings require explicit identification. |
| Current balance | Correction that reduces unequal phase currents; distinct from phase spacing. |
| Current-limit comparator | Protection/command element that changes switching when sensed current reaches a limit. |
| Current sharing loop | Feedback loop that adjusts per-phase commands to equalize a chosen current metric. |
| DCM | Discontinuous-conduction mode; includes a zero-current interval for a unidirectional stage. |
| Dead time | Deliberate interval when both commanded MOSFET channels are off to prevent shoot-through. Current may still flow through body diodes/capacitances. |
| Diode emulation | Light-load logic that disables synchronous reverse current by turning off the low-side path near zero current. |
| Duty ratio | Fraction of a defined period for which a defined state is active. In variable-frequency control, define the averaging interval. |
| Effective ripple frequency | Dominant repetition rate in a summed interleaved waveform; often `N × fs` only for ideal equal-frequency/equal-spacing conditions. |
| Error amplifier | Amplifier that processes reference error; may be op-amp-like or transconductance. Some COT architectures include one or a slower servo. |
| ESR zero | Zero introduced by capacitor ESR and capacitance in a lumped small-signal model: `ωz = 1/(RESR × C)` (`FPE3`, `TI-SLVA301`). |
| Event resolution | Temporal precision with which a simulator detects/schedules switching crossings. It may differ from saved waveform spacing. |
| Gain margin | Gain change to an instability condition at a specified phase crossing under a stated loop convention. |
| Gain peaking | Closed-loop magnitude exceeding its low-frequency/reference level near resonance; affected by more than phase margin alone. |
| Hysteretic control | Switching based on crossing one or more bounds; timing and feedback implementation must be stated. |
| Injected ripple | Deliberate AC signal added to a comparator/control path to create useful timing/dynamics. |
| Inner current loop | Faster loop or sampled cycle action using current information inside an outer regulation loop. |
| Interleaving | Intentionally displaced phase activity to reshape summed input/output ripple and distribute power. |
| Line-to-output | Small-signal transfer from input voltage perturbation to output voltage. |
| Loop gain / return ratio | Gain accumulated around a specified feedback loop with a defined return-ratio convention and break/injection point. |
| Minimum off-time | Interval after an on pulse during which another on pulse is ineligible; constrains maximum duty and scheduler behavior. |
| Minimum on-time | Smallest realizable high-side pulse; constrains low duty ratio and can cause pulse skipping. |
| Model abstraction | Selected level of detail: analytical, averaged, switched behavioral, device macro-model, or transistor-level. |
| Modulator gain | Small-signal gain from control input to duty/timing variable under a stated modulation model. |
| Monostable / one-shot | Element that produces a pulse of specified duration after a valid trigger. |
| Numerical artifact | Behavior caused by discretization, solver, tolerance, event handling, or discontinuity rather than the represented circuit. |
| Output impedance | Small-signal output-voltage response to load-current perturbation with other excitations constrained as stated. |
| Phase collision | Two or more phases firing too close together under a defined minimum-separation criterion. |
| Phase margin | Loop-angle margin at a named unity-gain crossing and phase convention. |
| Phase shedding | Disabling one or more phases, typically at lower load, to reduce loss; requires defined re-entry and current transition behavior. |
| Phase starvation | Persistent denial or lack of pulses for a phase that should participate. |
| Power phase | One paralleled energy-processing branch, usually switch pair plus inductor and sensing. |
| Power-stage bandwidth | Ambiguous phrase; replace with LC resonance, plant response, or a named closed-loop bandwidth. |
| Propagation delay | Time between an input condition/crossing and resulting output/command transition. |
| Pulse bunching | Multiple granted pulses clustered in time, reducing cancellation and potentially worsening transient stress. |
| Pulse skipping | Omission of switching pulses, commonly at light load or minimum-on-time limits. |
| Reverse current | Negative inductor current under the project sign convention, enabled only by a bidirectional conduction path/control state. |
| Ripple cancellation | Reduction in the sum of phase ripple due to timing; generally incomplete away from special ideal conditions and with mismatch. |
| RS latch | State element set by one event and reset by another; breaks zero-delay dependence and defines pulse memory. |
| Sampled-data effect | Dynamics caused by decisions taken at discrete switching-related instants, invisible to a naive continuous average. |
| Scheduler fairness | Degree to which eligible phases receive pulses over a stated observation window; define the metric. |
| Slope compensation | Artificial ramp combined with sensed current/control to alter sampled cycle-to-cycle dynamics and noise margin. |
| State variable | Minimal dynamic quantity whose value carries system memory, such as inductor current or capacitor voltage. |
| Switching frequency | Rate of switching cycles/pulses for a specified phase and measurement window; may vary in COT. |
| Type I / II / III | Common compensator families distinguished by integrators/poles/zeros; topology definitions should be shown, not assumed from the label. |
| Valley current mode | Pulse decision tied to a current valley crossing; not equivalent to peak-current control with inverted signs. |
| Volt-second balance | In periodic steady state, average inductor voltage is zero, so net flux/current change over a period is zero. |
| Voltage-loop bandwidth | Bandwidth/crossover of the named voltage regulation loop, distinct from current or sharing loops. |
| Voltage-mode control | Outer regulation drives a timing/duty modulator primarily from voltage error; sensing and feedforward variants exist. |
