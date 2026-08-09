interface CompensatorDiagramProps {
  readonly topology: number;
  readonly parameters: Readonly<Record<string, number>>;
}

const shown = (parameters: Readonly<Record<string, number>>, key: string, fallback: number, unit: string): string =>
  `${parameters[key] ?? fallback} ${unit}`;

const Resistor = ({ x, y, label, value }: { x: number; y: number; label: string; value: string }) => (
  <g>
    <path d={`M${x} ${y}h12l7-8 12 16 12-16 12 16 12-16 7 8h12`} />
    <text x={x + 48} y={y - 13} textAnchor="middle">{label}</text>
    <text x={x + 48} y={y + 25} textAnchor="middle" className="component-value">{value}</text>
  </g>
);

const Capacitor = ({ x, y, label, value }: { x: number; y: number; label: string; value: string }) => (
  <g>
    <path d={`M${x} ${y}h18m0-13v26m10-26v26m0-13h18`} />
    <text x={x + 23} y={y - 18} textAnchor="middle">{label}</text>
    <text x={x + 23} y={y + 30} textAnchor="middle" className="component-value">{value}</text>
  </g>
);

export const CompensatorDiagram = ({ topology, parameters }: CompensatorDiagramProps) => {
  const typeIII = Math.round(topology) === 3;
  return (
    <section className="circuit-panel compensator-panel" aria-labelledby="compensator-title">
      <div className="section-heading-row">
        <h3 id="compensator-title">Voltage op-amp {typeIII ? 'Type III' : 'Type II reduction'} · TI SLVA301 Figure 12 mapping</h3>
        <span>ideal high-open-loop-gain approximation</span>
      </div>
      <svg className="compensator-diagram" viewBox="0 0 760 230" role="img" aria-labelledby="comp-title comp-description">
        <title id="comp-title">{typeIII ? 'Type III' : 'Type II'} error-amplifier compensation network</title>
        <desc id="comp-description">The input impedance is R1 in parallel with a Type III R3-C3 series branch. The feedback impedance is C1 in parallel with an R2-C2 series branch. An ideal voltage operational amplifier compares the summing node with VREF.</desc>
        <g className="compensator-static">
          <text x="20" y="121">VSENSE</text>
          <path d="M74 116h34M108 116V72h18" />
          <Resistor x={126} y={72} label="R1" value={shown(parameters, 'r1', 20, 'kΩ')} />
          <path d="M222 72h82v44h18" />
          {typeIII ? <>
            <path d="M108 116v67h20" />
            <Capacitor x={128} y={183} label="C3" value={shown(parameters, 'c3', 1, 'nF')} />
            <path d="M174 183h8" />
            <Resistor x={182} y={183} label="R3" value={shown(parameters, 'r3', 5, 'kΩ')} />
            <path d="M278 183h26v-67h18" />
          </> : null}
          <circle cx="322" cy="116" r="4" className="comp-node" />
          <text x="284" y="107" className="node-label">SUM</text>
          <path d="M322 120v14l-8 7 16 11-16 11 16 11-8 7v18" />
          <path d="M309 199h26m-21 7h16m-11 7h6" />
          <text x="341" y="170">RBOT</text>
          <text x="341" y="184" className="component-value">DC divider</text>
          <path d="M322 116h38" />
          <path d="M360 82v76l122-38z" className="opamp" />
          <text x="369" y="112">−</text>
          <text x="369" y="147">+</text>
          <path d="M340 143h20M292 143h48" />
          <text x="238" y="148">VREF</text>
          <path d="M482 120h238" />
          <text x="648" y="109">VCONTROL</text>
          <circle cx="520" cy="120" r="4" className="comp-node" />

          <path d="M322 116V30h34" />
          <Capacitor x={356} y={30} label="C2" value={shown(parameters, 'c2', 2.2, 'nF')} />
          <path d="M402 30h16" />
          <Resistor x={418} y={30} label="R2" value={shown(parameters, 'r2', 5, 'kΩ')} />
          <path d="M514 30h46v90h-40" />

          <path d="M322 116V74h54" />
          <Capacitor x={376} y={74} label="C1" value={shown(parameters, 'c1', 220, 'pF')} />
          <path d="M422 74h138v46h-40" />
        </g>
      </svg>
      <div className="compensator-impedances">
        <code>Zf = C1 ∥ (C2 + R2)</code>
        <code>Zi = {typeIII ? 'R1 ∥ (C3 + R3)' : 'R1'}</code>
        <span>RBOT establishes the DC divider and drops out of this ideal AC shape. {typeIII ? 'R3–C3 adds the second lead pair.' : 'R3–C3 is deliberately removed.'}</span>
      </div>
    </section>
  );
};
