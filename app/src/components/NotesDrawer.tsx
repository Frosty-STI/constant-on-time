import { Bookmark, X } from 'lucide-react';

interface NotesDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly note: string;
  readonly bookmarked: boolean;
  readonly onChange: (note: string) => void;
  readonly onBookmark: () => void;
  readonly onClose: () => void;
}

export const NotesDrawer = ({ open, title, note, bookmarked, onChange, onBookmark, onClose }: NotesDrawerProps) => open ? (
  <aside className="notes-drawer" aria-labelledby="notes-title">
    <div>
      <div>
        <span>Personal lab notes</span>
        <h2 id="notes-title">{title}</h2>
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close notes"><X aria-hidden="true" /></button>
    </div>
    <textarea value={note} onChange={(event) => onChange(event.target.value)} placeholder="Record a derivation, modeling choice, confusing waveform, or teach-back explanation…" />
    <button type="button" className={bookmarked ? 'bookmark-button active' : 'bookmark-button'} onClick={onBookmark}><Bookmark aria-hidden="true" />{bookmarked ? 'Bookmarked' : 'Bookmark this concept'}</button>
    <p>Notes and bookmarks stay in this browser and are included in progress exports.</p>
  </aside>
) : null;
