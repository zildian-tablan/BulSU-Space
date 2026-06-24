import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';
import type { User } from '../../../contexts/AuthContext';
import { reactionEmojiMap } from '../constants';

type ReactionDetailsModalProps = {
  reactions: { user: User | null; timestamp: Timestamp; displayName?: string; type?: string }[];
  onClose: () => void;
};

const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({ reactions, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#1e1e1e] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="material-icons text-green-500 select-none" style={{ userSelect: 'none' }}>
              favorite
            </span>
            <h2 className="text-lg font-bold text-white">Reactions</h2>
          </div>
          <button
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#3a3b3c] transition-all duration-200"
            onClick={onClose}
            aria-label="Close modal"
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {reactions.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No reactions yet</div>
          ) : (
            <div className="p-2">
              {reactions.map((reaction, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border-b border-gray-800/30 last:border-0">
                  {reaction.user?.profile_pic ? (
                    <img
                      src={reaction.user.profile_pic}
                      alt={reaction.user.name || 'User'}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white font-medium">
                      {reaction.user?.name?.charAt(0) || reaction.displayName?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white">
                      {reaction.user?.name || reaction.displayName || 'Unknown User'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {reaction.timestamp
                        ? formatDistanceToNow(reaction.timestamp.toDate(), { addSuffix: true })
                        : ''}
                    </p>
                  </div>
                  <img
                    src={reactionEmojiMap[reaction.type || 'heart'] || reactionEmojiMap.heart}
                    alt={reaction.type || 'reaction'}
                    className="w-5 h-5 select-none"
                    style={{ userSelect: 'none' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReactionDetailsModal;
