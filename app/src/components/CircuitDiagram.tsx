import { useId } from 'react';

import type { LabId } from '../domain/labs';

interface CircuitDiagramProps {
  readonly labId: LabId;
  readonly phaseCount: number;
  readonly activeState: number;
  readonly inductorCurrent: number;
  readonly inputVoltage: number;
  readonly outputVoltage: number;
  readonly running: boolean;
  readonly revealed: boolean;
  readonly onStateChange: (state: number) => void;
}

const stateLabels = ['High-side on', 'Low-side on', 'Dead time', 'Async freewheel', 'Reverse · low-side on', 'Diode emulation', 'Startup'] as const;

type CurrentSign = -1 | 0 | 1;
type PathMode = 'high-forward' | 'high-reverse' | 'low-forward' | 'low-reverse' | 'low-diode' | 'high-diode' | null;

interface DisplayState {
  readonly highOn: boolean;
  readonly lowOn: boolean;
  readonly pathMode: PathMode;
  readonly diode: 'high' | 'low' | null;
  readonly switchState: string;
  readonly route: string;
  readonly inductor: string;
  readonly equation: string;
}

const signOf = (current: number): CurrentSign => current < 0 ? -1 : current > 0 ? 1 : 0;

const resolveDisplayState = (state: number, sign: CurrentSign): DisplayState => {
  const noCurrent = (switchState: string, inductor: string, equation: string): DisplayState => ({
    highOn: false,
    lowOn: false,
    pathMode: null,
    diode: null,
    switchState,
    route: 'No current path at this instant.',
    inductor,
    equation,
  });

  if (state === 0 || state === 6) {
    const startup = state === 6;
    if (sign === 0) return {
      ...noCurrent(
        startup ? 'Startup pulse · QH1 ON' : 'QH1 ON · QL1 OFF',
        'Current is zero at this instant; VIN − VOUT starts it ramping toward VOUT.',
        'vL = VIN − VOUT',
      ),
      highOn: true,
    };
    return {
      highOn: true,
      lowOn: false,
      pathMode: sign < 0 ? 'high-reverse' : 'high-forward',
      diode: null,
      switchState: startup ? 'Startup pulse · QH1 ON' : 'QH1 ON · QL1 OFF',
      route: sign < 0 ? 'VOUT → L1 → SW1 → QH1 → VIN' : 'VIN → QH1 → SW1 → L1 → VOUT',
      inductor: sign < 0
        ? 'Positive vL reduces the magnitude of negative current and returns energy to VIN.'
        : 'Positive current rises and stores energy in L1.',
      equation: 'vL = VIN − VOUT',
    };
  }

  if (state === 1) {
    if (sign === 0) return {
      ...noCurrent('QH1 OFF · QL1 ON', 'Current is zero now; −VOUT would drive it negative if QL1 stayed on.', 'vL = −VOUT'),
      lowOn: true,
    };
    return {
      highOn: false,
      lowOn: true,
      pathMode: sign < 0 ? 'low-reverse' : 'low-forward',
      diode: null,
      switchState: 'QH1 OFF · QL1 ON',
      route: sign < 0 ? 'VOUT → L1 → SW1 → QL1 → PGND' : 'PGND → QL1 → SW1 → L1 → VOUT',
      inductor: sign < 0 ? 'Negative current grows in magnitude.' : 'L1 keeps feeding the output while positive current falls.',
      equation: 'vL = −VOUT',
    };
  }

  if (state === 2 || state === 3) {
    const asynchronous = state === 3;
    if (sign === 0) return noCurrent(
      asynchronous ? 'QH1 OFF · catch diode idle' : 'Both gates OFF · dead time',
      'With iL = 0, neither body diode conducts and the switch node rests at VOUT.',
      'vL = 0',
    );
    return {
      highOn: false,
      lowOn: false,
      pathMode: sign < 0 ? 'high-diode' : 'low-diode',
      diode: sign < 0 ? 'high' : 'low',
      switchState: asynchronous ? 'QH1 OFF · catch-diode interval' : 'Both gates OFF · dead time',
      route: sign < 0
        ? 'VOUT → L1 → high-side body diode → VIN'
        : `PGND → ${asynchronous ? 'catch diode' : 'low-side body diode'} → SW1 → L1 → VOUT`,
      inductor: sign < 0
        ? 'Stored negative current commutates toward VIN and slews back toward zero.'
        : 'Current cannot jump instantly, so the diode keeps L1 feeding the output.',
      equation: sign < 0 ? 'vL ≈ VIN + VD − VOUT' : 'vL ≈ −(VOUT + VD)',
    };
  }

  if (state === 4) {
    if (sign >= 0) return noCurrent(
      'Invalid for iL ≥ 0 · phase open',
      'This teaching state requires negative current; the model holds vSW at VOUT.',
      'vL = 0',
    );
    return {
      highOn: false,
      lowOn: true,
      pathMode: 'low-reverse',
      diode: null,
      switchState: 'QH1 OFF · QL1 ON',
      route: 'VOUT → L1 → SW1 → QL1 → PGND',
      inductor: 'Current is negative: energy flows from the output back through the low-side channel.',
      equation: 'vL = −VOUT',
    };
  }

  if (state === 5) {
    if (sign === 0) return noCurrent(
      'Zero-current detect · both channels OFF',
      'Diode emulation opens the phase at zero so current cannot become negative.',
      'iL = 0 · vL = 0',
    );
    if (sign < 0) return {
      highOn: false,
      lowOn: false,
      pathMode: 'high-diode',
      diode: 'high',
      switchState: 'Both channels OFF · transient commutation',
      route: 'VOUT → L1 → high-side body diode → VIN',
      inductor: 'Stored negative current first returns to VIN, then the phase opens at zero.',
      equation: 'vL ≈ VIN + VD − VOUT',
    };
    return {
      highOn: false,
      lowOn: true,
      pathMode: 'low-forward',
      diode: null,
      switchState: 'QL1 ON until zero-current detect',
      route: 'PGND → QL1 → SW1 → L1 → VOUT',
      inductor: 'Positive current freewheels down to zero; QL1 then turns off to prevent reversal.',
      equation: 'vL = −VOUT',
    };
  }

  return noCurrent('Unknown switching state', 'No teaching path is defined for this state.', 'vL = 0');
};

