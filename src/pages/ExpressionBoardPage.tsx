import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import CreateNote from '../components/freedom/CreateNote';
import FreedomWallBoard from 'components/freedom/ExpressionBoard';
import { db } from '../firebase/config';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const FreedomWallPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser } = useAuth();
  // Keep ownerId for routing compatibility, but fetching will include ALL notes.
  const ownerId = userId || currentUser?.id;

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setLoading(true);
    const notesCol = collection(db, 'sticky_notes');
    // Fetch ALL notes, newest first.
    const q = query(notesCol, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
      setNotes(arr);
      setLoading(false);
    }, (err) => {
      console.error('Expression Board listener error', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const noteCount = notes ? notes.length : 0;

  // Simple portal modal so the modal is rendered at document.body and not constrained
  const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="mx-2 w-full max-w-xl">
          {children}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <MainLayout>
      {typeof document !== 'undefined' && createPortal(
        // replace animated colorful background with a darker solid background
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden style={{ backgroundColor: '#030305' }} />,
        document.body
      )}

      <div className="relative w-full max-w-6xl mx-auto px-4 py-8 z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-white">Expression Board</h1>
            <p className="text-sm text-gray-400 mt-1">A simple board for unshared thoughts.</p>
          </div>

          {currentUser && (
            // On mobile push the add button to the right; on sm+ keep previous layout
            <div className="w-full sm:w-auto">
              <div className="flex w-full justify-end sm:justify-start items-center">
                <button
                  onClick={() => setShowCreate(true)}
                  aria-label="Add note"
                  title="Add note"
                  className="p-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-500"
                >
                  <span className="material-icons">note_add</span>
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="space-y-4">
          <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4">
            <FreedomWallBoard notes={notes} loading={loading} ownerId={ownerId} />
          </div>

          {/* Create note modal */}
          {showCreate && (
            <Modal onClose={() => setShowCreate(false)}>
              <div className="w-full bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 rounded-xl shadow-2xl ring-1 ring-black/40 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                  <h3 className="text-xl font-semibold text-white">Add Note</h3>
                  <button
                    onClick={() => setShowCreate(false)}
                    aria-label="Close add note"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-gray-700/80 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-6 py-5 max-h-[70vh] overflow-auto">
                  {/* Ensure created notes are owned by the current user */}
                  <CreateNote ownerId={currentUser?.id || ''} onSuccess={() => setShowCreate(false)} />
                </div>
              </div>
            </Modal>
          )}

          {/* Helpful empty state when no notes are present (board also renders a fallback) */}
          {!loading && noteCount === 0 && (
            <div className="text-center py-8 border border-dashed border-gray-700 rounded-lg bg-gray-900/30">
              <div className="text-gray-400">No notes yet — be the first to post a short sticky!</div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default FreedomWallPage;
