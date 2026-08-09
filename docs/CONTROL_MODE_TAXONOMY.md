# Control-mode taxonomy

## Classify on independent axes

A useful name is a tuple, not a single badge:

1. **Regulated quantity / outer objective:** output voltage, output current, input current, droop, or another state.
2. **Pulse-start rule:** clock edge, threshold crossing, zero/valley event, scheduler grant, or asynchronous request.
3. **Pulse-end rule:** carrier crossing, peak-current crossing, valley crossing, fixed/adaptive one-shot expiration, or protection event.
4. **Frequency law:** fixed, synchronized, pseudo-constant, variable, or mode dependent.
5. **State feedback:** voltage only, current only, voltage plus current, capacitor current, synthetic/emulated state.
6. **Loop structure:** single loop, inner current plus outer voltage, comparator plus slow servo, centralized multiphase, per-phase plus share loop.
7. **Light-load policy:** forced CCM, diode emulation, pulse-frequency modulation, skip, burst, or phase shed.

This axis-based view is supported by `KAPAT-2020` and the constant-frequency/constant-on/off-time current-programmed variants in `RIDLEY-1990-COT`.

## Representative families

| Family | Typical start | Typical end | Frequency | Sensed/control structure | Mandatory caveat |
|---|---|---|---|---|---|
| Voltage-mode PWM | Clock | Voltage-error/carrier crossing | Fixed or synchronized | Outer voltage error through compensator | Feedforward and digital variants exist |
| Peak-current-mode | Clock | Sensed current + artificial ramp reaches command | Usually fixed | Sampled inner current action + outer voltage loop | “Above 50%” slogan is model-specific |
| Valley-current-mode | Current valley/clock logic | Timing/current-dependent opposite event | Fixed or variable | Current valley information + outer regulation | Not just peak mode with a minus sign |
| Hysteretic voltage | Boundary crossing | Opposite boundary crossing | Variable | Output/feedback voltage bounds | Delays/ripple set practical frequency |
| Basic fixed COT | Comparator/request | One-shot expiration | Variable | Feedback ripple comparator; optional servo | On-time says nothing by itself about start rule |
| Adaptive COT | Comparator/request | Law-defined one-shot expiration | Pseudo-constant/variable | Often line/output feedforward plus ripple comparator | Vendor variants differ materially |
| Ripple-based control | Ripple threshold logic | Architecture dependent | Fixed or variable | Natural/emulated/injected ripple | A broad umbrella, not synonymous with COT |
| Current-programmed COT | Current/voltage/scheduler request | Fixed on-time or current event, depending disclosed design | Variable/pseudo-constant | Current state plus regulation loop | Demonstrates overlapping labels |
| Multiphase coordinated COT | Per-phase requests to scheduler | One-shot expiration/protection | Per-phase variable or locked | Central grant + balance loop + output regulation | Scheduler is part of the control architecture |

## Constant on-time architecture checklist

Never describe a COT model without answering:

- Which signal crosses which threshold to request a pulse?
- Is the request edge- or level-sensitive?
- What sets on-time: constant, `Vo/Vin` feedforward, table, clamp, or servo?
- What minimum/maximum on-time and minimum off-time apply?
- Is natural ripple adequate? Where is injected ripple generated and added?
- Are delay, hysteresis, blanking, and noise modeled?
- Is there an error amplifier, transconductance amplifier, integrator, or slow DC servo?
- What happens at light load, reverse current, current limit, and skipped pulses?
- For N phases, who grants a request, enforces separation, and balances current?

Sources: `TI-SLVA281`, `TI-SLVA453`, `TI-SLVA546`, `LIU-COT-2023`, `SUN-COT-2019`, `IEEE-COT4PH-2017`.

## Comparison boundary

The lab's voltage-mode, peak-current-mode, and COT simulations use deliberately matched power stages, but their controllers are representative educational models. Results compare those explicit models, not the universal superiority of one named family.
