import { ChevronDown, Pause, Play, RotateCcw, Save, SkipForward, StepForward, TriangleAlert } from 'lucide-react';

import type { LabDefinition } from '../domain/labs';
import type { LabResult } from '../domain/labModels';
import { formatEngineering } from '../domain/labModels';
import { parameterValidationError } from '../domain/scenario';
import type { PlaybackController } from '../hooks/usePlayback';

interface ParameterInspectorProps {
  readonly lab: LabDefinition;
  readonly parameters: Readonly<Record<string, number>>;
  readonly result: LabResult | null;
  readonly error: string | null;
  readonly pending: boolean;
  readonly playback: PlaybackController;
  readonly seed: number;
  readonly onParameterChange: (key: string, value: number) => void;
  readonly onRun: () => void;
  readonly onSavePreset: () => void;
}

export const ParameterInspector = ({ lab, parameters, result, error, pending, playback, seed, onParameterChange, onRun, onSavePreset }: ParameterInspectorProps) => {
  const activeWarnings = error ? [error] : result?.warnings ?? [];
  return (
    <aside className="inspector" aria-labelledby="inspector-title">
      <div className="inspector-heading">
        <h2 id="inspector-title">Simulation inspector</h2>
        <ChevronDown aria-hidden="true" />
      </div>
      <section className="inspector-section parameter-section" aria-labelledby="parameter-title">
        <h3 id="parameter-title">Parameters</h3>
        <div className="parameter-list">
          {lab.parameters.map((parameter) => {
            const current = parameters[parameter.key] ?? parameter.defaultValue;
            const validationError = parameterValidationError(parameter, current);
            const invalid = validationError !== null;
            return (
              <label key={parameter.key} className={invalid ? 'invalid' : ''} title={parameter.description}>
                <span>{parameter.label}</span>
                <span className="engineering-field">
                  <input
                    type="number"
                    aria-describedby={`${parameter.key}-help`}
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={current}
                    aria-invalid={invalid}
                    onChange={(event) => onParameterChange(parameter.key, event.currentTarget.valueAsNumber)}
                  />
                  <span>{parameter.unit || '—'}</span>
                </span>
                <small id={`${parameter.key}-help`} className="sr-only">{validationError ?? `${parameter.description} Range ${parameter.min} to ${parameter.max} ${parameter.unit}.`}</small>
              </label>
            );
          })}
        </div>
      </section>
      <section className="inspector-section transport-section" aria-labelledby="transport-title">
        <div className="section-heading-row">
          <h3 id="transport-title">Simulation controls</h3>
          <span className="abstraction-label">{lab.abstraction}</span>
        </div>
        <div className="transport-grid">
          <button type="button" className="run-button" onClick={() => { onRun(); playback.play(); }} disabled={Boolean(error) || pending || !result}><Play aria-hidden="true" />{pending ? 'Calculating…' : 'Run simulation'}</button>
          <button type="button" onClick={playback.pause} disabled={!playback.running}><Pause aria-hidden="true" />Pause</button>
          <button type="button" onClick={playback.reset}><RotateCcw aria-hidden="true" />Reset</button>
          <button type="button" onClick={playback.stepInterval}><StepForward aria-hidden="true" />Step interval</button>
          <button type="button" onClick={playback.stepEvent}><SkipForward aria-hidden="true" />Step event</button>
          <button type="button" onClick={onSavePreset}><Save aria-hidden="true" />Save preset</button>
        </div>
        <dl className="transport-readout">
          <div><dt>Cursor sample</dt><dd>{playback.index + 1}</dd></div>
          <div><dt>Seed</dt><dd>0x{seed.toString(16).padStart(8, '0')}</dd></div>
        </dl>
      </section>
      {activeWarnings.length > 0 ? (
        <section className="timing-warning" aria-live="polite">
          <TriangleAlert aria-hidden="true" />
          <div>{activeWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
        </section>
      ) : null}
      <section className="inspector-section effects-section">
        <h3>Included effects</h3>
        <ul className="effect-list included">{lab.included.map((effect) => <li key={effect}>{effect}</li>)}</ul>
      </section>
      <section className="inspector-section effects-section">
        <h3>Excluded effects</h3>
        <ul className="effect-list excluded">{lab.excluded.map((effect) => <li key={effect}>{effect}</li>)}</ul>
      </section>
      <section className="inspector-section source-summary">
        <h3>Sources</h3>
        <ol>{lab.sources.map((source) => <li key={source}><code>{source}</code></li>)}</ol>
      </section>
      {result ? (
        <section className="inspector-section live-metrics">
          <h3>Calculated results</h3>
          <dl>
            {result.metrics.map((metric) => (
              <div key={metric.label} data-tone={metric.tone ?? 'normal'}>
                <dt>{metric.label}</dt>
                <dd>{typeof metric.value === 'number' ? formatEngineering(metric.value, metric.unit ?? '', 4) : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </aside>
  );
};
