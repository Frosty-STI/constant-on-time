import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface BlockPuzzleProps {
  readonly architecture: number;
  readonly includeCurrentLimit: boolean;
  readonly includeBalance: boolean;
  readonly includeShedding: boolean;
}

const buildExpected = (architecture: number): string[] => {
  const blocks = ['Feedback divider'];
  if (architecture === 2) blocks.push('Servo signal');
  blocks.push('Ripple sum', 'Comparator', 'Minimum off-time gate');
  if (architecture >= 1) blocks.push('Phase scheduler');
  blocks.push('One-shot', 'Buck phase', 'Current sense');
  return blocks;
};

export const BlockPuzzle = ({ architecture, includeCurrentLimit, includeBalance, includeShedding }: BlockPuzzleProps) => {
  const expected = useMemo(() => buildExpected(architecture), [architecture]);
  const parallelBlocks = useMemo(() => [
    ...(includeCurrentLimit ? ['Current-limit override'] : []),
    ...(includeBalance ? ['Current-balance loop'] : []),
    ...(includeShedding ? ['Phase-shedding logic'] : []),
  ], [includeBalance, includeCurrentLimit, includeShedding]);
  const [order, setOrder] = useState<string[]>(() => [...expected].reverse());
  const [revealed, setRevealed] = useState(false);
  const shuffleSequence = useRef(0);
  useEffect(() => { setOrder([...expected].reverse()); setRevealed(false); shuffleSequence.current = 0; }, [expected]);
  const move = (index: number, direction: -1 | 1) => {
    setOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const selected = next[index];
      const other = next[target];
      if (selected === undefined || other === undefined) return current;
      next[index] = other;
      next[target] = selected;
      return next;
    });
  };
  const shuffle = () => {
    shuffleSequence.current += 1;
    const sequence = shuffleSequence.current;
    setOrder((current) => {
      const next = [...current];
      let state = (0x9e37_79b9 ^ sequence ^ (architecture + 1) * 0x45d9_f3b) >>> 0;
      for (let index = next.length - 1; index > 0; index -= 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const swapIndex = (state >>> 0) % (index + 1);
        [next[index], next[swapIndex]] = [next[swapIndex] as string, next[index] as string];
      }
      const unchanged = next.every((block, index) => block === current[index]);
      const accidentallySolved = next.every((block, index) => block === expected[index]);
      if ((unchanged || accidentallySolved) && next.length > 1) {
        const first = next.shift() as string;
        next.push(first);
      }
      return next;
    });
    setRevealed(false);
  };
  const valid = order.every((block, index) => block === expected[index]);
  return (
    <section className="block-puzzle" aria-labelledby="block-puzzle-title">
      <div className="section-heading-row">
        <div><h3 id="block-puzzle-title">PSpice behavioral block construction</h3><p>Arrange one valid signal-flow order. Parallel protective and balancing paths are discussed after reveal.</p></div>
        <button type="button" onClick={shuffle}><Shuffle aria-hidden="true" />Shuffle</button>
      </div>
      <ol className="block-flow">
        {order.map((block, index) => (
          <li key={block} className={revealed ? (block === expected[index] ? 'correct' : 'wrong') : ''}>
            <span>{index + 1}</span>
            <strong>{block}</strong>
            <div>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${block} left`}><ArrowLeft aria-hidden="true" /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${block} right`}><ArrowRight aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ol>
      <div className="block-puzzle-actions">
        <button type="button" className="primary-button" onClick={() => setRevealed(true)}><Eye aria-hidden="true" />Check connections</button>
        {revealed ? <p className={valid ? 'success' : 'needs-work'}>{valid ? <><CheckCircle2 aria-hidden="true" />This is one valid educational implementation.</> : 'The sequence still violates a request, eligibility, one-shot, or sense-loop dependency.'}</p> : null}
      </div>
      {revealed ? (
        <details open>
          <summary>Reveal one valid implementation</summary>
          <div className="valid-flow">{expected.map((block, index) => <span key={block}>{block}{index < expected.length - 1 ? ' →' : ''}</span>)}</div>
          {parallelBlocks.length > 0 ? <div className="parallel-flow"><strong>Parallel control paths:</strong> {parallelBlocks.join(' · ')}</div> : null}
          <p>Current limit may inhibit or reset a pulse in parallel. Current balancing and phase shedding act more slowly on phase commands/enables; they are not simply inserted into the fast comparator chain in every architecture.</p>
        </details>
      ) : null}
    </section>
  );
};
