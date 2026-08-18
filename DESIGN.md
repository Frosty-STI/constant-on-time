# Constant On-Time Lab — Visual Design System

## Accepted concept

The implementation reference is [`docs/design/constant-on-time-lab-concept.png`](docs/design/constant-on-time-lab-concept.png), generated as a complete 1440 × 1024 desktop engineering-lab screen.

The concept is an instrument workspace, not a marketing page or generic dashboard. It uses a curriculum rail, an open central workbench, a narrow simulation inspector, and a persistent status strip.

## Information architecture

### App shell

1. **Top bar:** project title, current-module progress, overall mastery, local-only indicator, progress export/import, settings.
2. **Curriculum rail:** Modules 0–12 followed by the named lab catalog; active row is teal-highlighted with a left rule.
3. **Workbench:** selected lesson or lab, prediction prompt, gated visual/diagram and waveform plot, separately disclosed companion plots where needed, derivation, assumptions, sources, and mastery action.
4. **Inspector:** parameters, run controls, model abstraction, time-step guidance, included/excluded effects, and citations.
5. **Status strip:** offline-ready state, no-cloud-backend notice, current model abstraction, deterministic seed, bundled/not-executed PSpice artifact status, and readiness.

### Core component families

- `App`, `TopBar`, `CurriculumRail`, `StatusBar`
- `LabWorkbench`, `PredictionPanel`, `CircuitDiagram`, `BlockPuzzle`, `ScopePlot`
- `ParameterInspector`, `ScenarioToolbar`, `EquationPanel`
- `LessonReader`, `NotesDrawer`

Assumptions, sources, mastery, and transport controls are integrated sections within these components rather than separate public component contracts.

The layout uses rails, open bands, plot canvases, and fine dividers. Cards are reserved for meaningful interactive states such as the prediction panel and warnings.

## Visual tokens

### Color lock

The concept background is cool deep graphite/navy, not black, cream, or warm gray.

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `#09131d` | application background |
| `--surface-1` | `#0e1a26` | rails and workbench |
| `--surface-2` | `#132332` | raised controls and active bands |
| `--surface-3` | `#172b3b` | focused/selected control |
| `--line` | `#2b3d4b` | structural dividers |
| `--line-strong` | `#405363` | plot and field boundaries |
| `--text` | `#f1f5f7` | primary text |
| `--muted` | `#9eacb7` | secondary labels |
| `--teal` | `#36c7d8` | active state and phase B |
| `--teal-dim` | `#124b5a` | active row background |
| `--amber` | `#ffc400` | phase A and event cursor |
| `--magenta` | `#f061c8` | summed current |
| `--green` | `#5bd26a` | safe/offline-local state |
| `--warning` | `#ffb21a` | timing/model warnings |
| `--danger` | `#ff6b64` | invalid input and limit |

Color is never the only signal. Plot series also use dash pattern, markers, and direct legend labels.

### Typography

- UI/content family: `Inter`, `IBM Plex Sans`, `Segoe UI`, system sans-serif fallback; bundled local font assets only when licenses and bundle size permit.
- Numerical/readout family: `IBM Plex Mono`, `SFMono-Regular`, `Consolas`, monospace fallback.
- H1/app title: 21–24 px, 600.
- Workbench title: 18–20 px, 600.
- Section title: 13–14 px, 600.
- Body: 13–14 px with 1.45–1.55 line height.
- Control/rail text: 12–13 px, explicitly set.
- Dense plot labels/status: approximately 9.5–12 px at desktop scale, with contrast and spacing preserved for legibility.

### Geometry and spacing

- Borders: 1 px, precise, low contrast.
- Radii: 6 px fields/buttons, 8 px interactive panels, no giant rounded wrappers.
- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Top bar: 56–60 px.
- Left rail: 246–270 px desktop.
- Right inspector: 300–340 px desktop.
- Status strip: 42–48 px.
- Center workbench must retain at least 620 px at the native target width.

## Icon treatment

Icons are thin outline symbols, 1.75–2 px stroke, square-capped or modestly rounded, 16–18 px in controls and 20 px for the menu. Use semantic SVG components for play, pause, reset, step, export, import, chevrons, bookmark, info, warning, and source link. Do not use Unicode glyph substitutions.

## Plot treatment

- Near-black plot canvas with subtle major/minor grid.
- Time or frequency axis and engineering unit always visible.
- Direct legend identifies color, dash, marker, and signal name.
- Cursor line is amber and includes a numerical readout.
- Event markers label switch edges, comparator trips, or load transitions.
- Waveform hover/cursor is code-native and reports exact simulation data.
- Scope controls sit in a compact lower toolbar, not over the data.

## Schematic teaching grammar

- Read power stages left-to-right as source → switching phases → energy storage → shared output → load.
- A multiphase label requires explicit parallel phase lanes. Up to three complete lanes are drawn; larger phase counts retain three representative lanes plus an exact additional-branch count and a complete timing-offset strip.
- Every conduction view combines device ON/OFF text, arrow direction, line treatment, and a plain-language route. Color alone is never the state explanation.
- High-side, low-side, dead-time, reverse-current, diode-emulation, and startup views name the current route and pair it with the inductor-voltage/current response.
- Compensation and behavioral-control diagrams use numbered regions and short purpose labels so learners can move from topology to signal flow without decoding decoration.
- External presentation references and the decisions derived from them are recorded in [`docs/design/SCHEMATIC_REFERENCE_NOTES.md`](docs/design/SCHEMATIC_REFERENCE_NOTES.md); technical truth remains code-, source-, and test-governed.

## Motion

