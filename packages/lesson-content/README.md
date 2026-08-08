# Lesson content schema

`modules/index.json` orders the dependency-aware curriculum. Each module file contains lessons with the required three views:

- `physicalIntuition`: mechanism and current/energy story;
- `mathematicalDerivation`: equations, assumptions, and validity;
- `modelingConsequence`: what the simulator or PSpice model must represent and omit.

`citations` are stable IDs from `sources/manifest.json`. `evidenceLabels` use the vocabulary in `docs/START_HERE.md`. The content is plain JSON so the local app can import or transform it without a network service.

