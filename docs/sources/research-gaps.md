# Research gaps and validation debt

These gaps are intentionally visible; filling them is preferable to false precision.

## High priority

1. **Target-version PSpice execution.** `CAD-PSPICE-UG` is authoritative general documentation, but every netlist must be executed in the user's actual Cadence PSpice version. Syntax review or another SPICE engine cannot establish compatibility.
2. **Comparator/one-shot implementation limits.** Public COT papers and datasheets disclose functional blocks, but propagation-delay distributions, overdrive dependence, blanking internals, metastability behavior, and proprietary anti-jitter logic are rarely complete. The lab must label these as behavioral parameters.
3. **Multiphase COT scheduler breadth.** Public material supports active phase locking, free-running, and average-share examples, but a neutral survey of collision avoidance, fairness, starvation proofs, and current-priority scheduling is incomplete. The implemented schedulers are educational architectures.
4. **COT sampled-data analysis across CCM/DCM and pulse skipping.** Modern small-signal work is strongest around a particular steady-state mode. Large-signal, mode-changing validation remains a transient-simulation and bench problem.

## Medium priority

5. **Current-sharing loop design rules.** Public manufacturer sources establish need and representative architectures, but generalized robust bandwidth-selection criteria across scheduler types and N phases need more peer-reviewed coverage.
6. **Dead-time reverse-current paths.** The physical path depends on current sign, MOSFET body diode orientation, diode-emulation logic, and switch capacitances. The educational engine omits detailed commutation capacitance unless explicitly enabled.
7. **Capacitor ESL and package/layout models.** Lumped ESL can teach edge response, but a single ESL cannot reproduce distributed PCB/package resonances. Correlate to impedance measurements before claiming hardware fidelity.
8. **Noise model realism.** Reproducible seeded noise is suitable for algorithm exercises, not a validated semiconductor comparator-noise spectrum.
9. **Frequency-response measurement for variable-frequency COT.** Small-signal injection can be meaningful, but interpretation depends on quasi-periodicity, analyzer method, perturbation amplitude, and architecture. The lab must disclose its linearization.

## Lower priority / extensions

10. Coupled inductors and TLVR structures.
11. Magnetic saturation, core loss, and temperature-dependent winding resistance.
12. MOSFET charge, nonlinear capacitance, reverse recovery, and gate-drive loss.
13. EMI/common-mode behavior and layout parasitics.
14. Digital quantization, latency, and limit cycles in digitally implemented COT.
15. Formal stability/fairness analysis of phase schedulers.
16. Hardware FRA correlation and oscilloscope current-probe de-embedding.

## Research policy

No gap may be filled by copying restricted models, internal schematics, employer data, or unverifiable forum claims. Add a source only after verifying its title, authorship/organization, stable link, access terms, scope, and architecture assumptions.