const phaseRows = (visiblePhaseCount: number): readonly number[] => {
  if (visiblePhaseCount === 1) return [154];
  if (visiblePhaseCount === 2) return [105, 203];
  return [72, 154, 236];
};

const inductorForward = (row: number): string =>
  `M232 ${row}H282c8-19 16-19 24 0s16 19 24 0 16-19 24 0 16 19 24 0H540`;

const inductorForwardTail = (): string =>
  `H282c8-19 16-19 24 0s16 19 24 0 16-19 24 0 16 19 24 0H540`;

const inductorReverseTail = (): string =>
  `H378c-8 19-16 19-24 0s-16-19-24 0-16 19-24 0-16-19-24 0H232`;

const Ground = ({ x, y }: { readonly x: number; readonly y: number }) => (
  <path className="ground-symbol" d={`M${x} ${y - 14}v8m-13 0h26m-19 6h12m-8 6h4`} />
);

const Load = ({ outputY }: { readonly outputY: number }) => (
  <path d={`M800 ${outputY}v20l-13 8 26 12-26 12 26 12-26 12 26 12-13 8v40`} />
);

export const CircuitDiagram = ({
  labId,
  phaseCount,
  activeState,
  inductorCurrent,
  inputVoltage,
  outputVoltage,
  running,
  revealed,
  onStateChange,
}: CircuitDiagramProps) => {
  const idBase = useId().replace(/:/g, '');
  const sectionTitleId = `${idBase}-circuit-title`;
  const svgTitleId = `${idBase}-buck-title`;
  const svgDescriptionId = `${idBase}-buck-description`;
  const arrowForwardId = `${idBase}-arrow-forward`;
  const arrowReverseId = `${idBase}-arrow-reverse`;
  const arrowDiodeId = `${idBase}-arrow-diode`;
  const showStatePuzzle = labId === 'current-path';
  const count = Math.min(Math.max(Math.round(phaseCount), 1), 8);
  const visibleCount = Math.min(count, 3);
  const rows = phaseRows(visibleCount);
  const activeRow = rows[0] ?? 154;
  const outputY = 154;
  const sign = signOf(inductorCurrent);
  const reverse = sign < 0;
  const explanation = resolveDisplayState(activeState, sign);
  const { highOn, lowOn } = explanation;
  const lowDiode = explanation.diode === 'low';
  const highDiode = explanation.diode === 'high';
  const hasPath = revealed && explanation.pathMode !== null;

  const phasePath = (() => {
    if (!hasPath) return null;
    const highY = activeRow - 20;
    const lowY = activeRow + 20;
    switch (explanation.pathMode) {
      case 'high-forward':
        return `M50 128V42H92V${highY}H210L232 ${activeRow}${inductorForwardTail()}V${outputY}H800`;
      case 'high-reverse':
      case 'high-diode':
        return `M800 ${outputY}H540V${activeRow}${inductorReverseTail()}L210 ${highY}H142H92V42H50V128`;
      case 'low-forward':
      case 'low-diode':
        return `M110 ${lowY}H210L232 ${activeRow}${inductorForwardTail()}V${outputY}H800`;
      case 'low-reverse':
        return `M800 ${outputY}H540V${activeRow}${inductorReverseTail()}L210 ${lowY}H110`;
      default:
        return null;
    }
  })();

  return (
    <section className="circuit-panel" aria-labelledby={sectionTitleId}>
      <div className="circuit-heading">
        <div>
          <span className="diagram-kicker">Power stage · read left to right</span>
          <h3 id={sectionTitleId}>{count > 1 ? 'Multiphase' : 'Single-phase'} synchronous buck</h3>
          <p>{count} parallel switching {count === 1 ? 'leg feeds' : 'legs feed'} one shared output filter.</p>
        </div>
        <div className="diagram-state-readout" aria-label={revealed ? `Displayed conduction state: ${explanation.switchState}` : 'Conduction state hidden until simulation runs'}>
          <span>Viewing phase 1</span>
          <strong>{revealed ? explanation.switchState : 'Awaiting simulation'}</strong>
        </div>
      </div>

      <div className="diagram-legend" aria-label="Schematic legend">
        <span><i className="legend-wire" />Electrical connection</span>
        <span><i className="legend-path" />Conducting path</span>
        <span><i className="legend-diode" />Body-diode conduction</span>
        {count > 1 ? <span className="phase-spacing">Ideal spacing: 360° / {count} = {(360 / count).toFixed(count === 8 ? 0 : 1).replace('.0', '')}°</span> : null}
      </div>

      <svg
        className={`buck-diagram ${revealed ? 'is-revealed' : ''} ${running && hasPath ? 'is-running' : ''}`}
        viewBox="0 0 960 320"
        role="img"
        aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}
        data-path-mode={explanation.pathMode ?? 'none'}
      >
        <title id={svgTitleId}>{count}-phase synchronous buck converter teaching schematic</title>
        <desc id={svgDescriptionId}>A DC source feeds {count} parallel high-side and low-side MOSFET phase {count === 1 ? 'leg' : 'legs'}. Each switch node feeds its own inductor. The inductors join at one output capacitor and load. Phase one shows the selected current path after the prediction is run.</desc>
        <defs>
          <marker id={arrowForwardId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10z" fill="#ffc400" />
          </marker>
          <marker id={arrowReverseId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10z" fill="#f061c8" />
          </marker>
          <marker id={arrowDiodeId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10z" fill="#ffb21a" />
          </marker>
        </defs>

        <g className="diagram-zones" aria-hidden="true">
          <text x="18" y="22">SOURCE</text>
          <text x="126" y="22">SWITCHING PHASES</text>
          <text x="292" y="22">ENERGY STORAGE</text>
          <text x="568" y="22">SHARED OUTPUT</text>
          <path d="M112 10v294M560 10v294" />
        </g>

        <g className="circuit-static">
          <circle cx="50" cy="154" r="26" className="source-symbol" />
          <path d="M50 128V42H92M50 180v102" />
          <path d="M39 154h22M50 143v22" />
          <text x="18" y="112" className="net-label">VIN</text>
          <text x="15" y="124" className="component-value">{inputVoltage.toPrecision(3)} V DC</text>
          <Ground x={50} y={296} />
          <text x="16" y="316" className="net-label">PGND</text>

          <path d={`M92 42V${Math.max(52, (rows.at(-1) ?? activeRow) - 20)}`} className="vin-bus" />

          {rows.map((row, index) => {
            const phase = index + 1;
            const highY = row - 20;
            const lowY = row + 20;
            const offset = Math.round(index * 360 / count);
            const isPrimary = index === 0;
            return (
              <g key={phase} className={`phase-lane phase-${phase}`} data-testid={`phase-lane-${phase}`}>
                <path d={`M92 ${highY}H142M210 ${highY}L232 ${row}M110 ${lowY}H142M210 ${lowY}L232 ${row}`} />
                <rect data-device={`QH${phase}`} x="142" y={highY - 12} width="68" height="24" rx="3" className={`mosfet ${isPrimary && revealed && highOn ? 'conducting' : 'off'}`} />
                <rect data-device={`QL${phase}`} x="142" y={lowY - 12} width="68" height="24" rx="3" className={`mosfet ${isPrimary && revealed && lowOn ? 'conducting' : 'off'}`} />
                <text x="150" y={highY + 4} className="device-label">QH{phase}</text>
                <text x="150" y={lowY + 4} className="device-label">QL{phase}</text>
                {isPrimary ? <>
                  <text x="202" y={highY + 4} textAnchor="end" className={`device-state ${revealed && highOn ? 'is-on' : ''}`}>{revealed ? (highOn ? 'ON' : 'OFF') : '?'}</text>
                  <text x="202" y={lowY + 4} textAnchor="end" className={`device-state ${revealed && lowOn ? 'is-on' : ''}`}>{revealed ? (lowOn ? 'ON' : 'OFF') : '?'}</text>
                </> : null}
                <path className={`body-diode high ${isPrimary && highDiode && revealed ? 'active' : ''}`} d={`M169 ${highY - 6}l-10 6 10 6zm-14-8v16`} />
                <path className={`body-diode low ${isPrimary && lowDiode && revealed ? 'active' : ''}`} d={`M159 ${lowY - 6}l10 6-10 6zm14-8v16`} />
                <circle cx="232" cy={row} r="4" className="node" />
                <text x="238" y={row - 9} className="node-label">SW{phase}</text>
                <path d={inductorForward(row)} />
                <text x="330" y={row - 26} className="component-label">L{phase}</text>
                <text x="420" y={row - 9} className="phase-current">iL{phase} →</text>
                <text x="250" y={row + 28} className="phase-caption">PHASE {phase} · {offset}°</text>
                <Ground x={110} y={row + 34} />
                <circle cx="540" cy={row} r="3.5" className="node phase-node" />
              </g>
            );
          })}

          {lowDiode && revealed ? <g className="diode-callout"><path d={`M176 ${activeRow + 32}v16h18`} /><text x="200" y={activeRow + 52}>LOW-SIDE BODY DIODE</text></g> : null}
          {highDiode && revealed ? <g className="diode-callout"><path d={`M176 ${activeRow - 32}v-16h18`} /><text x="200" y={activeRow - 45}>HIGH-SIDE BODY DIODE</text></g> : null}

          <path d={`M540 ${rows[0] ?? outputY}V${rows.at(-1) ?? outputY}M540 ${outputY}H870`} className="output-bus" />
          <circle cx="540" cy={outputY} r="5" className="node output-node" />
          <text x="556" y={outputY - 12} className="net-label">VOUT</text>
          <text x="556" y={outputY + 18} className="component-value">{outputVoltage.toPrecision(3)} V target</text>

          <path d={`M660 ${outputY}v48m-17 0h34m-34 14h34m-17 0v74`} />
          <text x="632" y={outputY + 31} className="component-label">COUT</text>
          <Ground x={660} y={outputY + 150} />
          <Load outputY={outputY} />
          <text x="820" y={outputY + 70} className="component-label">LOAD</text>
          <Ground x={800} y={outputY + 150} />
          <text x="709" y="314" className="ground-note">All PGND symbols are the same return node.</text>
          {count > visibleCount ? <text x="410" y="291" className="additional-phases">+ {count - visibleCount} more identical phase {count - visibleCount === 1 ? 'leg' : 'legs'} join VOUT</text> : null}
        </g>

        {phasePath ? (
          <g className={`current-path ${reverse ? 'reverse' : 'forward'} ${lowDiode || highDiode ? 'through-diode' : ''}`}>
            <path d={phasePath} markerEnd={`url(#${lowDiode || highDiode ? arrowDiodeId : reverse ? arrowReverseId : arrowForwardId})`} />
            {!reverse ? <path d={`M800 ${outputY}v20l-13 8 26 12-26 12 26 12-26 12 26 12-13 8v40`} markerEnd={`url(#${lowDiode ? arrowDiodeId : arrowForwardId})`} /> : null}
          </g>
        ) : null}
      </svg>

      <div className={`diagram-reading ${revealed ? 'is-revealed' : 'is-locked'}`} role="note" aria-live="polite">
        {revealed ? <>
          <div><span>1 · Switch state</span><strong>{explanation.switchState}</strong></div>
          <div><span>2 · Trace the arrows</span><strong>{explanation.route}</strong></div>
          <div><span>3 · Inductor response</span><strong>{explanation.inductor}</strong><code>{explanation.equation}</code></div>
        </> : <p>Lock a prediction and run the model to reveal the conducting devices, arrow direction, and inductor-voltage story.</p>}
      </div>

      {count > 1 ? (
        <ol className="phase-timing-strip" aria-label={`${count} ideal interleaved phase offsets`}>
          {Array.from({ length: count }, (_, index) => <li key={index}><span>P{index + 1}</span><strong>{Math.round(index * 360 / count)}°</strong></li>)}
        </ol>
      ) : null}

      {showStatePuzzle ? (
        <div className="state-selector" role="group" aria-label="Select conduction state">
          {stateLabels.map((label, index) => (
            <button key={label} type="button" className={activeState === index ? 'active' : ''} aria-pressed={activeState === index} onClick={() => onStateChange(index)}>
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
