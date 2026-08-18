import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CircuitDiagram } from './CircuitDiagram';

const baseProps = {
  labId: 'interleaving' as const,
  phaseCount: 2,
  activeState: 0,
  inductorCurrent: 4,
  inputVoltage: 12,
  outputVoltage: 5,
  running: false,
  revealed: false,
  onStateChange: vi.fn(),
};

type PathMode = 'high-forward' | 'high-reverse' | 'low-forward' | 'low-reverse' | 'low-diode' | 'high-diode' | 'none';

interface StateCase {
  readonly name: string;
  readonly state: number;
  readonly current: number;
  readonly path: PathMode;
  readonly device?: 'QH1' | 'QL1';
  readonly diode?: 'high' | 'low';
  readonly equation: string;
}

const cases: readonly StateCase[] = [
  { name: 'high-side positive', state: 0, current: 4, path: 'high-forward', device: 'QH1', equation: 'vL = VIN − VOUT' },
  { name: 'high-side zero', state: 0, current: 0, path: 'none', device: 'QH1', equation: 'vL = VIN − VOUT' },
  { name: 'high-side reverse', state: 0, current: -4, path: 'high-reverse', device: 'QH1', equation: 'vL = VIN − VOUT' },
  { name: 'low-side positive', state: 1, current: 4, path: 'low-forward', device: 'QL1', equation: 'vL = −VOUT' },
  { name: 'low-side zero', state: 1, current: 0, path: 'none', device: 'QL1', equation: 'vL = −VOUT' },
  { name: 'low-side reverse', state: 1, current: -4, path: 'low-reverse', device: 'QL1', equation: 'vL = −VOUT' },
  { name: 'dead time positive', state: 2, current: 4, path: 'low-diode', diode: 'low', equation: 'vL ≈ −(VOUT + VD)' },
  { name: 'dead time zero', state: 2, current: 0, path: 'none', equation: 'vL = 0' },
  { name: 'dead time reverse', state: 2, current: -4, path: 'high-diode', diode: 'high', equation: 'vL ≈ VIN + VD − VOUT' },
  { name: 'async positive', state: 3, current: 4, path: 'low-diode', diode: 'low', equation: 'vL ≈ −(VOUT + VD)' },
  { name: 'async zero', state: 3, current: 0, path: 'none', equation: 'vL = 0' },
  { name: 'async reverse transient', state: 3, current: -4, path: 'high-diode', diode: 'high', equation: 'vL ≈ VIN + VD − VOUT' },
  { name: 'reverse state rejects positive current', state: 4, current: 4, path: 'none', equation: 'vL = 0' },
  { name: 'reverse state rejects zero current', state: 4, current: 0, path: 'none', equation: 'vL = 0' },
  { name: 'reverse state accepts negative current', state: 4, current: -4, path: 'low-reverse', device: 'QL1', equation: 'vL = −VOUT' },
  { name: 'diode emulation freewheels positive current', state: 5, current: 4, path: 'low-forward', device: 'QL1', equation: 'vL = −VOUT' },
  { name: 'diode emulation opens at zero', state: 5, current: 0, path: 'none', equation: 'iL = 0 · vL = 0' },
  { name: 'diode emulation commutates negative current', state: 5, current: -4, path: 'high-diode', diode: 'high', equation: 'vL ≈ VIN + VD − VOUT' },
  { name: 'startup positive', state: 6, current: 4, path: 'high-forward', device: 'QH1', equation: 'vL = VIN − VOUT' },
  { name: 'startup zero', state: 6, current: 0, path: 'none', device: 'QH1', equation: 'vL = VIN − VOUT' },
  { name: 'startup reverse', state: 6, current: -4, path: 'high-reverse', device: 'QH1', equation: 'vL = VIN − VOUT' },
];

describe('CircuitDiagram', () => {
  it.each([
    { count: 1, visible: 1, lastPhase: undefined, offset: undefined },
    { count: 2, visible: 2, lastPhase: 'P2', offset: '180°' },
    { count: 3, visible: 3, lastPhase: 'P3', offset: '240°' },
    { count: 8, visible: 3, lastPhase: 'P8', offset: '315°' },
  ])('draws a truthful $count-phase topology and timing key', ({ count, visible, lastPhase, offset }) => {
    const { container } = render(<CircuitDiagram {...baseProps} phaseCount={count} />);

    expect(container.querySelectorAll('[data-testid^="phase-lane-"]')).toHaveLength(visible);
    expect(screen.getByText(`${count} parallel switching ${count === 1 ? 'leg feeds' : 'legs feed'} one shared output filter.`)).toBeInTheDocument();
    if (lastPhase && offset) {
      const timing = screen.getByRole('list', { name: `${count} ideal interleaved phase offsets` });
      expect(timing).toHaveTextContent(lastPhase);
      expect(timing).toHaveTextContent(offset);
    } else {
      expect(screen.queryByRole('list', { name: /ideal interleaved phase offsets/i })).not.toBeInTheDocument();
    }
  });

  it.each(cases)('matches the simulator matrix for $name', ({ state, current, path, device, diode, equation }) => {
    const { container } = render(
      <CircuitDiagram {...baseProps} labId="current-path" phaseCount={1} activeState={state} inductorCurrent={current} revealed />,
    );

    const diagram = container.querySelector('.buck-diagram');
    expect(diagram).toHaveAttribute('data-path-mode', path);
    expect(container.querySelector('.current-path') === null).toBe(path === 'none');
    expect(container.querySelector('[data-device="QH1"]')).toHaveClass(device === 'QH1' ? 'conducting' : 'off');
    expect(container.querySelector('[data-device="QL1"]')).toHaveClass(device === 'QL1' ? 'conducting' : 'off');
    expect(container.querySelector('.body-diode.high.active') !== null).toBe(diode === 'high');
    expect(container.querySelector('.body-diode.low.active') !== null).toBe(diode === 'low');
    expect(within(container).getByText(equation, { selector: 'code' })).toBeInTheDocument();
  });

  it('keeps device state, diode state, and path neutral until the prediction is revealed', () => {
    const { container } = render(
      <CircuitDiagram {...baseProps} labId="current-path" phaseCount={1} activeState={2} inductorCurrent={4} revealed={false} />,
    );

    expect(within(container).getByText('Awaiting simulation')).toBeInTheDocument();
    expect(container.querySelector('.mosfet.conducting')).toBeNull();
    expect(container.querySelector('.body-diode.active')).toBeNull();
    expect(container.querySelector('.current-path')).toBeNull();
  });

  it('creates unique accessible title and marker ids for multiple instances', () => {
    const { container } = render(<><CircuitDiagram {...baseProps} /><CircuitDiagram {...baseProps} /></>);
    const diagrams = [...container.querySelectorAll<SVGElement>('.buck-diagram')];
    const accessibleIds = diagrams.map((diagram) => diagram.getAttribute('aria-labelledby'));
    const markerIds = [...container.querySelectorAll<SVGMarkerElement>('marker')].map((marker) => marker.id);

    expect(new Set(accessibleIds).size).toBe(2);
    expect(new Set(markerIds).size).toBe(markerIds.length);
  });
});
