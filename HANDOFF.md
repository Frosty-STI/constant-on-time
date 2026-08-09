# Constant On-Time Lab — handoff

Status date: **2026-08-08**

## What was built

- A desktop-first, tablet-usable React/TypeScript/Vite PWA titled **Constant On-Time Lab**.
- Seventeen interactive engineering labs with prediction, manipulation, deterministic simulation, discrepancy explanation, derivation, PSpice consequence, transfer prompt, and local mastery recording.
- A UI-independent `@constant-on-time/sim-core` package with switched buck physics, controller event models, scheduling, current sharing, Bode tools, units, seeded stochastic helpers, scenarios, diagnostics, and direct regression tests.
- Modules 0–12 with 49 structured lessons, local completed-reading/mastery/bookmark/note/preset state, reset, and progress JSON import/export.
- A 43-source public research library, 15-source core path, annotated bibliography, comparison, gaps, study aids, 49 flashcards, and citation validation.
- Seven PSpice-oriented libraries, 21 decks, a cumulative deterministic 2–8-phase capstone generator, focused/capstone documentation, structural lint, analytical checks, and a web-to-PSpice mapping.
- Local verification commands and unexecuted GitHub workflow definitions for lint, type, unit, coverage, build, offline, browser, accessibility, visual, source-link, secret, generated-artifact, dependency, and PSpice-static checks.

## Current working state

The local repository is on `agent/initial-build`; the implementation, verification assets, screenshots, and documentation are committed there in logical commits. Local `main` remains at the initial `SPEC.md` commit (`90a64fb7006a558f3d68b0aba6f45f1fcb7031f4`) so the requested branch-to-main pull request can still be created. No git remote is configured. The application and local checks run from the repository root.

## Exact startup commands

