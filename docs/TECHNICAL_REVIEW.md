# Adversarial technical review

Review date: **2026-08-08**

This record summarizes the release-blocking review of the educational models,
lesson claims, PSpice artifacts, and user-interface disclosures. It is not a
substitute for running the netlists in Cadence PSpice; that status remains
**not run**.

## Review method

- Compared switched-state signs and current continuity with the documented
  inductor/capacitor conventions (`FPE3`, `MIT622-L05`).
- Recomputed ideal duty, slopes, ripple, volt-second balance, charge balance,
  CCM boundary, and multiphase timing independently of screenshots.
- Exercised controller timing limits, denied requests, current limit, scheduler
  ties/fairness, mismatch polarity, and deterministic noise at boundary cases.
- Compared loop-gain construction with plant, compensator, modulator, and
  feedback factors; checked multiple unity and phase crossings
  (`MIDDLEBROOK-1975`, `TI-SLVA301`, `RIDLEY-1991`).
- Audited every structured lesson and lab description for claims beyond the
  implemented abstraction.
- Reviewed PSpice files structurally and against public Cadence ABM guidance;
  no circuit-simulator execution was available (`CAD-PSPICE-UG`).

## Release-blocking findings corrected

- Corrected low-side and body-diode current-path direction, including stored
  negative-current commutation and the distinction between synchronous
  low-side reverse current and negative-current dead time.
- Replaced a 50%-symmetric interleaving triangle with duty-aware phase timing,
  used the same time-shift convention in events and traces, and made RMS/mean
  metrics time weighted on the nonuniform event-aligned grid.
- Corrected the capacitor-ESR plant zero and exact loaded denominator; loop
  margins now enumerate crossing directions and select the controlling
  downward unity crossing instead of the first sign change.
- Enforced minimum/maximum on-time, minimum off-time, PWM dead-time feasibility,
  current-limit reevaluation, and strictly future controller deadlines.
- Preserved inductor-current continuity at dead-time zero crossings and made
  reverse-current clamping depend on the actual conducting gate state.
- Reworked ideal fixed-spacing scheduling as consumed discrete slots, validated
  current-priority sensor inputs, reported allocation and service fairness
  separately, and used the stored round-robin pointer. Scheduler calls now use
  a complete active-request set, expose cancellation, and prevent a withdrawn
  request from contaminating a later request's wait/starvation history.
- Made event-boundary plant observations right-continuous: integration retains
  the left-interval gate state, while the cursor's conduction mode and switch
  node report the state that applies from the exact event onward.
- Integrated the COT output-capacitor state, retained pulse end reasons, sorted
  event streams, and separated the adaptive-on-time law from the fixed-on-time
  control.
- Replaced the error-amplifier placeholder with the explicitly cited TI
  SLVA301 Figure 12 high-op-amp-gain passive-network mapping and drew its DC
  divider branch.
- Unified live, imported, and swept parameter validation on one min-origin
  step grid; impossible fractional selectors no longer round silently.
- Removed or disclosed inert controls, false unique-winner comparisons,
  unsourced interaction claims, and any lesson text implying absent traces or
  events.
- Added PSpice boundary fixtures for one-shot inhibit/release and scheduler
  tie behavior; these remain syntax-oriented artifacts until run in PSpice.
- Extended the generated capstone cumulatively across 2–8 phases with balance,
  shedding/re-entry, fixed/adaptive timing, startup, line/load events, limits,
  and mismatch. Generator checks now reject nonfinite CLI values and qualify
  zero commanded current separately from the finite stabilizing bleed load.
- Rechecked manufacturer-document covers rather than trusting URL or footer
  dates; corrected author/title/revision metadata and removed a misidentified
  AECM paper from D-CAP3, minimum-off-time, and phase-shedding claims.

## Remaining uncertainty and intentional limits

- Cadence parser acceptance, convergence, warning behavior, measurements, and
  waveforms are unknown. See `pspice/validation-status.md`.
- The web peak-current exercise is a simplified cycle map, not a full periodic
  sampled-data plant. The Bode labs are averaged and must not be extended near
  switching frequency without a periodic/sampled model.
- Generic COT arbitration, ripple injection, phase shedding, and current
  balancing are educational architectures, not universal commercial-controller
  implementations.
- The generated phase-shed policy is command-based and not bumpless; fixed
  windows have no stored request queue, and a re-enabled synchronous phase can
  conduct through its low side before the first grant unless an implementation
  adds first-pulse arming or diode emulation.
- Transistor charge, Coss, Qrr, magnetic saturation/coupling, temperature,
  layout, EMI, and a dynamic capacitor-ESL state are excluded.
- The normalized control-mode comparison and fault signatures support transfer
  questions; they cannot rank control families or validate a hardware design.

These uncertainties are visible in the application, `HANDOFF.md`, and the
per-file PSpice compatibility matrix rather than being inferred from a
converged educational waveform.
