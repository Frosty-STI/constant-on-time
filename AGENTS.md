# Working on Constant On-Time Lab

This guide applies to the whole repository. Read `README.md`, `ARCHITECTURE.md`, `DESIGN.md`, and the relevant domain guide before making a substantive change. `HANDOFF.md` records historical build and validation context; verify current Git and CI state rather than treating its dated publication notes as current facts.

## Product and learner flow

Constant On-Time Lab is a local-first, offline-capable course for synchronous buck converters, control loops, constant-on-time control, multiphase scheduling, and generic PSpice behavioral modeling. It has 13 modules (0–12), 49 lessons, and 17 interactive labs.

A learner should be able to:

1. read the physical intuition before the derivation;
2. make and lock a prediction before seeing the answer;
3. run or step a deterministic model and inspect the circuit, waveform, events, and metrics;
4. reconcile the result with the governing equation, assumptions, and model boundary;
5. answer the transfer question and record mastery or notes locally.

Do not casually bypass that predict–simulate–explain sequence. A diagram, result, or metric must remain paired with its abstraction, included/excluded effects, and source IDs.

## Repository map

- `app/`: React 19 + TypeScript + Vite PWA, UI components, lab definitions/models, Web Worker, persistence, and component tests.
- `packages/sim-core/`: UI-independent deterministic equations, plant integration, controllers, schedulers, and direct regression tests.
- `packages/lesson-content/`: ordered module JSON and the lesson-content schema.
- `sources/`: canonical source manifest and bibliography export.
- `pspice/`: plain-text libraries, test benches, generator, lint, analytical checks, and validation boundary.
- `tests/e2e/`: Playwright workflow, accessibility, offline, responsive, and visual checks.
- `scripts/`: repository hygiene, source, link, secret, generated-artifact, and offline checks.
- `docs/`: learner guides, engineering references, source notes, design specification, and reviewed screenshots.

The normal runtime is static and local. It has no backend, account system, telemetry, hosted database, runtime AI, or automatic external fetch. Keep simulation work in `@constant-on-time/sim-core` and the worker boundary where practical; keep the UI concerned with validated inputs, orchestration, and explanation.

## Toolchain and commands

Use Node.js 22+ and npm 10+; Python 3 is needed for PSpice-independent checks.

```bash
npm ci
npm run dev                 # http://127.0.0.1:5173
npm run build
npm run preview             # http://127.0.0.1:4173
```

Useful focused checks:

```bash
npm run lint
npm run typecheck
npm test
npm run test:unit
npm run verify:static
npm run check:offline
npm run test:e2e
npm run check:links
npm audit --audit-level=high
```

`npm run test:all` combines lint, types, tests, build, and browser checks. For a narrow simulation change, run the affected `packages/sim-core/test/*.test.ts` coverage through the workspace scripts before the full suite.

On Windows, confirm that `node --version` is at least 22 before diagnosing Vite, ESLint, or install failures. Quote paths and prefer PowerShell `Set-Location -LiteralPath` when the checkout path contains spaces or `&`; an unquoted ampersand is a shell operator, not part of the directory name.

## Course and lab data conventions

- `packages/lesson-content/modules/index.json` fixes the dependency-aware module order. Each lesson needs a stable ID, concepts, `physicalIntuition`, `mathematicalDerivation`, `modelingConsequence`, assumptions, citations, evidence labels, interaction, and transfer question.
- `app/src/domain/labs.ts` is the learner-facing catalog and parameter contract. Keep every lab's prediction, equation, abstraction, sources, included/excluded effects, and transfer question explicit.
- `app/src/domain/labModels.ts` returns named/unit-bearing signals, event markers, metrics, warnings, a deterministic seed, and optional separately disclosed supplemental plots. Never splice two abstractions onto one axis without a visible boundary.
- Scenario and progress JSON are versioned, strict, size-bounded, and local-only. Reject unknown or impossible input rather than silently repairing meaning.
- Analytical, averaged, switched RK4, sampled-data, and educational behavioral results are different model families. Label them accurately; do not present an educational controller policy as a vendor implementation.

Electrical sign conventions are part of the public contract:

- positive phase current flows from the switch node through the inductor toward the output;
- positive capacitor current is `sum(iL) - iLoad`;
- during positive-current dead time, the low-side diode/FET path is ground → switch node → inductor → output;
- negative current during dead time can select the high-side diode path.

Preserve these conventions across equations, SVG arrows, plots, tests, and PSpice mappings.

## Schematic and UI principles

This is an engineering instrument workspace, not a marketing dashboard. Follow `DESIGN.md` and the established cool graphite/navy palette, fine dividers, compact type, narrow rails, and restrained motion.

