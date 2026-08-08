import { Download, Menu, RotateCcw, Settings, ShieldCheck, Upload } from 'lucide-react';
import { useRef } from 'react';

interface TopBarProps {
  readonly moduleProgress: number;
  readonly overallProgress: number;
  readonly onExport: () => void;
  readonly onImport: (file: File) => void;
  readonly onReset: () => void;
  readonly onToggleRail: () => void;
}

export const TopBar = ({ moduleProgress, overallProgress, onExport, onImport, onReset, onToggleRail }: TopBarProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="top-bar">
      <div className="brand-group">
        <button type="button" className="menu-button" onClick={onToggleRail} aria-label="Toggle curriculum"><Menu aria-hidden="true" /></button>
        <h1>Constant On-Time Lab</h1>
      </div>
      <div className="top-progress" aria-label="Learning progress">
        <label>Module progress <progress max="100" value={moduleProgress} /> <span>{moduleProgress}%</span></label>
        <label>Overall mastery <progress max="100" value={overallProgress} /> <span>{overallProgress}%</span></label>
      </div>
      <div className="top-actions">
        <span className="local-only"><ShieldCheck aria-hidden="true" />Local only</span>
        <button type="button" onClick={onExport}><Download aria-hidden="true" />Export progress</button>
        <button type="button" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />Import</button>
        <input
          ref={fileRef}
          className="sr-only"
          aria-label="Import progress JSON file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onImport(file);
            event.currentTarget.value = '';
          }}
        />
        <details className="settings-menu">
          <summary aria-label="Settings"><Settings aria-hidden="true" /></summary>
          <div>
            <button type="button" onClick={onReset}><RotateCcw aria-hidden="true" />Reset local progress</button>
          </div>
        </details>
      </div>
    </header>
  );
};
