# Core reading path

This 15-source path is the shortest rigorous route in this library from switch-state physics to a configurable multiphase constant-on-time (COT) behavioral model. Read it in order. Every citation ID resolves through `sources/manifest.json`; every link below was accessed and verified on **2026-08-08**. Page ranges appear only where an official publisher table of contents was verified.

## 1. `MIT622-L05` — derive the switch states

- **Full citation:** David J. Perreault, *Lecture 5: Intro to DC/DC, Part 1*, MIT OpenCourseWare university lecture, 2023.
- **Link / accessed:** https://ocw.mit.edu/courses/6-622-power-electronics-spring-2023/resources/mit6_622s23_lecture_05_mp4/ — 2026-08-08.
- **Difficulty / prerequisites:** Introductory; KVL, inductors, capacitors, and averages.
- **Review exactly:** Entire lecture, especially periodic steady state, volt-second balance, and the buck introduction.
- **Why / concepts:** Makes state-dependent inductor voltage—not a memorized duty formula—the starting point for buck reasoning.
- **After reading, answer:** What is the inductor voltage in each switch state? Why must its average be zero in periodic steady state?
- **PSpice consequence:** A switched phase is credible only if every conduction state produces the correct switch-node voltage and current path.
- **Limits / vendor assumptions:** Foundational ideal circuit; it does not treat detailed control, dead time, or loss. No vendor architecture is assumed.

## 2. `TI-SLVA057` — connect physics to CCM, DCM, and the plant

- **Full citation:** Everett Rogers, *Understanding Buck Power Stages in Switchmode Power Supplies*, Texas Instruments application report, March 1999.
- **Link / accessed:** https://www.ti.com/lit/pdf/slva057 — 2026-08-08.
- **Difficulty / prerequisites:** Introductory-to-intermediate; source 1 and basic algebra.
- **Review exactly:** “Continuous-Conduction Mode,” “Discontinuous-Conduction Mode,” and “Buck Power Stage Small-Signal Analysis.”
- **Why / concepts:** Unifies ripple, CCM/DCM, conversion, and the control-to-output plant.
- **After reading, answer:** Which ideal conversion relationships change in DCM? Where does load enter plant damping?
- **PSpice consequence:** Use its slopes, ripple, conversion, boundary, and plant response as analytical fixtures.
- **Limits / vendor assumptions:** The report explicitly excludes the control circuit and uses idealized application-report assumptions; its notation is not an architecture definition.

## 3. `FPE3` — build the mathematical backbone

- **Full citation:** Robert W. Erickson and Dragan Maksimović, *Fundamentals of Power Electronics*, 3rd ed., Springer Nature textbook, 2020.
- **Link / accessed:** https://link.springer.com/book/10.1007/978-3-030-43881-4 — 2026-08-08.
- **Difficulty / prerequisites:** Intermediate-to-advanced; circuits, differential equations, complex frequency, and Laplace transforms.
- **Review exactly:** “Principles of Steady-State Converter Analysis,” pp. 15–41; “The Discontinuous Conduction Mode,” pp. 135–162; “AC Equivalent Circuit Modeling,” pp. 215–275; “Converter Transfer Functions,” pp. 277–346; “Controller Design,” pp. 347–405; and “Circuit Averaging, Averaged Switch Modeling, and Simulation,” pp. 547–583.
- **Why / concepts:** Provides rigorous derivations for state-space averaging, perturbation, transfer functions, feedback, and averaged switches.
- **After reading, answer:** What is perturbed in a small-signal model? Which pulse information disappears under averaging?
- **PSpice consequence:** Defines the averaged-model rung and its validation targets; it also explains why that rung cannot show jitter, collision, or pulse skipping.
- **Limits / vendor assumptions:** Full access may require purchase. COT and multiphase scheduling are not central topics. No vendor architecture is assumed.

## 4. `TI-SLVA301` — factor and shape a complete loop

