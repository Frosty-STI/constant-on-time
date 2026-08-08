# Teach-back questions

## Fundamentals

1. Explain a synchronous buck switching cycle without using the words “charges the inductor” until after you state the inductor voltage in each state.
2. Derive `Vo = D × Vin` and list four reasons it will not be exact in a real model.
3. Why can inductor current be continuous while switch current is discontinuous?
4. During dead time, how does current sign determine the clamping device and switch-node voltage?
5. What does the output capacitor do during a load step before the inductor current can move?

## Dynamics and feedback

6. Explain an LC double pole as an exchange of energy, then show how it appears algebraically.
7. What transfer function would you measure to answer “how much does the output move for a load disturbance”?
8. Use “power phase,” “Bode phase,” and “phase margin” correctly in one explanation.
9. Why can loop crossover and closed-loop bandwidth be close without being identical?
10. Why must modulator gain and feedback-divider gain appear in total loop gain?
11. When is a simple voltage-injection loop measurement valid?
12. What information does an averaged model erase, and which COT questions therefore require switching simulation?

## Peak current and COT

13. Narrate every event in one peak-current-mode cycle from clock edge to latch reset.
14. Explain slope compensation as a cycle-to-cycle perturbation problem, not a slogan.
15. Give an example in which duty above 50% is stable and one in which an alternating-cycle mode appears, including assumptions.
16. Narrate every event in one basic COT cycle from comparator crossing to next eligible request.
17. Why can fixed on-time produce variable switching frequency?
18. How can a COT controller use an error amplifier or slow servo?
19. Compare output-ESR ripple, DCR-derived ripple, and internally emulated ripple.
20. What happens when ripple amplitude is too small, too large, or incorrectly phased?
21. Construct a controller label that is simultaneously current-programmed and constant-on-time.

## Multiphase

22. Why does interleaving reduce summed ripple without reducing every phase's ripple?
23. Why does `360°/N` not ensure current sharing?
24. Compare a phase collision, pulse bunching, beat behavior, and phase starvation using observable evidence.
25. What does a round-robin scheduler optimize, and what can a current-priority scheduler improve or harm?
26. Why should a current-sharing loop generally not compete with the main voltage loop?
27. How should phase shedding and re-entry protect both voltage regulation and phase-current stress?

## PSpice and debugging

28. Which abstraction would you use for loop design, pulse jitter, and MOSFET switching loss, and why are the answers different?
29. How does an RS latch remove an unrealistic zero-delay dependency?
30. What evidence distinguishes physical comparator chatter from coarse-timestep aliasing?
31. Why can a simulation converge with the wrong inductor-voltage sign?
32. What does an alternative-SPICE pass prove, and what does it not prove about PSpice?
33. Name five independent capstone validation oracles.
34. Pick one capstone block and explain what behavior it intentionally does not capture.