```bash
cd /workspace/scratch/c3afa35f776d/constant-on-time
git switch agent/initial-build
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>.

Production/offline verification:

```bash
npm run build
npm run check:offline
npm run preview
```

Open <http://127.0.0.1:4173>.

## Exact test commands

```bash
npm run lint
npm run typecheck
npm test
npm run coverage --workspace @constant-on-time/sim-core
npm run test:unit --workspace @constant-on-time/app
npm run verify:static
npm run build
npm run check:offline
npm run test:e2e
npm run check:links
npm audit --audit-level=high
```

PSpice-independent checks:

```bash
python3 pspice/scripts/netlist_lint.py
python3 pspice/scripts/analytical_checks.py
```

## Verified local results

These are the latest local results from this audit, not remote CI evidence; re-run them after the final tree is frozen.

| Check | Result |
| --- | --- |
| ESLint | Pass, zero warnings |
| Strict TypeScript | Pass for app and sim-core |
| Unit/regression tests | 154 pass: 49 app + 105 sim-core |
| Sim-core coverage | 94.13% statements, 79.01% branches, 96.77% functions, 94.13% lines |
| App coverage | 60.70% statements, 49.63% branches, 52.69% functions, 62.84% lines; `src/domain` is 92.77% statements and 95.50% lines |
| Production build | Pass; Vite transformed 1,798 modules |
| Offline bundle | Pass; 28 precache entries / 1300.25 KiB, local assets, restrictive CSP, no automatic remote transport |
| Source/citation validation | Pass: 43 sources, 21 tags, 13 modules, 39 referenced IDs |
| Source-link check | Pass: 43/43 checked; two documented publisher HTTP 403 automation warnings |
| Secret/generated-artifact checks | Pass: 199 repository files inspected |
| Dependency audit | Pass, 0 vulnerabilities |
| PSpice structural lint | Pass: 7 libraries, 21 decks |
| PSpice analytical checks | Pass: 20 relationship groups and 28 generated configurations; no circuit simulator invoked |
| Browser/accessibility/visual | Pass: 33 passed, 17 intentional tablet-project skips, 0 failed across 50 listed Playwright cases in 3.3 minutes. The skipped cases are desktop-only per-lab screenshot captures; both desktop and tablet primary baselines passed. |

## GitHub publication status

- Requested repository: `constant-on-time`
- Authenticated GitHub connector account: **`Frosty-STI`**
- Repository creation: **not verified; treat as unpublished**
- Visibility verification: **not applicable; no remote repository exists**
- Remote URL: **none**
- Development branch pushed: **no**
- Pull request: **none**
- GitHub Actions remote results: **not available**
- Merge status: **not merged**

Current verified facts: `git remote -v` is empty and a lookup of `Frosty-STI/constant-on-time` returned not found, so there is no publication evidence. The available authenticated GitHub connector can inspect and mutate existing repositories but does not expose repository creation; the local environment has no `gh` executable or configured Git credential helper. No credentials were requested or handled, and no public fallback, mirror, or alternate host was created.

After authentication, the exact CLI-equivalent publication sequence is:

```bash
gh repo create constant-on-time --private --source=. --remote=origin
git push -u origin main
git push -u origin agent/initial-build
gh repo edit --default-branch main
gh repo view --json url,visibility,defaultBranchRef
gh pr create --base main --head agent/initial-build --title "Build Constant On-Time Lab" --body-file .github/PULL_REQUEST_TEMPLATE.md
gh pr checks --watch
gh pr merge --merge --delete-branch=false
git fetch origin main
git switch main
git pull --ff-only origin main
git rev-parse HEAD
gh repo view --json url,visibility,defaultBranchRef
```

Do not merge if any required check is pending or failing. Re-run `gh pr checks --watch` after every correction and preserve the PR URL plus final SHA.

## Important architectural decisions

- No backend, account, telemetry, analytics, hosted database, runtime AI, or automatic external fetch.
- The normal browser path dispatches laboratory runs to a Web Worker. Changing a lab or parameter terminates obsolete work; playback operates over a completed deterministic result. A synchronous fallback is retained for environments without Worker support.
- Switched labs use the actual sim-core plant state and event-aligned RK4. Analytical, averaged, sampled-data, and educational behavioral views remain visibly distinct.
- The UI exposes strict per-lab scenario JSON; sim-core separately exposes the fuller engine scenario contract.
- Parameter sweeps are bounded to 2–9 points to keep a local browser responsive and reproducible.
- Source links are explicit user navigation. Source metadata and all lesson content are bundled locally.
- Generated visual concept art guides appearance only; code-native SVG/canvas renders all technical diagrams and plots.

## Numerical-simulation design

Positive phase current flows from the switch node through the inductor into the output. Positive capacitor current is `sum(iL) - iLoad`. The switched-plant runner splits intervals at supplied PWM and load events while fixed-step RK4 evolves the continuous states. Controller cores expose timing deadlines where implemented; other decisions occur on the disclosed sample/integration grid rather than through a universal coupled event solver. Time-step diagnostics compare the requested step with switching period, phase event rate, dead time, minimum timing limits, delay, and ripple intervals.

The switched plant includes L, DCR, HS/LS resistance, dead time, body-diode clamps, shared C, ESR, loads, mismatch, and current-sense scaling. ESL is intentionally output-only and does not create a resonant state. Controller/scheduler models are generic educational architectures; their events and exclusions are visible.

## PSpice validation status

Cadence PSpice, ngspice, Xyce, LTspice/Wine, and other circuit-simulator executables were not available. **No PSpice validation is claimed.** The files passed structural lint, manual syntax-oriented review against public Cadence material, and independent analytical arithmetic. Parser acceptance, convergence, warnings, measured values, and waveforms remain pending in a named PSpice release. See [pspice/validation-status.md](pspice/validation-status.md) for the per-file matrix and exact first-run order.

## Known technical limitations

- No transistor switching loss, Coss, Qrr, gate-charge, nonlinear magnetics, saturation, thermal network, PCB parasitics, EMI, or vendor IC replication.
- Capacitor ESL in the web plant is an output-only derivative estimate, not a dynamic ESL state.
- The peak-current stability exercise is a simplified fixed-period CCM cycle map, not a complete sampled-data converter.
- COT pulse, free-running, scheduler, phase-shed, and balance behaviors are disclosed educational policies; commercial implementations vary.
- The control-mode comparison uses visible normalized behavioral factors and cannot establish universal superiority.
- Averaged Bode views omit switching sidebands and full periodic sampled-data effects.
- Current-sharing interaction is an averaged educational model; it does not include thermal drift or magnetic coupling dynamics.
- PSpice ABM `IF`, `LIMIT`, `TANH`, parameter-expression, branch-current, and `.MEAS` compatibility remains release-dependent until executed.
- The web UI bounds a sweep at nine points and does not yet provide Monte Carlo histogram visualization, although deterministic mismatch primitives and PSpice sweep guidance are present.
- The generated N-phase PSpice shedding policy uses commanded load, changes active count without bumpless transfer, and has no stored fixed-window request queue. A re-enabled synchronous phase can conduct reverse low-side current before its first grant unless a future model adds first-pulse arming or diode emulation.
- The project is unpublished and has no git remote; private visibility, branch push, PR, remote checks, and merge all remain outstanding.

## Remaining research gaps

The catalog records gaps in public architecture-neutral descriptions of commercial multiphase COT arbitration, rigorous sampled-data COT stability with practical ripple injection, current-sharing/voltage-loop interaction measurements, and release-specific PSpice ABM portability. These are tracked in [docs/sources/research-gaps.md](docs/sources/research-gaps.md), not papered over with vendor-general claims.

## Expensive-to-rediscover context

- The low-side/dead-time positive-current path is ground → low-side diode/FET → switch node → inductor → output; reverse current selects the high-side diode during dead time.
- Interleaved ripple uses the duty-aware waveform and negative phase-time shift convention; a 50%-symmetric triangle gives false cancellation away from 50% duty.
- Buck capacitor ESR is a plant numerator zero/phase lead, not a compensator pole. The Bode lab calls sim-core plant/compensator/loop functions directly and reports no crossover when none exists.
- Web current-balance command and PSpice feedback trim have opposite boundary signs: `TRIM_PSpice = -u_command` after scaling.
- A shed synchronous phase must force both FET gates off; forcing PWM low would hold its low-side switch on.
- Static ideal-current loading at zero output created unphysical startup solutions; supplied PSpice decks use passive/static loads and delayed dynamic increments.
- Alternative-SPICE convergence would not prove PSpice compatibility.
- Browser plugin access to localhost was blocked (`ERR_BLOCKED_BY_CLIENT`), so the documented visual QA uses Playwright with bundled Chromium.

## Recommended next development steps

1. Create the private GitHub repository through an account path that can create repositories, then run the preserved publication commands; verify visibility before pushing and preserve the PR, check, merge, and final-SHA evidence.
2. Run the PSpice ladder in the documented order on a named Cadence release and preserve logs, `.out` files, measurements, plots, warnings, and exact syntax changes.
3. Add a dynamic ESL state and optional coupled/thermal phase models only after preserving the existing analytical baselines.
4. Add Monte Carlo visualization and asynchronous sweep cancellation if larger statistical studies are needed.
5. Add periodic-operating-point/sampled-data loop studies rather than stretching the averaged Bode model near switching frequency.

## Exact first lesson and source

Open **Module 1, Lesson 1.1: “Two switch states, one inductor.”** Then use **`MIT622-L05` — David J. Perreault, “Lecture 5: Intro to DC/DC, Part 1”** at <https://ocw.mit.edu/courses/6-622-power-electronics-spring-2023/resources/mit6_622s23_lecture_05_mp4/>. Predict and draw the high-side, low-side, and dead-time current paths before opening a controller datasheet.
