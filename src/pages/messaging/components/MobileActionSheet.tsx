import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { addMessageReaction } from '../../../services/messageService';
import type { MobileActionSheetProps } from '../types';

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({ message, onAction, onClose, isSender }) => {
  const isDeletedForEveryone = message.deletedForEveryone === true;
  const { currentUser } = useAuth();

  const reactionOptions = [
    { type: 'heart', label: 'Heart', img: '/images/emoji/heart.png' },
    { type: 'haha', label: 'Haha', img: '/images/emoji/haha.png' },
    { type: 'love', label: 'Love', img: '/images/emoji/love.png' },
    { type: 'sob', label: 'Sob', img: '/images/emoji/sob.png' },
    { type: 'sad', label: 'Sad', img: '/images/emoji/sad.png' },
    { type: 'angry', label: 'Angry', img: '/images/emoji/angry.png' },
  ];

  const userReactionType = currentUser ? message.reactions?.[currentUser.id]?.type : undefined;

  const [actionsEnabled, setActionsEnabled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActionsEnabled(true), 220);
    return () => clearTimeout(t);
  }, []);

  const withGuard = (fn: () => void) => {
    if (!actionsEnabled) return;
    fn();
  };

  const handleReaction = (reactionType: string) => {
    if (!currentUser || !actionsEnabled) return;
    onClose();
    addMessageReaction(message.id, currentUser.id, reactionType).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-gradient-to-b from-[#1e1e1e] to-[#121212] rounded-t-2xl p-5 shadow-lg border-t border-gray-800/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-600 rounded-full"></div>
        </div>

        <div className="flex justify-center gap-0.5 mb-4">
          {reactionOptions.map((reaction) => {
            const selected = reaction.type === userReactionType;
            return (
              <button
                key={reaction.type}
                onClick={() => handleReaction(reaction.type)}
                className="flex flex-col items-center focus:outline-none transition-all duration-200"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                tabIndex={0}
                aria-label={reaction.label + (selected ? ' (selected)' : '')}
                title={reaction.label + (selected ? ' (your reaction)' : '')}
              >
                <div
                  className={`rounded-full flex items-center justify-center ${
                    selected ? 'bg-green-500/15 shadow-[0_0_8px_2px_rgba(34,197,94,0.45)]' : ''
                  }`}
                  style={{ width: 32, height: 32, background: 'transparent', overflow: 'hidden' }}
                >
                  <img
                    src={reaction.img}
                    alt={reaction.label}
                    className="w-8 h-8 object-cover"
                    style={{ display: 'block', borderRadius: '50%' }}
                  />
                </div>
                <span
                  className={`text-xs mt-1 text-center ${selected ? 'text-green-300' : 'text-gray-200'}`}
                  style={{ fontWeight: 500 }}
                >
                  {reaction.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-3 text-white rounded-xl transition-all duration-200"
            onClick={() => withGuard(() => { onAction('reply'); onClose(); })}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-600/20 to-emerald-500/20 flex items-center justify-center">
              <span className="material-icons text-green-400">reply</span>
            </div>
            <span className="font-medium">Reply</span>
          </button>

          {!isDeletedForEveryone && (
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-3 text-white rounded-xl transition-all duration-200"
              onClick={() => withGuard(() => { onAction('copy'); onClose(); })}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600/20 to-indigo-500/20 flex items-center justify-center">
                <span className="material-icons text-blue-400">content_copy</span>
              </div>
              <span className="font-medium">Copy text</span>
            </button>
          )}

          {!isDeletedForEveryone && (
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-3 text-white rounded-xl transition-all duration-200"
              onClick={() => withGuard(() => { onAction('forward'); onClose(); })}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-600/20 to-cyan-500/20 flex items-center justify-center">
                <span className="material-icons text-teal-400">forward</span>
              </div>
              <span className="font-medium">Forward</span>
            </button>
          )}

          {isSender && (
            <>
              <button
                className="w-full text-left px-4 py-3 flex items-center gap-3 text-white rounded-xl transition-all duration-200"
                onClick={() => withGuard(() => { onAction('edit'); onClose(); })}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-600/20 to-yellow-500/20 flex items-center justify-center">
                  <span className="material-icons text-amber-400">edit</span>
                </div>
                <span className="font-medium">Edit</span>
              </button>
              <button
                className="w-full text-left px-4 py-3 flex items-center gap-3 text-red-400 rounded-xl transition-all duration-200"
                onClick={() => withGuard(() => { onAction('delete'); onClose(); })}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-700/20 to-red-600/20 flex items-center justify-center">
                  <span className="material-icons text-red-500">delete_forever</span>
                </div>
                <span className="font-medium">Delete</span>
              </button>
            </>
          )}

          <button
            className="w-full text-left px-4 py-3 flex items-center gap-3 text-white rounded-xl transition-all duration-200"
            onClick={() => withGuard(() => { onAction('pin'); onClose(); })}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600/20 to-fuchsia-500/20 flex items-center justify-center">
              <span className="material-icons text-purple-400">{message.isPinned ? 'push_pin' : 'push_pin'}</span>
            </div>
            <span className="font-medium">{message.isPinned ? 'Unpin' : 'Pin'}</span>
          </button>

          <div className="pt-2 mt-2 border-t border-gray-800/30">
            <button className="w-full text-gray-400 text-sm font-medium py-3 hover:text-gray-200 transition-colors" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileActionSheet;