- Current-path animation uses a restrained moving dash or point flow.
- Panel transitions use 120–180 ms opacity/translate.
- Run state may animate the playhead, never fabricate real-time acquisition.
- `prefers-reduced-motion` disables flow animation and nonessential transitions.

## Responsive continuation

At widths up to 1220 px, the shell narrows its rail/inspector geometry. At 1100 px and below, the curriculum rail becomes a fixed drawer and the inspector flows beneath the workbench. At 720 px and below, compact mobile control rules apply. The plot and diagram remain full-width and scroll only where the content requires it.

## Allowed first-viewport copy

- Constant On-Time Lab
- Inductor Ripple Sandbox
- Predict first
- Submit prediction
- Run simulation
- Pause
- Reset
- Step interval
- Step event
- Switched · RK4
- Model assumptions
- Sources
- Local only
- Export progress
- Import progress

Module and parameter names may appear as required by the user specification. No marketing subtitle, eyebrow, fake metric, login, avatar, cloud status, assistant, or gamification copy is allowed.

## Intentional concept corrections

The concept image is a visual specification, not a technical source. The implementation corrects these items without changing its design language:

- The rail uses the exact Modules 0–12 sequence from `SPEC.md`, rather than the abbreviated/generated labels.
- The status strip says **PSpice examples bundled** or **PSpice not executed**, never the concept’s unverified “PSpice: Connected (Local).”
- Citations use verified manifest IDs, not generated source text.
- Circuit labels and equations are rendered from reviewed code-native content.
- Calculated values come from the simulation package rather than image placeholders.

## Verification contract

At 1440 × 1024, the rendered primary lab must be compared with the concept for:

1. app-shell density and rail proportions,
2. typography and control scale,
3. cool graphite/navy palette and fine dividers,
4. workbench versus inspector balance,
5. plot/cursor/legend treatment,
6. prediction panel hierarchy,
7. status-strip anatomy,
8. responsive continuation and focus states.

Any remaining intentional deviation must be recorded in the final fidelity ledger.

## Final fidelity ledger

Compared artifacts:

- concept: [`docs/design/constant-on-time-lab-concept.png`](docs/design/constant-on-time-lab-concept.png)
- desktop implementation: [`docs/screenshots/inductor-ripple-desktop-chromium.png`](docs/screenshots/inductor-ripple-desktop-chromium.png)
- tablet implementation: [`docs/screenshots/inductor-ripple-tablet-chromium.png`](docs/screenshots/inductor-ripple-tablet-chromium.png)

| Comparison point | Verified implementation result | Intentional difference |
| --- | --- | --- |
| Shell and rail proportions | Desktop retains the narrow curriculum rail, open workbench, 310 px inspector, top controls, and bottom status anatomy. | At 1024 px the rail becomes an explicit drawer and the inspector continues below the workbench so the plot is not squeezed. |
| Typography and density | Compact 9.5–19 px hierarchy, mono engineering readouts, tight row rhythm, and restrained headings match the instrument-workspace concept. | System-local font fallbacks avoid a runtime font request. |
| Palette and dividers | Cool graphite/navy layers, teal selection, amber phase A, cyan phase B, magenta sum, and fine blue-gray rules are retained. | Warning/danger contrast was strengthened for accessibility. |
| Prediction hierarchy | “Predict first,” question, engineering-unit input, and locked reveal remain directly above the physical diagram. The answer path, waveform, metrics, derivation, transfer prompt, and mastery action remain hidden until the learner locks a prediction and runs the model. | Submission is disabled until a nonempty prediction exists, and Run remains disabled until prediction lock, rather than showing a decorative active button. |
| Circuit diagram | Code-native SVG preserves the central current-path emphasis, switch/inductor/capacitor/load topology, state selection, and reduced-motion support. | Device geometry was redrawn for legible current direction and physically correct dead-time arrows; no generated-image labels are treated as technical truth. |
| Waveform workbench | Oscilloscope surface, labeled axes/units, direct legend, dash/marker redundancy, cursor, event markers, and compact controls match the concept. | The implementation adds CSV, plot image, pan, event stepping, exact cursor values, and separately bordered companion plots when two abstraction levels must be compared without splicing their data. |
| Scenario and model controls | The inspector retains dense engineering inputs, transport controls, abstraction label, effects, sources, warnings, and calculated results. | A slim scenario band adds JSON import/export, pinned comparison, and bounded worker sweeps because these are functional requirements absent from the concept. |
| Status and trust language | Local/offline state, deterministic seed, and PSpice artifact status remain visible. | Unverified “connected” language was replaced with “examples bundled / not executed.” |

### Visual QA record

Interactive semantic QA used the in-app Browser against the live local application. Exact CI-rendered baselines were then regenerated with the repository's Playwright/Chromium setup at 1440 × 1024 and 1024 × 768 after each simulation worker completed and its plot became visible. The final matrix contains 50 project cases: 33 pass and 17 desktop-only per-lab captures are intentionally skipped in the tablet project. The browser suite checks navigation, prediction/reveal, strict invalid-input handling, local persistence, JSON/CSV downloads, sweep and comparison workflows, offline reload, keyboard focus, zero unexpected runtime requests, and Axe violations.

Manual original-resolution review confirmed:

- plot axes state quantity and SI/engineering units;
- phase lines remain distinguishable by color, label, marker, and dash;
- the interleaving primary scope emphasizes phase and summed currents while secondary switch/filter signals remain in a clearly labeled companion scope;
- legends and cursor readouts match displayed arrays;
- the diagram does not clip at either verified viewport;
- the desktop inspector does not obscure the workbench;
- the tablet workbench remains full-width with rail and inspector continuation available;
- scenario controls preserve the compact lab density; and
- no fake cloud, PSpice execution, or real-time acquisition state appears.
