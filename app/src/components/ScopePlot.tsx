import { ArrowLeft, ArrowRight, Download, Focus, Table, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import uPlot from 'uplot';

import type { LabEvent, LabResult } from '../domain/labModels';
import { formatEngineering } from '../domain/labModels';

interface ScopePlotProps {
  readonly result: LabResult;
  readonly cursorIndex: number;
  readonly onCursorIndexChange: (index: number) => void;
  readonly title?: string;
}

const eventPlugin = (events: readonly LabEvent[]): uPlot.Plugin => ({
  hooks: {
    draw: [
      (plot) => {
        const { ctx } = plot;
        ctx.save();
        ctx.font = '11px ui-monospace, monospace';
        for (const event of events.slice(0, 80)) {
          const left = plot.valToPos(event.x, 'x', true);
          if (left < plot.bbox.left || left > plot.bbox.left + plot.bbox.width) continue;
          const color = event.kind === 'denied' || event.kind === 'artifact'
            ? '#ff6b64'
            : event.kind === 'waiting'
              ? '#9b8cff'
              : event.kind === 'delayed' || event.kind === 'load'
                ? '#ffb21a'
                : '#50677a';
          ctx.strokeStyle = color;
          ctx.setLineDash(event.kind === 'request' || event.kind === 'waiting' ? [4, 4] : event.kind === 'delayed' ? [8, 3, 2, 3] : []);
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(left, plot.bbox.top);
          ctx.lineTo(left, plot.bbox.top + plot.bbox.height);
          ctx.stroke();
        }
        ctx.restore();
      },
    ],
  },
});

const unitScale = (unit: string): string => `unit-${unit.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'plain'}`;

const logTickLabel = (tick: number, unit: string): string => {
  if (!(tick > 0)) return '';
  const exponent = Math.log10(tick);
  // uPlot exposes logarithmic minor ticks to the formatter. Label only the
  // decade ticks so a seven-decade Bode sweep remains readable.
  return Math.abs(exponent - Math.round(exponent)) < 1e-8
    ? formatEngineering(tick, unit, 3)
    : '';
};

const csvField = (value: string | number): string => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const ScopePlot = ({ result, cursorIndex, onCursorIndexChange, title = 'Waveform workbench' }: ScopePlotProps) => {
  const titleId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const isLogX = result.xUnit === 'Hz' && (result.x[0] ?? 0) > 0;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || result.x.length === 0) return undefined;
    const units = [...new Set(result.signals.map((signal) => signal.unit))];
    const xMin = result.x[0] ?? 0;
    const xMax = result.x[result.x.length - 1] ?? 1;
    const transformedMin = isLogX ? Math.log10(Math.max(xMin, 1e-12)) : xMin;
    const transformedMax = isLogX ? Math.log10(Math.max(xMax, 1e-12)) : xMax;
    const fullSpan = transformedMax - transformedMin;
    const span = fullSpan / zoomFactor;
    const maxShift = Math.max((fullSpan - span) / 2, 0);
    const center = (transformedMin + transformedMax) / 2 + panOffset * maxShift;
    const visibleMin = center - span / 2;
    const visibleMax = center + span / 2;
    const options: uPlot.Options = {
      width: Math.max(host.clientWidth, 320),
      height: 330,
      title: '',
      padding: [14, 12, 2, 0],
      legend: { show: false },
      cursor: {
        drag: { x: true, y: false, setScale: true },
        focus: { prox: 24 },
        points: { size: 7, width: 2 },
      },
      scales: {
        x: isLogX
          ? { distr: 3, min: 10 ** visibleMin, max: 10 ** visibleMax }
          : { time: false, min: Math.max(xMin, visibleMin), max: Math.min(xMax, visibleMax) },
        ...Object.fromEntries(units.map((unit) => [unitScale(unit), { auto: true }])),
      },
      series: [
        { label: `${result.xLabel} (${result.xUnit || 'index'})`, value: (_plot, raw) => formatEngineering(Number(raw), result.xUnit, 4) },
        ...result.signals.map((signal) => ({
          label: signal.name,
          scale: unitScale(signal.unit),
          stroke: signal.color,
          width: 2,
          dash: signal.dash ? [...signal.dash] : undefined,
          points: {
            show: signal.marker !== 'none',
            size: signal.marker === 'diamond' ? 4 : 3,
            width: 1,
          },
          value: (_plot: uPlot, raw: number | null) => raw === null ? '—' : formatEngineering(raw, signal.unit, 4),
        })),
      ],
      axes: [
        {
          label: `${result.xLabel} (${result.xUnit || 'index'})`,
          stroke: '#9eacb7',
          grid: { stroke: '#263845', width: 1 },
          ticks: { stroke: '#405363', width: 1 },
          values: (_plot, ticks) => ticks.map((tick) => isLogX
            ? logTickLabel(tick, result.xUnit)
            : formatEngineering(tick, result.xUnit, 3)),
        },
        ...units.map((unit, index) => ({
          scale: unitScale(unit),
          side: index % 2 === 0 ? 3 : 1,
          label: unit || 'value',
          stroke: index === 0 ? '#9eacb7' : '#728695',
          grid: index === 0 ? { stroke: '#263845', width: 1 } : { show: false },
          ticks: { stroke: '#405363', width: 1 },
          size: 54,
          values: (_plot: uPlot, ticks: number[]) => ticks.map((tick) => formatEngineering(tick, '', 3)),
        })),
      ],
      hooks: {
        setCursor: [
          (plot) => {
            if (plot.cursor.idx !== null && plot.cursor.idx !== undefined) onCursorIndexChange(plot.cursor.idx);
          },
        ],
      },
      plugins: [eventPlugin(result.events)],
    };
    const data: uPlot.AlignedData = [
      [...result.x],
      ...result.signals.map((signal) => [...signal.values]),
    ];
    const plot = new uPlot(options, data, host);
    plotRef.current = plot;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 300) plot.setSize({ width: Math.floor(width), height: 330 });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [isLogX, onCursorIndexChange, panOffset, result, zoomFactor]);

  useEffect(() => {
    const plot = plotRef.current;
    const x = result.x[cursorIndex];
    if (!plot || x === undefined) return;
    plot.setCursor({ left: plot.valToPos(x, 'x'), top: 24 });
  }, [cursorIndex, result.x]);

  const downloadPlot = () => {
    const canvas = hostRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'constant-on-time-lab-plot.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const downloadCsv = () => {
    const header = [result.xLabel, ...result.signals.map((signal) => `${signal.name} (${signal.unit || 'value'})`)];
    const rows = result.x.map((sample, index) => [sample, ...result.signals.map((signal) => signal.values[index] ?? '')]);
    const csv = [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.download = 'constant-on-time-lab-data.csv';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="scope-panel" aria-labelledby={titleId}>
      <div className="scope-title-row">
        <h3 id={titleId}>{title}</h3>
        <output aria-live="polite" className="cursor-readout">
          Cursor {formatEngineering(result.x[cursorIndex] ?? 0, result.xUnit, 4)}
        </output>
      </div>
      <div
        ref={hostRef}
        className="scope-host"
        data-testid="scope-plot"
        role="img"
        aria-label={`Plot of ${result.signals.map((signal) => signal.name).join(', ')}`}
      />
      <div className="signal-legend" aria-label="Waveform legend">
        {result.signals.map((signal, index) => (
          <div key={signal.name} className="legend-item">
            <span className={`legend-line dash-${index % 4}`} style={{ color: signal.color }} />
            <span>{signal.name}</span>
            <strong>{formatEngineering(signal.values[cursorIndex] ?? 0, signal.unit, 4)}</strong>
          </div>
        ))}
      </div>
      <div className="scope-toolbar" aria-label="Plot tools">
        <button type="button" onClick={() => setZoomFactor((current) => Math.min(current * 1.5, 12))}><ZoomIn aria-hidden="true" />Zoom in</button>
        <button type="button" onClick={() => setZoomFactor((current) => Math.max(current / 1.5, 1))}><ZoomOut aria-hidden="true" />Zoom out</button>
        <button type="button" onClick={() => setPanOffset((current) => Math.max(-1, current - 0.25))} disabled={zoomFactor === 1}><ArrowLeft aria-hidden="true" />Pan left</button>
        <button type="button" onClick={() => setPanOffset((current) => Math.min(1, current + 0.25))} disabled={zoomFactor === 1}><ArrowRight aria-hidden="true" />Pan right</button>
        <button type="button" onClick={() => { setZoomFactor(1); setPanOffset(0); }}><Focus aria-hidden="true" />Fit</button>
        <button type="button" onClick={downloadCsv}><Table aria-hidden="true" />CSV data</button>
        <button type="button" onClick={downloadPlot}><Download aria-hidden="true" />Plot image</button>
      </div>
      {result.events.length > 0 ? (
        <div className="event-strip" aria-label="Simulation events">
          {result.events.slice(0, 12).map((event, index) => (
            <button key={`${event.label}-${event.x}-${index}`} type="button" onClick={() => {
              const next = result.x.findIndex((sample) => sample >= event.x);
              if (next >= 0) onCursorIndexChange(next);
            }}>
              <span data-kind={event.kind} />{event.label} · {formatEngineering(event.x, result.xUnit, 3)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
