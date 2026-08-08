import katex from 'katex';
import { useEffect, useRef } from 'react';

interface EquationPanelProps {
  readonly equation: string;
  readonly label: string;
}

export const EquationPanel = ({ equation, label }: EquationPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    katex.render(equation, containerRef.current, {
      displayMode: true,
      throwOnError: false,
      strict: 'warn',
      trust: false,
    });
  }, [equation]);
  return (
    <section className="equation-panel" aria-labelledby="equation-title">
      <div className="section-heading-row">
        <h3 id="equation-title">{label}</h3>
        <span>valid only under the listed assumptions</span>
      </div>
      <div ref={containerRef} className="equation-render" role="math" aria-label={equation} />
    </section>
  );
};
