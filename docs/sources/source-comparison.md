# Source comparison and terminology crosswalk

## What each source class can establish

| Source class | Strongest use | What it cannot establish alone |
|---|---|---|
| Textbook / university (`FPE3`, `MIT622-*`) | Physical derivations, standard models, stated assumptions | Exact behavior of a proprietary controller |
| Foundational paper (`MIDDLEBROOK-1975`, `VORPERIAN-*`, `RIDLEY-1991`, `TAN-MIDDLEBROOK-1995`) | Model structure, measurement theory, sampled-data effects | Current product implementation without a datasheet/model |
| Modern COT paper (`LIU-COT-2023`, `SUN-COT-2019`) | One disclosed COT architecture and its analysis | A universal COT transfer function |
| Manufacturer application report (`TI-*`, `INFINEON-*`) | Practical circuit, design, and measurement details | Vendor-neutral terminology or undisclosed silicon behavior |
| Datasheet (`ON-FAN23SV10M`) | Guaranteed/specified product behavior and timing conditions | Internal architecture beyond what is disclosed |
| Simulator manual (`CAD-PSPICE-UG`) | PSpice syntax and analysis behavior | Physical correctness of a converter model |

## Terminology that must not collapse

| Term | Precise use in this project | Primary support |
|---|---|---|
| Power phase | One parallel switch pair/rectifier plus its inductor and sensing path | `TI-SLVA882` |
| Phase offset | Relative firing displacement between phases | `TI-SLVA882` |
| Bode phase | Argument of a complex transfer function versus frequency | `FPE3`, `TI-SLVA301` |
| Phase margin | Angular distance from loop phase to the instability condition at a specified unity-gain crossing, subject to convention | `FPE3`, `MIDDLEBROOK-1975` |
| Power-stage bandwidth | Ambiguous shorthand; replace with named plant pole/resonance or response metric | `FPE3`, `TI-SLVA057` |
| Crossover frequency | Frequency where a specified loop gain crosses unity; name the loop | `FPE3`, `TI-SLVA301` |
| Closed-loop bandwidth | Frequency-response metric of a specified closed-loop transfer function, not automatically identical to crossover | `FPE3` |
| Current-loop bandwidth | Bandwidth/crossover of the inner sensed-current loop or its sampled-data equivalent | `RIDLEY-1991`, `TI-SNVA555` |
| Current-sharing-loop bandwidth | Response rate of interphase balance correction; normally separated from the primary regulation dynamics | `INFINEON-APEC03`, `TI-SSZTC61` |
| Constant on-time | A pulse-duration/timing law; pulse initiation and outer regulation architecture must be stated separately | `KAPAT-2020`, `RIDLEY-1990-COT`, `TI-SLVA281` |
| Peak-current mode | A pulse decision based on sensed current reaching a command/ramp condition; clocking/timing variant must also be stated | `MIT622-L27`, `RIDLEY-1991` |
| Ripple injection | Deliberate control-path signal used to create suitable comparator crossings/dynamics; not necessarily output ripple | `TI-SLVA453`, `TI-SLVA546`, `SUN-COT-2019` |

## Areas of apparent disagreement

1. **“COT needs no compensation.”** Some product literature calls a pinless or externally compensation-free implementation “no compensation.” `TI-SLVA546`, `TI-SLVAF11`, and `LIU-COT-2023` still reveal loop-shaping dynamics in the ripple path, divider, delay, plant, or internal servo. The correct claim is architecture-specific: a controller may require no user-designed error-amplifier network, but its regulation loop still has dynamics and stability conditions.
2. **“COT is constant frequency.”** Basic COT has fixed pulse length and variable off-time (`TI-SLVA281`). Adaptive or feedforward timing can make frequency approximately constant, and particular implementations may synchronize. “Pseudo-constant” is not mathematically constant (`SUN-COT-2019`).
3. **“Current-mode removes the inductor.”** Low-frequency outer-loop approximations can resemble a controlled current source (`TI-SNVA555`), while `RIDLEY-1991` and `MIT622-L27` retain sampled-data and high-frequency behavior. Always state frequency range and sensing/control assumptions.
4. **“Duty above 50% is unstable.”** That slogan refers to a particular uncompensated peak-current sampled-data condition. Required artificial slope depends on sensed natural slopes and architecture (`RIDLEY-1991`, `TI-SNVA555`). It is not a statement about every current-mode or COT converter.
5. **“360°/N gives perfect sharing.”** Ideal spacing reduces ripple; sharing depends on L, DCR, sensing, timing, and correction (`TI-SLVA882`, `TI-SSZTC61`, `INFINEON-APEC03`).

## Evidence labels used in lessons

- **[exact]** follows from the stated mathematical model.
- **[derived]** is derived in the lesson from cited constitutive laws.
- **[approximation]** has a stated limiting assumption such as small ripple, CCM, linearization, or negligible parasitics.
- **[heuristic]** is a design starting point, never a pass/fail law.
- **[architecture-specific]** describes the cited controller or disclosed topology.
- **[modeling choice]** is an intentional abstraction, not a claim about silicon.
- **[validation pending]** has not been run in Cadence PSpice.

