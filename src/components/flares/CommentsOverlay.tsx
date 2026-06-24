import React from 'react';
import { ChatBubbleOvalLeftIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { FlareComment } from '../../services/flareCommentService';
import { User } from '../../contexts/AuthContext';

interface CommentsOverlayProps {
  open: boolean;
  onClose: () => void;
  comments: FlareComment[];
  loading: boolean;
  currentUser: User | null;
  newComment: string;
  setNewComment: (v: string) => void;
  onSubmit: () => void;
  onSignIn: () => void;
  getRelativeTime: (timestamp: any) => string;
}

const CommentsOverlay: React.FC<CommentsOverlayProps> = ({
  open,
  onClose,
  comments,
  loading,
  currentUser,
  newComment,
  setNewComment,
  onSubmit,
  onSignIn,
  getRelativeTime,
}) => {
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-gray-900 rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-gray-600 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 pb-4">
          <div>
            <h3 className="text-white font-semibold text-lg">Comments</h3>
            <p className="text-gray-400 text-sm">{comments.length} comments</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-white">refresh</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ChatBubbleOvalLeftIcon className="w-16 h-16 mb-2 opacity-50" />
              <p>No comments yet</p>
              <p className="text-sm">Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                {comment.userProfilePic ? (
                  <img
                    src={comment.userProfilePic}
                    alt={comment.userName}
                    className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-white">person</span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white font-semibold">{comment.userName}</p>
                  <p className="text-gray-300 text-sm mt-1">{comment.text}</p>
                  <p className="text-gray-500 mt-1" style={{ fontSize: '10px' }}>
                    {getRelativeTime(comment.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {currentUser ? (
          <div className="p-6 border-t border-gray-700 bg-gray-900">
            <div className="flex gap-3">
              {currentUser.profile_pic ? (
                <img
                  src={currentUser.profile_pic}
                  alt={currentUser.name}
                  className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-white">person</span>
                </div>
              )}
              <div className="flex-1 flex gap-2 items-center">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onSubmit()}
                  placeholder="Add a comment..."
                  className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-full border border-gray-700 focus:outline-none focus:border-gray-600 placeholder-gray-500"
                />
                <button
                  onClick={onSubmit}
                  disabled={!newComment.trim()}
                  className="p-3 text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors disabled:opacity-50 disabled:bg-gray-700 disabled:cursor-not-allowed"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 border-t border-gray-700 bg-gray-900 text-center">
            <p className="text-gray-400 mb-3">Sign in to comment</p>
            <button
              onClick={onSignIn}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-semibold"
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentsOverlay;
