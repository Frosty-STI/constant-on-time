import type { LabId } from '../domain/labs';

interface CircuitDiagramProps {
  readonly labId: LabId;
  readonly phaseCount: number;
  readonly activeState: number;
  readonly inductorCurrent: number;
  readonly running: boolean;
  readonly onStateChange: (state: number) => void;
}

const stateLabels = ['High-side on', 'Low-side on', 'Dead time', 'Async freewheel', 'Reverse · low-side on', 'Diode emulation', 'Startup'] as const;

export const CircuitDiagram = ({ labId, phaseCount, activeState, inductorCurrent, running, onStateChange }: CircuitDiagramProps) => {
  const showStatePuzzle = labId === 'current-path';
  const reverse = inductorCurrent < 0;
  const path = (() => {
    if (!showStatePuzzle) return 'M48 35H170V97H481';
    if (activeState === 0) return reverse ? 'M481 97H170V35H48' : 'M48 35H170V97H481';
    if (activeState === 1) return reverse ? 'M481 97H170V153H48' : 'M48 153H170V97H481';
    if (activeState === 2) return inductorCurrent === 0 ? null : reverse ? 'M481 97H170V35H48' : 'M48 153H170V97H481';
    if (activeState === 3) return inductorCurrent < 0 ? 'M481 97H170V35H48' : inductorCurrent > 0 ? 'M48 153H170V97H481' : null;
    if (activeState === 4) return reverse ? 'M481 97H170V153H48' : null;
    if (activeState === 5) return inductorCurrent < 0 ? 'M481 97H170V35H48' : inductorCurrent > 0 ? 'M48 153H170V97H481' : null;
    return reverse ? 'M481 97H170V35H48' : 'M48 35H170V97H481';
  })();
  return (
    <section className="circuit-panel" aria-labelledby="circuit-title">
      <div className="section-heading-row">
        <h3 id="circuit-title">Synchronous buck · {Math.max(1, Math.round(phaseCount))} phase{phaseCount === 1 ? '' : 's'}</h3>
        <span>{showStatePuzzle ? stateLabels[activeState] ?? 'State' : 'active current path'}</span>
      </div>
      <svg className={`buck-diagram ${running ? 'is-running' : ''}`} viewBox="0 0 760 190" role="img" aria-labelledby="buck-title buck-description">
        <title id="buck-title">Synchronous buck converter current path</title>
        <desc id="buck-description">Input source, high-side and low-side switches, per-phase inductor, output capacitor, and load. The highlighted arrow follows both the selected conduction state and the inductor-current sign.</desc>
        <defs>
          <marker id="arrow-forward" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="currentColor" />
          </marker>
        </defs>
        <g className="circuit-static">
          <circle cx="48" cy="98" r="20" />
          <path d="M48 78V35H170M48 118v35h620" />
          <path d="M38 98h20M48 88v20" />
          <text x="25" y="68">VIN</text>
          <path d="M170 35v25m-14 12 28-12m-14 12v25" />
          <text x="136" y="56">QHS</text>
          <path d="M170 97v22m-14 12 28-12m-14 12v22" />
          <text x="136" y="143">QLS</text>
          <circle cx="170" cy="97" r="4" className="node" />
          <text x="182" y="92">SW</text>
          <path d="M170 97h55c8-24 18-24 26 0s18 24 26 0 18-24 26 0 18 24 26 0h58" />
          <text x="270" y="70">L1</text>
          <path d="M387 97h94m0-42v98" />
          <path d="M467 72h28m-28 12h28" />
          <text x="452" y="47">COUT</text>
          <path d="M481 153h187M560 97h108m-68 0v15l-12 8 24 12-24 12 24 9" />
          <text x="615" y="118">LOAD</text>
          <circle cx="481" cy="97" r="4" className="node" />
          <text x="493" y="91">VOUT</text>
          <path d="M170 153v-22M668 97v56" />
        </g>
        <g className={`current-path ${reverse ? 'reverse' : 'forward'} state-${activeState}`}>
          {path ? <path d={path} markerEnd="url(#arrow-forward)" /> : null}
        </g>
        {Array.from({ length: Math.min(Math.max(Math.round(phaseCount), 1), 8) - 1 }, (_, index) => (
          <g key={index} className="phase-ghost" transform={`translate(0 ${Math.min((index + 1) * 8, 38)})`}>
            <path d="M170 97h55c8-24 18-24 26 0s18 24 26 0 18-24 26 0 18 24 26 0h58" />
          </g>
        ))}
      </svg>
      {showStatePuzzle ? (
        <div className="state-selector" role="group" aria-label="Select conduction state">
          {stateLabels.map((label, index) => (
            <button key={label} type="button" className={activeState === index ? 'active' : ''} onClick={() => onStateChange(index)}>{label}</button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
