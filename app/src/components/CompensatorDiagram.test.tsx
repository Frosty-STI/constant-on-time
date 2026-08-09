import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompensatorDiagram } from './CompensatorDiagram';

const parameters = { r1: 20, r2: 5, r3: 5, c1: 220, c2: 2.2, c3: 1 };

describe('CompensatorDiagram', () => {
  it('shows the complete Type III input and feedback topology', () => {
    const { container } = render(<CompensatorDiagram topology={3} parameters={parameters} />);
    const view = within(container);

    expect(view.getByText('Zi = R1 ∥ (C3 + R3)')).toBeInTheDocument();
    expect(view.getByText('Zf = C1 ∥ (C2 + R2)')).toBeInTheDocument();
    expect(view.getByText('C3', { selector: 'text' })).toBeInTheDocument();
    expect(view.getByText('R3', { selector: 'text' })).toBeInTheDocument();
    expect(container.querySelector('.signal-entry')).toHaveAttribute('d', 'M90 110h18');
  });

  it('removes the second lead branch in the Type II reduction', () => {
    const { container } = render(<CompensatorDiagram topology={2} parameters={parameters} />);
    const view = within(container);

    expect(view.getByText('Zi = R1')).toBeInTheDocument();
    expect(view.queryByText('C3', { selector: 'text' })).not.toBeInTheDocument();
    expect(view.queryByText('R3', { selector: 'text' })).not.toBeInTheDocument();
  });

  it('creates unique accessible title and arrow ids for multiple instances', () => {
    const { container } = render(<><CompensatorDiagram topology={3} parameters={parameters} /><CompensatorDiagram topology={2} parameters={parameters} /></>);
    const diagrams = [...container.querySelectorAll<SVGElement>('.compensator-diagram')];
    const accessibleIds = diagrams.map((diagram) => diagram.getAttribute('aria-labelledby'));
    const markerIds = [...container.querySelectorAll<SVGMarkerElement>('marker')].map((marker) => marker.id);

    expect(new Set(accessibleIds).size).toBe(2);
    expect(new Set(markerIds).size).toBe(markerIds.length);
  });
});
