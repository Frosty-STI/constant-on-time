import { useId } from 'react';

interface CompensatorDiagramProps {
  readonly topology: number;
  readonly parameters: Readonly<Record<string, number>>;
}

const shown = (parameters: Readonly<Record<string, number>>, key: string, fallback: number, unit: string): string =>
  `${parameters[key] ?? fallback} ${unit}`;

const Resistor = ({ x, y, label, value }: { x: number; y: number; label: string; value: string }) => (
  <g className="schematic-component resistor">
    <path d={`M${x} ${y}h12l7-8 12 16 12-16 12 16 12-16 7 8h12`} />
    <text x={x + 48} y={y - 13} textAnchor="middle">{label}</text>
    <text x={x + 48} y={y + 25} textAnchor="middle" className="component-value">{value}</text>
  </g>
);

const Capacitor = ({ x, y, label, value }: { x: number; y: number; label: string; value: string }) => (
  <g className="schematic-component capacitor">
    <path d={`M${x} ${y}h18m0-13v26m10-26v26m0-13h18`} />
    <text x={x + 23} y={y - 18} textAnchor="middle">{label}</text>
    <text x={x + 23} y={y + 30} textAnchor="middle" className="component-value">{value}</text>
  </g>
);

const NumberTag = ({ x, y, value }: { readonly x: number; readonly y: number; readonly value: number }) => (
  <g className="number-tag">
    <circle cx={x} cy={y} r="11" />
    <text x={x} y={y + 3.5} textAnchor="middle">{value}</text>
  </g>
);

export const CompensatorDiagram = ({ topology, parameters }: CompensatorDiagramProps) => {
  const typeIII = Math.round(topology) === 3;
  const idBase = useId().replace(/:/g, '');
  const sectionTitleId = `${idBase}-compensator-title`;
  const svgTitleId = `${idBase}-comp-title`;
  const svgDescriptionId = `${idBase}-comp-description`;
  const arrowId = `${idBase}-comp-arrow`;
  return (
    <section className="circuit-panel compensator-panel" aria-labelledby={sectionTitleId}>
      <div className="circuit-heading">
        <div>
          <span className="diagram-kicker">Feedback network · follow the signal left to right</span>
          <h3 id={sectionTitleId}>Voltage op-amp {typeIII ? 'Type III' : 'Type II reduction'}</h3>
          <p>TI SLVA301 Figure 12 mapping · ideal high-open-loop-gain approximation</p>
        </div>
        <div className="diagram-state-readout compensator-readout">
          <span>Topology</span>
          <strong>{typeIII ? 'Two lead pairs' : 'One lead pair'}</strong>
        </div>
      </div>

      <svg className="compensator-diagram" viewBox="0 0 960 280" role="img" aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}>
        <title id={svgTitleId}>{typeIII ? 'Type III' : 'Type II'} voltage error-amplifier compensation network</title>
        <desc id={svgDescriptionId}>VSENSE travels through the input impedance to the op-amp summing node. Two feedback branches connect VCONTROL back to the summing node. The positive input is held at VREF. Numbered regions match the explanation below.</desc>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10z" fill="#36c7d8" />
          </marker>
        </defs>

        <g className="compensator-zones" aria-hidden="true">
          <rect x="18" y="54" width="330" height="182" rx="6" />
          <rect x="360" y="14" width="274" height="82" rx="6" />
          <rect x="360" y="102" width="274" height="134" rx="6" />
          <rect x="646" y="102" width="296" height="134" rx="6" />
        </g>

        <g className="compensator-static">
          <text x="30" y="116" className="net-label">VSENSE</text>
          <path d="M90 110h18" className="signal-entry" markerEnd={`url(#${arrowId})`} />
          <path d="M108 110V72h20" />
          <Resistor x={128} y={72} label="R1" value={shown(parameters, 'r1', 20, 'kΩ')} />
          <path d="M224 72h126v38" />

          {typeIII ? <g className="second-lead-branch">
            <path d="M108 110v90h20" />
            <Capacitor x={128} y={200} label="C3" value={shown(parameters, 'c3', 1, 'nF')} />
            <path d="M174 200h18" />
            <Resistor x={192} y={200} label="R3" value={shown(parameters, 'r3', 5, 'kΩ')} />
            <path d="M288 200h62v-90" />
          </g> : null}

          <circle cx="350" cy="110" r="5" className="comp-node" />
          <text x="306" y="102" className="node-label">SUM</text>

          <path d="M350 114v20l-8 7 16 11-16 11 16 11-8 7v43" />
          <path d="M337 224h26m-20 7h14m-9 7h4" />
          <text x="370" y="173">RBOT</text>
          <text x="370" y="187" className="component-value">DC divider</text>

          <path d="M350 110h70" />
          <path d="M420 76v108l150-54z" className="opamp" />
          <text x="430" y="110" className="opamp-input">−</text>
          <text x="430" y="162" className="opamp-input">+</text>
          <path d="M370 157h50" />
          <text x="322" y="162" className="net-label">VREF</text>
          <path d="M570 130h340" className="control-output" markerEnd={`url(#${arrowId})`} />
          <text x="822" y="118" className="net-label">VCONTROL</text>
          <circle cx="610" cy="130" r="5" className="comp-node" />

          <path d="M350 110V48h48" className="feedback-branch" />
          <Capacitor x={398} y={48} label="C2" value={shown(parameters, 'c2', 2.2, 'nF')} />
          <path d="M444 48h18" />
          <Resistor x={462} y={48} label="R2" value={shown(parameters, 'r2', 5, 'kΩ')} />
          <path d="M558 48h52v82" className="feedback-branch" />

          <path d="M350 110V88h70" className="feedback-branch" />
          <Capacitor x={420} y={88} label="C1" value={shown(parameters, 'c1', 220, 'pF')} />
          <path d="M466 88h144v42" className="feedback-branch" />

          <NumberTag x={42} y={92} value={1} />
          <NumberTag x={378} y={54} value={2} />
          <NumberTag x={392} y={144} value={3} />
        </g>
      </svg>

      <div className="compensator-reading">
        <div><span>1 · Input network</span><code>Zi = {typeIII ? 'R1 ∥ (C3 + R3)' : 'R1'}</code><p>{typeIII ? 'R3–C3 creates the second lead pair.' : 'R3–C3 is intentionally removed.'}</p></div>
        <div><span>2 · Feedback network</span><code>Zf = C1 ∥ (C2 + R2)</code><p>Two parallel feedback routes shape the high-frequency response.</p></div>
        <div><span>3 · Op-amp rule</span><code>V− ≈ V+ = VREF</code><p>Negative feedback drives VCONTROL to hold the summing node near VREF.</p></div>
      </div>
      <p className="compensator-note">RBOT establishes the DC divider and is not part of this ideal AC transfer-function shape.</p>
    </section>
  );
};
