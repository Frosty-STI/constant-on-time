import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LABS, defaultParameters } from '../domain/labs';
import { runLab } from '../domain/labModels';
import { PredictionPanel } from './PredictionPanel';

describe('predict-before-reveal interaction', () => {
  it('locks a prediction and reveals it only after a run', async () => {
    const user = userEvent.setup();
    const lab = LABS.find((candidate) => candidate.id === 'inductor-ripple');
    expect(lab).toBeDefined();
    if (!lab) return;
    const result = runLab(lab, defaultParameters(lab));
    const record = vi.fn();
    const submitted = vi.fn();
    const { rerender } = render(<PredictionPanel lab={lab} result={result} hasRun={false} revision={0} onSubmittedChange={submitted} onRecord={record} />);
    await user.type(screen.getByLabelText('Your prediction'), String(result.expectedPrediction));
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }));
    expect(screen.getByText(/Prediction locked/)).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    expect(submitted).toHaveBeenCalledWith(true);
    rerender(<PredictionPanel lab={lab} result={result} hasRun revision={0} onSubmittedChange={submitted} onRecord={record} />);
    expect(await screen.findByText(/within the accepted range/)).toBeInTheDocument();
    expect(record).toHaveBeenCalledWith(true);
  });
});
