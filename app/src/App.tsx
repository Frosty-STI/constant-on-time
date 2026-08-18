import { lazy, Suspense, useCallback, useMemo, useState } from 'react';

import { CurriculumRail } from './components/CurriculumRail';
import { LabWorkbench } from './components/LabWorkbench';
import { NotesDrawer } from './components/NotesDrawer';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { LAB_BY_ID, LAB_IDS } from './domain/labs';
import type { LabId } from './domain/labs';
import { useProgress } from './hooks/useProgress';

const LessonReader = lazy(async () => {
  const module = await import('./components/LessonReader');
  return { default: module.LessonReader };
});

const downloadText = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const masteryWeight = (value: string | undefined): number => {
  if (value === 'teach-back') return 1;
  if (value === 'proficient') return 0.75;
  if (value === 'developing') return 0.35;
  return 0;
};

const isLabId = (input: string): input is LabId => (LAB_IDS as readonly string[]).includes(input);

export default function App() {
  const progressController = useProgress();
  const { progress } = progressController;
  const [activeLabId, setActiveLabId] = useState<LabId>('inductor-ripple');
  const [activeModule, setActiveModule] = useState<number | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const activeLab = LAB_BY_ID.get(activeLabId) ?? LAB_BY_ID.get('inductor-ripple');
  if (!activeLab) throw new Error('The required inductor-ripple lab is missing from the catalog.');

  const moduleProgress = Math.round(masteryWeight(progress.conceptMastery[`module-${activeLab.module}`]) * 100);
  const overallProgress = useMemo(() => {
    const keys = [
      ...Array.from({ length: 13 }, (_, index) => `module-${index}`),
      ...LAB_IDS.map((id) => `lab-${id}`),
    ];
    return Math.round(keys.reduce((sum, key) => sum + masteryWeight(progress.conceptMastery[key]), 0) / keys.length * 100);
  }, [progress.conceptMastery]);

  const closeResponsiveRail = useCallback(() => {
    if (window.matchMedia('(max-width: 1100px)').matches) setRailCollapsed(false);
  }, []);

  const selectLab = useCallback((id: LabId) => {
    setActiveLabId(id);
    setActiveModule(null);
    setNotice('');
    closeResponsiveRail();
  }, [closeResponsiveRail]);

  const importProgress = useCallback(async (file: File) => {
    try {
      progressController.importJson(await file.text());
      setNotice('Progress imported and validated locally.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to import progress.');
    }
  }, [progressController]);

  const resetProgress = useCallback(() => {
    if (!window.confirm('Reset all local Constant On-Time Lab progress, notes, bookmarks, and presets? This cannot be undone unless you exported a JSON backup.')) return;
    progressController.reset();
    setNotice('Local progress reset.');
  }, [progressController]);

  const contextId = activeModule === null ? activeLab.id : `module-${activeModule}`;
  const contextTitle = activeModule === null ? activeLab.title : `Module ${activeModule}`;

  return (
    <div className={`app-shell ${railCollapsed ? 'rail-collapsed' : ''}`}>
      <TopBar
        moduleProgress={moduleProgress}
        overallProgress={overallProgress}
        onExport={() => downloadText('constant-on-time-progress.json', progressController.exportJson(), 'application/json')}
        onImport={(file) => { void importProgress(file); }}
        onReset={resetProgress}
        onToggleRail={() => setRailCollapsed((current) => !current)}
      />
      <CurriculumRail
        activeLab={activeLabId}
        activeModule={activeModule}
        progress={progress}
        onSelectLab={selectLab}
        onSelectModule={(moduleIndex) => { setActiveModule(moduleIndex); setNotice(''); closeResponsiveRail(); }}
        onToggleNotes={() => setNotesOpen((current) => !current)}
      />
      <div className="app-content">
        {activeModule === null ? (
          <LabWorkbench
            key={activeLab.id}
            lab={activeLab}
            progress={progress}
            onSetMastery={progressController.setMastery}
            onRecordPrediction={progressController.recordPrediction}
            onSavePreset={progressController.savePreset}
            onToggleBookmark={progressController.toggleBookmark}
          />
        ) : (
          <Suspense fallback={<div className="lesson-loading" role="status">Loading the offline lesson package…</div>}>
            <LessonReader
              moduleIndex={activeModule}
              mastery={progress.conceptMastery[`module-${activeModule}`] ?? 'not-started'}
              bookmarked={progress.bookmarks.includes(`module-${activeModule}`)}
              completedReadings={progress.completedReadings}
              onMasteryChange={(mastery) => progressController.setMastery(`module-${activeModule}`, mastery)}
              onToggleReading={progressController.toggleReading}
              onBookmark={() => progressController.toggleBookmark(`module-${activeModule}`)}
              onOpenLab={(labId) => { if (isLabId(labId)) selectLab(labId); }}
            />
          </Suspense>
        )}
      </div>
      <NotesDrawer
        open={notesOpen}
        title={contextTitle}
        note={progress.notes[contextId] ?? ''}
        bookmarked={progress.bookmarks.includes(contextId)}
        onChange={(note) => progressController.setNote(contextId, note)}
        onBookmark={() => progressController.toggleBookmark(contextId)}
        onClose={() => setNotesOpen(false)}
      />
      {notice ? <div className="global-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')}>Dismiss</button></div> : null}
      <StatusBar lab={activeLab} seed={progress.seed} />
    </div>
  );
}
