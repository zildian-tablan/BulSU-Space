import React, { useState, useRef, useLayoutEffect } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

interface CreateNoteProps {
  ownerId: string;
  onSuccess?: () => void;
}

const CreateNote: React.FC<CreateNoteProps> = ({ ownerId, onSuccess }) => {
  const { currentUser } = useAuth();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const baseHeight = 40; // single-line base

  const adjustHeight = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const newH = Math.max(ta.scrollHeight, baseHeight);
    ta.style.height = `${newH}px`;
  };

  useLayoutEffect(() => {
    // initial adjust and when content changes
    adjustHeight();
  }, [content]);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!currentUser) return alert('You must be signed in');
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const col = collection(db, 'sticky_notes');
  // Firestore doesn't accept `undefined` as a field value. Use null when anonymous
  // so the field is explicitly empty but supported by Firestore.
  const visibleName = isAnonymous ? null : (currentUser.name || '');
  await addDoc(col, {
        // keep ownerId for compatibility with the board filter
        ownerId,
        // required fields per spec: author uid, timestamp, content
        authorId: currentUser.id,
    authorName: visibleName,
    isAnonymous,
        content: content.trim(),
        createdAt: serverTimestamp(),
      });
  setContent('');
  setIsAnonymous(false);
  // notify parent that creation succeeded so it can e.g. close the modal
  try { onSuccess && onSuccess(); } catch (e) { /* ignore callback errors */ }
    } catch (err) {
      console.error('CreateNote error', err);
      alert('Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
        <div className="flex flex-col sm:flex-row items-start gap-3 w-full">
          <div className="flex w-full items-start gap-3">
            <div className="flex-1">
              <textarea
                ref={taRef}
                rows={1}
                maxLength={150}
                value={content}
                onChange={(e) => {
                  const v = e.target.value;
                  setContent(v.length > 150 ? v.slice(0, 150) : v);
                }}
                className="min-h-[40px] max-h-44 w-full rounded-md bg-gray-900 text-gray-100 px-3 py-2 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 transition-all resize-none overflow-hidden"
                placeholder="Write a short note..."
                aria-label="Sticky note content"
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              />
              <div className="text-xs text-gray-400 mt-1 text-right">{content.length}/150</div>
            </div>
            <div className="flex-shrink-0 flex items-start">
              <button
            onClick={handleCreate}
            disabled={submitting || !content.trim()}
            className={`h-10 flex items-center justify-center px-4 rounded-md bg-green-600 text-white text-sm font-medium ${submitting ? 'opacity-60 cursor-wait' : 'hover:bg-green-500'}`}
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
            </div>
          </div>
        </div>
        {/* anonymity option */}
  <div className="mt-3 flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 select-none cursor-pointer text-gray-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-green-600 focus:ring-green-500"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            <span>Post as anonymous</span>
          </label>
        </div>
        {/* full-width reminder */}
        <div className="mt-3 w-full">
          <div className="flex items-start gap-4 w-full bg-gradient-to-b from-gray-900/70 to-gray-800/70 border border-gray-700 rounded-lg px-4 py-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.12" />
                <path d="M12 8.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11.5 11.5h1v4h-1z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-100 leading-tight">Reminder</div>
              <div className="mt-0.5 text-xs text-gray-300 leading-snug">Please avoid posting inappropriate content. Violations may result in restrictions.</div>
            </div>
          </div>
        </div>
    </div>
  );
};

export default CreateNote;
