import { CheckCircle2, CircleHelp, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { LabDefinition } from '../domain/labs';
import type { LabResult } from '../domain/labModels';
import { formatEngineering } from '../domain/labModels';

interface PredictionPanelProps {
  readonly lab: LabDefinition;
  readonly result: LabResult;
  readonly hasRun: boolean;
  readonly onRecord: (correct: boolean) => void;
  readonly revision: number;
  readonly onSubmittedChange: (submitted: boolean) => void;
}

const normalizePrediction = (input: string): string => input
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const PREDICTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  yes: ['yes', 'y'],
  no: ['no', 'n'],
  'low side body diode': ['low side body diode', 'low side diode', 'low side mosfet body diode', 'qls body diode'],
  capacitance: ['capacitance', 'capacitive'],
  'r c pair': ['r c pair', 'rc pair'],
  'r2 and c2': ['r2 and c2', 'r2 c2', 'r2-c2', 'r2/c2'],
  'no unique winner': ['no unique winner', 'tie', 'tied', 'no winner'],
};

export const matchesTextPrediction = (prediction: string, expected: string): boolean => {
  const normalizedPrediction = normalizePrediction(prediction);
  const normalizedExpected = normalizePrediction(expected);
  if (!normalizedPrediction) return false;
  return (PREDICTION_ALIASES[normalizedExpected] ?? [normalizedExpected]).includes(normalizedPrediction);
};

export const PredictionPanel = ({ lab, result, hasRun, onRecord, revision, onSubmittedChange }: PredictionPanelProps) => {
  const [prediction, setPrediction] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    setPrediction('');
    setSubmitted(false);
    setRecorded(false);
    onSubmittedChange(false);
  }, [lab.id, onSubmittedChange, revision]);

  const numericExpected = typeof result.expectedPrediction === 'number';
  const numericPrediction = Number(prediction);
  const correct = numericExpected
    ? Number.isFinite(numericPrediction) && Math.abs(numericPrediction - result.expectedPrediction) <= (result.predictionTolerance ?? Math.abs(result.expectedPrediction) * 0.1)
    : matchesTextPrediction(prediction, String(result.expectedPrediction));

  useEffect(() => {
    if (submitted && hasRun && !recorded) {
      onRecord(correct);
      setRecorded(true);
    }
  }, [correct, hasRun, onRecord, recorded, submitted]);

  const expectedLabel = typeof result.expectedPrediction === 'number'
    ? formatEngineering(result.expectedPrediction, lab.predictionUnit, 4)
    : String(result.expectedPrediction);

  return (
    <section className="prediction-panel" aria-labelledby="prediction-title">
      <div className="prediction-heading">
        <div>
          <span className="prediction-kicker"><CircleHelp aria-hidden="true" />Predict first</span>
          <h2 id="prediction-title">{lab.prediction}</h2>
        </div>
        {submitted ? (
          <button type="button" className="icon-text-button" onClick={() => { setSubmitted(false); setRecorded(false); setPrediction(''); onSubmittedChange(false); }}>
            <RotateCcw aria-hidden="true" />Try again
          </button>
        ) : null}
      </div>
      <div className="prediction-entry">
        <label htmlFor="prediction-value">Your prediction</label>
        <div className="prediction-input-row">
          <input
            id="prediction-value"
            type={numericExpected ? 'number' : 'text'}
            inputMode={numericExpected ? 'decimal' : 'text'}
            value={prediction}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder={numericExpected ? `value in ${lab.predictionUnit}` : 'brief answer'}
            disabled={submitted}
          />
          <span>{lab.predictionUnit}</span>
          <button type="button" className="primary-button" disabled={!prediction.trim() || submitted} onClick={() => { setSubmitted(true); onSubmittedChange(true); }}>Submit prediction</button>
        </div>
      </div>
      {submitted && !hasRun ? <p className="prediction-wait">Prediction locked. Run the simulation to reveal the comparison.</p> : null}
      {submitted && hasRun ? (
        <div className={`prediction-result ${correct ? 'correct' : 'incorrect'}`} role="status">
          {correct ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
          <div>
            <strong>{correct ? 'Prediction is within the accepted range.' : `Model result: ${expectedLabel}.`}</strong>
            <p>{result.discrepancyHint}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
};