- **Full citation:** Daniel Meeks, *Loop Stability Analysis of Voltage Mode Buck Regulator With Different Output Capacitor Types – Continuous and Discontinuous Modes*, Texas Instruments application report, April 2008.
- **Link / accessed:** https://www.ti.com/lit/pdf/slva301 — 2026-08-08.
- **Difficulty / prerequisites:** Intermediate-to-advanced; source 3, Bode plots, poles, and zeros.
- **Review exactly:** “Buck Power Stage Model,” “Voltage Mode Modulator,” compensation design, and the continuous- and discontinuous-mode results.
- **Why / concepts:** Shows that plant, modulator, compensator/error amplifier, and feedback network all participate in loop gain.
- **After reading, answer:** Why is a compensator plot not loop gain? How do load and capacitor type change the plant?
- **PSpice consequence:** An AC testbench must include modulator and sensing gains and identify its injection point and sign convention.
- **Limits / vendor assumptions:** Voltage-mode centered; its device and capacitor examples are vendor-contextual. It does not establish a universal crossover rule.

## 5. `MIDDLEBROOK-1975` — measure return ratio without destroying the operating point

- **Full citation:** R. D. Middlebrook, “Measurement of Loop Gain in Feedback Systems,” *International Journal of Electronics*, peer-reviewed paper, April 1975.
- **Link / accessed:** https://doi.org/10.1080/00207217508920421 — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; linear feedback and two-port reasoning.
- **Review exactly:** Voltage injection, current injection, null double injection, and interpretation of closed-loop measurements.
- **Why / concepts:** Establishes that an injection result represents return ratio only under the required loop-cut and impedance conditions.
- **After reading, answer:** When does simple voltage injection recover loop gain? Why should a regulating loop not casually be opened?
- **PSpice consequence:** Provide a documented injection source and verify the topology rather than plotting an arbitrary node ratio.
- **Limits / vendor assumptions:** Linear framework; sampled switching effects require later sources. Full text may require institutional access. No vendor architecture is assumed.

## 6. `BROWN-1981` — learn where averaged analysis stops

- **Full citation:** Arthur Raymond Brown, *Topics in the Analysis, Measurement, and Design of High-Performance Switching Regulators*, California Institute of Technology doctoral dissertation, 1981.
- **Link / accessed:** https://thesis.caltech.edu/3994/ — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; sources 3–5 and sampled-data intuition.
- **Review exactly:** Part I, sampled-data modeling; Part II, loop-gain measurements; Part III, high-bandwidth sensitivity.
- **Why / concepts:** Explains why state-space averaging loses accuracy as dynamics approach the switching scale and why loop measurement is sampling-sensitive.
- **After reading, answer:** Why can a smooth, plausible averaged Bode plot be misleading near the switching rate?
- **PSpice consequence:** State the averaged AC model’s frequency range and validate high-bandwidth claims with a switched or sampled model.
- **Limits / vendor assumptions:** Advanced historical notation must be translated carefully. No vendor architecture is assumed.

## 7. `MIT622-L27` — see the peak-current pulse mechanism

- **Full citation:** David J. Perreault, *Lecture 27: Current-Mode Control*, MIT OpenCourseWare university lecture, 2023.
- **Link / accessed:** https://ocw.mit.edu/courses/6-622-power-electronics-spring-2023/resources/mit6_622s23_lecture_27_mp4/ — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; switching waveforms, feedback, and discrete-time perturbations.
- **Review exactly:** Entire lecture: peak-current-mode pulse formation, averaged interpretation, slope compensation, and ripple instability.
- **Why / concepts:** Connects clock/set, sensed-ramp/reset, cycle-to-cycle perturbation, and artificial ramp.
- **After reading, answer:** Which physical slopes determine whether a small alternating perturbation grows? What assumptions underlie the familiar 50% result?
- **PSpice consequence:** Represent the latch, current comparator, sense polarity, artificial ramp, and switching-cycle memory explicitly.
- **Limits / vendor assumptions:** A teaching derivation is not a transistor-complete commercial controller and cannot replace architecture-specific documentation.

## 8. `RIDLEY-1991` — add the sampled current-loop model

- **Full citation:** Raymond B. Ridley, “A New, Continuous-Time Model for Current-Mode Control,” *IEEE Transactions on Power Electronics*, peer-reviewed paper, April 1991.
- **Link / accessed:** https://doi.org/10.1109/63.76813 — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; source 7, small-signal control, and sampling.
- **Review exactly:** Sampled-data representation, current-loop gain, control-to-output response, and subharmonic prediction.
- **Why / concepts:** Retains the high-frequency current-loop/sampling behavior erased by the most simplified current-mode model.
- **After reading, answer:** In what frequency range can an inductor-pole simplification help, and what sampled dynamics remain?
- **PSpice consequence:** Include comparator delay, blanking, current-sense filtering, and cycle-to-cycle observation when those effects matter.
- **Limits / vendor assumptions:** Honor the paper’s model assumptions and frequency range; it is not a universal commercial-controller model.