- Render technical diagrams and plots code-natively. Do not treat generated concept art or a third-party diagram as electrical truth.
- Use conventional, recognizable symbols; show the ground/reference rail; keep energy flow readable left-to-right; label VIN, switch nodes, phase inductors, output capacitor, load, and phase lanes directly.
- An indicated current path must be topologically continuous and agree with switch state and current sign. Show inactive devices distinctly, but never communicate state by color alone—also use labels, line treatment, arrows, or markers.
- Keep diagram annotations short and instructional: identify what is switching, storing energy, filtering ripple, or serving the load. Avoid decorative detail that implies an unmodeled component.
- Keep plot names, axes, engineering units, legends, event markers, and exact cursor values accessible as DOM text. Preserve dash/marker redundancy.
- Respect `prefers-reduced-motion`, keyboard operation, focus visibility, color contrast, and the 1440×1024 desktop plus 1024×768 tablet layouts. Do not squeeze the workbench to preserve a rail.
- Update visual baselines only after inspecting the new screenshots at original resolution and confirming that the difference is intentional.

## Sources and citations

`sources/manifest.json` is canonical. Lessons, labs, flashcards, and source guides cite stable `citationId` values instead of duplicating metadata. `sources/bibliography.csv` must remain in parity.

When adding or revising a technical claim:

1. prefer public primary material such as university courses, standards, papers, or manufacturer documentation;
2. add original summaries and the exact modeling relevance/limitations—never copy a textbook page or vendor figure into the repository merely because it is viewable online;
3. preserve access/license notes and use links rather than vendoring source documents;
4. cite the stable ID in all downstream content; and
5. run `npm run check:sources` and, when URLs changed, `npm run check:links`.

Publisher anti-bot responses may be documented warnings; do not weaken source validation or claim that an inaccessible page was reviewed.

## PSpice boundary

Read `pspice/README.md` and `pspice/validation-status.md` before editing a deck or library. The checked-in files are generic educational models, not commercial-controller replicas. Unless a named Cadence PSpice release actually ran them and the logs were preserved, say only that structural and analytical checks passed.

```bash
python3 pspice/scripts/netlist_lint.py
python3 pspice/scripts/analytical_checks.py
```

An alternative SPICE run does not establish PSpice compatibility. Generated capstone fixtures must stay deterministic; use the documented generator command and its overwrite guard.

## Desktop executable

The Windows build is a hardened Electron shell around the same static app. `desktop/main.cjs` serves the built `app/dist` tree from the privileged `cotlab://app` origin; there is no preload script, renderer IPC, or Node access. Preserve the exact application host and traversal checks, denied permission/webview/pop-up behavior, renderer network block, and HTTPS-only system-browser handoff when changing this boundary.

Use Node 22 or newer, and keep desktop dependencies isolated from the root workspace lockfile:

```bash
npm ci
npm ci --prefix desktop
npm run desktop:test
npm run desktop:audit
npm run desktop:smoke
npm run desktop:dist
npm run desktop:smoke:exe
```

`desktop:dist` rebuilds the web app, regenerates a Windows PNG from `app/public/favicon.svg`, and writes a portable x64 executable under ignored `release/`. Source maps are excluded from the package. The desktop workflow repeats the security tests, dependency audit, runtime smoke, packaged-executable smoke, and uploads the unsigned executable as a short-lived Actions artifact. Do not describe a local or CI artifact as signed unless a real code-signing identity was configured and independently verified.

## Safe change boundaries

- Preserve offline behavior, restrictive runtime networking, deterministic seeds, source traceability, and visible model limitations.
- Do not commit secrets, local presets, personal data, telemetry, proprietary models, or employer/customer material.
- Do not commit `node_modules`, `dist`, coverage, Playwright reports/results, caches, logs, TypeScript build info, service-worker output, or editor backups. Repository hygiene also rejects symlinks and files over 10 MiB.
- Do not hand-edit calculated arrays, test outputs, or generated PSpice fixtures to force a pass. Fix the source or regenerate through the documented tool.
- Preserve unrelated work in a dirty tree. Keep commits scoped and review `git diff --check` plus `git status --short` before handoff.

## Verification before handoff

Choose the smallest relevant checks while iterating, then run the complete checks warranted by the change:

- content/source edit: source validation, link check when URLs changed, lint, and affected tests;
- simulation edit: sim-core tests, app regressions, typecheck, build, and relevant analytical checks;
- UI/diagram edit: lint, typecheck, unit tests, production build, offline check, Playwright accessibility/workflow tests, and reviewed desktop/tablet screenshots;
- PSpice edit: netlist lint, analytical checks, generated-fixture check, and honest validation-status wording;
- dependency/workflow edit: clean `npm ci`, build/test suite, generated-artifact and secret checks, and dependency audit.

For a broad release candidate, run the verification commands in `README.md` and wait for every applicable GitHub Actions job. Report exact passes, failures, intentional skips, final commit SHA, and any unexecuted validation boundary; never turn an unknown into a claim of success.
