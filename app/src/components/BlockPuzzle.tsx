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

const blockPurpose: Readonly<Record<string, string>> = {
  'Feedback divider': 'Scale VOUT for comparison',
  'Servo signal': 'Correct slow DC error',
  'Ripple sum': 'Add the switching ramp',
  Comparator: 'Create a pulse request',
  'Minimum off-time gate': 'Decide pulse eligibility',
  'Phase scheduler': 'Choose the next phase',
  'One-shot': 'Set the constant on-time',
  'Buck phase': 'Switch energy into L',
  'Current sense': 'Measure phase current',
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
        <div><span className="diagram-kicker">Control architecture · build left to right</span><h3 id="block-puzzle-title">PSpice behavioral block construction</h3><p>Arrange one valid signal-flow order. Each block states the job it performs.</p></div>
        <button type="button" onClick={shuffle}><Shuffle aria-hidden="true" />Shuffle</button>
      </div>
      <div className="block-flow-legend" aria-label="Signal-flow reading order"><span>MEASURE</span><i aria-hidden="true" /><span>DECIDE</span><i aria-hidden="true" /><span>TIME</span><i aria-hidden="true" /><span>SWITCH</span><i aria-hidden="true" /><span>FEEDBACK</span></div>
      <div className="block-flow-shell">
        <p className="block-scroll-hint"><span>Stages 1–{order.length}</span>Scroll horizontally to inspect every block <ArrowRight aria-hidden="true" /></p>
        <ol className="block-flow" aria-label={`${order.length}-stage control signal flow`}>
          {order.map((block, index) => (
            <li key={block} className={revealed ? (block === expected[index] ? 'correct' : 'wrong') : ''}>
              <span className="block-step">STEP {index + 1} OF {order.length}</span>
              <strong>{block}</strong>
              <small>{blockPurpose[block]}</small>
              <div>
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${block} left`}><ArrowLeft aria-hidden="true" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${block} right`}><ArrowRight aria-hidden="true" /></button>
              </div>
              {index < order.length - 1 ? <ArrowRight className="block-connector" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </div>
      <div className="block-puzzle-actions">
        <button type="button" className="primary-button" onClick={() => setRevealed(true)}><Eye aria-hidden="true" />Check connections</button>
        <p className={revealed ? (valid ? 'success' : 'needs-work') : 'unchecked'} role="status" aria-live="polite">
          {revealed
            ? valid
              ? <><CheckCircle2 aria-hidden="true" />Arrangement valid: this is one educational implementation.</>
              : 'Arrangement needs work: a request, eligibility, one-shot, or sense-loop dependency is out of order.'
            : 'Arrangement status: unchecked.'}
        </p>
      </div>
      {revealed ? (
        <details open>
          <summary>Reveal one valid implementation</summary>
          <div className="valid-flow">{expected.map((block, index) => <span key={block}>{block}{index < expected.length - 1 ? <ArrowRight aria-hidden="true" /> : null}</span>)}</div>
          {parallelBlocks.length > 0 ? <div className="parallel-flow"><strong>Parallel control paths:</strong> {parallelBlocks.join(' · ')}</div> : null}
          <p>Current limit may inhibit or reset a pulse in parallel. Current balancing and phase shedding act more slowly on phase commands/enables; they are not simply inserted into the fast comparator chain in every architecture.</p>
        </details>
      ) : null}
    </section>
  );
};
