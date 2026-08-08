import { Beaker, Bookmark, Check, ChevronDown, Circle, FileText, NotebookPen } from 'lucide-react';

import type { LabId } from '../domain/labs';
import { LABS, MODULES } from '../domain/labs';
import type { ProgressState } from '../state/progress';

interface CurriculumRailProps {
  readonly activeLab: LabId;
  readonly activeModule: number | null;
  readonly progress: ProgressState;
  readonly onSelectLab: (id: LabId) => void;
  readonly onSelectModule: (index: number) => void;
  readonly onToggleNotes: () => void;
}

export const CurriculumRail = ({ activeLab, activeModule, progress, onSelectLab, onSelectModule, onToggleNotes }: CurriculumRailProps) => (
  <nav className="curriculum-rail" aria-label="Curriculum and laboratories">
    <div className="rail-label">Curriculum</div>
    <section className="rail-section">
      <h2>Modules <ChevronDown aria-hidden="true" /></h2>
      <ol className="module-list">
        {MODULES.map((module, index) => {
          const mastery = progress.conceptMastery[`module-${index}`] ?? 'not-started';
          const complete = mastery === 'proficient' || mastery === 'teach-back';
          return (
            <li key={module}>
              <button type="button" className={activeModule === index ? 'active' : ''} onClick={() => onSelectModule(index)} aria-current={activeModule === index ? 'page' : undefined}>
                <span className={`rail-state ${complete ? 'complete' : ''}`}>{complete ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}</span>
                <span className="module-number">{index}</span>
                <span>{module}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
    <section className="rail-section lab-section">
      <h2>Labs <ChevronDown aria-hidden="true" /></h2>
      <ul className="lab-list">
        {LABS.map((lab) => (
          <li key={lab.id}>
            <button type="button" className={activeModule === null && activeLab === lab.id ? 'active' : ''} onClick={() => onSelectLab(lab.id)} aria-current={activeModule === null && activeLab === lab.id ? 'page' : undefined}>
              <Beaker aria-hidden="true" /><span>{lab.shortTitle}</span>
              {progress.bookmarks.includes(lab.id) ? <Bookmark className="bookmarked" aria-label="Bookmarked" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
    <div className="rail-tools">
      <button type="button" onClick={onToggleNotes}><NotebookPen aria-hidden="true" />Lab notes</button>
      <button type="button" onClick={() => onSelectModule(0)}><FileText aria-hidden="true" />Start here</button>
    </div>
  </nav>
);
