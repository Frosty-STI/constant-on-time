# Common misconceptions

Each correction names the condition that makes the tempting statement fail.

1. **“The inductor supplies constant current.”** Its current is continuous in ideal CCM, not constant; state-dependent voltage produces rising and falling slopes. `MIT622-L05`, `TI-SLVA057`.
2. **“The capacitor only filters switching noise.”** It carries the difference between summed inductor and load current and supplies/absorbs transient charge. `FPE3`, `TI-SLYT139`.
3. **“Duty ratio is always exactly `Vo/Vin`.”** That equality is an ideal CCM steady-state result; losses, dead time, DCM, timing constraints, and transients modify it. `TI-SLVA057`, `FPE3`.
4. **“Crossover frequency and closed-loop bandwidth are always identical.”** Crossover belongs to a named loop gain; bandwidth belongs to a named closed-loop response and depends on loop shape. `FPE3`.
5. **“More crossover frequency is always better.”** Delay, sampling, switching harmonics, noise, plant uncertainty, and multiple crossings impose tradeoffs. `BROWN-1981`, `FPE3`.
6. **“Phase margin directly tells the entire transient response.”** It is one local loop metric; gain shape, zeros, saturation, large-signal slew, load dynamics, and nonlinear modes matter. `FPE3`, `MIDDLEBROOK-1975`.
7. **“A power phase is the same thing as Bode phase.”** A power phase is a parallel energy-processing branch; Bode phase is a transfer-function angle. `TI-SLVA882`, `FPE3`.
8. **“Peak-current-mode control completely removes LC dynamics.”** A low-frequency outer-loop approximation simplifies the inductor contribution; sampling and higher-frequency plant dynamics remain. `RIDLEY-1991`, `TI-SNVA555`.
9. **“All duty cycles above 50% are automatically unstable.”** The familiar criterion belongs to a simplified uncompensated peak-current sampled-data case; artificial slope and architecture change the condition. `MIT622-L27`, `RIDLEY-1991`.
10. **“All constant-on-time controllers have no error amplifier.”** Some use a fast comparator plus a slower servo/integrator or other error-processing path. State the disclosed architecture. `KAPAT-2020`, `TI-SLVA546`.
11. **“Constant on-time means switching frequency is constant.”** Fixed pulse length plus variable off-time normally yields variable frequency; adaptive/feedforward laws can make it approximately constant. `TI-SLVA281`, `SUN-COT-2019`.
12. **“Constant on-time needs no ripple design.”** Comparator crossing quality and loop dynamics may depend on natural or injected ripple amplitude, phase, and delay. `TI-SLVA453`, `TI-SNVA874`.
13. **“Constant on-time never needs compensation.”** It may need no external COMP network, yet internal ripple/servo paths and plant/delay still shape stability. `TI-SLVA546`, `TI-SLVAF11`, `LIU-COT-2023`.
14. **“Multiphase means each phase independently regulates the output.”** Phases share an output and may be centrally scheduled, locked, or driven; independent free-running control is only one architecture. `TI-SLVA882`, `IEEE-COT4PH-2017`.
15. **“Perfect `360°/N` timing automatically guarantees current sharing.”** Spacing controls ripple timing; L, DCR, sense gain/offset, resistance, and pulse allocation control average current. `TI-SSZTC61`, `INFINEON-APEC03`.
16. **“Interleaving always eliminates output ripple.”** Cancellation depends on duty, spacing, equal waveforms, and matching and is generally partial. `TI-SLVA882`.
17. **“A converged SPICE waveform must be physically correct.”** A solver can converge to a faithfully computed wrong equation, polarity, topology, or abstraction. `CAD-PSPICE-UG` plus conservation checks from `FPE3`.
18. **“A PSpice model should begin with detailed transistor models.”** Begin at the least detail that answers the question; device detail increases convergence cost and can hide control mistakes. `FPE3`, `CAD-DCDC-APP`.
19. **“A smaller simulator time step automatically guarantees a correct model.”** It can reduce integration error while leaving incorrect events, equations, parameters, and ideal discontinuities unchanged. `CAD-PSPICE-UG`.
20. **“A behavioral model that matches one waveform is fully validated.”** Validation needs multiple independent operating points, invariants, transients, corners, and failure modes. `FPE3`, `BROWN-1981`.
21. **“COT and peak-current mode are mutually exclusive.”** One label may specify timing and the other sensed-current control; current-programmed constant-on-time variants exist. `RIDLEY-1990-COT`, `KAPAT-2020`.
22. **“Ripple at the feedback comparator is the same as output ripple.”** It may be attenuated output ripple, ESR ripple, DCR-derived ripple, synthetic ramp, or a sum. `TI-SLVA453`, `SUN-COT-2019`.
23. **“Dead time means no current flows.”** The gated channels are off, but inductor current commutates through the appropriate body diode/capacitance according to current sign. `MIT622-L05`; model extension is architecture dependent.
24. **“An ngspice run proves PSpice compatibility.”** Alternative SPICE can cross-check physics and some syntax, but dialect and behavioral semantics differ. `CAD-PSPICE-UG`.