## 9. `KAPAT-2020` — separate modulation, control, and tuning labels

- **Full citation:** Santanu Kapat and Philip T. Krein, “A Tutorial and Review Discussion of Modulation, Control and Tuning of High-Performance DC–DC Converters Based on Small-Signal and Large-Signal Approaches,” *IEEE Open Journal of Power Electronics*, peer-reviewed review, 2020.
- **Link / accessed:** https://doi.org/10.1109/OJPEL.2020.3018311 — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; sources 3–8.
- **Review exactly:** Control/modulation taxonomy, small-signal tuning, large-signal approaches, and constant-on-time examples.
- **Why / concepts:** Prevents a timing law, sensed variable, loop organization, and vendor family name from being collapsed into one label.
- **After reading, answer:** Can constant-on-time timing coexist with current programming? Which dimensions are independent?
- **PSpice consequence:** Describe pulse-start logic, pulse-end logic, sensed variables, and slow loops as separate configurable blocks.
- **Limits / vendor assumptions:** A broad review requires follow-up in architecture-specific primary sources. No single vendor implementation defines its taxonomy.

## 10. `RIDLEY-1990-COT` — compare timing-law variants inside one framework

- **Full citation:** Raymond B. Ridley, “A New Continuous-Time Model for Current-Mode Control With Constant Frequency, Constant On-Time, and Constant Off-Time, in CCM and DCM,” IEEE conference paper, 1990.
- **Link / accessed:** https://ieeexplore.ieee.org/document/131213/ — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; sources 7–9 and CCM/DCM modeling.
- **Review exactly:** Constant-frequency model, constant-on-time extension, constant-off-time extension, and CCM/DCM comparisons.
- **Why / concepts:** Demonstrates that current-programmed behavior and pulse-timing law are not necessarily mutually exclusive categories.
- **After reading, answer:** Which event is fixed and which event is state-dependent in each timing variant?
- **PSpice consequence:** Implement pulse-start and pulse-end rules as composable decisions rather than a single controller label.
- **Limits / vendor assumptions:** Historical continuous-time model; apply only within stated assumptions and compare with newer sampled-data work. No modern product behavior is implied.

## 11. `TI-SLVA281` — observe basic and adaptive COT pulse timing

- **Full citation:** Chuan Ni and Tateishi Tetsuo, *Adaptive Constant On-Time (D-CAP™) Control Study in Notebook Applications*, Texas Instruments application report, December 2007.
- **Link / accessed:** https://www.ti.com/lit/pdf/slva281 — 2026-08-08.
- **Difficulty / prerequisites:** Intermediate; buck ripple and feedback-comparator basics.
- **Review exactly:** Control-method comparison, “Constant On-Time Control,” “Adaptive On-Time Control,” and “Jitter Mechanism.”
- **Why / concepts:** Makes pulse request, one-shot termination, variable off-time, adaptive timing, comparator ripple, and jitter concrete.
- **After reading, answer:** Which interval is controlled? Why can switching frequency vary? What determines the next pulse request?
- **PSpice consequence:** Separate comparator crossing, one-shot duration, adaptive on-time law, propagation delay, and minimum off-time.
- **Limits / vendor assumptions:** D-CAP is a specific Texas Instruments family, not the definition of all COT controllers.

## 12. `TI-SLVA546` — expose the dynamics inside one ripple-injected COT architecture

- **Full citation:** Toshiyuki (Rick) Zaitsu, Katsuya Goto, Takahiro Miyazaki, and Junichi Yamamoto, *D-CAP2™ Frequency Response Model Based on Frequency Domain Analysis of Fixed On-Time With Bottom Detection Having Ripple Injection*, Texas Instruments application report, January 2013.
- **Link / accessed:** https://www.ti.com/lit/pdf/slva546 — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; sources 3–6 and 11.
- **Review exactly:** Open-loop blocks, comparator with ripple injection, plant transfer function, fixed-on-time delay, Bode measurement, and Appendix A derivation.
- **Why / concepts:** Shows that COT can contain finite delay, loop dynamics, damping, and a frequency-shaped ripple path.
- **After reading, answer:** Which dynamics does ripple injection add? Where does fixed-on-time delay enter the loop?
- **PSpice consequence:** Keep the ripple source, comparator, timing delay, plant, divider, and any slow servo/error amplifier visible as separate blocks.
- **Limits / vendor assumptions:** Specific D-CAP2 bottom-detection architecture; small-ripple, averaged, below-switching-frequency assumptions do not transfer unchanged to every COT controller.

