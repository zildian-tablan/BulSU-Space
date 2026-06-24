import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { formatDistanceToNow } from 'date-fns';

const NoteCard: React.FC<{ note: any; canDelete: boolean; onDelete: (id: string) => void; onOpen?: (note: any) => void }> = ({ note, canDelete, onDelete, onOpen }) => {
  const createdAt = note.createdAt && note.createdAt.toDate ? note.createdAt.toDate() : (note.createdAt || null);

  // Small deterministic rotation based on id so notes look scattered
  const getRotation = (id?: string) => {
    if (!id) return 0;
    const sum = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return (sum % 5) - 2; // -2 .. 2 degrees
  };

  const rotation = getRotation(note.id);

  // Pastel color palette
  const pastelColors = [
    { bg: '#FFFBCC', border: '#F5E4A6' }, // light yellow
    { bg: '#FCEFF6', border: '#F6D6E8' }, // pink
    { bg: '#E8FFFA', border: '#CFF3EF' }, // mint
    { bg: '#EEF8FF', border: '#D7EEFF' }, // baby blue
    { bg: '#FFF6EC', border: '#F6E6CC' }, // peach
    { bg: '#F4F7FF', border: '#E1E8FF' }, // lavender
  ];

  const getColorForId = (id?: string) => {
    if (!id) return pastelColors[0];
    const sum = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return pastelColors[sum % pastelColors.length];
  };

  const col = getColorForId(note.id);

  // fixed card size for all notes (width/padding/height kept consistent)
  // reduced compact card sizing
  const sizeClasses = 'rounded-md p-2 sm:p-3';
  const widthClass = 'w-56'; // reduced width (~14rem = 224px)
  const responsiveWidth = widthClass; // same width across breakpoints

  return (
    <div
      className="relative rounded-md shadow-lg group inline-block"
      style={{ transform: `rotate(${rotation}deg)` }}
      onClick={() => onOpen && onOpen(note)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen && onOpen(note); }}
    >
    {/* enforce a fixed height so a single long note can't break the masonry layout
      use flex column so preview stays at top and author/delete stay at bottom */}
  <div className={`${sizeClasses} ${responsiveWidth} min-h-0 relative overflow-hidden rounded-lg shadow-sm flex flex-col justify-between h-40 sm:h-48`} style={{ backgroundColor: col.bg, border: `1px solid ${col.border}` }}>
        {/* subtle tape at top to hint sticky-note */}
        <div className="absolute left-1/2 -top-2 -translate-x-1/2 w-10 h-2 rounded-sm opacity-80 pointer-events-none" style={{ backgroundColor: col.border }} aria-hidden="true" />
        {/* content/body */}
        <div className="flex-1">
          {(() => {
            const text = String(note.content || '').trim();
            const charLimit = 10;
            const preview = text.length > charLimit ? `${text.slice(0, charLimit)}…` : text;
            return (
              <div className="text-sm leading-relaxed text-gray-900 truncate" title={text} aria-label={text} style={{ maxWidth: '100%' }}>
                {preview}
              </div>
            );
          })()}
        </div>

        {/* unified footer pinned to bottom */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-700 italic">-{(note.authorName || 'anonymous')}</div>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
              aria-label="Delete note"
              title="Delete note"
              className="p-0 bg-transparent text-red-600 z-10 transform transition-all duration-150 ease-out
                opacity-100 scale-100 translate-y-0
                md:opacity-0 md:scale-75 md:translate-y-1 md:group-hover:opacity-100 md:group-hover:scale-110 md:group-hover:-translate-y-0"
            >
              <span className="material-icons text-base text-red-600">delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FreedomWallBoard: React.FC<{ notes: any[]; loading: boolean; ownerId?: string }> = ({ notes, loading, ownerId }) => {
  const { currentUser } = useAuth();
  const [openNote, setOpenNote] = useState<any | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenNote(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteDoc(doc(db, 'sticky_notes', id));
    } catch (err) {
      console.error('Failed to delete note', err);
      alert('Failed to delete note');
    }
  };

  if (loading) return <div className="text-gray-400">Loading notes...</div>;
  if (!notes || notes.length === 0) return <div className="text-gray-400">No notes yet</div>;

  const closeModal = () => setOpenNote(null);
  // portal modal so it isn't clipped by parent layout
  const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={onClose} role="dialog" aria-modal="true">
        <div onClick={(e) => e.stopPropagation()} className="mx-4 w-full max-w-2xl">
          {children}
        </div>
      </div>,
      document.body
    );
  };

  const NoteModal: React.FC<{ note: any; onClose: () => void }> = ({ note, onClose }) => {
    if (!note) return null;
    const createdAt = note.createdAt && note.createdAt.toDate ? note.createdAt.toDate() : (note.createdAt || null);
    // Determine if current user is allowed to delete any note (super admin OR admin assigned to Program Chair)
    const isAdminProgramChair = (() => {
      if (!currentUser || (currentUser.role || '').toLowerCase() !== 'admin') return false;
      const officeString: string | undefined = (currentUser as any)?.office;
      const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
        ? ((currentUser as any).offices as string[])
        : [];

      const normalizedOffice = typeof officeString === 'string' ? officeString.toLowerCase() : '';
      const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));

      return normalizedOffice === 'program chair' || normalizedOffices.includes('program chair');
    })();

    const isSuperAdmin = (currentUser && (currentUser.role || '').toLowerCase() === 'super admin');
    const canDeleteAny = isSuperAdmin || isAdminProgramChair;
    return (
      <Modal onClose={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full p-6">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-semibold text-gray-900">Note</h3>
            <button onClick={onClose} aria-label="Close note" className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="mt-4 whitespace-pre-wrap text-gray-900">{note.content}</div>
          <div className="mt-4 text-sm text-gray-600">— {note.authorName || 'anonymous'}</div>
          {createdAt && <div className="mt-1 text-xs text-gray-500">{formatDistanceToNow(createdAt, { addSuffix: true })}</div>}
          <div className="mt-5 text-right">
            {(currentUser?.id === note.authorId || canDeleteAny) && (
              <button
                onClick={() => { onClose(); handleDelete(note.id); }}
                aria-label="Delete note"
                title="Delete note"
                className="p-2 bg-red-600 text-white rounded inline-flex items-center justify-center"
              >
                <span className="material-icons">delete</span>
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="notes-masonry">
      {notes.map(n => (
        <div key={n.id} className="mb-2 break-inside-avoid">
          {/* allow authors, program-chair admins, and super admins to delete */}
          <NoteCard
            note={n}
            canDelete={!!(
              currentUser?.id === n.authorId || (currentUser && ((currentUser.role || '').toLowerCase() === 'super admin')) || (
                currentUser && (currentUser.role || '').toLowerCase() === 'admin' && (
                  ((currentUser as any)?.office || '').toLowerCase() === 'program chair' ||
                  (Array.isArray((currentUser as any)?.offices) && ((currentUser as any).offices as string[]).map(o => (o || '').toLowerCase()).includes('program chair'))
                )
              )
            )}
            onDelete={handleDelete}
            onOpen={(note) => setOpenNote(note)}
          />
        </div>
      ))}
  <style>{`
        .notes-masonry {
          /* center the board and constrain width so mobile resembles desktop density */
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 0.75rem;
          column-count: 2;
          column-gap: 0.5rem; /* slightly increased gap for breathing room */
        }
        /* nudge the board left a bit on very small screens so it lines up like the screenshot */
        @media (max-width: 420px) {
          .notes-masonry {
            transform: translateX(-6%);
            /* slightly reduce horizontal padding to keep visible area reasonable */
            padding-left: 0.5rem;
            padding-right: 0.5rem;
          }
        }
        @media (min-width: 420px) { .notes-masonry { column-count: 3; column-gap: 0.6rem; } }
        @media (min-width: 640px) { .notes-masonry { column-count: 4; column-gap: 0.6rem; } }
        @media (min-width: 1024px) { .notes-masonry { column-count: 4; column-gap: 0.8rem; } }
        @media (min-width: 1280px) { .notes-masonry { column-count: 5; column-gap: 1rem; } }
        .break-inside-avoid { break-inside: avoid; margin-bottom: .5rem; }
      `}</style>
  {openNote && <NoteModal note={openNote} onClose={closeModal} />}
    </div>
  );
};

export default FreedomWallBoard;
