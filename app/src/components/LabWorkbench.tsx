import { Bookmark, CheckCircle2, ChevronDown, CircleAlert, ExternalLink, Lightbulb, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { defaultParameters } from '../domain/labs';
import type { LabDefinition } from '../domain/labs';
import { formatEngineering } from '../domain/labModels';
import { nearestXIndex } from '../domain/comparison';
import type { LabScenario } from '../domain/scenario';
import { sourceById } from '../domain/sourceCatalog';
import { useLabSimulation } from '../hooks/useLabSimulation';
import { usePlayback } from '../hooks/usePlayback';
import type { Mastery, ProgressState } from '../state/progress';
import { BlockPuzzle } from './BlockPuzzle';
import { CircuitDiagram } from './CircuitDiagram';
import { CompensatorDiagram } from './CompensatorDiagram';
import { EquationPanel } from './EquationPanel';
import { ParameterInspector } from './ParameterInspector';
import { PredictionPanel } from './PredictionPanel';
import { ScopePlot } from './ScopePlot';
import { ScenarioToolbar } from './ScenarioToolbar';

interface LabWorkbenchProps {
  readonly lab: LabDefinition;
  readonly progress: ProgressState;
  readonly onSetMastery: (conceptId: string, mastery: Mastery) => void;
  readonly onRecordPrediction: (labId: string, correct: boolean) => void;
  readonly onSavePreset: (labId: string, parameters: Readonly<Record<string, number>>) => void;
  readonly onToggleBookmark: (labId: string) => void;
}

const masteryOptions: readonly Mastery[] = ['not-started', 'developing', 'proficient', 'teach-back'];

export const LabWorkbench = ({ lab, progress, onSetMastery, onRecordPrediction, onSavePreset, onToggleBookmark }: LabWorkbenchProps) => {
  const [parameters, setParameters] = useState<Record<string, number>>(() => progress.simulatorPresets[lab.id] ?? defaultParameters(lab));
  const [scenarioSeed, setScenarioSeed] = useState(progress.seed);
  const [hasRun, setHasRun] = useState(false);
  const [presetMessage, setPresetMessage] = useState('');
  const [comparison, setComparison] = useState<{
    readonly result: NonNullable<ReturnType<typeof useLabSimulation>['result']>;
    readonly parameters: Readonly<Record<string, number>>;
    readonly seed: number;
  } | null>(null);

  useEffect(() => {
    setParameters(progress.simulatorPresets[lab.id] ?? defaultParameters(lab));
    setScenarioSeed(progress.seed);
    setHasRun(false);
    setPresetMessage('');
    setComparison(null);
  }, [lab, progress.seed]);

  const calculation = useLabSimulation(lab, parameters, scenarioSeed);

  const stableX = calculation.result?.x ?? [];
  const stableEvents = calculation.result?.events ?? [];
  const playback = usePlayback(stableX, stableEvents);

  const onParameterChange = useCallback((key: string, next: number) => {
    setParameters((current) => ({ ...current, [key]: next }));
    setHasRun(false);
    setPresetMessage('');
  }, []);

  const onRun = useCallback(() => {
    if (!calculation.error && calculation.result) setHasRun(true);
  }, [calculation.error, calculation.result]);

  const onPreset = useCallback(() => {
    onSavePreset(lab.id, parameters);
    setPresetMessage('Preset saved locally.');
  }, [lab.id, onSavePreset, parameters]);

  const result = calculation.result;
  const mastery = progress.conceptMastery[`lab-${lab.id}`] ?? 'not-started';
  const phaseCount = parameters.phases ?? 1;
  const activeState = Math.round(parameters.state ?? 0);
  const currentCursorX = result?.x[Math.min(playback.index, Math.max(0, (result?.x.length ?? 1) - 1))] ?? 0;
  const comparisonCursorIndex = comparison ? nearestXIndex(comparison.result.x, currentCursorX) : 0;

  const importScenario = useCallback((scenario: LabScenario) => {
    setParameters({ ...scenario.parameters });
    setScenarioSeed(scenario.seed);
    setHasRun(false);
    setPresetMessage(`Scenario imported and validated locally with seed 0x${scenario.seed.toString(16).padStart(8, '0')}.`);
  }, []);

  return (
    <div className="lab-layout">
      <main className="workbench">
        <header className="workbench-header">
          <div>
            <span>Module {lab.module}</span>
            <h2>{lab.title}</h2>
            <p>{lab.description}</p>
          </div>
          <button type="button" className={progress.bookmarks.includes(lab.id) ? 'bookmark-button active' : 'bookmark-button'} onClick={() => onToggleBookmark(lab.id)}>
            <Bookmark aria-hidden="true" />{progress.bookmarks.includes(lab.id) ? 'Bookmarked' : 'Bookmark'}
          </button>
        </header>
        {result ? <PredictionPanel lab={lab} result={result} hasRun={hasRun} onRecord={(correct) => onRecordPrediction(lab.id, correct)} /> : null}
        {lab.id === 'pspice-blocks' ? (
          <BlockPuzzle
            architecture={parameters.architecture ?? 0}
            includeCurrentLimit={(parameters.currentLimit ?? 1) > 0}
            includeBalance={(parameters.balance ?? 1) > 0}
            includeShedding={(parameters.phaseShedding ?? 1) > 0}
          />
        ) : lab.id === 'error-amplifier' ? (
          <CompensatorDiagram topology={parameters.topology ?? 3} parameters={parameters} />
        ) : (
          <CircuitDiagram
            labId={lab.id}
            phaseCount={phaseCount}
            activeState={activeState}
            inductorCurrent={parameters.current ?? parameters.load ?? 1}
            running={playback.running}
            onStateChange={(state) => {
              onParameterChange('state', state);
              if (lab.id === 'current-path' && state === 4 && (parameters.current ?? 0) >= 0) onParameterChange('current', -Math.max(Math.abs(parameters.current ?? 5), 0.5));
              if (lab.id === 'current-path' && (state === 5 || state === 6)) onParameterChange('current', 0);
            }}
          />
        )}
        {calculation.error ? (
          <section className="simulation-error" role="alert"><CircleAlert aria-hidden="true" /><div><h3>Cannot run this configuration</h3><p>{calculation.error}</p><button type="button" onClick={() => setParameters(defaultParameters(lab))}><RotateCcw aria-hidden="true" />Restore valid defaults</button></div></section>
        ) : null}
        {result ? (
          <>
            <ScenarioToolbar
              lab={lab}
              parameters={parameters}
              result={result}
              seed={scenarioSeed}
              comparisonPinned={comparison !== null}
              onImport={importScenario}
              onPinComparison={() => setComparison({ result, parameters: { ...parameters }, seed: scenarioSeed })}
              onClearComparison={() => setComparison(null)}
              onRunSweep={calculation.runSweep}
            />
            {comparison ? (
              <section className="comparison-summary" data-testid="comparison-summary" aria-label="Pinned baseline configuration">
                <div><strong>Pinned baseline configuration</strong><span data-testid="comparison-seed">Seed 0x{comparison.seed.toString(16).padStart(8, '0')}</span></div>
                <div className="comparison-parameters">
                  {lab.parameters.map((parameter) => (
                    <span key={parameter.key}><b>{parameter.label}</b>{formatEngineering(comparison.parameters[parameter.key] ?? parameter.defaultValue, parameter.unit, 4)}</span>
                  ))}
                </div>
              </section>
            ) : null}
            <div className={comparison ? 'scope-comparison-grid' : undefined}>
              <ScopePlot result={result} cursorIndex={playback.index} onCursorIndexChange={playback.setIndex} title={comparison ? 'Current scenario' : 'Waveform workbench'} />
              {comparison ? <ScopePlot result={comparison.result} cursorIndex={comparisonCursorIndex} onCursorIndexChange={(index) => {
                const baselineX = comparison.result.x[index];
                if (baselineX !== undefined) playback.setIndex(nearestXIndex(result.x, baselineX));
              }} title="Pinned baseline" /> : null}
            </div>
          </>
        ) : null}
        <EquationPanel equation={lab.equation} label={lab.equationLabel} />
        {result ? (
          <section className="interpretation-panel">
            <div><Lightbulb aria-hidden="true" /><div><h3>Interpret the result</h3><p>{result.summary}</p></div></div>
            <div className="metric-grid">
              {result.metrics.slice(0, 6).map((metric) => <div key={metric.label} data-tone={metric.tone ?? 'normal'}><span>{metric.label}</span><strong>{typeof metric.value === 'number' ? metric.value.toPrecision(4) : metric.value} {metric.unit ?? ''}</strong></div>)}
            </div>
          </section>
        ) : null}
        <section className="disclosure-stack">
          <details>
            <summary><ChevronDown aria-hidden="true" />Model assumptions</summary>
            <div className="assumption-grid">
              <div><h3>Abstraction</h3><p>{lab.abstraction}. Results apply to the equations and visible behavioral rules in this lab.</p></div>
              <div><h3>Numerical method</h3><p>Analytical and averaged labs evaluate closed forms. Switched labs use deterministic state evolution; the core package documents RK4, event alignment, and discontinuity handling.</p></div>
              <div><h3>Included</h3><p>{lab.included.join(', ')}.</p></div>
              <div><h3>Excluded</h3><p>{lab.excluded.join(', ')}.</p></div>
            </div>
          </details>
          <details>
            <summary><ChevronDown aria-hidden="true" />Sources</summary>
            <div className="source-cards">{lab.sources.map((citationId) => {
              const source = sourceById(citationId);
              return <article key={citationId}><code>{citationId}</code><h3>{source.title}</h3><p>{source.summary}</p><a href={source.url} target="_blank" rel="noreferrer">Open source <ExternalLink aria-hidden="true" /></a></article>;
            })}</div>
          </details>
        </section>
        <section className="transfer-question">
          <span>Transfer question</span>
          <h3>{lab.transferQuestion}</h3>
          <p>Answer at a different operating point. State the mechanism, equation assumptions, and PSpice consequence.</p>
        </section>
        <footer className="lab-mastery">
          <div><CheckCircle2 aria-hidden="true" /><div><h3>Record concept mastery</h3><p>Use teach-back only after you can explain the waveform and model limits without the panel open.</p></div></div>
          <select aria-label="Lab mastery" value={mastery} onChange={(event) => onSetMastery(`lab-${lab.id}`, event.target.value as Mastery)}>
            {masteryOptions.map((option) => <option key={option} value={option}>{option.replace('-', ' ')}</option>)}
          </select>
        </footer>
      </main>
      <div>
        <ParameterInspector
          lab={lab}
          parameters={parameters}
          result={result}
          error={calculation.error}
          pending={calculation.pending}
          playback={playback}
          seed={scenarioSeed}
          onParameterChange={onParameterChange}
          onRun={onRun}
          onSavePreset={onPreset}
        />
        {presetMessage ? <div className="toast" role="status">{presetMessage}</div> : null}
      </div>
    </div>
  );
};
