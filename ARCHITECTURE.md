# Constant On-Time Lab — Architecture

## System shape

Constant On-Time Lab is a static, offline-capable React application backed by deterministic TypeScript packages. There is no server, telemetry client, hosted database, authentication layer, or runtime AI dependency.

```text
app/                         React shell, labs, plots, persistence, workers
packages/sim-core/           deterministic equations, controllers, schedulers, integrator
packages/lesson-content/     modules, source references, exercises, mastery metadata
sources/                     traceable machine-readable bibliography
pspice/                      inspectable libraries and test benches
tests/                       browser, accessibility, offline, and visual checks
scripts/                     source/link/security/build/PSpice-static helpers
docs/                        curriculum, guides, design evidence, screenshots
```

## Runtime boundaries

### UI thread

- Maintains learner progress and current scenario.
- Collects engineering inputs and validates imported per-lab scenarios; model validation also runs in the worker or synchronous fallback before computation.
- Renders diagrams, equations, plots, sources, and explanations.
- Stores versioned progress in localStorage.
- Performs import/export through local files only.

### Simulation worker

- Receives a serializable scenario and deterministic seed.
- Runs `@constant-on-time/sim-core` without DOM access.
- Returns one bounded result and its event markers per run request.
- Keeps heavy switched calculations off the UI thread. The current worker contract is request/result; changing a laboratory or parameter terminates its obsolete worker, while a completed result is replayed locally. It does not stream partial results.

Short analytical calculations may run synchronously. The application dispatches laboratory runs to the worker when available, then the UI provides pause, reset, interval-step, and event-step playback over the completed deterministic result. The bounded 2–9-point parameter-sweep UI creates a dedicated worker and reports numerical metrics for every operating point.

### Content package

Lessons are structured data with stable IDs, prerequisites, three-layer teaching content, exercise metadata, source IDs, assumptions, and transfer questions. UI components render them; lesson content does not embed executable arbitrary HTML.

## Simulation abstractions

The UI never silently mixes abstractions. Each `LabDefinition` visibly identifies one of these model families:

- **Analytical**: exact/derived relationship under stated assumptions,
- **Averaged**: continuous duty-ratio model,
- **Switched · RK4**: actual resolved conducting state,
- **Sampled-data**: cycle map or discrete controller demonstration,
- **Behavioral architecture**: educational scheduler/controller logic.

The workbench shows that abstraction beside the controls and repeats the lab's included/excluded effects in the assumptions panel. `LabResult` contains the computed vectors, metrics, events, warnings, prediction baseline, seed, and optional supplemental plots; it does not duplicate the definition metadata. Supplemental plots are rendered beneath an explicit model-boundary disclosure with independent cursors and exports. The capacitor and crossover labs use this contract to keep reduced-order averaged recovery predictions separate from their primary switched or frequency-domain results.

## State and sign conventions

Phase current is positive from switch node through the phase inductor into the shared output. Capacitor current is positive into the capacitor:

\[
i_C = \sum_{k=1}^{N} i_{L,k} - i_{load}.
\]

The switched model resolves channel or diode conduction before computing inductor voltage. Known controller and source events split the integration schedule.

## Data contracts

### Scenario

The engine package exposes a versioned scenario JSON contract for power stage, load, controller, phase, numerical settings, and seed. The app exposes strict per-lab scenario JSON import/export, local presets, and a pinned side-by-side baseline. Validation rejects nonfinite values, impossible timing, unsupported phase counts, negative passive values, and unknown keys where strictness protects meaning.

### Simulation result

- `LabResult`: independent-axis vector, named/unit-bearing signals, controller or scheduler events, derived metrics, prediction baseline, warnings, deterministic seed, and optional separately disclosed supplemental plots
- `LabDefinition`: abstraction, equation, assumptions, included/excluded effects, source IDs, and transfer question
- UI contract: both are rendered together; a result is never presented without its definition and visible limitation panel

### Learner progress

Progress is a separately versioned local-only document. Imported progress cannot mutate simulation or lesson code and is sanitized before storage.

## Numerical design

Fixed-step RK4 is the switched-plant default because its state updates are inspectable. The plant runner splits steps at supplied PWM and load events. The COT core exposes internal deadlines to event-driven callers; controller decisions otherwise occur on the disclosed sampling grid, with no universal coupled event solver or hidden threshold-crossing interpolation claimed. The engine emits warnings when resolution is coarse relative to the shortest switching or controller interval. The app does not equate a smaller step with proof of correctness.

## Plot design

The app uses code-native SVG/canvas layers and local package dependencies. Plot title, legend, signal labels, units, and cursor values remain accessible DOM content around the canvas. CSV export is generated from the exact plotted arrays. Plot-image export is a canvas snapshot only; scenario/assumption/source metadata and any cross-abstraction disclosure remain in the surrounding UI and scenario JSON. Primary and supplemental plots use independent cursors so unlike x-axes are never indexed together.

## Persistence and offline behavior

- A namespaced, schema-versioned localStorage record stores progress and presets.
- Exported progress JSON includes a schema version and export timestamp but no checksum or secrets.
- The service worker/precache contains only the built production assets.
- Content Security Policy constrains connections, and browser tests detect unexpected external requests.
- Cited links are ordinary user-initiated external navigation and are never fetched during normal runtime.

## Test layers

1. physics and numerical unit tests in `packages/sim-core`
2. structured-content/schema tests
3. React component and persistence tests
4. browser workflow, keyboard, accessibility, responsive, visual, and export tests
5. offline production-runtime test with network disabled
6. repository source-link, secret, dependency, and build checks

## PSpice boundary

The web engine and PSpice files share parameter names and block mapping but not a promise of numerical identity. The mapping document states intended equivalents and differences. PSpice compatibility is “not executed” unless a named Cadence version and preserved log prove execution.

## Security and privacy

- no telemetry or analytics packages
- no credential inputs or secret configuration
- no application-initiated external data fetch; normal runtime uses bundled/same-origin assets and the service worker, while source URLs require explicit user navigation
- sanitized JSON import with size limit
- deterministic demo data only
- CI secret scanning and dependency auditing