## 13. `LIU-COT-2023` — study a modern COT small-signal derivation

- **Full citation:** Wen-Chin Liu, Ching-Hsiang Cheng, Patrick P. Mercier, and Chunting Chris Mi, “Small-Signal Analysis and Design of Constant On-Time Controlled Buck Converters With Duty-Cycle-Independent Quality Factors,” *IEEE Transactions on Power Electronics*, peer-reviewed paper, July 2023.
- **Link / accessed:** https://doi.org/10.1109/TPEL.2023.3268613 — 2026-08-08.
- **Difficulty / prerequisites:** Advanced; sources 3–6 and 11–12.
- **Review exactly:** Frequency-domain COT model, quality-factor derivation, duty-cycle dependence, design strategy, and validation.
- **Why / concepts:** Gives a contemporary example of architecture-aware COT damping analysis rather than a slogan about “no compensation.”
- **After reading, answer:** What makes the derived quality factor duty dependent, and what intervention removes that dependence in this architecture?
- **PSpice consequence:** Match every behavioral block to the derivation before comparing Bode results; do not transplant the transfer function to a different comparator/ripple topology.
- **Limits / vendor assumptions:** The modeled COT structure and assumptions are specific; the result is not universal across branded variants.

## 14. `TI-SLVA882` — scale the power stage to multiple phases

- **Full citation:** Carmen Parisi, *Multiphase Buck Design From Start to Finish (Part 1)*, Texas Instruments application report, April 2017, revised April 2021.
- **Link / accessed:** https://www.ti.com/lit/an/slva882/slva882.pdf — 2026-08-08.
- **Difficulty / prerequisites:** Intermediate-to-advanced; ripple, RMS current, and transient charge balance.
- **Review exactly:** Multiphase regulator basics, per-phase power stage, phase spacing, and output/input ripple.
- **Why / concepts:** Covers interleaving, summed phase current, ripple cancellation, mismatch, component stress, and phase management.
- **After reading, answer:** Why does equal 360°/N spacing not guarantee equal phase current? When does ideal ripple cancellation disappear?
- **PSpice consequence:** Give each phase independent L, DCR, sense gain/offset, timing, and current-limit parameters; observe both summed and per-phase quantities.
- **Limits / vendor assumptions:** Equal spacing is an ideal baseline. Product-oriented design guidance is not a universal COT scheduler or balance-loop architecture.

## 15. `CAD-PSPICE-UG` — translate every abstraction into inspectable PSpice syntax

- **Full citation:** Cadence Design Systems, *PSpice A/D User Guide*, Product Version 17.4-2019, October 2019; document updated March 2022, official software manual.
- **Link / accessed:** https://resources.pcb.cadence.com/i/1180526-pspice-user-guide — 2026-08-08.
- **Difficulty / prerequisites:** Intermediate; SPICE netlists, transient analysis, and sources 1–14 for physical meaning.
- **Review exactly:** Analog behavioral modeling; ABM expressions and math functions; Laplace transforms and frequency-response tables; transient analysis; convergence and simulation options; parametric sweeps; and Monte Carlo analysis.
- **Why / concepts:** It is the official syntax and analysis reference for the model ladder.
- **After reading, answer:** Which PSpice constructs can express a comparator, controlled switch, transfer block, and parameter sweep? Which discontinuities are likely to impair convergence?
- **PSpice consequence:** Use documented constructs, expose parameters hierarchically, record solver options, and preserve target-version execution logs.
- **Limits / vendor assumptions:** The hosted edition may not match the installed release. A syntax review or another SPICE engine does not establish Cadence PSpice compatibility; only a target-version run can do that.

## Optional bridge readings

After source 2, use `MIT622-L07` and `MIT622-L08` for extra practice with ratings, ripple, component selection, and DCM. For a concrete average-current share-bus architecture after source 14, use `INFINEON-APEC03`. These are in the extended library but are not counted in the 15-source core.
