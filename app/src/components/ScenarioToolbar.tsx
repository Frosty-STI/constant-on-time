import { Download, Pin, Play, SlidersHorizontal, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { LabDefinition } from '../domain/labs';
import type { LabResult } from '../domain/labModels';
import { formatEngineering } from '../domain/labModels';
import { createLabScenario, createParameterSweepValues, parseLabScenario, serializeLabScenario } from '../domain/scenario';
import type { LabScenario } from '../domain/scenario';
import type { SweepPoint } from '../hooks/useLabSimulation';

interface ScenarioToolbarProps {
  readonly lab: LabDefinition;
  readonly parameters: Readonly<Record<string, number>>;
  readonly result: LabResult;
  readonly seed: number;
  readonly comparisonPinned: boolean;
  readonly onImport: (scenario: LabScenario) => void;
  readonly onPinComparison: () => void;
  readonly onClearComparison: () => void;
  readonly onRunSweep: (parameterKey: string, values: readonly number[]) => Promise<readonly SweepPoint[]>;
}

const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const formatSeed = (seed: number): string => `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;

export const ScenarioToolbar = ({ lab, parameters, result, seed, comparisonPinned, onImport, onPinComparison, onClearComparison, onRunSweep }: ScenarioToolbarProps) => {
  const [parameterKey, setParameterKey] = useState(lab.parameters[0]?.key ?? '');
  const selected = lab.parameters.find((parameter) => parameter.key === parameterKey) ?? lab.parameters[0];
  const current = selected ? parameters[selected.key] ?? selected.defaultValue : 0;
  const [start, setStart] = useState(current);
  const [stop, setStop] = useState(current);
  const [count, setCount] = useState(5);
  const [sweep, setSweep] = useState<readonly SweepPoint[]>([]);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const first = lab.parameters[0];
    if (!first) return;
    const center = parameters[first.key] ?? first.defaultValue;
    setParameterKey(first.key);
    setStart(Math.max(first.min, center - Math.max(Math.abs(center) * 0.2, first.step)));
    setStop(Math.min(first.max, center + Math.max(Math.abs(center) * 0.2, first.step)));
    setSweep([]);
    setStatus('');
  }, [lab]);

  const metricLabels = useMemo(() => {
    const first = sweep[0]?.result;
    return first?.metrics.filter((metric) => typeof metric.value === 'number').slice(0, 3).map((metric) => metric.label) ?? [];
  }, [sweep]);

  const selectParameter = (key: string) => {
    setParameterKey(key);
    const parameter = lab.parameters.find((candidate) => candidate.key === key);
    if (!parameter) return;
    const center = parameters[key] ?? parameter.defaultValue;
    setStart(Math.max(parameter.min, center - Math.max(Math.abs(center) * 0.2, parameter.step)));
    setStop(Math.min(parameter.max, center + Math.max(Math.abs(center) * 0.2, parameter.step)));
    setSweep([]);
  };

  const runSweep = async () => {
    if (!selected || !Number.isFinite(start) || !Number.isFinite(stop) || start > stop || start < selected.min || stop > selected.max || !Number.isInteger(count) || count < 2 || count > 9) {
      setStatus('Sweep bounds must be ordered, finite, within the parameter range, and use 2–9 whole requested points.');
      return;
    }
    const values = createParameterSweepValues(selected, start, stop, count);
    if (values.length < 2) {
      setStatus(`Sweep resolves to ${values.length} distinct step-aligned point; widen the range or reduce the parameter step.`);
      return;
    }
    setPending(true);
    setStatus(`Running ${values.length} distinct step-aligned values in a deterministic worker…`);
    try {
      const points = await onRunSweep(parameterKey, values);
      setSweep(points);
      setStatus(`Sweep complete: ${points.length} distinct operating points (${count} requested).`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Parameter sweep failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="scenario-toolbar" aria-labelledby="scenario-tools-title">
      <div className="scenario-toolbar-heading">
        <div><SlidersHorizontal aria-hidden="true" /><div><h3 id="scenario-tools-title">Scenario tools</h3><p>Local JSON, pinned comparison, and bounded deterministic sweep · <span className="scenario-seed" data-testid="scenario-seed">Seed {formatSeed(seed)}</span></p></div></div>
        <div className="scenario-actions">
          <button type="button" onClick={() => download(`${lab.id}-scenario.json`, serializeLabScenario(createLabScenario(lab, parameters, seed)), 'application/json')}><Download aria-hidden="true" />Scenario JSON</button>
          <label className="scenario-import"><Upload aria-hidden="true" />Import JSON<input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void file.text().then((text) => {
              const imported = parseLabScenario(text, lab);
              onImport(imported);
            }).catch((caught: unknown) => setStatus(caught instanceof Error ? caught.message : 'Scenario import failed.'));
            event.currentTarget.value = '';
          }} /></label>
          {comparisonPinned
            ? <button type="button" onClick={onClearComparison}><X aria-hidden="true" />Clear baseline</button>
            : <button type="button" onClick={onPinComparison}><Pin aria-hidden="true" />Pin baseline</button>}
        </div>
      </div>
      <details>
        <summary>Parameter sweep</summary>
        <div className="sweep-controls">
          <label>Parameter<select aria-label="Sweep parameter" value={parameterKey} onChange={(event) => selectParameter(event.target.value)}>{lab.parameters.map((parameter) => <option key={parameter.key} value={parameter.key}>{parameter.label}</option>)}</select></label>
          <label>Start<input aria-label="Sweep start" type="number" value={start} min={selected?.min} max={selected?.max} step={selected?.step} onChange={(event) => setStart(event.currentTarget.valueAsNumber)} /></label>
          <label>Stop<input aria-label="Sweep stop" type="number" value={stop} min={selected?.min} max={selected?.max} step={selected?.step} onChange={(event) => setStop(event.currentTarget.valueAsNumber)} /></label>
          <label>Points<input aria-label="Sweep points" type="number" value={count} min={2} max={9} step={1} onChange={(event) => setCount(event.currentTarget.valueAsNumber)} /></label>
          <button type="button" onClick={() => { void runSweep(); }} disabled={pending}><Play aria-hidden="true" />{pending ? 'Running…' : 'Run sweep'}</button>
        </div>
        {sweep.length > 0 ? <div className="sweep-table-wrap"><table><thead><tr><th>{selected?.label ?? 'Parameter'} ({selected?.unit || 'value'})</th>{metricLabels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{sweep.map((point) => <tr key={point.parameterValue}><td>{formatEngineering(point.parameterValue, selected?.unit ?? '', 4)}</td>{metricLabels.map((label) => {
          const metric = point.result.metrics.find((candidate) => candidate.label === label);
          return <td key={label}>{typeof metric?.value === 'number' ? formatEngineering(metric.value, metric.unit ?? '', 4) : '—'}</td>;
        })}</tr>)}</tbody></table></div> : null}
      </details>
      {status ? <p className="scenario-status" role="status">{status}</p> : null}
      <span className="sr-only">Current result has {result.signals.length} plotted signals.</span>
    </section>
  );
};
