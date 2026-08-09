import { Bookmark, BookOpenCheck, CheckCircle2, ChevronRight, CircleHelp, ExternalLink, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CURRICULUM_MODULES } from '../domain/curriculum';
import { MODULE_CONTENT } from '../domain/modules';
import { sourceById } from '../domain/sourceCatalog';
import type { Mastery } from '../state/progress';

interface LessonReaderProps {
  readonly moduleIndex: number;
  readonly mastery: Mastery;
  readonly bookmarked: boolean;
  readonly completedReadings: readonly string[];
  readonly onMasteryChange: (mastery: Mastery) => void;
  readonly onToggleReading: (readingId: string) => void;
  readonly onBookmark: () => void;
  readonly onOpenLab: (labId: string) => void;
}

const masteryOptions: readonly Mastery[] = ['not-started', 'developing', 'proficient', 'teach-back'];

export const LessonReader = ({ moduleIndex, mastery, bookmarked, completedReadings, onMasteryChange, onToggleReading, onBookmark, onOpenLab }: LessonReaderProps) => {
  const module = MODULE_CONTENT[moduleIndex];
  const curriculumModule = CURRICULUM_MODULES[moduleIndex];
  const [lessonIndex, setLessonIndex] = useState(0);

  useEffect(() => setLessonIndex(0), [moduleIndex]);

  if (!module || !curriculumModule) return null;
  const lesson = curriculumModule.lessons[lessonIndex] ?? curriculumModule.lessons[0];
  if (!lesson) return null;
  const readingId = `${curriculumModule.id}:${lesson.id}`;
  const readingComplete = completedReadings.includes(readingId);
  const lessonSources = lesson.citations.map(sourceById);
  return (
    <article className="lesson-reader">
      <header className="lesson-header">
        <div>
          <span>Module {moduleIndex}</span>
          <h2>{module.title}</h2>
          <p>{module.objective}</p>
        </div>
        <button type="button" className={bookmarked ? 'bookmark-button active' : 'bookmark-button'} onClick={onBookmark}><Bookmark aria-hidden="true" />{bookmarked ? 'Bookmarked' : 'Bookmark'}</button>
      </header>
      {moduleIndex === 0 ? (
        <section className="diagnostic-panel">
          <div><CircleHelp aria-hidden="true" /><h3>Diagnostic assessment</h3></div>
          <p>Answer aloud or in your notes. If all four explanations are precise, continue directly to Module 1.</p>
          <ol>{module.diagnostic.map((question) => <li key={question}>{question}</li>)}</ol>
        </section>
      ) : null}
      <nav className="lesson-navigator" aria-label={`Lessons in module ${moduleIndex}`}>
        <div>
          <h3>Lessons</h3>
          <span>{curriculumModule.lessons.length} dependency-ordered topics</span>
        </div>
        <ol>
          {curriculumModule.lessons.map((item, index) => (
            <li key={item.id}>
              <button type="button" className={index === lessonIndex ? 'active' : ''} onClick={() => setLessonIndex(index)} aria-current={index === lessonIndex ? 'page' : undefined}>
                <span>{item.id}</span>{item.title}
                {completedReadings.includes(`${curriculumModule.id}:${item.id}`) ? <CheckCircle2 aria-label="Completed reading" /> : null}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section className="active-lesson-heading">
        <div><span>Lesson {lesson.id}</span><h3>{lesson.title}</h3><p>{lesson.interaction}</p></div>
        <button type="button" className={readingComplete ? 'bookmark-button active' : 'bookmark-button'} onClick={() => onToggleReading(readingId)}>
          <BookOpenCheck aria-hidden="true" />{readingComplete ? 'Reading complete' : 'Mark reading complete'}
        </button>
      </section>
      <div className="lesson-grid">
        <section>
          <span className="layer-number">1</span>
          <h3>Physical intuition</h3>
          <p>{lesson.physicalIntuition}</p>
        </section>
        <section>
          <span className="layer-number">2</span>
          <h3>Mathematical derivation</h3>
          <p>{lesson.mathematicalDerivation}</p>
        </section>
        <section>
          <span className="layer-number">3</span>
          <h3>Modeling consequence</h3>
          <p>{lesson.modelingConsequence}</p>
        </section>
      </div>
      <section className="lesson-evidence" aria-label="Assumptions and evidence labels">
        <div><strong>Assumptions</strong>{lesson.assumptions.map((item) => <span key={item}>{item}</span>)}</div>
        <div><strong>Evidence</strong>{lesson.evidenceLabels.map((item) => <span key={item}>{item}</span>)}</div>
        <div><strong>Concepts</strong>{lesson.concepts.slice(0, 8).map((item) => <span key={item}>{item}</span>)}</div>
      </section>
      <section className="lesson-reading">
        <div>
          <h3>Sources for this lesson</h3>
          <div className="lesson-source-list">
            {lessonSources.map((source) => (
              <a key={source.citationId} href={source.url} target="_blank" rel="noreferrer">
                <code>{source.citationId}</code><span>{source.title}</span><ExternalLink aria-hidden="true" />
              </a>
            ))}
          </div>
          <p>External links open only when selected; source metadata and curriculum content remain available offline.</p>
        </div>
        <CheckCircle2 aria-label={`${lessonSources.length} verified sources`} />
      </section>
      <section className="transfer-panel">
        <span>Transfer question</span>
        <h3>{lesson.transferQuestion}</h3>
        <p>Explain the mechanism, derive the relationship under stated assumptions, then name the PSpice consequence.</p>
      </section>
      <section className="related-labs">
        <h3><FlaskConical aria-hidden="true" />Practice laboratories</h3>
        <div>{module.relatedLabs.map((labId) => <button key={labId} type="button" onClick={() => onOpenLab(labId)}>{labId.replaceAll('-', ' ')}<ChevronRight aria-hidden="true" /></button>)}</div>
      </section>
      <footer className="mastery-footer">
        <label htmlFor="module-mastery">Concept mastery</label>
        <select id="module-mastery" value={mastery} onChange={(event) => onMasteryChange(event.target.value as Mastery)}>
          {masteryOptions.map((option) => <option key={option} value={option}>{option.replace('-', ' ')}</option>)}
        </select>
        <p>Use “teach back” only when you can explain the physical, mathematical, and modeling layers without the lesson open.</p>
      </footer>
    </article>
  );
};
